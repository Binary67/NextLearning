import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { RealtimeTutorStatus } from "@/lib/use-realtime-tutor";

import type { Modal } from "./types";

export function useWorkspaceShortcuts({
  learnerCanAsk,
  modal,
  raiseHandShortcut,
  realtimeTutorStatus,
  sessionActive,
  transcriptCount,
  setModal,
  toggleUserTurn,
}: {
  learnerCanAsk: boolean;
  modal: Modal;
  raiseHandShortcut: string;
  realtimeTutorStatus: RealtimeTutorStatus;
  sessionActive: boolean;
  transcriptCount: number;
  setModal: Dispatch<SetStateAction<Modal>>;
  toggleUserTurn: () => void | Promise<void>;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isInteractiveTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(
            target.tagName,
          ));

      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isInteractiveTarget
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "escape") {
        setModal(null);
      } else if (key === "t" && transcriptCount > 0) {
        setModal("transcript");
      } else if (key === "e" && sessionActive) {
        setModal("end-session");
      } else if (
        key === raiseHandShortcut &&
        realtimeTutorStatus === "connected" &&
        modal === null &&
        learnerCanAsk
      ) {
        event.preventDefault();
        void toggleUserTurn();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    learnerCanAsk,
    modal,
    raiseHandShortcut,
    realtimeTutorStatus,
    sessionActive,
    setModal,
    toggleUserTurn,
    transcriptCount,
  ]);
}
