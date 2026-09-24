import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertSigningAccountConfigured } from "../../../src/cli/context";

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
