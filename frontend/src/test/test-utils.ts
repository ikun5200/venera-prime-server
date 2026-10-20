import { afterEach, vi } from "vitest";

export type MockRoute =
  ((init?: RequestInit) => unknown) | object | string | number | boolean | null;

export function mockFetch(routes: Record<string, MockRoute>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(raw, "http://localhost");
    const path = url.pathname + (url.search || "");
    const exact = routes[path];
    if (exact !== undefined) {
      const result = typeof exact === "function" ? exact(init) : exact;
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result ?? {}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const prefix = Object.keys(routes).find(
      (key) => key.endsWith("*") && path.startsWith(key.slice(0, -1)),
    );
    if (prefix) {
      const route = routes[prefix];
      const result = typeof route === "function" ? route(init) : route;
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result ?? {}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: { code: "NOT_FOUND", message: path } }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    );
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
