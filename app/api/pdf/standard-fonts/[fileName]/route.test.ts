import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/pdf/standard-fonts/[fileName]/route";

describe("PDF standard-font route", () => {
  it("streams an installed standard font with immutable caching", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/pdf/standard-fonts/LiberationSans-Regular.ttf",
      ),
      {
        params: Promise.resolve({
          fileName: "LiberationSans-Regular.ttf",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("Content-Type")).toBe("font/ttf");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Number(response.headers.get("Content-Length"))).toBeGreaterThan(0);
    expect((await response.arrayBuffer()).byteLength).toBe(
      Number(response.headers.get("Content-Length")),
    );
  });

  it("does not expose other package files or paths", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/pdf/standard-fonts/package.json",
      ),
      {
        params: Promise.resolve({ fileName: "../package.json" }),
      },
    );

    expect(response.status).toBe(404);
  });
});
