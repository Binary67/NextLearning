const VISUAL_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "img-src data:",
  "manifest-src 'none'",
  "media-src 'none'",
  "navigate-to 'none'",
  "object-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "worker-src 'none'",
].join("; ");

function createVisualDocument(htmlFragment: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${VISUAL_CONTENT_SECURITY_POLICY}">
    <style>
      html, body { min-height: 100%; max-width: 100%; margin: 0; overflow-x: hidden; }
      *, *::before, *::after { box-sizing: border-box; }
      img, svg, canvas, video { max-width: 100%; }
    </style>
  </head>
  <body>${htmlFragment}</body>
</html>`;
}

export function LearningVisualFrame({
  title,
  altText,
  htmlFragment,
}: {
  title: string;
  altText: string;
  htmlFragment: string;
}) {
  return (
    <iframe
      className="learning-visual-frame"
      title={`${title}: ${altText}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={createVisualDocument(htmlFragment)}
    />
  );
}
