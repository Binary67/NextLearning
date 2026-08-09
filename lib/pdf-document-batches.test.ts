import { promises as fs } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

import { openPdfBatchReader } from "@/lib/pdf-document-batches";

describe("PDF document batch reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("splits merged pending spans, overlaps concurrent reads, and cleans batch PDFs immediately", async () => {
    let activeUnites = 0;
    let maxActiveUnites = 0;
    const calls: Array<{
      command: string;
      args: string[];
      options: { timeout: number };
    }> = [];

    mocks.execFile.mockImplementation(
      (
        command: string,
        args: string[],
        options: { timeout: number },
        callback: (error: Error | null) => void,
      ) => {
        calls.push({ command, args, options });

        if (command === "pdfseparate") {
          const pagePattern = args.at(-1)!;
          const start = Number(args[1]);
          const end = Number(args[3]);
          Promise.all(
            Array.from({ length: end - start + 1 }, (_, index) =>
              fs.writeFile(
                pagePattern.replace("%d", String(start + index)),
                `page ${start + index}`,
              ),
            ),
          ).then(() => callback(null), callback);
          return;
        }

        activeUnites += 1;
        maxActiveUnites = Math.max(maxActiveUnites, activeUnites);
        const outputPath = args.at(-1)!;
        setImmediate(() => {
          fs.writeFile(outputPath, path.basename(outputPath)).then(
            () => {
              activeUnites -= 1;
              callback(null);
            },
            callback,
          );
        });
      },
    );

    const reader = await openPdfBatchReader("/documents/source.pdf", 20, [
      { batch_index: 1, start_page: 2, end_page: 3 },
      { batch_index: 3, start_page: 4, end_page: 5 },
      { batch_index: 2, start_page: 10, end_page: 11 },
    ]);
    const [first, second] = await Promise.all([
      reader.readBatch({ batch_index: 1, start_page: 2, end_page: 3 }),
      reader.readBatch({ batch_index: 2, start_page: 10, end_page: 11 }),
    ]);

    expect(first).toEqual({
      fileData: Buffer.from("batch-1.pdf"),
      inputStartPage: 1,
      inputEndPage: 4,
    });
    expect(second).toEqual({
      fileData: Buffer.from("batch-2.pdf"),
      inputStartPage: 9,
      inputEndPage: 12,
    });
    expect(maxActiveUnites).toBe(2);
    expect(calls.every(({ options }) => options.timeout === 5 * 60 * 1000)).toBe(
      true,
    );

    const separateCalls = calls.filter(
      ({ command }) => command === "pdfseparate",
    );
    expect(separateCalls).toHaveLength(2);
    expect(
      separateCalls.map(({ args }) => args.slice(0, 5)),
    ).toEqual([
      ["-f", "1", "-l", "6", "/documents/source.pdf"],
      ["-f", "9", "-l", "12", "/documents/source.pdf"],
    ]);
    const uniteCalls = calls.filter(
      ({ command }) => command === "pdfunite",
    );
    expect(uniteCalls).toHaveLength(2);
    expect(uniteCalls.map(({ args }) => path.basename(args.at(-1)!))).toEqual([
      "batch-1.pdf",
      "batch-2.pdf",
    ]);
    expect(
      uniteCalls[0].args.slice(0, -1).map((filePath) => path.basename(filePath)),
    ).toEqual([
      "page-1.pdf",
      "page-2.pdf",
      "page-3.pdf",
      "page-4.pdf",
    ]);
    expect(
      uniteCalls[1].args.slice(0, -1).map((filePath) => path.basename(filePath)),
    ).toEqual(["page-9.pdf", "page-10.pdf", "page-11.pdf", "page-12.pdf"]);
    await expect(fs.access(uniteCalls[0].args.at(-1)!)).rejects.toThrow();
    await expect(fs.access(uniteCalls[1].args.at(-1)!)).rejects.toThrow();

    const workspace = path.dirname(separateCalls[0].args.at(-1)!);
    await reader.close();
    await expect(fs.access(workspace)).rejects.toThrow();
  });
});
