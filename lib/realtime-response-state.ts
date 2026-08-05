export type TutorResponseKind =
  | "guided_segment"
  | "learning_prompt"
  | "learner_question";

type LogicalResponse = {
  id: string;
  kind: TutorResponseKind;
};

type PendingResponse = {
  kind: TutorResponseKind;
  continuationOf: string | null;
};

type PendingContinuation = {
  responseId: string;
  kind: TutorResponseKind;
};

export type RealtimeResponseState = {
  pending: PendingResponse | null;
  continuation: PendingContinuation | null;
  logical: LogicalResponse | null;
  audio: LogicalResponse | null;
};

type ResponseTransition = {
  state: RealtimeResponseState;
  accepted: boolean;
  kind: TutorResponseKind | null;
};

export function createRealtimeResponseState(): RealtimeResponseState {
  return {
    pending: null,
    continuation: null,
    logical: null,
    audio: null,
  };
}

export function supersedeRealtimeResponse(
  kind: TutorResponseKind,
): RealtimeResponseState {
  return {
    ...createRealtimeResponseState(),
    pending: {
      kind,
      continuationOf: null,
    },
  };
}

export function activateRealtimeResponse(
  state: RealtimeResponseState,
  responseId: string,
): ResponseTransition {
  if (!state.pending) {
    return rejectedTransition(state);
  }

  return {
    state: {
      ...state,
      pending: null,
      logical: {
        id: responseId,
        kind: state.pending.kind,
      },
    },
    accepted: true,
    kind: state.pending.kind,
  };
}

export function finishRealtimeResponse(
  state: RealtimeResponseState,
  responseId: string,
  needsContinuation: boolean,
): ResponseTransition {
  if (state.logical?.id !== responseId) {
    return rejectedTransition(state);
  }

  const kind = state.logical.kind;

  return {
    state: {
      ...state,
      logical: null,
      continuation: needsContinuation
        ? {
            responseId,
            kind,
          }
        : null,
    },
    accepted: true,
    kind,
  };
}

export function requestRealtimeContinuation(
  state: RealtimeResponseState,
  responseId: string,
): ResponseTransition {
  if (state.continuation?.responseId !== responseId) {
    return rejectedTransition(state);
  }

  return {
    state: {
      ...state,
      pending: {
        kind: state.continuation.kind,
        continuationOf: responseId,
      },
      continuation: null,
    },
    accepted: true,
    kind: state.continuation.kind,
  };
}

export function startRealtimeResponseAudio(
  state: RealtimeResponseState,
  responseId: string,
): ResponseTransition {
  if (state.logical?.id !== responseId) {
    return rejectedTransition(state);
  }

  return {
    state: {
      ...state,
      audio: {
        id: responseId,
        kind: state.logical.kind,
      },
    },
    accepted: true,
    kind: state.logical.kind,
  };
}

export function finishRealtimeResponseAudio(
  state: RealtimeResponseState,
  responseId: string,
): ResponseTransition {
  if (state.audio?.id !== responseId) {
    return rejectedTransition(state);
  }

  return {
    state: {
      ...state,
      audio: null,
    },
    accepted: true,
    kind: state.audio.kind,
  };
}

export function isActiveLogicalResponse(
  state: RealtimeResponseState,
  responseId: string,
) {
  return state.logical?.id === responseId;
}

export function ownsRealtimeContinuation(
  state: RealtimeResponseState,
  responseId: string,
) {
  return (
    state.continuation?.responseId === responseId ||
    state.pending?.continuationOf === responseId
  );
}

function rejectedTransition(
  state: RealtimeResponseState,
): ResponseTransition {
  return {
    state,
    accepted: false,
    kind: null,
  };
}
