export async function readPdfPageCount(fileData: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(fileData),
  });

  try {
    const document = await loadingTask.promise;
    return document.numPages;
  } finally {
    await loadingTask.destroy();
  }
}
