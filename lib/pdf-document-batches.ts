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
const PDF_TOOL_TIMEOUT_MS = 5 * 60 * 1000;

export async function openPdfBatchReader(
  sourcePath: string,
  pageCount: number,
  pendingRanges: readonly DocumentBatchRange[],
) {
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), "nextlearning-pdf-batch-"),
  );
  const pagePattern = path.join(directory, "page-%d.pdf");

  function expandedRange(range: DocumentBatchRange) {
    return {
      start_page: Math.max(1, range.start_page - DOCUMENT_BATCH_OVERLAP),
      end_page: Math.min(pageCount, range.end_page + DOCUMENT_BATCH_OVERLAP),
    };
  }

  const mergedRanges = pendingRanges
    .map(expandedRange)
    .sort((left, right) => left.start_page - right.start_page)
    .reduce<Array<{ start_page: number; end_page: number }>>(
      (merged, range) => {
        const previous = merged.at(-1);
        if (previous && range.start_page <= previous.end_page + 1) {
          previous.end_page = Math.max(previous.end_page, range.end_page);
        } else {
          merged.push({ ...range });
        }
        return merged;
      },
      [],
    );

  async function readBatch(batch: DocumentBatchRange) {
    const { start_page: inputStartPage, end_page: inputEndPage } =
      expandedRange(batch);
    const batchPath = path.join(
      directory,
      `batch-${batch.batch_index}.pdf`,
    );
    const pagePaths = Array.from(
      { length: inputEndPage - inputStartPage + 1 },
      (_, index) =>
        path.join(directory, `page-${inputStartPage + index}.pdf`),
    );

    try {
      await execFileAsync("pdfunite", [...pagePaths, batchPath], {
        timeout: PDF_TOOL_TIMEOUT_MS,
      });
      return {
        fileData: await fs.readFile(batchPath),
        inputStartPage,
        inputEndPage,
      };
    } finally {
      await fs.rm(batchPath, { force: true }).catch(() => {});
    }
  }

  function close() {
    return fs.rm(directory, { force: true, recursive: true });
  }

  try {
    for (const range of mergedRanges) {
      await execFileAsync(
        "pdfseparate",
        [
          "-f",
          String(range.start_page),
          "-l",
          String(range.end_page),
          sourcePath,
          pagePattern,
        ],
        { timeout: PDF_TOOL_TIMEOUT_MS },
      );
    }

    return { readBatch, close };
  } catch (error) {
    await close();
    throw error;
  }
}
