import { describe, expect, it, vi } from "vitest";
import { completeUpload, uploadFile } from "./api";

describe("chunked upload", () => {
  it("uploads a file in chunks and reports progress", async () => {
    const calls: { path: string; method: string; size: number }[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const url = new URL(raw, "http://localhost");
        const body = init?.body as Blob | undefined;
        calls.push({
          path: url.pathname + url.search,
          method: init?.method ?? "GET",
          size: body?.size ?? 0,
        });
        if (url.pathname === "/api/uploads/init") {
          return new Response(JSON.stringify({ uploadId: "u1", offset: 0 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.pathname === "/api/uploads/u1/chunk") {
          const offset = Number(url.searchParams.get("offset") ?? 0);
          return new Response(
            JSON.stringify({ offset: offset + (body?.size ?? 0) }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (url.pathname === "/api/uploads/u1/complete") {
          return new Response(JSON.stringify({ upload: { id: "u1" } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("{}", { status: 404 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const progress: number[] = [];
    const file = new File([new Uint8Array(6 * 1024 * 1024)], "comic.zip", {
      type: "application/zip",
    });
    const result = await uploadFile(file, (value) => progress.push(value));
    expect(result.uploadId).toBe("u1");
    const chunks = calls.filter((call) => call.path.includes("/chunk"));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].method).toBe("PUT");
    expect(progress[progress.length - 1]).toBe(1);
    expect(calls[0].path).toBe("/api/uploads/init");

    await completeUpload("u1", true);
    expect(calls.some((call) => call.path === "/api/uploads/u1/complete")).toBe(
      true,
    );
    vi.unstubAllGlobals();
  });
});
