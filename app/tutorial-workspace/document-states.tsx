import Link from "next/link";
import type { ReactNode } from "react";

export function DocumentState({
  icon,
  eyebrow,
  title,
  message,
  error = false,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  message: string;
  error?: boolean;
}) {
  return (
    <div className="document-state">
      <span className="document-state-icon">{icon}</span>
      <p className="document-state-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className={error ? "document-error" : undefined}>{message}</p>
      <Link className="secondary-button upload-button" href="/library">
        Back to library
      </Link>
    </div>
  );
}
