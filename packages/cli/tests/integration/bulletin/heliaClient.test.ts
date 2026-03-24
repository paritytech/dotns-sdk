import { expect, test, afterAll } from "bun:test";
import { BulletinHeliaClient } from "../../../src/bulletin/heliaClient";

const KNOWN_RESOLVABLE_CID = "bafkreidd6megpuwnyhhqahvaf4jdwgtcfc5ep7lyhljpvz27taeig5mpgq";
const NONEXISTENT_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

let testClient: BulletinHeliaClient | null = null;

afterAll(async () => {
  if (testClient) {
    await testClient.destroy();
    testClient = null;
  }
});

test(
  "connects to at least one Paseo Bulletin peer",
  async () => {
    testClient = new BulletinHeliaClient();
    await testClient.initialize();
  },
  { timeout: 30_000 },
);

test(
  "resolves a known CID that exists on Bulletin",
  async () => {
    if (!testClient) {
      testClient = new BulletinHeliaClient();
      await testClient.initialize();
    }

    const result = await testClient.fetchBlock(KNOWN_RESOLVABLE_CID);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.size).toBeGreaterThan(0);
  },
  { timeout: 60_000 },
);

test(
  "verifyCid returns true for existing content",
  async () => {
    if (!testClient) {
      testClient = new BulletinHeliaClient();
      await testClient.initialize();
    }

    const resolved = await testClient.verifyCid(KNOWN_RESOLVABLE_CID);
    expect(resolved).toBe(true);
  },
  { timeout: 60_000 },
);

test(
  "verifyCid returns false for nonexistent content",
  async () => {
    if (!testClient) {
      testClient = new BulletinHeliaClient();
      await testClient.initialize();
    }

    const resolved = await testClient.verifyCid(NONEXISTENT_CID);
    expect(resolved).toBe(false);
  },
  { timeout: 60_000 },
);

test(
  "cleans up without errors on destroy",
  async () => {
    const ephemeralClient = new BulletinHeliaClient();
    await ephemeralClient.initialize();
    await ephemeralClient.destroy();
  },
  { timeout: 30_000 },
);
