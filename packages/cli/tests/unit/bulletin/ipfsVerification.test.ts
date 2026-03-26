import { afterEach, describe, expect, mock, test } from "bun:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchWithStatus(status: number) {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(null, { status })),
  ) as unknown as typeof fetch;
}

function mockFetchReject(error: Error) {
  globalThis.fetch = mock(() => Promise.reject(error)) as unknown as typeof fetch;
}

async function loadModule() {
  return import("../../../src/bulletin/ipfs");
}

describe("verifyCidResolution", () => {
  const testCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

  test("treats 200 as resolvable", async () => {
    mockFetchWithStatus(200);
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://example.com");
    expect(result.resolvable).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  test("treats 301 redirect as not resolvable", async () => {
    mockFetchWithStatus(301);
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://example.com");
    expect(result.resolvable).toBe(false);
  });

  test("treats 302 redirect as not resolvable", async () => {
    mockFetchWithStatus(302);
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://example.com");
    expect(result.resolvable).toBe(false);
  });

  test("treats 404 as not resolvable", async () => {
    mockFetchWithStatus(404);
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://example.com");
    expect(result.resolvable).toBe(false);
  });

  test("treats 504 as not resolvable", async () => {
    mockFetchWithStatus(504);
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://example.com");
    expect(result.resolvable).toBe(false);
  });

  test("treats network error as not resolvable with error message", async () => {
    mockFetchReject(new Error("network timeout"));
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://example.com");
    expect(result.resolvable).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });

  test("uses GET with redirect follow for actual content retrieval", async () => {
    globalThis.fetch = mock((_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("follow");
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;
    const { verifyCidResolution } = await loadModule();
    await verifyCidResolution(testCid, "https://example.com");
  });

  test("tries both with and without trailing slash", async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = mock((url: string | URL | Request) => {
      calledUrls.push(String(url));
      return Promise.resolve(new Response(null, { status: 404 }));
    }) as unknown as typeof fetch;
    const { verifyCidResolution } = await loadModule();
    await verifyCidResolution(testCid, "https://example.com");
    expect(calledUrls).toContain(`https://example.com/ipfs/${testCid}`);
    expect(calledUrls).toContain(`https://example.com/ipfs/${testCid}/`);
  });

  test("includes gateway and cid in result", async () => {
    mockFetchWithStatus(200);
    const { verifyCidResolution } = await loadModule();
    const result = await verifyCidResolution(testCid, "https://my-gateway.io");
    expect(result.cid).toBe(testCid);
    expect(result.gateway).toBe("https://my-gateway.io");
  });
});

describe("verifyCidWithMultipleGateways", () => {
  const testCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

  test("checks all provided gateways concurrently", async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = mock((url: string | URL | Request) => {
      calledUrls.push(String(url));
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;

    const { verifyCidWithMultipleGateways } = await loadModule();
    const gateways = ["https://gw1.io", "https://gw2.io"];
    const results = await verifyCidWithMultipleGateways(testCid, gateways);

    expect(results.size).toBe(2);
    expect(calledUrls.some((u) => u.includes("gw1.io"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("gw2.io"))).toBe(true);
  });

  test("returns resolvable false when gateway returns 301", async () => {
    mockFetchWithStatus(301);
    const { verifyCidWithMultipleGateways } = await loadModule();
    const results = await verifyCidWithMultipleGateways(testCid, ["https://gw.io"]);
    const result = results.get("https://gw.io");
    expect(result?.resolvable).toBe(false);
  });

  test("uses default fallback gateways when none provided", async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = mock((url: string | URL | Request) => {
      calledUrls.push(String(url));
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as unknown as typeof fetch;

    const { verifyCidWithMultipleGateways } = await loadModule();
    await verifyCidWithMultipleGateways(testCid);

    expect(calledUrls.some((u) => u.includes("dweb.link"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("ipfs.io"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("cloudflare-ipfs.com"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("w3s.link"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("paseo-ipfs.polkadot.io"))).toBe(true);
  });

  test("mixed results: some gateways resolve, some fail", async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      const status = callCount <= 2 ? 404 : 200;
      return Promise.resolve(new Response(null, { status }));
    }) as unknown as typeof fetch;

    const { verifyCidWithMultipleGateways } = await loadModule();
    const results = await verifyCidWithMultipleGateways(testCid, [
      "https://fail.io",
      "https://pass.io",
    ]);

    const anyResolvable = Array.from(results.values()).some((r) => r.resolvable);
    expect(anyResolvable).toBe(true);
  });
});
