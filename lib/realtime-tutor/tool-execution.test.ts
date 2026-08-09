import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activateRealtimeResponse,
  finishRealtimeResponse,
  supersedeRealtimeResponse,
} from "@/lib/realtime-response-state";
import { sendToolOutputs } from "@/lib/realtime-tutor/tool-execution";
import { executeRealtimeTutorTool } from "@/lib/realtime-tutor/tools";
import { sendEventAndWait } from "@/lib/realtime-tutor/event-transport";
import type { RealtimeTutorRuntime } from "@/lib/realtime-tutor/types";

vi.mock("@/lib/realtime-tutor/tools", () => ({
  executeRealtimeTutorTool: vi.fn(),
}));

vi.mock("@/lib/realtime-tutor/event-transport", () => ({
  sendEventAndWait: vi.fn(),
}));

describe("lesson-action tool execution", () => {
  beforeEach(() => {
    vi.mocked(executeRealtimeTutorTool).mockReset();
    vi.mocked(executeRealtimeTutorTool).mockResolvedValue({ ok: true });
    vi.mocked(sendEventAndWait).mockReset();
    vi.mocked(sendEventAndWait).mockResolvedValue({
      type: "conversation.item.added",
    });
  });

  it("does not expose an active learning attempt to a lesson action", async () => {
    let responseState = supersedeRealtimeResponse(
      "technical_lesson_action",
    );
    responseState = activateRealtimeResponse(
      responseState,
      "response-1",
    ).state;
    responseState = finishRealtimeResponse(
      responseState,
      "response-1",
      true,
    ).state;

    const runtime = {
      optionsRef: {
        current: {
          documentModel: {},
          selection: null,
          textSelectionContext: null,
        },
      },
      responseStateRef: { current: responseState },
      activeLearningCheckpointRef: {
        current: {},
      },
    } as unknown as RealtimeTutorRuntime;

    await sendToolOutputs(runtime, [
      {
        type: "function_call",
        name: "record_learning_attempt",
        call_id: "call-1",
        arguments: "{}",
      },
    ]);

    expect(
      vi.mocked(executeRealtimeTutorTool).mock.calls[0][2]
        .activeLearningAttempt,
    ).toBeNull();
  });
});
