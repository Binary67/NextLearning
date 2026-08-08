import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LearningVisualFrame } from "./learning-visual-frame";

describe("LearningVisualFrame", () => {
  it("keeps generated markup inside a script-only, no-network iframe", () => {
    const markup = renderToStaticMarkup(
      LearningVisualFrame({
        title: "Signal paths",
        altText: "Two paths branching from one signal.",
        htmlFragment: "<button>Inside iframe</button>",
      }),
    );

    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).not.toContain("allow-same-origin");
    expect(markup).toContain("Content-Security-Policy");
    expect(markup).toContain("default-src");
    expect(markup).toContain("connect-src");
    expect(markup).toContain("img-src data:");
    expect(markup).toContain(
      "&lt;button&gt;Inside iframe&lt;/button&gt;",
    );
    expect(markup).not.toContain("<button>Inside iframe</button>");
  });
});
