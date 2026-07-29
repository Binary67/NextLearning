import {
  readDocumentFile,
  readStoredDocument,
} from "@/lib/document-storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const document = await readStoredDocument();

  if (!document) {
    return new Response("No document has been uploaded.", { status: 404 });
  }

  const file = await readDocumentFile(document);
  const download = new URL(request.url).searchParams.has("download");
  const disposition = download ? "attachment" : "inline";

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(document.name)}`,
      "Content-Length": String(file.byteLength),
      "Content-Type":
        document.type === "pdf"
          ? "application/pdf"
          : "text/markdown; charset=utf-8",
    },
  });
}
