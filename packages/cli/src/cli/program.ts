import { Command } from "commander";
import { attachAuthCommands } from "./commands/auth";
import { attachBulletinCommands } from "./commands/bulletin";
import { attachContentCommands } from "./commands/content";
import { attachTextCommands } from "./commands/text";
import { attachLookupCommands } from "./commands/lookup";
import { attachPopCommands } from "./commands/pop";
import { attachRegisterCommand } from "./commands/registerCommand";
import { attachAccountCommands } from "./commands/info";
import { version } from "../../package.json";
import { attachStoreCommands } from "./commands/store";
import { attachEscrowCommands } from "./commands/escrow";
import { attachDelegateCommands } from "./commands/delegate";
import { attachPrimaryCommands } from "./commands/primary";
import { attachGovernanceCommands } from "./commands/governance";
import { attachWhitelistCommands } from "./commands/whitelist";
import chalk from "chalk";
import { selectDotnsEnvironment } from "./env";
import { addNetworkOptions, getAuthOptions } from "./commands/authOptions";
import { getJsonFlag, handleCommandError } from "./commands/jsonHelpers";

/**
 * Declares the network options on `program` and, before each command that takes a network
 * (one that declares `--stack`), activates the selected network. A `--stack` is loaded once,
 * and a stack that cannot be used stops the command before its action runs. A stale stack's
 * warning goes to stderr, also under `--json`.
 */
export function attachNetworkSelection(program: Command): Command {
  return addNetworkOptions(program).hook("preAction", async (_program, actionCommand) => {
    if (!actionCommand.options.some((option) => option.long === "--stack")) return;
    const jsonOutput = getJsonFlag(actionCommand);
    try {
      const { warning } = await selectDotnsEnvironment(getAuthOptions(actionCommand));
      if (warning) console.error(chalk.yellow(`\n⚠ ${warning}\n`));
    } catch (error) {
      handleCommandError(jsonOutput, error, actionCommand);
    }
  });
}

export function createProgram() {
  const program = new Command();
  program.name("dotns").description("dotNS developer CLI");
  program.version(version, "-v, --version");
  attachNetworkSelection(program);
  attachPopCommands(program);
  attachAuthCommands(program);
  attachRegisterCommand(program);
  attachLookupCommands(program);
  attachContentCommands(program);
  attachTextCommands(program);
  attachBulletinCommands(program);
  attachAccountCommands(program);
  attachStoreCommands(program);
  attachEscrowCommands(program);
  attachDelegateCommands(program);
  attachPrimaryCommands(program);
  attachGovernanceCommands(program);
  attachWhitelistCommands(program);

  return program;
}
