import { expect, test } from "bun:test";
import { Command } from "commander";
import { addAuthOptions, getAuthOptions } from "../../../src/cli/commands/authOptions";

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

  program.parse(["node", "dotns", "--env", "devnet", "lookup", "name", "foo"]);

  expect(resolved).toBe("devnet");
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
    "devnet",
    "lookup",
    "name",
    "foo",
    "--env",
    "previewnet",
  ]);

  expect(resolved).toBe("previewnet");
});

test("getAuthOptions resolves the --network alias from the program root", () => {
  const { program, leaf } = buildTree();
  let resolved: string | undefined;
  leaf.action((_label, _options, cmd) => {
    resolved = getAuthOptions(cmd).network;
  });

  program.parse(["node", "dotns", "--network", "devnet", "lookup", "name", "foo"]);

  expect(resolved).toBe("devnet");
});
