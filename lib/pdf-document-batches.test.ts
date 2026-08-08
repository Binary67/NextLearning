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

  it("separates once, overlaps reads, uses unique outputs, and cleans up", async () => {
    let activeUnites = 0;
    let maxActiveUnites = 0;
    const calls: Array<{ command: string; args: string[] }> = [];

    mocks.execFile.mockImplementation(
      (
        command: string,
        args: string[],
        callback: (error: Error | null) => void,
      ) => {
        calls.push({ command, args });

        if (command === "pdfseparate") {
          const pagePattern = args.at(-1)!;
          Promise.all(
            Array.from({ length: 20 }, (_, index) =>
              fs.writeFile(
                pagePattern.replace("%d", String(index + 1)),
                `page ${index + 1}`,
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

    const reader = await openPdfBatchReader("/documents/source.pdf", 20);
    const [first, second] = await Promise.all([
      reader.readBatch({ batch_index: 1, start_page: 1, end_page: 10 }),
      reader.readBatch({ batch_index: 2, start_page: 11, end_page: 20 }),
    ]);

    expect(first).toEqual({
      fileData: Buffer.from("batch-1.pdf"),
      inputStartPage: 1,
      inputEndPage: 11,
    });
    expect(second).toEqual({
      fileData: Buffer.from("batch-2.pdf"),
      inputStartPage: 10,
      inputEndPage: 20,
    });
    expect(maxActiveUnites).toBe(2);

    const separateCalls = calls.filter(
      ({ command }) => command === "pdfseparate",
    );
    expect(separateCalls).toHaveLength(1);
    expect(separateCalls[0].args.slice(0, 5)).toEqual([
      "-f",
      "1",
      "-l",
      "20",
      "/documents/source.pdf",
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
    ).toEqual(
      Array.from({ length: 11 }, (_, index) => `page-${index + 1}.pdf`),
    );
    expect(
      uniteCalls[1].args.slice(0, -1).map((filePath) => path.basename(filePath)),
    ).toEqual(
      Array.from({ length: 11 }, (_, index) => `page-${index + 10}.pdf`),
    );

    const workspace = path.dirname(separateCalls[0].args.at(-1)!);
    await reader.close();
    await expect(fs.access(workspace)).rejects.toThrow();
  });
});
