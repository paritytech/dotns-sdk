import { Command } from "commander";
import {
  executeRegistration,
  executeSubnameRegistration,
  executeRetry,
  executeClear,
  executeList,
} from "./register";
import { type RegistrationCommandOptions } from "../../types/types";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { DEFAULT_COMMITMENT_BUFFER_SECONDS } from "../../utils/constants";
import { getJsonFlag, maybeQuiet, emitJsonResult, handleCommandError } from "./jsonHelpers";

export type RegisterActionOptions = RegistrationCommandOptions & {
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

function resolveRetryCount(cliValue?: string): number {
  if (cliValue == null) return 0;
  const parsed = Number(cliValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --retry "${cliValue}": must be a non-negative integer`);
  }
  return parsed;
}

export function attachRegisterCommand(root: Command) {
  const registerCommand = root.command("register").description("Domain registration commands");

  const domainCommand = registerCommand
    .command("domain")
    .description("Register a new base domain")
    .option("-n, --name <label>", "Domain label to register (without .dot)")
    .option("-r, --reverse", "Enable reverse record registration", false)
    .option("-g, --governance", "Use governance registration path", false)
    .option(
      "-o, --owner <address>",
      "Register on behalf of another address (EVM, SS58, or .dot label). Caller pays price + transferFloor friction; owner receives the NFT. Mutually exclusive with --transfer, --reverse, --governance.",
    )
    .option("--transfer", "Transfer domain after registration", false)
    .option("--to <destination>", "Transfer destination (EVM address, SS58, or domain label)")
    .option(
      "--cb, --commitment-buffer <seconds>",
      `Extra seconds to wait after minCommitmentAge (default: ${DEFAULT_COMMITMENT_BUFFER_SECONDS}, env: DOTNS_COMMITMENT_BUFFER)`,
    )
    .option(
      "--retry <count>",
      "On failure, resume from the cached commitment up to N times before giving up",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (options: RegistrationCommandOptions, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions;

        const allOpts =
          typeof cmd.optsWithGlobals === "function" ? cmd.optsWithGlobals() : cmd.opts();

        merged.commitmentBuffer = resolveCommitmentBuffer(allOpts?.commitmentBuffer);
        merged.retry = resolveRetryCount(allOpts?.retry);

        if (merged.transfer === true && !merged.to) {
          throw new Error("Missing transfer destination: use --to <evm|ss58|label>");
        }

        const result = await maybeQuiet(jsonOutput, () => executeRegistration(merged));

        emitJsonResult(jsonOutput, result);
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
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

        emitJsonResult(jsonOutput, result);
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    });

  addAuthOptions(subnameCommand);

  const retryCommand = registerCommand
    .command("retry [name]")
    .description("Resume a cached commit-reveal registration")
    .option(
      "--cb, --commitment-buffer <seconds>",
      `Extra seconds to wait after minCommitmentAge (default: ${DEFAULT_COMMITMENT_BUFFER_SECONDS}, env: DOTNS_COMMITMENT_BUFFER)`,
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (name: string | undefined, options: any, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions;
        if (name) merged.name = name;

        const allOpts =
          typeof cmd.optsWithGlobals === "function" ? cmd.optsWithGlobals() : cmd.opts();
        merged.commitmentBuffer = resolveCommitmentBuffer(allOpts?.commitmentBuffer);

        const result = await maybeQuiet(jsonOutput, () => executeRetry(merged));

        emitJsonResult(jsonOutput, result);
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    });

  addAuthOptions(retryCommand);

  const clearCommand = registerCommand
    .command("clear [name]")
    .description("Review cached commitments, purging completed ones")
    .option("--discard", "Delete pending cached commitments", false)
    .option("--register", "Complete pending cached commitments", false)
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (name: string | undefined, options: any, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        if (options.discard && options.register) {
          throw new Error("Cannot combine --discard with --register; pick one");
        }

        const merged = {
          ...options,
          ...getAuthOptions(cmd),
        } as RegisterActionOptions & { discard?: boolean; register?: boolean };
        if (name) merged.name = name;

        const result = await maybeQuiet(jsonOutput, () => executeClear(merged));

        emitJsonResult(jsonOutput, result);
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    });

  addAuthOptions(clearCommand);

  const listCommand = registerCommand
    .command("list")
    .description("List cached commitments and their on-chain status")
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (options: any, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        const merged = { ...options, ...getAuthOptions(cmd) } as RegisterActionOptions & {
          json?: boolean;
        };

        const result = await maybeQuiet(jsonOutput, () => executeList(merged));

        emitJsonResult(jsonOutput, result);
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    });

  addAuthOptions(listCommand);
}
