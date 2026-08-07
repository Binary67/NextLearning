import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readPdfPageCount(filePath: string) {
  const { stdout } = await execFileAsync("pdfinfo", [filePath], {
    maxBuffer: 1024 * 1024,
  });
  const match = stdout.match(/^Pages:\s+(\d+)$/m);
  const pageCount = match ? Number(match[1]) : 0;

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("The PDF page count could not be read.");
  }

  return pageCount;
}
