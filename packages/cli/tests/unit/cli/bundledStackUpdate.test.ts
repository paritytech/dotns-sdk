import { afterAll, expect, mock, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSecret, parse, publicKey } from "@parity/trinity-stack";
import { stacks as shippedStacks } from "../../../.trinity/index.js";
import type * as Environments from "../../../src/utils/environments";
import { signDescriptor } from "../../_helpers/stacks";

// The paseo-v2 copy is replaced by one signed with a test secret, so a test can publish a newer
// or conflicting copy of the same stack. Only a fresh instance of the environments module reads
// it; the shipped copies are restored for the other test files.
const TRINITY_MODULE = "../../../.trinity/index.js";
const SECRET = generateSecret();
const POINTER = { url: "https://stack.example/paseo-v2.json", key: publicKey(SECRET) };
const BUNDLED_AT = new Date("2026-01-01T00:00:00Z");
const PASEO_DESCRIPTOR = parse(
  new TextEncoder().encode(shippedStacks["paseo-v2"].document),
).descriptor;

function publishPaseo(now: Date, assetHubRpc?: string) {
  const descriptor = structuredClone(PASEO_DESCRIPTOR);
  if (assetHubRpc) {
    descriptor.chains.find((chain) => chain.role === "AssetHub")!.rpc = [assetHubRpc];
  }
  return signDescriptor(descriptor, SECRET, now);
}

const bundledDocument = await publishPaseo(BUNDLED_AT);
mock.module(TRINITY_MODULE, () => ({
  stacks: {
    ...shippedStacks,
    "paseo-v2": { pointer: POINTER, document: new TextDecoder().decode(bundledDocument) },
  },
}));
const environmentsModule = "../../../src/utils/environments.ts?test-signed-paseo";
const { loadDotnsStack } = (await import(environmentsModule)) as typeof Environments;

afterAll(() => {
  mock.module(TRINITY_MODULE, () => ({ stacks: shippedStacks }));
});

const directory = mkdtempSync(path.join(os.tmpdir(), "dotns-bundled-update-"));

function writeDocument(name: string, document: Uint8Array): string {
  const file = path.join(directory, name);
  writeFileSync(file, document);
  return file;
}

// The way out when a bundled copy is outdated: a newer copy of the same stack, passed with --stack.
test("a newer copy of a bundled stack loads as that environment with its new values", async () => {
  const newer = await publishPaseo(
    new Date("2026-02-01T00:00:00Z"),
    "wss://newer.example/asset-hub",
  );

  const environment = await loadDotnsStack(writeDocument("newer.json", newer));

  expect(environment.id).toBe("paseo-v2");
  expect(environment.rpc).toBe("wss://newer.example/asset-hub");
  expect(environment.publishedLink).toBeNull();
});

// Two copies with one sequence and different content: neither can be trusted over the other.
test("a copy with the bundled sequence and other content is rejected", async () => {
  const conflicting = await publishPaseo(BUNDLED_AT, "wss://conflicting.example/asset-hub");

  await expect(loadDotnsStack(writeDocument("conflicting.json", conflicting))).rejects.toThrow(
    /matches the bundled copy's .* with other content/,
  );
});
