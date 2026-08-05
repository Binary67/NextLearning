export class RequestBodyTooLargeError extends Error {}

export async function readRequestBytesWithLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      byteLength += value.byteLength;

      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size error remains the actionable failure.
        }

        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function readRequestTextWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const bytes = await readRequestBytesWithLimit(
    request,
    maxBytes,
  );

  return new TextDecoder().decode(bytes);
}

export function isMultipartFormDataContentType(
  contentType: string | null,
) {
  const mediaType = contentType
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();

  return mediaType === "multipart/form-data";
}

export function isContentLengthOverLimit(
  contentLength: string | null,
  maxBytes: number,
) {
  return (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  );
}

export function isUtf8TextOverLimit(
  value: string,
  maxBytes: number,
) {
  return new TextEncoder().encode(value).byteLength > maxBytes;
}
