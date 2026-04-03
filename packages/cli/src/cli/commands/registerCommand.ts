import { Command } from "commander";
import chalk from "chalk";
import { executeRegistration, executeSubnameRegistration } from "./register";
import { type RegistrationCommandOptions } from "../../types/types";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { formatErrorMessage } from "../../utils/formatting";
import { DEFAULT_COMMITMENT_BUFFER_SECONDS } from "../../utils/constants";
import { getJsonFlag } from "./lookup";
import { maybeQuiet } from "./bulletin";

export type RegisterActionOptions = RegistrationCommandOptions & {
  __statusProvided?: boolean;
  transfer?: boolean;
  to?: string;
  parent?: string;
};

function resolveCommitmentBuffer(cliValue?: string): number {
  const raw = cliValue ?? process.env.DOTNS_COMMITMENT_BUFFER;
  if (raw == null) return DEFAULT_COMMITMENT_BUFFER_SECONDS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid commitment buffer "${raw}": must be a non-negative number (seconds)`);
  }
  return parsed;
}

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
    .option(
      "--cb, --commitment-buffer <seconds>",
      `Extra seconds to wait after minCommitmentAge (default: ${DEFAULT_COMMITMENT_BUFFER_SECONDS}, env: DOTNS_COMMITMENT_BUFFER)`,
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (options: RegistrationCommandOptions, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions;

        const allOpts =
          typeof cmd.optsWithGlobals === "function" ? cmd.optsWithGlobals() : cmd.opts();

        merged.__statusProvided = allOpts?.status != null;
        merged.commitmentBuffer = resolveCommitmentBuffer(allOpts?.commitmentBuffer);

        if (merged.transfer === true && !merged.to) {
          throw new Error("Missing transfer destination: use --to <evm|ss58|label>");
        }

        const result = await maybeQuiet(jsonOutput, () => executeRegistration(merged));

        if (jsonOutput) {
          console.log(JSON.stringify(result));
        }
        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }
        console.error(`\n${chalk.red.bold("✗ Error:")} ${errorMessage}\n`);
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
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (options: any, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions;

        const result = await maybeQuiet(jsonOutput, () => executeSubnameRegistration(merged));

        if (jsonOutput) {
          console.log(JSON.stringify(result));
        }
        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }
        console.error(`\n${chalk.red.bold("✗ Error:")} ${errorMessage}\n`);
        process.exit(1);
      }
    });

  addAuthOptions(subnameCommand);
}
