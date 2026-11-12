import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  encodeLink,
  generateSecret,
  parse,
  publicKey,
  type Descriptor,
} from "@parity/trinity-stack";
import type { Bundled } from "@parity/trinity-stack/reader";
import * as trinityStack from "@parity/trinity-stack";
import { stacks } from "../../../.trinity/index.js";
import * as environments from "../../../src/utils/environments";
import {
  DOTNS_ENVIRONMENTS,
  StackExpiredError,
  assertBundledStacksUnexpired,
  assertBundledStacksSigned,
  checkStackCurrent,
  deriveBundledEnvironments,
  getActiveDotnsEnvironment,
  loadDotnsStack,
  resolveDotnsEnvironmentId,
  setActiveDotnsEnvironment,
} from "../../../src/utils/environments";
import { createDotnsContext } from "../../../src/core/context";
import { createProgram } from "../../../src/cli/program";
import type { Command } from "commander";
import type { ReviveClientWrapper } from "../../../src/client/polkadotClient";
import { saveCommitmentRecord } from "../../../src/commands/registrationManifest";
import { ENV, resolveQrPeopleEndpoints, selectDotnsEnvironment } from "../../../src/cli/env";
import { ALICE_SS58, runDotnsCli } from "../../_helpers/cliHelpers";
import { signDescriptor } from "../../_helpers/stacks";
import { getPreviewUrl } from "../../../src/bulletin/cidHistory";
import type { UploadRecord } from "../../../src/types/types";

const ENCODER = new TextEncoder();
const PASEO_DESCRIPTOR = parse(ENCODER.encode(stacks["paseo-v2"].document)).descriptor;
const STACK_URL = "https://stack.example/.well-known/trinity-stack.json";
const OLDER_PREVIEWNET = path.join(
  import.meta.dir,
  "../../_files/stacks/previewnet-sequence-1793782246.json",
);

let directory: string;

beforeAll(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "dotns-stack-"));
});

afterEach(() => {
  mock.restore();
  setActiveDotnsEnvironment("paseo-v2");
});

// A local stack: the paseo-v2 descriptor under another id, with `change` applied.
function localDescriptor(change: (descriptor: Descriptor) => void = () => {}): Descriptor {
  const descriptor = structuredClone(PASEO_DESCRIPTOR);
  descriptor.id = "local-dev";
  descriptor.name = "Local dev";
  change(descriptor);
  return descriptor;
}

async function createSignedCopy(descriptor: Descriptor): Promise<Bundled> {
  const secret = generateSecret();
  return {
    pointer: { url: STACK_URL, key: publicKey(secret) },
    document: new TextDecoder().decode(await signDescriptor(descriptor, secret)),
  };
}

function writeStackFile(name: string, document: Uint8Array | Descriptor): string {
  const file = path.join(directory, name);
  writeFileSync(file, document instanceof Uint8Array ? document : JSON.stringify(document));
  return file;
}

function serve(url: string, document: Uint8Array) {
  return spyOn(globalThis, "fetch").mockImplementation((async (input: string | URL | Request) =>
    String(input) === url
      ? new Response(document)
      : new Response(null, { status: 404 })) as typeof fetch);
}

describe("bundled stacks", () => {
  test("pass the build check", () => {
    expect(() => deriveBundledEnvironments(stacks)).not.toThrow();
    expect(() => assertBundledStacksSigned()).not.toThrow();
    expect(() => assertBundledStacksUnexpired()).not.toThrow();
  });

  // The build runs this check over .trinity, so a copy update that drops a required field
  // fails CI instead of the release.
  test("a stack missing a required field fails the build check, listing the stack and fields", async () => {
    const descriptor = structuredClone(PASEO_DESCRIPTOR);
    delete descriptor.dotns!.nameEscrow;
    descriptor.services = descriptor.services.filter((service) => service.kind !== "ipfs-gateway");
    const broken = await createSignedCopy(descriptor);

    expect(() => deriveBundledEnvironments({ ...stacks, "paseo-v2": broken })).toThrow(
      /paseo-v2: .*service ipfs-gateway, dotns\.nameEscrow/,
    );
  });

  test("a copy that does not verify against its link's key fails the build check", () => {
    const forged = { ...stacks.polkadot, document: stacks.previewnet.document };
    expect(() => assertBundledStacksSigned({ ...stacks, polkadot: forged })).toThrow(
      /polkadot: .*signature does not verify/,
    );
  });

  // Signatures are checked at build only, so the CLI starts without running the verifier.
  test("start-up reads the bundled copies without checking their signatures", () => {
    const forged = { ...stacks.polkadot, document: stacks.previewnet.document };
    expect(() => deriveBundledEnvironments({ ...stacks, polkadot: forged })).not.toThrow();
  });

  test("a missing copy fails the build check", () => {
    const withoutPreviewnet: Record<string, Bundled> = { ...stacks };
    delete withoutPreviewnet.previewnet;
    expect(() => deriveBundledEnvironments(withoutPreviewnet)).toThrow(
      /previewnet: copy is missing/,
    );
  });

  test("a malformed contract address is rejected with the stack it came from", async () => {
    const file = writeStackFile(
      "bad-address.json",
      localDescriptor((descriptor) => (descriptor.dotns!.resolver = "0x1234")),
    );
    await expect(loadDotnsStack(file)).rejects.toThrow(
      /stack '.*bad-address\.json' is unusable: dotns is not 20 bytes/,
    );
  });

  // Only the publisher can sign a newer copy, so a stale one must not block every build until
  // it does; readers warn about it.
  test("a copy past its validUntil passes the build check with a warning", () => {
    const stale = withDescriptor("polkadot", { validUntil: 1 });
    expect(assertBundledStacksUnexpired({ polkadot: stale })).toEqual([
      expect.stringMatching(/^polkadot: .*past its validUntil/),
    ]);
  });

  // A release must not ship a copy that every reader rejects.
  test("a copy past its expiresAt fails the build check", () => {
    const expired = withDescriptor("previewnet", { expiresAt: 1, validUntil: 1 });
    const stale = withDescriptor("polkadot", { validUntil: 1 });
    expect(() => assertBundledStacksUnexpired({ previewnet: expired, polkadot: stale })).toThrow(
      /expired bundled stacks in .trinity:\n {2}previewnet: .*expired at[^\n]*$/,
    );
  });
});

function withDescriptor(id: keyof typeof DOTNS_ENVIRONMENTS, change: Partial<Descriptor>) {
  const environment = DOTNS_ENVIRONMENTS[id];
  return { ...environment, descriptor: { ...environment.descriptor, ...change } };
}

describe("stack currency", () => {
  // SDK callers fail too, and get the link to load with `loadDotnsStack` instead of a CLI flag.
  test("an expired bundled copy fails wherever it is resolved, carrying its published link", () => {
    const expired = withDescriptor("polkadot", { expiresAt: 1 });
    const context = { clientWrapper: {} as ReviveClientWrapper, origin: ALICE_SS58 };

    expect(() => createDotnsContext({ ...context, environment: expired })).toThrow(
      StackExpiredError,
    );
    let error: unknown;
    try {
      setActiveDotnsEnvironment(expired);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(StackExpiredError);
    expect((error as StackExpiredError).publishedLink).toBe(encodeLink(stacks.polkadot.pointer));
    expect((error as StackExpiredError).message).not.toContain("--stack");
    expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  });

  test("a stale bundled copy reports its published link", () => {
    const stale = withDescriptor("polkadot", { validUntil: 1 });
    expect(checkStackCurrent(stale)).toEqual({
      status: "stale",
      message: expect.stringContaining("past its validUntil"),
      publishedLink: encodeLink(stacks.polkadot.pointer),
    });
  });

  test("a current stack is reported current", () => {
    expect(checkStackCurrent(DOTNS_ENVIRONMENTS["paseo-v2"])).toEqual({ status: "current" });
  });

  test("the CLI turns a bundled copy's published link into a --stack hint", async () => {
    const link = encodeLink(stacks.polkadot.pointer);
    const currency = spyOn(environments, "checkStackCurrent");

    currency.mockReturnValue({ status: "stale", message: "Outdated.", publishedLink: link });
    const { warning } = await selectDotnsEnvironment({ env: "polkadot" });
    expect(warning).toBe(`Outdated. Run with the published one: --stack '${link}'`);

    currency.mockReturnValue({ status: "expired", message: "Expired.", publishedLink: link });
    await expect(selectDotnsEnvironment({ env: "previewnet" })).rejects.toThrow(
      `Expired. Run with the published one: --stack '${link}'`,
    );
    expect(getActiveDotnsEnvironment().id).toBe("polkadot");
  });

  test("an expired stack file loads, and is rejected when selected", async () => {
    const file = writeStackFile(
      "expired.json",
      localDescriptor((descriptor) => (descriptor.expiresAt = 1)),
    );
    expect((await loadDotnsStack(file)).label).toBe("Local dev");
    await expect(selectDotnsEnvironment({ stack: file })).rejects.toThrow(
      /The Local dev stack expired at/,
    );
    expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  });

  test("an expired stack link is rejected when selected", async () => {
    const secret = generateSecret();
    const document = await signDescriptor(
      localDescriptor((descriptor) => (descriptor.expiresAt = 1)),
      secret,
    );
    serve(STACK_URL, document);
    await expect(
      selectDotnsEnvironment({ stack: encodeLink({ url: STACK_URL, key: publicKey(secret) }) }),
    ).rejects.toThrow(/expired/);
  });

  test("a stale stack file is selected with a warning", async () => {
    const file = writeStackFile(
      "stale.json",
      localDescriptor((descriptor) => (descriptor.validUntil = 1)),
    );
    const { environment, warning } = await selectDotnsEnvironment({ stack: file });
    expect(environment.label).toBe("Local dev");
    expect(warning).toContain("past its validUntil");
  });
});

describe("--stack file", () => {
  test("runs a local descriptor with every value from the file", async () => {
    const descriptor = localDescriptor((descriptor) => {
      descriptor.chains.find((chain) => chain.role === "AssetHub")!.rpc = [
        "wss://local.example/asset-hub",
      ];
    });

    const { environment } = await selectDotnsEnvironment({
      stack: writeStackFile("local.json", descriptor),
    });

    expect(getActiveDotnsEnvironment()).toBe(environment);
    expect(environment.id).toStartWith("local-dev-");
    expect(environment.label).toBe("Local dev");
    expect(environment.rpc).toBe("wss://local.example/asset-hub");
    expect(environment.publishedLink).toBeNull();
  });

  // Where the app is deployed is not in a descriptor, so even paseo-v2's descriptor run from a
  // file, under its own id, has no known deployment.
  test("a --stack stack prints no preview link", async () => {
    const record: UploadRecord = {
      cid: "bafyfoo",
      path: "x",
      type: "file",
      size: 1,
      timestamp: "",
    };
    setActiveDotnsEnvironment(await loadDotnsStack(writeStackFile("paseo.json", PASEO_DESCRIPTOR)));
    expect(getPreviewUrl(record)).toBeNull();
  });

  // A swapped key would point the SDK at another contract with no other test failing.
  test("each dotns key fills its contract address in the SDK context", async () => {
    const keys = Object.keys(PASEO_DESCRIPTOR.dotns!);
    const addressOf = (key: string) =>
      `0x${(keys.indexOf(key) + 1).toString(16).padStart(40, "0")}`.toLowerCase();
    const descriptor = localDescriptor((descriptor) => {
      descriptor.dotns = Object.fromEntries(keys.map((key) => [key, addressOf(key)]));
    });
    const environment = await loadDotnsStack(writeStackFile("contracts.json", descriptor));

    const ctx = createDotnsContext({
      clientWrapper: {} as ReviveClientWrapper,
      origin: ALICE_SS58,
      environment,
    });

    const expected = {
      DOTNS_REGISTRAR: addressOf("registrar"),
      DOTNS_REGISTRAR_CONTROLLER: addressOf("controller"),
      DOTNS_REGISTRY: addressOf("registry"),
      DOTNS_RESOLVER: addressOf("resolver"),
      DOTNS_REVERSE_RESOLVER: addressOf("reverseResolver"),
      DOTNS_POP_RESOLVER: addressOf("popResolver"),
      DOTNS_CONTENT_RESOLVER: addressOf("contentResolver"),
      STORE_FACTORY: addressOf("storeFactory"),
      DOTNS_RULES: addressOf("popRules"),
      DOTNS_POP_CONTROLLER: addressOf("popController"),
      DOTNS_NAME_ESCROW: addressOf("nameEscrow"),
      MULTICALL3: addressOf("multicall3"),
    };
    expect(
      Object.fromEntries(
        Object.entries(ctx.contracts).map(([name, address]) => [name, address.toLowerCase()]),
      ),
    ).toEqual(expected);
  });

  test("a signed copy of a bundled stack loads as that environment", async () => {
    const file = writeStackFile("polkadot.json", ENCODER.encode(stacks.polkadot.document));

    const environment = await loadDotnsStack(file);

    expect(environment.id).toBe("polkadot");
    expect(environment.publishedLink).toBeNull();
  });

  // A verifier fault is not a rule failure: reading the copy as a custom stack would give it
  // another id and skip the sequence check against the bundled copy.
  test("a verifier fault while matching a bundled key stops the load", async () => {
    const file = writeStackFile("polkadot-fault.json", ENCODER.encode(stacks.polkadot.document));
    spyOn(trinityStack, "open").mockImplementation(() => {
      throw new TypeError("verifier fault");
    });

    await expect(loadDotnsStack(file)).rejects.toThrow("is unusable: verifier fault");
  });

  // An older copy could carry retired contract addresses on the same chain.
  test("a signed copy older than the bundled one is rejected, listing both sequences", async () => {
    const older = parse(readFileSync(OLDER_PREVIEWNET)).descriptor.sequence;
    const bundled = DOTNS_ENVIRONMENTS.previewnet.descriptor.sequence;

    await expect(loadDotnsStack(OLDER_PREVIEWNET)).rejects.toThrow(
      `its sequence ${older} is below the bundled copy's ${bundled}`,
    );
  });

  // The descriptor id is not unique, so an unsigned copy must not share the bundled
  // environment's registration records.
  test("an unsigned copy of a bundled descriptor gets its own id", async () => {
    const previewnet = DOTNS_ENVIRONMENTS.previewnet.descriptor;
    const environment = await loadDotnsStack(writeStackFile("unsigned.json", previewnet));

    expect(environment.id).toStartWith("previewnet-");
    expect(() => resolveDotnsEnvironmentId(environment.id)).toThrow();
  });

  test("two stacks with the same descriptor id get different ids", async () => {
    const first = await loadDotnsStack(writeStackFile("first.json", localDescriptor()));
    const second = await loadDotnsStack(
      writeStackFile(
        "second.json",
        localDescriptor((descriptor) => (descriptor.name = "Other")),
      ),
    );
    expect(first.id).not.toBe(second.id);
  });

  test("a descriptor id with path segments cannot place records outside the registrations directory", async () => {
    const registrations = mkdtempSync(path.join(directory, "registrations-"));
    const saved = process.env.DOTNS_REGISTRATION_DIR;
    process.env.DOTNS_REGISTRATION_DIR = registrations;
    try {
      const environment = await loadDotnsStack(
        writeStackFile(
          "traversal.json",
          localDescriptor((descriptor) => (descriptor.id = "../../evil")),
        ),
      );
      expect(environment.id).toMatch(/^[a-z0-9-]+$/);

      saveCommitmentRecord({
        env: environment.id,
        caller: "0x0000000000000000000000000000000000000001",
        label: "alice",
        owner: "0x0000000000000000000000000000000000000001",
        reserved: false,
        governance: false,
        maxPrice: 0n,
        pricingVersion: 0n,
        secret: `0x${"00".repeat(32)}`,
        commitmentHash: `0x${"00".repeat(32)}`,
        committedAtIso: new Date(0).toISOString(),
        credential: "test-password",
      });
      expect(readdirSync(registrations)).toEqual([
        `${environment.id}__0x0000000000000000000000000000000000000001__alice.json`,
      ]);
    } finally {
      if (saved === undefined) delete process.env.DOTNS_REGISTRATION_DIR;
      else process.env.DOTNS_REGISTRATION_DIR = saved;
    }
  });

  test("rejects a descriptor missing required fields before any command runs", async () => {
    const descriptor = localDescriptor((descriptor) => {
      delete descriptor.dotns!.registry;
      delete descriptor.dotns!.multicall3;
    });

    await expect(
      selectDotnsEnvironment({ stack: writeStackFile("incomplete.json", descriptor) }),
    ).rejects.toThrow(/lacks dotns\.registry, dotns\.multicall3/);
    expect(getActiveDotnsEnvironment().id).toBe("paseo-v2");
  });

  test("reports a file it cannot read", async () => {
    await expect(loadDotnsStack(path.join(directory, "missing.json"))).rejects.toThrow(
      /failed to read stack/,
    );
  });

  test("DOTNS_STACK selects a file like --stack", async () => {
    const saved = { stack: process.env[ENV.STACK], env: process.env[ENV.DOTNS_ENV] };
    delete process.env[ENV.DOTNS_ENV];
    process.env[ENV.STACK] = writeStackFile("from-env.json", localDescriptor());
    try {
      expect((await selectDotnsEnvironment({})).environment.label).toBe("Local dev");
    } finally {
      if (saved.stack === undefined) delete process.env[ENV.STACK];
      else process.env[ENV.STACK] = saved.stack;
      if (saved.env !== undefined) process.env[ENV.DOTNS_ENV] = saved.env;
    }
  });

  test("--stack takes precedence over DOTNS_ENV", async () => {
    const saved = process.env[ENV.DOTNS_ENV];
    process.env[ENV.DOTNS_ENV] = "polkadot";
    try {
      const { environment } = await selectDotnsEnvironment({
        stack: writeStackFile("over-env.json", localDescriptor()),
      });
      expect(environment.label).toBe("Local dev");
    } finally {
      if (saved === undefined) delete process.env[ENV.DOTNS_ENV];
      else process.env[ENV.DOTNS_ENV] = saved;
    }
  });
});

describe("--stack link", () => {
  test("fetches the descriptor and verifies it with the link's key", async () => {
    const secret = generateSecret();
    const document = await signDescriptor(localDescriptor(), secret);
    serve(STACK_URL, document);
    const link = encodeLink({ url: STACK_URL, key: publicKey(secret) });
    const environment = await loadDotnsStack(link);
    expect(environment.id).toStartWith("local-dev-");
    expect(environment.label).toBe("Local dev");
  });

  // The id is part of the stack's registration record names, so it must not change on republish.
  test("a keyed link has one id across documents, and another key another id", async () => {
    const secret = generateSecret();
    const link = encodeLink({ url: STACK_URL, key: publicKey(secret) });
    const loadServed = async (document: Uint8Array, stackLink: string) => {
      serve(STACK_URL, document);
      return (await loadDotnsStack(stackLink)).id;
    };
    const renamed = localDescriptor((descriptor) => (descriptor.name = "Renamed"));
    const otherSecret = generateSecret();

    const first = await loadServed(await signDescriptor(localDescriptor(), secret), link);
    const second = await loadServed(await signDescriptor(renamed, secret), link);
    const otherKey = await loadServed(
      await signDescriptor(localDescriptor(), otherSecret),
      encodeLink({ url: STACK_URL, key: publicKey(otherSecret) }),
    );

    expect(second).toBe(first);
    expect(otherKey).not.toBe(first);
  });

  test("a descriptor URL without a key has one id across documents", async () => {
    const loadServed = async (descriptor: Descriptor) => {
      serve(STACK_URL, ENCODER.encode(JSON.stringify(descriptor)));
      return (await loadDotnsStack(STACK_URL)).id;
    };
    const renamed = localDescriptor((descriptor) => (descriptor.name = "Renamed"));

    expect(await loadServed(renamed)).toBe(await loadServed(localDescriptor()));
  });

  test("rejects a descriptor signed with another key", async () => {
    const document = await signDescriptor(localDescriptor(), generateSecret());
    serve(STACK_URL, document);
    const link = encodeLink({ url: STACK_URL, key: publicKey(generateSecret()) });
    await expect(loadDotnsStack(link)).rejects.toThrow(/signature does not verify/);
  });

  test("rejects an unreachable stack", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(loadDotnsStack(STACK_URL)).rejects.toThrow(/is unreachable/);
  });

  // The way out when the bundled copy is outdated: the published link of the same stack.
  test("the published link of a bundled stack loads as that environment", async () => {
    const bundled = stacks["paseo-v2"];
    serve(bundled.pointer.url, ENCODER.encode(bundled.document));
    const environment = await loadDotnsStack(encodeLink(bundled.pointer));
    expect(environment.id).toBe("paseo-v2");
    expect(environment.contracts).toEqual(DOTNS_ENVIRONMENTS["paseo-v2"].contracts);
    expect(environment.publishedLink).toBeNull();
  });

  test("the plain descriptor URL of a bundled stack loads as that environment", async () => {
    const bundled = stacks["paseo-v2"];
    serve(bundled.pointer.url, ENCODER.encode(bundled.document));
    expect((await loadDotnsStack(bundled.pointer.url)).id).toBe("paseo-v2");
  });

  test("a link with its own key does not load a bundled stack's document as that stack", async () => {
    const bundled = stacks.polkadot;
    serve(STACK_URL, ENCODER.encode(bundled.document));
    const link = encodeLink({ url: STACK_URL, key: publicKey(generateSecret()) });
    await expect(loadDotnsStack(link)).rejects.toThrow(/signature does not verify/);
  });
});

describe("network selection before a command", () => {
  const bulletinHistory = ["bulletin", "history"];

  test("a bad --stack stops the command before its action runs", async () => {
    const result = await runDotnsCli([...bulletinHistory, "--stack", "/nonexistent/stack.json"]);
    expect(result.standardError).toContain("✗ Error: failed to read stack");
    expect(result.combinedOutput).not.toContain("No uploads in history");
  });

  // The bulletin GitHub action reads the upload's `--json` result, error included, from stdout.
  test("under --json a bulletin command writes the error as JSON on stdout", async () => {
    const result = await runDotnsCli([
      ...bulletinHistory,
      "--json",
      "--stack",
      "/nonexistent/stack.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.standardOutput.trim()).error).toContain("failed to read stack");
  });

  test("under --json other commands write the error as JSON on stderr", async () => {
    const result = await runDotnsCli([
      "lookup",
      "name",
      "alice",
      "--json",
      "--stack",
      "/nonexistent/stack.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.standardError.trim()).error).toContain("failed to read stack");
    expect(result.standardOutput).toBe("");
  });

  // A stale copy must be reported; under --json it goes to stderr so stdout stays JSON.
  test("a stale stack prints a warning on stderr, also under --json", async () => {
    const file = writeStackFile(
      "stale-cli.json",
      localDescriptor((descriptor) => (descriptor.validUntil = 1)),
    );
    const plain = await runDotnsCli([...bulletinHistory, "--stack", file]);
    expect(plain.standardError).toContain("past its validUntil");

    const json = await runDotnsCli([...bulletinHistory, "--json", "--stack", file]);
    expect(json.standardError).toContain("past its validUntil");
    expect(() => JSON.parse(json.standardOutput)).not.toThrow();
  });

  // A local stack may run only its relay and Asset Hub; only the commands that use Bulletin or
  // People need them.
  test("a stack with only Asset Hub runs commands that do not use Bulletin or People", async () => {
    const file = writeStackFile(
      "asset-hub-only.json",
      localDescriptor((descriptor) => {
        descriptor.chains = descriptor.chains.filter(
          (chain) => chain.role === "Relay" || chain.role === "AssetHub",
        );
        delete descriptor.coinage;
        descriptor.services = descriptor.services.filter(
          (service) => service.kind !== "ipfs-gateway",
        );
      }),
    );
    const history = await runDotnsCli([...bulletinHistory, "--json", "--stack", file]);
    expect(JSON.parse(history.standardOutput)).toBeArray();

    const authorize = await runDotnsCli([
      "bulletin",
      "authorize",
      ALICE_SS58,
      "--json",
      "--stack",
      file,
    ]);
    expect(authorize.exitCode).toBe(1);
    expect(JSON.parse(authorize.standardOutput.trim()).error).toBe(
      "local-dev has no chain Bulletin",
    );

    await selectDotnsEnvironment({ stack: file });
    expect(() => resolveQrPeopleEndpoints()).toThrow("local-dev has no chain People");
  });

  // Key management works offline, whatever stack the shell exports.
  test("commands without a network option do not select one", async () => {
    const result = await runDotnsCli(["auth", "list"], {
      [ENV.STACK]: "/nonexistent/stack.json",
      [ENV.DOTNS_ENV]: undefined,
      [ENV.KEYSTORE_PATH]: mkdtempSync(path.join(directory, "keystore-")),
    });
    expect(result.standardOutput).toContain("accounts: (none)");
    expect(result.combinedOutput).not.toContain("failed to read stack");
  });

  test("account address prints the address offline, whatever stack the shell exports", async () => {
    const result = await runDotnsCli(["account", "address", "--key-uri", "//Alice"], {
      [ENV.STACK]: "/nonexistent/stack.json",
      [ENV.DOTNS_ENV]: undefined,
    });
    expect(result.standardOutput.trim()).toBe(ALICE_SS58);
    expect(result.combinedOutput).not.toContain("failed to read stack");
  });

  // The hook selects a network only for a command that declares --stack, so a new network
  // command without it would ignore --env, DOTNS_ENV and DOTNS_STACK and run on polkadot.
  test("every command declares --stack except key management, account address and history cleanup", () => {
    const withoutStack: string[] = [];
    const visit = (command: Command, prefix: string[]) => {
      for (const child of command.commands) {
        const commandPath = [...prefix, child.name()];
        if (child.commands.length > 0) visit(child, commandPath);
        else if (!child.options.some((option) => option.long === "--stack")) {
          withoutStack.push(commandPath.join(" "));
        }
      }
    };
    visit(createProgram(), []);

    expect(withoutStack.sort()).toEqual([
      "account address",
      "auth clear",
      "auth list",
      "auth remove",
      "auth set",
      "auth use",
      "bulletin history:clear",
      "bulletin history:remove",
    ]);
  });

  test("bulletin verify falls back to the stack's gateway and reports why P2P failed", async () => {
    const descriptor = localDescriptor((descriptor) => {
      delete descriptor.chains.find((chain) => chain.role === "Bulletin")!.lightSpec;
    });
    const stackFile = writeStackFile("no-light-spec.json", descriptor);
    const verifyJson = async () => {
      const result = await runDotnsCli([
        "bulletin",
        "verify",
        "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy",
        "--json",
        "--stack",
        stackFile,
      ]);
      return JSON.parse(result.standardOutput);
    };

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    expect(await verifyJson()).toMatchObject({ resolvable: true, method: "gateway" });

    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    const { resolvable, gateways } = await verifyJson();
    expect(resolvable).toBe(false);
    expect(gateways[0]).toEqual({
      gateway: "p2p/bitswap",
      resolvable: false,
      errorMessage: "stack local-dev does not have a Bulletin light spec to read P2P peers from",
    });
  });
});
