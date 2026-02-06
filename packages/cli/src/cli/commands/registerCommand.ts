import { Command } from "commander";
import chalk from "chalk";
import { executeRegistration, executeSubnameRegistration } from "./register";
import { type RegistrationCommandOptions } from "../../types/types";
import { addAuthOptions, getAuthOptions } from "./authOptions";

export type RegisterActionOptions = RegistrationCommandOptions & {
  __statusProvided?: boolean;
  transfer?: boolean;
  to?: string;
  parent?: string;
};

export function attachRegisterCommand(root: Command) {
  const registerCommand = root.command("register").description("Domain registration commands");

  const domainCommand = registerCommand
    .command("domain")
    .description("Register a new base domain")
    .option("-n, --name <label>", "Domain label to register (without .dot)")
    .option("-s, --status <level>", "ProofOfPersonhood status: none, lite, or full")
    .option("-r, --reverse", "Enable reverse record registration", false)
    .option("-g, --governance", "Use governance registration path", false)
    .option("-o, --owner <address>", "Owner address (EVM or Substrate, or label)")
    .option("--transfer", "Transfer domain after registration", false)
    .option("--to <destination>", "Transfer destination (EVM address, SS58, or domain label)")
    .action(async (options: RegistrationCommandOptions, cmd: any) => {
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions;

        const allOpts =
          typeof cmd.optsWithGlobals === "function" ? cmd.optsWithGlobals() : cmd.opts();

        merged.__statusProvided = allOpts?.status != null;

        if (merged.transfer === true && !merged.to) {
          throw new Error("Missing transfer destination: use --to <evm|ss58|label>");
        }

        await executeRegistration(merged);
        process.exit(0);
      } catch (error) {
        console.error(
          `\n${chalk.red.bold("✗ Error:")} ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      }
    });

  addAuthOptions(domainCommand);

  const subnameCommand = registerCommand
    .command("subname")
    .description("Register a subname under an existing domain")
    .requiredOption("-n, --name <label>", "Subname label to register")
    .requiredOption("-p, --parent <label>", "Parent domain label (without .dot)")
    .option("-o, --owner <address>", "Owner address (EVM or Substrate, or label)")
    .action(async (options: any, cmd: any) => {
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions;

        await executeSubnameRegistration(merged);
        process.exit(0);
      } catch (error) {
        console.error(
          `\n${chalk.red.bold("✗ Error:")} ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      }
    });

  addAuthOptions(subnameCommand);
}
