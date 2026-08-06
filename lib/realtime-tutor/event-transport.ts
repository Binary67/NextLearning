import type {
  RealtimeServerEvent,
  RealtimeTutorRuntime,
} from "@/lib/realtime-tutor/types";
import {
  rejectPendingServerEvent,
  resolvePendingServerEvent,
} from "@/lib/realtime-tutor/transport";

export function sendEvent(
  runtime: RealtimeTutorRuntime,
  event: object,
) {
  const dataChannel = runtime.dataChannelRef.current;

  if (!dataChannel || dataChannel.readyState !== "open") {
    throw new Error("The Realtime tutor is not connected.");
  }

  const message = JSON.stringify(event);
  const maxMessageSize =
    runtime.peerConnectionRef.current?.sctp?.maxMessageSize;

  if (
    maxMessageSize &&
    new TextEncoder().encode(message).byteLength > maxMessageSize
  ) {
    throw new Error(
      "A tutor message is too large for the Realtime connection.",
    );
  }

  dataChannel.send(message);
}

export function sendEventAndWait(
  runtime: RealtimeTutorRuntime,
  event: object,
  expectedEventType: string,
) {
  const eventId = `client_${crypto.randomUUID()}`;
  const response = waitForServerEvent(
    runtime,
    expectedEventType,
    eventId,
  );

  try {
    sendEvent(runtime, { ...event, event_id: eventId });
  } catch (reason) {
    rejectPendingServerEvent(
      runtime.pendingServerEventsRef.current,
      eventId,
      reason instanceof Error
        ? reason
        : new Error("The Realtime event could not be sent."),
    );
  }

  return response;
}

export function waitForServerEvent(
  runtime: RealtimeTutorRuntime,
  expectedEventType: string,
  eventId: string | null = null,
) {
  if (
    runtime.pendingServerEventsRef.current.has(expectedEventType)
  ) {
    throw new Error(
      `The Realtime tutor is already waiting for ${expectedEventType}.`,
    );
  }

  return new Promise<RealtimeServerEvent>((resolve, reject) => {
    const timeout = setTimeout(() => {
      runtime.pendingServerEventsRef.current.delete(expectedEventType);
      reject(
        new Error(
          `The Realtime tutor timed out waiting for ${expectedEventType}.`,
        ),
      );
    }, 10_000);

    runtime.pendingServerEventsRef.current.set(expectedEventType, {
      eventId,
      resolve,
      reject,
      timeout,
    });
  });
}

export function resolveServerEvent(
  runtime: RealtimeTutorRuntime,
  event: RealtimeServerEvent,
) {
  if (event.type) {
    resolvePendingServerEvent(
      runtime.pendingServerEventsRef.current,
      event.type,
      event,
    );
  }
}
