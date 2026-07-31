"use client";

import { FileText, Sparkles, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { TutorialResponse } from "@/lib/tutorial";

type NewTutorialButtonProps = {
  variant?: "primary" | "icon";
};

const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_PDF_SIZE = 10 * BYTES_PER_MEGABYTE;
const PREPARATION_STAGES = [
  {
    id: "analyzing",
    label: "Analyzing and planning",
    description: "Mapping concepts and organizing focused learning units.",
  },
  {
    id: "saving",
    label: "Finishing setup",
    description: "Saving the tutorial and getting it ready to use.",
  },
] as const;

type PreparationStage =
  | "uploading"
  | (typeof PREPARATION_STAGES)[number]["id"];

type PreparationEvent =
  | {
      type: "progress";
      stage: Exclude<PreparationStage, "uploading">;
    }
  | {
      type: "complete";
      tutorial: TutorialResponse;
    }
  | {
      type: "error";
      message: string;
    };

export function NewTutorialButton({
  variant = "primary",
}: NewTutorialButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preparationStage, setPreparationStage] =
    useState<PreparationStage | null>(null);
  const [error, setError] = useState("");
  const pendingFileIsValid =
    pendingFile !== null &&
    isPdf(pendingFile) &&
    pendingFile.size <= MAX_PDF_SIZE;
  const stageIndex = PREPARATION_STAGES.findIndex(
    (stage) => stage.id === preparationStage,
  );
  const preparationStatus =
    preparationStage === "uploading"
      ? {
          label: "Uploading PDF",
          description: "Sending the document for preparation.",
        }
      : PREPARATION_STAGES[stageIndex];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingFile && !uploading) {
        setPendingFile(null);
        setPreparationStage(null);
        setError("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingFile, uploading]);

  function selectDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setPendingFile(file);
    setPreparationStage(null);

    if (!isPdf(file)) {
      setError("Only PDF files are supported.");
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      setError("The document must be 10 MB or smaller.");
      return;
    }

    setError("");
  }

  async function prepareTutorial() {
    if (!pendingFile || !pendingFileIsValid) {
      return;
    }

    setUploading(true);
    setPreparationStage("uploading");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const response = await fetch("/api/tutorials", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? "The tutorial could not be prepared.");
      }

      const tutorial = await readPreparedTutorial(
        response,
        setPreparationStage,
      );
      router.push(`/tutorials/${tutorial.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The tutorial could not be prepared.",
      );
    } finally {
      setPreparationStage(null);
      setUploading(false);
    }
  }

  function closeModal() {
    if (uploading) {
      return;
    }

    setPendingFile(null);
    setPreparationStage(null);
    setError("");
  }

  const button =
    variant === "icon" ? (
      <button
        className="icon-button small"
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Create a new tutorial"
      >
        <Upload size={21} />
      </button>
    ) : (
      <button
        className="primary-button new-tutorial-button"
        type="button"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={19} />
        Create tutorial
      </button>
    );

  return (
    <>
      {button}
      <input
        ref={inputRef}
        className="document-input"
        type="file"
        accept=".pdf,application/pdf"
        onChange={selectDocument}
      />

      {pendingFile && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-tutorial-title"
          >
            <button
              className="modal-close"
              type="button"
              onClick={closeModal}
              disabled={uploading}
              aria-label="Close dialog"
            >
              <X size={22} />
            </button>
            <div className="modal-icon">
              <Upload size={23} />
            </div>
            <p className="modal-eyebrow">New tutorial</p>
            <h2 id="new-tutorial-title">
              {uploading
                ? "Preparing your tutorial…"
                : "Prepare this PDF?"}
            </h2>
            <div className="pending-file">
              <FileText size={23} aria-hidden="true" />
              <span>
                <strong>{pendingFile.name}</strong>
                <small>{formatFileSize(pendingFile.size)}</small>
              </span>
            </div>
            {uploading && preparationStatus ? (
              <div
                className="document-preparation-progress"
                aria-live="polite"
              >
                <div
                  className="document-preparation-track"
                  role="progressbar"
                  aria-label="Tutorial preparation progress"
                  aria-valuemin={0}
                  aria-valuemax={PREPARATION_STAGES.length}
                  aria-valuenow={Math.max(stageIndex + 1, 0)}
                >
                  {PREPARATION_STAGES.map((stage, index) => (
                    <span
                      className={`document-preparation-segment${
                        index < stageIndex ? " complete" : ""
                      }${
                        index === Math.max(stageIndex, 0)
                          ? " current"
                          : ""
                      }`}
                      key={stage.id}
                    />
                  ))}
                </div>
                <p className="document-preparation-step">
                  {preparationStage === "uploading"
                    ? "Starting preparation"
                    : `Stage ${stageIndex + 1} of ${PREPARATION_STAGES.length}`}
                </p>
                <h3>{preparationStatus.label}</h3>
                <p>{preparationStatus.description}</p>
                <small>This may take a few minutes.</small>
              </div>
            ) : (
              <p className="modal-copy">
                We’ll turn this PDF into a structured tutorial with key
                concepts, guided lessons, and source highlights.
              </p>
            )}
            <p className="replacement-note">
              Your existing tutorials will not be changed.
            </p>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={closeModal}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={prepareTutorial}
                disabled={uploading || !pendingFileIsValid}
              >
                <Sparkles size={19} />
                {uploading ? "Preparing…" : "Prepare Tutorial"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

async function readPreparedTutorial(
  response: Response,
  onProgress: (stage: PreparationStage) => void,
) {
  if (!response.body) {
    throw new Error("The tutorial could not be prepared.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tutorial: TutorialResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) {
        continue;
      }

      const event = JSON.parse(line) as PreparationEvent;

      if (event.type === "progress") {
        onProgress(event.stage);
      } else if (event.type === "error") {
        throw new Error(event.message);
      } else {
        tutorial = event.tutorial;
      }
    }

    if (done) {
      break;
    }
  }

  if (!tutorial) {
    throw new Error("The tutorial could not be prepared.");
  }

  return tutorial;
}

function formatFileSize(bytes: number) {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

function isPdf(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension === "pdf" && file.type === "application/pdf";
}
