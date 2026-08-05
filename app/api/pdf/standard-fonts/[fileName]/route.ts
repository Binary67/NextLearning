import { createReadStream, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=31536000, immutable";
const STANDARD_FONT_FILE_NAMES = new Set([
  "FoxitDingbats.pfb",
  "FoxitFixed.pfb",
  "FoxitFixedBold.pfb",
  "FoxitFixedBoldItalic.pfb",
  "FoxitFixedItalic.pfb",
  "FoxitSerif.pfb",
  "FoxitSerifBold.pfb",
  "FoxitSerifBoldItalic.pfb",
  "FoxitSerifItalic.pfb",
  "FoxitSymbol.pfb",
  "LiberationSans-Bold.ttf",
  "LiberationSans-BoldItalic.ttf",
  "LiberationSans-Italic.ttf",
  "LiberationSans-Regular.ttf",
]);
const require = createRequire(import.meta.url);
const standardFontsDirectory = path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "standard_fonts",
);

type StandardFontRouteContext = {
  params: Promise<{ fileName: string }>;
};

export async function GET(
  _request: Request,
  context: StandardFontRouteContext,
) {
  const { fileName } = await context.params;

  if (!STANDARD_FONT_FILE_NAMES.has(fileName)) {
    return new Response("That PDF font is not available.", {
      status: 404,
    });
  }

  const filePath = path.join(standardFontsDirectory, fileName);
  const stats = await fs.stat(filePath);
  const stream = Readable.toWeb(
    createReadStream(filePath),
  ) as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "Content-Length": String(stats.size),
      "Content-Type": fileName.endsWith(".ttf")
        ? "font/ttf"
        : "application/x-font-type1",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
