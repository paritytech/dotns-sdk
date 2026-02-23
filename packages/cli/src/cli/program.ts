import { Command } from "commander";
import { attachAuthCommands } from "./commands/auth";
import { attachBulletinCommands } from "./commands/bulletin";
import { attachContentCommands } from "./commands/content";
import { attachLookupCommands } from "./commands/lookup";
import { attachPopCommands } from "./commands/pop";
import { attachRegisterCommand } from "./commands/registerCommand";
import { attachAccountCommands } from "./commands/info";
import { version } from "../../package.json";
import { banner } from "./ui";
import { attachStoreCommands } from "./commands/store";

export function createProgram() {
  const program = new Command();
  program.name("dotns").description("dotns developer CLI");
  program.version(version, "-v, --version");
  attachPopCommands(program);
  attachAuthCommands(program);
  attachRegisterCommand(program);
  attachLookupCommands(program);
  attachContentCommands(program);
  attachBulletinCommands(program);
  attachAccountCommands(program);
  attachStoreCommands(program);

  if (!process.argv.includes("--json")) banner();

  return program;
}
