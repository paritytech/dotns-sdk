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
import { banner } from "./ui";
import { attachStoreCommands } from "./commands/store";
import { ENV } from "./env";

export function createProgram() {
  const program = new Command();
  program.name("dotns").description("dotns developer CLI");
  program.version(version, "-v, --version");
  program
    .option("--env <environment>", `DotNS environment: paseo-v2 (env: ${ENV.DOTNS_ENV})`)
    .option("--network <environment>", "Alias for --env");
  attachPopCommands(program);
  attachAuthCommands(program);
  attachRegisterCommand(program);
  attachLookupCommands(program);
  attachContentCommands(program);
  attachTextCommands(program);
  attachBulletinCommands(program);
  attachAccountCommands(program);
  attachStoreCommands(program);

  if (!process.argv.includes("--json")) banner();

  return program;
}
