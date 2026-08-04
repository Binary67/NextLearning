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
