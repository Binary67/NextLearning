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
const PREPARATION_STATUS = {
  uploading: {
    label: "Uploading PDF",
    description: "Sending your document for preparation.",
  },
  analyzing: {
    label: "Analyzing concepts and page context",
    description: "Preparing the document for selection-based questions.",
  },
  saving: {
    label: "Finalizing and saving",
    description: "Saving the PDF and its document model.",
  },
} as const;

type PreparationStage = keyof typeof PREPARATION_STATUS;

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
  const [preparationStage, setPreparationStage] =
    useState<PreparationStage | null>(null);
  const [error, setError] = useState("");
  const preparing = preparationStage !== null;
  const pendingFileIsValid =
    pendingFile !== null &&
    isPdf(pendingFile) &&
    pendingFile.size <= MAX_PDF_SIZE;
  const preparationStatus = preparationStage
    ? PREPARATION_STATUS[preparationStage]
    : null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingFile && !preparing) {
        setPendingFile(null);
        setPreparationStage(null);
        setError("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingFile, preparing]);

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

  async function prepareDocument() {
    if (!pendingFile || !pendingFileIsValid) {
      return;
    }

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
        throw new Error(data.message ?? "The document could not be prepared.");
      }

      const tutorial = await readPreparedDocument(
        response,
        setPreparationStage,
      );
      router.push(`/tutorials/${tutorial.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The document could not be prepared.",
      );
    } finally {
      setPreparationStage(null);
    }
  }

  function closeModal() {
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
        aria-label="Add a new document"
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
        Add document
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
            className="modal new-tutorial-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-tutorial-title"
          >
            {!preparing && (
              <button
                className="modal-close"
                type="button"
                onClick={closeModal}
                aria-label="Close dialog"
              >
                <X size={22} />
              </button>
            )}
            <div className="modal-icon">
              {preparing ? <Sparkles size={23} /> : <Upload size={23} />}
            </div>
            <p className="modal-eyebrow">New document</p>
            <h2 id="new-tutorial-title">
              {preparing ? "Preparing your document" : "Prepare this PDF?"}
            </h2>
            <div className="pending-file">
              <FileText size={23} aria-hidden="true" />
              <span>
                <strong>{pendingFile.name}</strong>
                <small>{formatFileSize(pendingFile.size)}</small>
              </span>
            </div>
            {preparationStatus ? (
              <div
                className="document-preparation-progress"
                aria-live="polite"
              >
                <div
                  className="document-preparation-track"
                  role="progressbar"
                  aria-label="Document preparation progress"
                />
                <h3>{preparationStatus.label}</h3>
                <p>{preparationStatus.description}</p>
                <small>Preparation can take a few minutes.</small>
              </div>
            ) : (
              <p className="modal-copy">
                We’ll map its concepts and page context so you can select any
                region and ask questions by voice.
              </p>
            )}
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            {!preparing && (
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={prepareDocument}
                  disabled={!pendingFileIsValid}
                >
                  <Sparkles size={19} />
                  Prepare Document
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

async function readPreparedDocument(
  response: Response,
  onProgress: (stage: PreparationStage) => void,
) {
  if (!response.body) {
    throw new Error("The document could not be prepared.");
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
    throw new Error("The document could not be prepared.");
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
