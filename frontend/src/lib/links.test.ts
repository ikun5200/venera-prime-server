import { describe, expect, it } from "vitest";
import { comicPath, readerPath } from "./links";

describe("comic routes", () => {
  it("encodes ids that contain slashes or schemes", () => {
    expect(comicPath("goda", "/manga/a/b")).toBe(
      "/comic/goda/%2Fmanga%2Fa%2Fb",
    );
    expect(comicPath("ykmh", "https://example.com/m/1/")).toBe(
      "/comic/ykmh/https%3A%2F%2Fexample.com%2Fm%2F1%2F",
    );
  });

  it("encodes reader ids and query parameters", () => {
    expect(readerPath("ykmh", "https://example.com/m/1/", {
      chapter: "ch/1",
      page: 2,
    })).toBe(
      "/reader/ykmh/https%3A%2F%2Fexample.com%2Fm%2F1%2F?chapter=ch%2F1&page=2",
    );
  });
});
