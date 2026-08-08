import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  DOCUMENT_BATCH_OVERLAP,
  type DocumentBatchRange,
} from "@/lib/document-batches";

const execFileAsync = promisify(execFile);

export async function openPdfBatchReader(
  sourcePath: string,
  pageCount: number,
) {
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), "nextlearning-pdf-batch-"),
  );
  const pagePattern = path.join(directory, "page-%d.pdf");

  async function readBatch(batch: DocumentBatchRange) {
    const inputStartPage = Math.max(
      1,
      batch.start_page - DOCUMENT_BATCH_OVERLAP,
    );
    const inputEndPage = Math.min(
      pageCount,
      batch.end_page + DOCUMENT_BATCH_OVERLAP,
    );
    const batchPath = path.join(
      directory,
      `batch-${batch.batch_index}.pdf`,
    );
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
  }

  function close() {
    return fs.rm(directory, { force: true, recursive: true });
  }

  try {
    await execFileAsync("pdfseparate", [
      "-f",
      "1",
      "-l",
      String(pageCount),
      sourcePath,
      pagePattern,
    ]);

    return { readBatch, close };
  } catch (error) {
    await close();
    throw error;
  }
}
