import { expect, test } from "bun:test";
import { Command } from "commander";
import { addAuthOptions, getAuthOptions } from "../../../src/cli/commands/authOptions";
import { ENV, resolveSignerKind } from "../../../src/cli/env";

// Rebuilds the real command nesting: a global `--env` on the program root, an
// intermediate group command, and a leaf command that also redeclares the auth
// options. getAuthOptions must recover the root-level `--env` from any depth.
function buildTree(): { program: Command; leaf: Command } {
  const program = new Command();
  program.name("dotns").option("--env <environment>").option("--network <environment>");

  const group = program.command("lookup");
  addAuthOptions(group);

  const leaf = group.command("name [label]");
  addAuthOptions(leaf);

  return { program, leaf };
}

test("getAuthOptions resolves a global --env given before a two-level-nested command", () => {
  const { program, leaf } = buildTree();
  let resolved: string | undefined;
  leaf.action((_label, _options, cmd) => {
    resolved = getAuthOptions(cmd).env;
  });

  program.parse(["node", "dotns", "--env", "previewnet", "lookup", "name", "foo"]);

  expect(resolved).toBe("previewnet");
});

test("getAuthOptions lets a command-level --env override the global one", () => {
  const { program, leaf } = buildTree();
  let resolved: string | undefined;
  leaf.action((_label, _options, cmd) => {
    resolved = getAuthOptions(cmd).env;
  });

  program.parse([
    "node",
    "dotns",
    "--env",
    "previewnet",
    "lookup",
    "name",
    "foo",
    "--env",
    "paseo-v2",
  ]);

  expect(resolved).toBe("paseo-v2");
});

test("getAuthOptions resolves the --network alias from the program root", () => {
  const { program, leaf } = buildTree();
  let resolved: string | undefined;
  leaf.action((_label, _options, cmd) => {
    resolved = getAuthOptions(cmd).network;
  });

  program.parse(["node", "dotns", "--network", "previewnet", "lookup", "name", "foo"]);

  expect(resolved).toBe("previewnet");
});

test("DOTNS_SIGNER applies when --signer is not passed", () => {
  const { program, leaf } = buildTree();
  let signer: string | undefined;
  leaf.action((_label, _options, cmd) => {
    signer = getAuthOptions(cmd).signer;
  });
  const original = process.env[ENV.SIGNER];
  process.env[ENV.SIGNER] = "qr";
  try {
    program.parse(["node", "dotns", "lookup", "name", "foo"]);
    expect(resolveSignerKind(signer)).toBe("qr");
  } finally {
    if (original === undefined) delete process.env[ENV.SIGNER];
    else process.env[ENV.SIGNER] = original;
  }
});
