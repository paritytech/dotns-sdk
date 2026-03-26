import { afterEach, describe, expect, mock, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { hasIpfsCli, importCarToIpfs } from "../../../src/bulletin/ipfs";

const tmpDir = path.join("/tmp", `dotns-kubo-tests-${process.pid}-${Date.now()}`);

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // already cleaned
  }
});

describe("hasIpfsCli", () => {
  test("returns a boolean", () => {
    const result = hasIpfsCli();
    expect(typeof result).toBe("boolean");
  });
});

describe("importCarToIpfs", () => {
  test("returns failure for nonexistent CAR file", () => {
    const result = importCarToIpfs("/tmp/nonexistent-dotns-test-car-" + Date.now() + ".car");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("returns failure when ipfs CLI is not available and file exists", async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    const carPath = path.join(tmpDir, "empty.car");
    await fs.writeFile(carPath, new Uint8Array(0));

    const result = importCarToIpfs(carPath);

    if (hasIpfsCli()) {
      expect(typeof result.success).toBe("boolean");
    } else {
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  test("result shape includes success field", () => {
    const result = importCarToIpfs("/dev/null");
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  });
});
