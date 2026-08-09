import {
  isTutorialId,
  readStoredTutorial,
} from "@/lib/tutorial-storage";
import {
  statDocumentFile,
  streamDocumentFile,
} from "@/lib/document-artifact-storage";

export const runtime = "nodejs";

const CACHE_CONTROL = "private, max-age=31536000, immutable";

type TutorialFileRouteContext = {
  params: Promise<{ tutorialId: string }>;
};

type ByteRange = {
  start: number;
  end: number;
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

  const file = await statDocumentFile(tutorialId);
  const download = new URL(request.url).searchParams.has("download");
  const disposition = download ? "attachment" : "inline";
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE_CONTROL,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(tutorial.documentName)}`,
    "Content-Type": "application/pdf",
    ETag: file.etag,
  };
  const rangeHeader = request.headers.get("range");

  if (
    rangeHeader === null &&
    matchesIfNoneMatch(request.headers.get("if-none-match"), file.etag)
  ) {
    return new Response(null, {
      status: 304,
      headers: {
        "Accept-Ranges": headers["Accept-Ranges"],
        "Cache-Control": headers["Cache-Control"],
        ETag: headers.ETag,
      },
    });
  }

  if (rangeHeader !== null) {
    const range = parseByteRange(rangeHeader, file.size);

    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          ...headers,
          "Content-Range": `bytes */${file.size}`,
        },
      });
    }

    return new Response(streamDocumentFile(tutorialId, range), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      },
    });
  }

  return new Response(streamDocumentFile(tutorialId), {
    status: 200,
    headers: {
      ...headers,
      "Content-Length": String(file.size),
    },
  });
}

function parseByteRange(value: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);

  if (!match || (!match[1] && !match[2]) || size === 0) {
    return null;
  }

  const sizeValue = BigInt(size);
  const startValue = match[1] ? BigInt(match[1]) : null;
  const endValue = match[2] ? BigInt(match[2]) : null;

  if (startValue === null) {
    if (endValue === null || endValue === BigInt(0)) {
      return null;
    }

    const suffixLength =
      endValue > sizeValue ? sizeValue : endValue;

    return {
      start: Number(sizeValue - suffixLength),
      end: size - 1,
    };
  }

  if (
    startValue >= sizeValue ||
    (endValue !== null && endValue < startValue)
  ) {
    return null;
  }

  return {
    start: Number(startValue),
    end: Number(
      endValue === null || endValue >= sizeValue
        ? sizeValue - BigInt(1)
        : endValue,
    ),
  };
}

function matchesIfNoneMatch(
  value: string | null,
  etag: string,
) {
  if (!value) {
    return false;
  }

  return value.split(",").some((candidate) => {
    const tag = candidate.trim();

    return tag === "*" || tag === etag || tag === `W/${etag}`;
  });
}
