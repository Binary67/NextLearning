import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { DOCUMENT_BATCH_OVERLAP } from "@/lib/document-batches";

const execFileAsync = promisify(execFile);

export async function readPdfBatch(
  sourcePath: string,
  startPage: number,
  endPage: number,
  pageCount: number,
) {
  const inputStartPage = Math.max(
    1,
    startPage - DOCUMENT_BATCH_OVERLAP,
  );
  const inputEndPage = Math.min(
    pageCount,
    endPage + DOCUMENT_BATCH_OVERLAP,
  );
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), "nextlearning-pdf-batch-"),
  );
  const pagePattern = path.join(directory, "page-%d.pdf");
  const batchPath = path.join(directory, "batch.pdf");

  try {
    await execFileAsync("pdfseparate", [
      "-f",
      String(inputStartPage),
      "-l",
      String(inputEndPage),
      sourcePath,
      pagePattern,
    ]);
    const pagePaths = Array.from(
      { length: inputEndPage - inputStartPage + 1 },
      (_, index) =>
        path.join(directory, `page-${inputStartPage + index}.pdf`),
    );
    await execFileAsync("pdfunite", [...pagePaths, batchPath]);

    return {
      fileData: await fs.readFile(batchPath),
      inputStartPage,
      inputEndPage,
    };
  } finally {
    await fs.rm(directory, { force: true, recursive: true });
  }
}
