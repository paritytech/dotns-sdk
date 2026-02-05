#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";

import { addHelpFooter } from "./help";
import { attachAllCommands } from "./commands";
import { executeRegistration } from "./commands/register";

async function main() {
  const program = new Command();

  program.name("dotns").description("dotns developer CLI").version("1.0.0");
  program.showHelpAfterError(true);
  addHelpFooter(program);
  const pop = program.command("pop").description("dotns developer CLI (grouped commands)");
  addHelpFooter(pop);
  attachAllCommands(program);
  attachAllCommands(pop);

  await program.parseAsync(process.argv);

  if (process.argv.length === 2) {
    try {
      console.log(chalk.yellow("\nNo command specified. Registering random NoStatus name...\n"));
      await executeRegistration({});
      process.exit(0);
    } catch (error) {
      console.error(
        chalk.red(`\nFatal error: ${error instanceof Error ? error.message : String(error)}\n`),
      );
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      chalk.red(`\nFatal error: ${error instanceof Error ? error.message : String(error)}\n`),
    );
    process.exit(1);
  });
}
