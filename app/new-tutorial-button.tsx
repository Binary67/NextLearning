"use client";

import { FileText, Sparkles, Upload, X } from "lucide-react";
import {
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ProgressiveTutorialResponse } from "@/app/tutorial-progressive";

type NewTutorialButtonProps = {
  variant?: "primary" | "icon";
  onQueued: (tutorial: ProgressiveTutorialResponse) => void;
};

const BYTES_PER_MEGABYTE = 1024 * 1024;

export function NewTutorialButton({
  variant = "primary",
  onQueued,
}: NewTutorialButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const pendingFileIsValid =
    pendingFile !== null &&
    isPdf(pendingFile);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pendingFile && !uploading) {
        setPendingFile(null);
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

    if (!isPdf(file)) {
      setError("Only PDF files are supported.");
      return;
    }

    setError("");
  }

  async function prepareDocument() {
    if (!pendingFile || !pendingFileIsValid) {
      return;
    }

    setUploading(true);
    setError("");

    try {
      const response = await fetch("/api/tutorials", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Document-Name": encodeURIComponent(pendingFile.name),
        },
        body: pendingFile,
      });

      const data = (await response.json()) as {
        tutorial?: ProgressiveTutorialResponse;
        message?: string;
      };

      if (!response.ok || !data.tutorial) {
        throw new Error(data.message ?? "The document could not be prepared.");
      }

      onQueued(data.tutorial);
      closeModal();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The document could not be prepared.",
      );
    } finally {
      setUploading(false);
    }
  }

  function closeModal() {
    setPendingFile(null);
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
            {!uploading && (
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
              {uploading ? <Sparkles size={23} /> : <Upload size={23} />}
            </div>
            <p className="modal-eyebrow">New document</p>
            <h2 id="new-tutorial-title">
              {uploading ? "Adding your document" : "Prepare this PDF?"}
            </h2>
            <div className="pending-file">
              <FileText size={23} aria-hidden="true" />
              <span>
                <strong>{pendingFile.name}</strong>
                <small>{formatFileSize(pendingFile.size)}</small>
              </span>
            </div>
            {uploading ? (
              <div
                className="document-preparation-progress"
                aria-live="polite"
              >
                <div
                  className="document-preparation-track"
                  role="progressbar"
                  aria-label="Document upload progress"
                />
                <h3>Uploading PDF</h3>
                <p>Saving your document and adding it to the queue.</p>
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
            {!uploading && (
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

function formatFileSize(bytes: number) {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

function isPdf(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension === "pdf" && file.type === "application/pdf";
}
