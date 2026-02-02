import { Command } from "commander";
import { attachAuthCommands } from "./commands/auth";
import { attachBulletinCommands } from "./commands/bulletin";
import { attachContentCommands } from "./commands/content";
import { attachLookupCommands } from "./commands/lookup";
import { attachPopCommands } from "./commands/pop";
import { attachRegisterCommand } from "./commands/register-command";
import { attachAccountCommands } from "./commands/info";

export function createProgram() {
  const program = new Command();
  program.name("dotns").description("dotns developer CLI");
  attachPopCommands(program);
  attachAuthCommands(program);
  attachRegisterCommand(program);
  attachLookupCommands(program);
  attachContentCommands(program);
  attachBulletinCommands(program);
  attachAccountCommands(program);
  return program;
}
