import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const CAR_CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_CAR_IN_FLIGHT_BYTES = 8 * 1024 * 1024;
const DEFAULT_TEMP_CAR_PATH = "/tmp/dotns-test-upload.car";

type StoreBlockCall = {
  contentCid: string;
  nonce: number;
  contentBytes: Uint8Array;
};

type MockState = {
  carBytes: Uint8Array;
  currentCarPath: string;
  storeBlockCalls: StoreBlockCall[];
  readPositions: number[];
  openPaths: string[];
  unlinkPaths: string[];
  exportPaths: string[];
  failChunkIndex: number | null;
  failChunkOnce: boolean;
};

const state: MockState = {
  carBytes: new Uint8Array(0),
  currentCarPath: DEFAULT_TEMP_CAR_PATH,
  storeBlockCalls: [],
  readPositions: [],
  openPaths: [],
  unlinkPaths: [],
  exportPaths: [],
  failChunkIndex: null,
  failChunkOnce: false,
};

const fsStatMock = mock(async (carPath: string) => {
  if (carPath !== state.currentCarPath) {
    throw new Error(`Unexpected stat path: ${carPath}`);
  }

  return {
    size: state.carBytes.length,
  } as const;
});

const fsOpenMock = mock(async (carPath: string) => {
  if (carPath !== state.currentCarPath) {
    throw new Error(`Unexpected open path: ${carPath}`);
  }

  state.openPaths.push(carPath);

  return {
    read: async (
      buffer: Buffer,
      bufferOffset: number,
      length: number,
      position: number,
    ): Promise<{ bytesRead: number }> => {
      state.readPositions.push(position);
      const slice = state.carBytes.subarray(position, position + length);
      buffer.set(slice, bufferOffset);
      return { bytesRead: slice.length };
    },
    close: async () => {},
  };
});

const fsUnlinkMock = mock(async (carPath: string) => {
  state.unlinkPaths.push(carPath);
});

const fsCreateReadStreamMock = mock(() => ({}));

const fsMock = {
  promises: {
    stat: fsStatMock,
    open: fsOpenMock,
    unlink: fsUnlinkMock,
  },
  createReadStream: fsCreateReadStreamMock,
};

const osMock = {
  tmpdir: () => "/tmp",
};

const addDirectoryToIpfsMock = mock(() => ({
  success: true,
  output: "bafyroot",
}));

const exportCidToCarMock = mock((cid: string, outputPath: string) => {
  state.exportPaths.push(outputPath);
  state.currentCarPath = outputPath;
  return {
    success: true,
    output: outputPath,
  };
});

const addDirectoryWithDaemonMock = mock(async () => ({
  success: true,
  daemonStarted: false,
}));

const provideRootCidMock = mock(() => ({
  success: true,
  output: "provided",
}));

const verifyCidResolutionMock = mock(async () => ({
  cid: "cid",
  gateway: "gateway",
  url: "https://example.com/ipfs/cid",
  resolvable: true,
}));

const verifySingleFileCidMock = mock(async () => ({
  cid: "cid",
  gateway: "gateway",
  url: "https://example.com/ipfs/cid",
  resolvable: true,
}));

const cidHistoryMock = {
  addUploadRecord: mock(async (record: { cid: string; ipfsCid: string }) => ({
    ...record,
    timestamp: new Date().toISOString(),
  })),
  readHistory: mock(async () => []),
  removeUploadRecord: mock(async () => false),
  clearHistory: mock(async () => 0),
  getHistoryPath: mock(() => "/tmp/uploads.json"),
  formatRecordTimestamp: mock(() => "timestamp"),
  getPreviewUrl: mock(() => "https://example.com/preview"),
};

const uploadManifestMock = {
  completedBlocksFromManifest: mock(() => []),
  loadManifestForResume: mock(async () => ({ manifest: null, manifestPath: null })),
  cleanupStaleManifests: mock(async () => {}),
  deleteManifest: mock(async () => {}),
};

const ipfsMock = {
  hasIpfsCli: mock(() => true),
  addDirectoryToIpfs: addDirectoryToIpfsMock,
  exportCidToCar: exportCidToCarMock,
  importCarToIpfs: mock(() => ({ success: true, output: "" })),
  provideRootCid: provideRootCidMock,
  addDirectoryWithDaemon: addDirectoryWithDaemonMock,
  verifyCidResolution: verifyCidResolutionMock,
  verifySingleFileCid: verifySingleFileCidMock,
  ensureIpfsRepo: mock(() => ({ success: true, output: "repo already initialized" })),
};

const createRawCidMock = mock((bytes: Uint8Array) => ({
  toString: () => `raw-${bytes[0] ?? 0}-${bytes.length}`,
}));

const cidMock = {
  encodeIpfsContenthash: mock((cid: string) => `contenthash:${cid}`),
  createRawCid: createRawCidMock,
  createDagPbCid: mock(() => ({ toString: () => "dagpb-cid" })),
  CODEC: {
    RAW: 0x55,
    DAG_PB: 0x70,
  },
  HASH: {
    SHA2_256: 0x12,
    BLAKE2B_256: 0xb220,
  },
};

const createBulletinClientMock = mock(() => ({
  destroy: mock(() => {}),
}));

const fetchAccountNonceMock = mock(async () => 100);

const storeBlockToBulletinMock = mock(async (params: {
  contentBytes: Uint8Array;
  contentCid: string;
  nonce: number;
}) => {
  const chunkIndex = params.contentBytes[0] ?? 0;
  state.storeBlockCalls.push({
    contentCid: params.contentCid,
    nonce: params.nonce,
    contentBytes: params.contentBytes,
  });

  if (
    state.failChunkIndex !== null &&
    chunkIndex === state.failChunkIndex &&
    state.failChunkOnce
  ) {
    state.failChunkOnce = false;
    throw new Error(`simulated upload failure for chunk ${chunkIndex}`);
  }
});

const storeModuleMock = {
  FINAL_STORE_CALL_TIMEOUT_MS: 180_000,
  createBulletinClient: createBulletinClientMock,
  fetchAccountNonce: fetchAccountNonceMock,
  storeBlockToBulletin: storeBlockToBulletinMock,
  storeChunkedFileToBulletin: mock(async () => ({ cid: "chunked" })),
  storeSingleFileToBulletin: mock(async () => ({ cid: "single" })),
  clampChunkSizeBytes: mock((value: number | undefined) => value ?? CAR_CHUNK_SIZE),
};

const uploadRetryMock = {
  normalizeUploadMaxRetries: mock((value: number | string | undefined) => {
    if (value === undefined) return 1;
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Math.floor(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(20, parsed)) : 1;
  }),
  isRetryableUploadError: mock(() => true),
  runWithUploadRetries: mock(async <T>(options: {
    execute: (attempt: number, totalAttempts: number) => Promise<T>;
    onRetry?: (info: {
      retry: number;
      totalAttempts: number;
      delayMs: number;
      error: unknown;
    }) => void;
    maxRetries?: number;
  }) => {
    const maxRetries = options.maxRetries ?? 1;
    const totalAttempts = maxRetries + 1;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      try {
        return await options.execute(attempt, totalAttempts);
      } catch (error) {
        if (attempt >= maxRetries) {
          throw error;
        }

        options.onRetry?.({
          retry: attempt + 1,
          totalAttempts,
          delayMs: 0,
          error,
        });
      }
    }

    throw new Error("unreachable");
  }),
};

mock.module("node:fs", () => fsMock);
mock.module("node:os", () => ({ default: osMock, ...osMock }));
mock.module("../../../src/bulletin/ipfs", () => ipfsMock);
mock.module("../../../src/bulletin/cid", () => cidMock);
mock.module("../../../src/bulletin/store", () => storeModuleMock);
mock.module("../../../src/bulletin/cidHistory", () => cidHistoryMock);
mock.module("../../../src/bulletin/uploadManifest", () => uploadManifestMock);
mock.module("../../../src/bulletin/uploadRetry", () => uploadRetryMock);

const { storeDirectoryAsCar } = await import("../../../src/commands/bulletin");

function resetState(): void {
  state.carBytes = new Uint8Array(0);
  state.currentCarPath = DEFAULT_TEMP_CAR_PATH;
  state.storeBlockCalls = [];
  state.readPositions = [];
  state.openPaths = [];
  state.unlinkPaths = [];
  state.exportPaths = [];
  state.failChunkIndex = null;
  state.failChunkOnce = false;
}

function makeCarBytes(chunkCount: number): Uint8Array {
  const bytes = new Uint8Array(chunkCount * CAR_CHUNK_SIZE);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    bytes.fill(chunkIndex, chunkIndex * CAR_CHUNK_SIZE, (chunkIndex + 1) * CAR_CHUNK_SIZE);
  }
  return bytes;
}

beforeEach(() => {
  resetState();
  fsStatMock.mockClear();
  fsOpenMock.mockClear();
  fsUnlinkMock.mockClear();
  fsCreateReadStreamMock.mockClear();
  addDirectoryToIpfsMock.mockClear();
  exportCidToCarMock.mockClear();
  addDirectoryWithDaemonMock.mockClear();
  provideRootCidMock.mockClear();
  verifyCidResolutionMock.mockClear();
  verifySingleFileCidMock.mockClear();
  cidHistoryMock.addUploadRecord.mockClear();
  cidHistoryMock.readHistory.mockClear();
  cidHistoryMock.removeUploadRecord.mockClear();
  cidHistoryMock.clearHistory.mockClear();
  cidHistoryMock.getHistoryPath.mockClear();
  cidHistoryMock.formatRecordTimestamp.mockClear();
  cidHistoryMock.getPreviewUrl.mockClear();
  uploadManifestMock.completedBlocksFromManifest.mockClear();
  uploadManifestMock.loadManifestForResume.mockClear();
  uploadManifestMock.cleanupStaleManifests.mockClear();
  uploadManifestMock.deleteManifest.mockClear();
  createRawCidMock.mockClear();
  createBulletinClientMock.mockClear();
  fetchAccountNonceMock.mockClear();
  storeBlockToBulletinMock.mockClear();
  storeModuleMock.storeChunkedFileToBulletin.mockClear();
  storeModuleMock.storeSingleFileToBulletin.mockClear();
  storeModuleMock.clampChunkSizeBytes.mockClear();
  uploadRetryMock.normalizeUploadMaxRetries.mockClear();
  uploadRetryMock.isRetryableUploadError.mockClear();
  uploadRetryMock.runWithUploadRetries.mockClear();
});

afterEach(() => {
  resetState();
});

describe("storeDirectoryAsCar", () => {
  test("clamps in-flight CAR uploads to the byte budget", async () => {
    state.carBytes = makeCarBytes(6);

    const result = await storeDirectoryAsCar(
      "wss://bulletin.example",
      {} as never,
      "/tmp/example-directory",
      {
        accountAddress: "//Alice",
        concurrency: 6,
        maxRetries: 0,
      },
    );

    expect(result.storageCid).toBe("bafyroot");
    expect(result.ipfsCid).toBe("bafyroot");
    expect(uploadRetryMock.runWithUploadRetries).toHaveBeenCalledTimes(1);
    expect(fsOpenMock).toHaveBeenCalledTimes(1);
    expect(fsUnlinkMock).toHaveBeenCalledTimes(1);
    expect(exportCidToCarMock).toHaveBeenCalledTimes(1);
    expect(state.storeBlockCalls.map((call) => call.nonce)).toEqual([100, 101, 102, 103, 104, 105]);
    expect(state.readPositions).toEqual([
      0,
      CAR_CHUNK_SIZE,
      CAR_CHUNK_SIZE * 2,
      CAR_CHUNK_SIZE * 3,
      CAR_CHUNK_SIZE * 4,
      CAR_CHUNK_SIZE * 5,
    ]);
    expect(state.exportPaths[0]).toBeDefined();
    expect(state.exportPaths[0]).toBe(state.currentCarPath);
    expect(state.unlinkPaths).toEqual([state.currentCarPath]);
    expect(state.storeBlockCalls).toHaveLength(6);
    expect(MAX_CAR_IN_FLIGHT_BYTES / CAR_CHUNK_SIZE).toBe(4);
  });

  test("retries only failed CAR chunks and keeps completed chunks", async () => {
    state.carBytes = makeCarBytes(3);
    state.failChunkIndex = 1;
    state.failChunkOnce = true;

    const result = await storeDirectoryAsCar(
      "wss://bulletin.example",
      {} as never,
      "/tmp/example-directory",
      {
        accountAddress: "//Alice",
        concurrency: 3,
        maxRetries: 1,
      },
    );

    expect(result.storageCid).toBe("bafyroot");
    expect(result.ipfsCid).toBe("bafyroot");
    expect(uploadRetryMock.runWithUploadRetries).toHaveBeenCalledTimes(1);
    expect(fetchAccountNonceMock).toHaveBeenCalledTimes(2);
    expect(fsOpenMock).toHaveBeenCalledTimes(2);
    expect(fsUnlinkMock).toHaveBeenCalledTimes(1);
    expect(state.storeBlockCalls.map((call) => call.contentBytes[0])).toEqual([0, 1, 2, 1]);
    expect(state.storeBlockCalls.map((call) => call.nonce)).toEqual([100, 101, 102, 100]);
    expect(state.readPositions).toEqual([
      0,
      CAR_CHUNK_SIZE,
      CAR_CHUNK_SIZE * 2,
      CAR_CHUNK_SIZE,
    ]);
    expect(state.storeBlockCalls.filter((call) => call.contentBytes[0] === 0)).toHaveLength(1);
    expect(state.storeBlockCalls.filter((call) => call.contentBytes[0] === 2)).toHaveLength(1);
  });
});
