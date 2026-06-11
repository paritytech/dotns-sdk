import { describe, it, expect } from "bun:test";
import { safeHttpUrl, socialHandle } from "./safeLink";

describe("safeHttpUrl", () => {
  it("accepts http and https urls", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com");
    expect(safeHttpUrl("http://example.com/path")).toBe("http://example.com/path");
  });

  it("rejects javascript, data and other schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects malformed or empty input", () => {
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("socialHandle", () => {
  it("accepts valid x and github handles", () => {
    expect(socialHandle("alice", "x")).toBe("alice");
    expect(socialHandle("alice_99", "x")).toBe("alice_99");
    expect(socialHandle("a-b-c", "github")).toBe("a-b-c");
  });

  it("rejects handles with path/query/slashes used to spoof a destination", () => {
    expect(socialHandle("evil.com/?", "x")).toBeNull();
    expect(socialHandle("a/../b", "github")).toBeNull();
    expect(socialHandle("name with space", "x")).toBeNull();
    expect(socialHandle("a".repeat(16), "x")).toBeNull();
    expect(socialHandle("", "github")).toBeNull();
    expect(socialHandle(null, "x")).toBeNull();
  });
});
