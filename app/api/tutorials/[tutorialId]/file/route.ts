import {
  isTutorialId,
  readDocumentFile,
  readStoredTutorial,
} from "@/lib/document-storage";

export const runtime = "nodejs";

type TutorialFileRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

export async function GET(
  request: Request,
  context: TutorialFileRouteContext,
) {
  const { tutorialId } = await context.params;
  const tutorial = isTutorialId(tutorialId)
    ? await readStoredTutorial(tutorialId)
    : null;

  if (!tutorial) {
    return new Response("That document is not available.", { status: 404 });
  }

  const file = await readDocumentFile(tutorialId);
  const download = new URL(request.url).searchParams.has("download");
  const disposition = download ? "attachment" : "inline";

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(tutorial.documentName)}`,
      "Content-Length": String(file.byteLength),
      "Content-Type": "application/pdf",
    },
  });
}
