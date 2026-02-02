import type { Command } from "commander";
import { attachAuthCommands } from "./auth";
import { attachRegisterCommand } from "./register-command";
import { attachLookupCommands } from "./lookup";
import { attachContentCommands } from "./content";
import { attachPopCommands } from "./pop";
import { attachBulletinCommands } from "./bulletin";
import { attachAccountCommands } from "./info";

export function attachAllCommands(root: Command) {
  attachAuthCommands(root);
  attachRegisterCommand(root);
  attachLookupCommands(root);
  attachContentCommands(root);
  attachPopCommands(root);
  attachBulletinCommands(root);
  attachAccountCommands(root);
}
