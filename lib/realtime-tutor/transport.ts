import type { DocumentModel } from "@/lib/document-model";
import type {
  PendingServerEvent,
  RealtimeFunctionCall,
  RealtimeResponseOutputItem,
  RealtimeServerEvent,
} from "@/lib/realtime-tutor/types";

const UNNEGOTIATED_MESSAGE_LIMIT = 512 * 1024;

export function getMaximumMessageSize(
  peerConnection: RTCPeerConnection | null,
) {
  const negotiatedLimit = peerConnection?.sctp?.maxMessageSize;

  return negotiatedLimit &&
    Number.isFinite(negotiatedLimit) &&
    negotiatedLimit > 0
    ? negotiatedLimit
    : UNNEGOTIATED_MESSAGE_LIMIT;
}

export function getMessageByteLength(event: object) {
  return new TextEncoder().encode(JSON.stringify(event)).byteLength;
}

export function isValidPageIndex(
  model: DocumentModel,
  pageIndex: number,
) {
  return (
    Number.isInteger(pageIndex) &&
    pageIndex >= 1 &&
    pageIndex <= model.page_count
  );
}

export function findChunkIndex(
  model: DocumentModel,
  pageIndex: number,
  chunkId: string | null,
) {
  if (!chunkId) {
    return 0;
  }

  const chunkIndex = model.pages[pageIndex - 1].chunks.findIndex(
    (chunk) => chunk.id === chunkId,
  );

  return chunkIndex >= 0 ? chunkIndex : 0;
}

export function readInvalidPageMessage(
  model: DocumentModel | null,
  pageIndex: number,
) {
  if (!model) {
    return "A prepared document is required.";
  }

  return `PDF page ${pageIndex} is not available. Choose a page from 1 through ${model.page_count}.`;
}

export function readFunctionCalls(
  output: RealtimeResponseOutputItem[] | undefined,
) {
  return (output ?? []).filter(
    (item): item is RealtimeFunctionCall =>
      item.type === "function_call" &&
      typeof item.name === "string" &&
      typeof item.call_id === "string" &&
      typeof item.arguments === "string",
  );
}

export function buildAudioConstraints(
  deviceId: string,
): MediaTrackConstraints {
  return {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

export function setAudioTracksEnabled(
  mediaStream: MediaStream | null,
  enabled: boolean,
) {
  for (const track of mediaStream?.getAudioTracks() ?? []) {
    track.enabled = enabled;
  }
}

export function resolvePendingServerEvent(
  pendingEvents: Map<string, PendingServerEvent>,
  eventType: string,
  event: RealtimeServerEvent,
) {
  const pendingEvent = pendingEvents.get(eventType);

  if (!pendingEvent) {
    return;
  }

  clearTimeout(pendingEvent.timeout);
  pendingEvents.delete(eventType);
  pendingEvent.resolve(event);
}

export function rejectPendingServerEvent(
  pendingEvents: Map<string, PendingServerEvent>,
  eventId: string | undefined,
  reason: Error,
) {
  if (!eventId) {
    return;
  }

  for (const [eventType, pendingEvent] of pendingEvents) {
    if (pendingEvent.eventId === eventId) {
      clearTimeout(pendingEvent.timeout);
      pendingEvents.delete(eventType);
      pendingEvent.reject(reason);
      return;
    }
  }
}

export function rejectPendingServerEvents(
  pendingEvents: Map<string, PendingServerEvent>,
  reason: Error,
) {
  for (const pendingEvent of pendingEvents.values()) {
    clearTimeout(pendingEvent.timeout);
    pendingEvent.reject(reason);
  }

  pendingEvents.clear();
}

export function waitForDataChannel(dataChannel: RTCDataChannel) {
  return new Promise<void>((resolve, reject) => {
    dataChannel.onopen = () => resolve();
    dataChannel.onerror = () =>
      reject(new Error("The Realtime data channel could not open."));
  });
}

export function readResponseMessage(value: string) {
  try {
    const parsed = JSON.parse(value) as { message?: string };
    return parsed.message;
  } catch {
    return null;
  }
}

export function getErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
