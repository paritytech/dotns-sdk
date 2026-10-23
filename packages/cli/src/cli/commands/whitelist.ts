import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getAddress, type Address } from "viem";
import { printCommandHeader } from "../ui";
import { addAuthOptions } from "./authOptions";
import { prepareAssetHubContext, buildDotnsContext } from "../context";
import { makeOnStatus } from "../txStatus";
import { resolveTransferRecipient } from "../transfer";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import { formatDomainName } from "../../core/naming";
import { normaliseGrantLabel, requestNameGrant } from "../../commands/governance";

interface RequestOptions {
  reason?: string;
  for?: string;
}

export function attachWhitelistCommands(root: Command) {
  const whitelistCommand = root
    .command("whitelist")
    .description("Ask governance for a name through the whitelist's request window");
  addAuthOptions(whitelistCommand);

  const requestCommand = whitelistCommand
    .command("request <name>")
    .description("Request a name while the window is open, for governance to accept")
    .requiredOption("--reason <text>", "Why the name should be granted")
    .option(
      "--for <account>",
      "Account the request is for: EVM address, SS58 address or domain name (default: the signer)",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(requestCommand).action(
    async (name: string, options: RequestOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));
        if (!jsonOutput) printCommandHeader("Request name", name);
        const spinner = ora();
        const ctx = buildDotnsContext(context, { onStatus: makeOnStatus(spinner, "Requesting") });

        const label = await normaliseGrantLabel(ctx, name);
        const domain = await formatDomainName(ctx, label);
        const user: Address = options.for
          ? await maybeQuiet(jsonOutput, () => resolveTransferRecipient(ctx, options.for as string))
          : getAddress(context.evmAddress);
        const selfFiled = user.toLowerCase() === context.evmAddress.toLowerCase();

        if (!jsonOutput) {
          console.log(chalk.gray("  name:  ") + chalk.cyan(domain));
          console.log(chalk.gray("  for:   ") + chalk.white(user));
          // The whitelist keeps a rejected self-filed request and deletes one filed on
          // someone's behalf, so only the first can never be filed again.
          console.log(
            chalk.yellow(
              selfFiled
                ? "  If governance rejects this request, this account can't request the name again."
                : "  If governance rejects this request it is deleted, and that account can still request the name itself.",
            ),
          );
        }

        const result = await maybeQuiet(jsonOutput, () =>
          requestNameGrant(ctx, label, options.reason as string, user),
        );

        if (!emitJsonResult(jsonOutput, { ok: true, label, domain, user, ...result })) {
          console.log(chalk.gray("  tx:    ") + chalk.blue(result.txHash));
          console.log(
            chalk.green("\n✓ Requested. ") +
              `Propose the grant with: dotns governance propose ${label}${selfFiled ? "" : ` --for ${user}`}\n`,
          );
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
