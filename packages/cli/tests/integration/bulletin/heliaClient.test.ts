import { expect, test, afterAll } from "bun:test";
import { BulletinHeliaClient } from "../../../src/bulletin/heliaClient";
import { resolveBulletinPeers } from "../../../src/bulletin/bulletinPeers";
import { DOTNS_ENVIRONMENTS } from "../../../src/utils/environments";

const PASEO_PEERS = await resolveBulletinPeers(DOTNS_ENVIRONMENTS["paseo-v2"].descriptor);

const KNOWN_RESOLVABLE_CID = "bafkreidd6megpuwnyhhqahvaf4jdwgtcfc5ep7lyhljpvz27taeig5mpgq";
const NONEXISTENT_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const testClient = new BulletinHeliaClient(PASEO_PEERS);

afterAll(async () => {
  await testClient.destroy();
});

test(
  "resolves a known CID that exists on Bulletin",
  async () => {
    const block = await testClient.fetchBlock(KNOWN_RESOLVABLE_CID);
    expect(block.length).toBeGreaterThan(0);
  },
  { timeout: 60_000 },
);

test(
  "verifyCid returns true for existing content",
  async () => {
    expect(await testClient.verifyCid(KNOWN_RESOLVABLE_CID)).toBe(true);
  },
  { timeout: 60_000 },
);

test(
  "verifyCid returns false for nonexistent content",
  async () => {
    expect(await testClient.verifyCid(NONEXISTENT_CID)).toBe(false);
  },
  { timeout: 60_000 },
);

test(
  "cleans up without errors on destroy",
  async () => {
    const ephemeralClient = new BulletinHeliaClient(PASEO_PEERS);
    await ephemeralClient.verifyCid(KNOWN_RESOLVABLE_CID);
    await ephemeralClient.destroy();
  },
  { timeout: 60_000 },
);
