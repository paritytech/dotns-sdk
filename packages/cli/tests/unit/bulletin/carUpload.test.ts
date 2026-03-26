import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applyCarUploadWaveResults,
  chunkCarBytes,
  clampCarWaveSize,
  countCarChunks,
  getCarChunkLength,
  getPendingCarChunkIndexes,
  merkleizeDirectoryToBlocks,
  readCarChunk,
} from "../../../src/commands/bulletin";

const testDirectoryRoot = path.join("/tmp", `dotns-car-upload-tests-${process.pid}-${Date.now()}`);
const CAR_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

afterEach(async () => {
  try {
    await fs.rm(testDirectoryRoot, { recursive: true, force: true });
  } catch {
    // already cleaned
  }
});

async function createTestDirectory(name: string): Promise<string> {
  const dirPath = path.join(testDirectoryRoot, name);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, "index.html"), "<html><body>Hello</body></html>");
  await fs.writeFile(path.join(dirPath, "style.css"), "body { color: red; }");
  return dirPath;
}

async function createCarFixture(
  name: string,
  chunkLengths: number[],
): Promise<{ filePath: string; bytes: Uint8Array; totalBytes: number }> {
  const filePath = path.join(testDirectoryRoot, `${name}.car`);
  await fs.mkdir(testDirectoryRoot, { recursive: true });

  const totalBytes = chunkLengths.reduce((sum, length) => sum + length, 0);
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  chunkLengths.forEach((length, index) => {
    bytes.fill(index + 1, offset, offset + length);
    offset += length;
  });

  await fs.writeFile(filePath, bytes);
  return { filePath, bytes, totalBytes };
}

describe("chunkCarBytes", () => {
  test("returns single chunk when data fits within chunk size", () => {
    const data = new Uint8Array(100);
    const chunks = chunkCarBytes(data, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.length).toBe(100);
  });

  test("splits data into correct number of chunks", () => {
    const data = new Uint8Array(500);
    const chunks = chunkCarBytes(data, 200);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.length).toBe(200);
    expect(chunks[1]!.length).toBe(200);
    expect(chunks[2]!.length).toBe(100);
  });

  test("handles exact chunk boundary", () => {
    const data = new Uint8Array(400);
    const chunks = chunkCarBytes(data, 200);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.length).toBe(200);
    expect(chunks[1]!.length).toBe(200);
  });

  test("handles empty input", () => {
    const data = new Uint8Array(0);
    const chunks = chunkCarBytes(data, 200);
    expect(chunks).toHaveLength(0);
  });

  test("preserves data content across chunks", () => {
    const data = new Uint8Array(10);
    for (let i = 0; i < 10; i++) data[i] = i;

    const chunks = chunkCarBytes(data, 3);
    expect(chunks).toHaveLength(4);

    const reassembled = new Uint8Array(10);
    let offset = 0;
    for (const chunk of chunks) {
      reassembled.set(chunk, offset);
      offset += chunk.length;
    }
    expect(reassembled).toEqual(data);
  });
});

describe("merkleizeDirectoryToBlocks", () => {
  test("collects blocks and produces a root CID", async () => {
    const dirPath = await createTestDirectory("basic");

    const result = await merkleizeDirectoryToBlocks(dirPath);

    expect(result.rootCid).toBeDefined();
    expect(result.rootCid.toString()).toMatch(/^bafy/);
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  test("each block has a valid CID and non-empty bytes", async () => {
    const dirPath = await createTestDirectory("block-validity");

    const result = await merkleizeDirectoryToBlocks(dirPath);

    for (const block of result.blocks) {
      expect(block.cid).toBeDefined();
      expect(block.cid.toString()).toBeTruthy();
      expect(block.bytes.length).toBeGreaterThan(0);
    }
  });

  test("totalBytes matches sum of block sizes", async () => {
    const dirPath = await createTestDirectory("byte-sum");

    const result = await merkleizeDirectoryToBlocks(dirPath);
    const sum = result.blocks.reduce((acc, b) => acc + b.bytes.length, 0);

    expect(result.totalBytes).toBe(sum);
  });

  test("deduplicates blocks with identical CIDs", async () => {
    const dirPath = await createTestDirectory("dedup");
    await fs.writeFile(path.join(dirPath, "copy.html"), "<html><body>Hello</body></html>");

    const result = await merkleizeDirectoryToBlocks(dirPath);

    const cidStrings = result.blocks.map((b) => b.cid.toString());
    const uniqueCids = new Set(cidStrings);
    expect(cidStrings.length).toBe(uniqueCids.size);
  });

  test("throws for nonexistent directory", async () => {
    await expect(
      merkleizeDirectoryToBlocks("/tmp/nonexistent-dotns-test-dir-" + Date.now()),
    ).rejects.toThrow();
  });
});

describe("CAR upload helpers", () => {
  test("counts chunks, sizes the tail chunk, and clamps CAR wave size", () => {
    expect(countCarChunks(0, CAR_CHUNK_SIZE_BYTES)).toBe(0);
    expect(countCarChunks(CAR_CHUNK_SIZE_BYTES * 4 + 17, CAR_CHUNK_SIZE_BYTES)).toBe(5);
    expect(getCarChunkLength(CAR_CHUNK_SIZE_BYTES * 4 + 17, 4, CAR_CHUNK_SIZE_BYTES)).toBe(17);
    expect(getCarChunkLength(CAR_CHUNK_SIZE_BYTES * 4 + 17, 5, CAR_CHUNK_SIZE_BYTES)).toBe(0);
    expect(clampCarWaveSize(99)).toBe(4);
    expect(clampCarWaveSize(0)).toBe(1);
  });

  test("reads CAR chunks from the correct offsets, including a partial tail chunk", async () => {
    const fixture = await createCarFixture("read-car-chunk", [
      CAR_CHUNK_SIZE_BYTES,
      CAR_CHUNK_SIZE_BYTES,
      19,
    ]);
    const handle = await fs.open(fixture.filePath, "r");

    try {
      const firstChunk = await readCarChunk(handle, fixture.totalBytes, 0, CAR_CHUNK_SIZE_BYTES);
      const secondChunk = await readCarChunk(handle, fixture.totalBytes, 1, CAR_CHUNK_SIZE_BYTES);
      const tailChunk = await readCarChunk(handle, fixture.totalBytes, 2, CAR_CHUNK_SIZE_BYTES);

      expect(firstChunk.length).toBe(CAR_CHUNK_SIZE_BYTES);
      expect(firstChunk[0]).toBe(1);
      expect(secondChunk.length).toBe(CAR_CHUNK_SIZE_BYTES);
      expect(secondChunk[0]).toBe(2);
      expect(tailChunk.length).toBe(19);
      expect(tailChunk[0]).toBe(3);
      expect(tailChunk[18]).toBe(3);
    } finally {
      await handle.close();
    }
  });

  test("returns only chunk indexes that still need to be uploaded", () => {
    const completedChunkIndexes = new Set([0, 2, 4]);
    expect(getPendingCarChunkIndexes(5, completedChunkIndexes)).toEqual([1, 3]);
  });

  test("preserves successful chunk completions and clears wave bytes after a partial failure", () => {
    const completedChunkIndexes = new Set<number>();
    const waveChunks = [
      { index: 0, bytes: new Uint8Array([1]) },
      { index: 1, bytes: new Uint8Array([2]) },
      { index: 2, bytes: new Uint8Array([3]) },
    ];
    const error = new Error("temporary transport error");

    const firstFailure = applyCarUploadWaveResults(
      waveChunks,
      [
        { status: "fulfilled", value: 0 },
        { status: "rejected", reason: error },
        { status: "fulfilled", value: 2 },
      ],
      completedChunkIndexes,
    );

    expect(firstFailure).toBe(error);
    expect([...completedChunkIndexes]).toEqual([0, 2]);
    expect(waveChunks.map((chunk) => chunk.bytes.length)).toEqual([0, 0, 0]);
  });
});
