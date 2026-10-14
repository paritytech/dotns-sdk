import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertSigningAccountConfigured, resolveSigningAuth } from "../../../src/cli/context";
import { ENV, resolveKeystorePath } from "../../../src/cli/env";

describe("assertSigningAccountConfigured", () => {
  test("accepts every source other than the built-in default", () => {
    for (const resolvedFrom of ["cli", "env", "keystore"]) {
      expect(() => assertSigningAccountConfigured(resolvedFrom, false)).not.toThrow();
    }
  });

  test("refuses the default source and points at the opt-in", () => {
    expect(() => assertSigningAccountConfigured("default", false)).toThrow(
      /refusing to sign with the shared public dev account[\s\S]*--allow-dev-account/,
    );
  });

  test("proceeds once the caller opts in", () => {
    expect(() => assertSigningAccountConfigured("default", true)).not.toThrow();
  });
});

describe("security warnings survive the --json capture", () => {
  test("writeSecurityWarning reaches stderr from inside withCapturedConsole", async () => {
    const cliRoot = path.resolve(import.meta.dir, "../../..");
    const scriptPath = path.join(os.tmpdir(), `dotns-warning-capture-${process.pid}.ts`);
    await fs.writeFile(
      scriptPath,
      [
        `import { withCapturedConsole, writeSecurityWarning } from "${cliRoot}/src/cli/commands/jsonHelpers";`,
        `await withCapturedConsole(async () => {`,
        `  console.warn("captured console warning");`,
        `  process.stderr.write("captured stream write");`,
        `  writeSecurityWarning("dev account in use");`,
        `  console.log("captured stdout");`,
        `});`,
      ].join("\n"),
    );

    try {
      const child = Bun.spawn(["bun", "run", scriptPath], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      await child.exited;

      expect(stderr).toContain("dev account in use");
      expect(stderr).not.toContain("captured console warning");
      expect(stderr).not.toContain("captured stream write");
      expect(stdout).toBe("");
    } finally {
      await fs.rm(scriptPath, { force: true });
    }
  });
});

describe("resolveSigningAuth", () => {
  const AUTH_ENV = [ENV.MNEMONIC, ENV.KEY_URI, ENV.ALLOW_DEV_ACCOUNT, ENV.KEYSTORE_PATH] as const;
  const saved = new Map<string, string | undefined>();
  const missingKeystore = path.join(os.tmpdir(), `dotns-no-keystore-${process.pid}`);

  beforeEach(() => {
    for (const name of AUTH_ENV) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
    // The default keystore location, empty, as for a user who never ran `dotns auth set`.
    process.env[ENV.KEYSTORE_PATH] = missingKeystore;
  });

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test("refuses when nothing but the default resolves", async () => {
    await expect(resolveSigningAuth({}, resolveKeystorePath())).rejects.toThrow(
      /refusing to sign with the shared public dev account/,
    );
  });

  test("reads the --allow-dev-account option", async () => {
    const auth = await resolveSigningAuth({ allowDevAccount: true }, resolveKeystorePath());
    expect(auth.resolvedFrom).toBe("default");
  });

  test(`reads ${ENV.ALLOW_DEV_ACCOUNT}=1`, async () => {
    process.env[ENV.ALLOW_DEV_ACCOUNT] = "1";
    const auth = await resolveSigningAuth({}, resolveKeystorePath());
    expect(auth.resolvedFrom).toBe("default");
  });
});
