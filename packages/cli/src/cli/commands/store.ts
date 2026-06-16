import { printCommandHeader } from "../ui";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import type { Address } from "viem";
import { addAuthOptions } from "./authOptions";
import { prepareAssetHubContext, buildDotnsContext, buildReadOnlyDotnsContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { makeOnStatus } from "../txStatus";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import { isSecondLevelDotName } from "../../utils/validation";
import {
  claimUserStore,
  getStoreInfo,
  listStoreValues,
  getStoreValue,
  setStoreValue,
  deleteStoreValue,
  listStoreNames,
  listStoreCids,
  claimLabels,
} from "../../commands/storeManagement";

interface StoreCommonOptions {
  rpc?: string;
}

export function attachStoreCommands(root: Command): void {
  const storeCommand = root
    .command("store")
    .description("Manage your on-chain User Store (claim, key/value data) and Label Store names");
  addAuthOptions(storeCommand);

  const claimCommand = storeCommand
    .command("claim")
    .description("Claim your User Store (required once before setting values)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(claimCommand).action(async (options: StoreCommonOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));

      if (!jsonOutput) printCommandHeader("Claim User Store");
      const spinner = ora();
      const ctx = buildDotnsContext(context, { onStatus: makeOnStatus(spinner, "User Store") });

      const result = await maybeQuiet(jsonOutput, () => claimUserStore(ctx, context.evmAddress));

      if (!emitJsonResult(jsonOutput, result)) {
        console.log(chalk.gray("  owner: ") + chalk.white(context.evmAddress));
        console.log(chalk.gray("  store: ") + chalk.white(result.storeAddress));
        console.log(
          chalk.gray("  status: ") +
            chalk.white(result.alreadyClaimed ? "already claimed" : "claimed"),
        );
        if (result.tx) console.log(chalk.gray("  tx:    ") + chalk.blue(result.tx));
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  const infoCommand = storeCommand
    .command("info")
    .description("Show Store address and deployment status")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(infoCommand).action(async (options: StoreCommonOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));

      if (!jsonOutput) printCommandHeader("Store info");
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, {
        onStatus: makeOnStatus(spinner, "Store"),
      });

      const result = await maybeQuiet(jsonOutput, () =>
        getStoreInfo(ctx, context.evmAddress as Address),
      );

      if (!emitJsonResult(jsonOutput, result)) {
        console.log(chalk.gray("  owner: ") + chalk.white(result.owner));
        console.log(chalk.gray("  store: ") + chalk.white(result.storeAddress ?? "(not claimed)"));
        console.log(chalk.gray("  exists: ") + chalk.white(String(result.exists)));
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  const listCommand = storeCommand
    .command("list")
    .description("List all values in your UserStore")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(listCommand).action(async (options: StoreCommonOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));

      if (!jsonOutput) printCommandHeader("Store values");
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, {
        onStatus: makeOnStatus(spinner, "Store values"),
      });

      const values = await maybeQuiet(jsonOutput, () =>
        listStoreValues(ctx, context.evmAddress as Address),
      );

      if (!emitJsonResult(jsonOutput, { values })) {
        if (values.length === 0) {
          console.log(chalk.gray("  (empty)"));
        } else {
          values.forEach((entry, index) => {
            console.log(
              chalk.gray(`  ${index + 1}. `) + chalk.cyan(`${entry.key} = ${entry.value}`),
            );
          });
        }
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  const namesCommand = storeCommand
    .command("names")
    .description("List .dot names in your LabelStore (second-level names only by default)")
    .option("--all", "Include subdomains (default: only second-level .dot names)", false)
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(namesCommand).action(
    async (options: StoreCommonOptions & { all?: boolean }, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));

        if (!jsonOutput) printCommandHeader("Store names");
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "Store names"),
        });

        const allNames = await maybeQuiet(jsonOutput, () =>
          listStoreNames(ctx, context.evmAddress as Address),
        );
        const names = options.all ? allNames : allNames.filter(isSecondLevelDotName);

        if (!emitJsonResult(jsonOutput, { names })) {
          if (names.length === 0) {
            console.log(chalk.gray("  No names found in Store"));
          } else {
            for (const name of names) {
              console.log(chalk.gray("  • ") + chalk.cyan(name));
            }
          }
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const cidsCommand = storeCommand
    .command("cids")
    .description("List all uploaded CIDs in your Store")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(cidsCommand).action(async (options: StoreCommonOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));

      if (!jsonOutput) printCommandHeader("Store CIDs");
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, {
        onStatus: makeOnStatus(spinner, "Store CIDs"),
      });

      const cids = await maybeQuiet(jsonOutput, () =>
        listStoreCids(ctx, context.evmAddress as Address),
      );

      if (!emitJsonResult(jsonOutput, { cids })) {
        if (cids.length === 0) {
          console.log(chalk.gray("  No CIDs found in Store"));
        } else {
          for (const cid of cids) {
            console.log(chalk.gray("  • ") + chalk.cyan(cid));
          }
        }
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  const getCommand = storeCommand
    .command("get <key>")
    .description("Get a value by key (hex bytes32 or string, hashed via keccak256)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(getCommand).action(
    async (key: string, options: StoreCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));

        if (!jsonOutput) printCommandHeader("Store value");
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "Store value"),
        });

        const result = await maybeQuiet(jsonOutput, () =>
          getStoreValue(ctx, context.evmAddress as Address, key),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  key:   ") + chalk.white(result.key));
          console.log(
            chalk.gray("  value: ") + chalk.white(result.exists ? result.value : "(empty)"),
          );
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const setCommand = storeCommand
    .command("set <key> <value>")
    .description("Set a key-value pair in your Store")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(setCommand).action(
    async (key: string, value: string, options: StoreCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));

        if (!jsonOutput) printCommandHeader("Set Store value");
        const spinner = ora();
        const ctx = buildDotnsContext(context, { onStatus: makeOnStatus(spinner, "Store write") });

        const result = await maybeQuiet(jsonOutput, () =>
          setStoreValue(ctx, context.evmAddress, key, value),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  key:   ") + chalk.white(result.key));
          console.log(chalk.gray("  value: ") + chalk.white(result.value));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const deleteCommand = storeCommand
    .command("delete <key>")
    .description("Delete a value from your Store by key")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(deleteCommand).action(
    async (key: string, options: StoreCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));

        if (!jsonOutput) printCommandHeader("Delete Store value");
        const spinner = ora();
        const ctx = buildDotnsContext(context, { onStatus: makeOnStatus(spinner, "Store delete") });

        const result = await maybeQuiet(jsonOutput, () =>
          deleteStoreValue(ctx, context.evmAddress, key),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  key: ") + chalk.white(result.key));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const syncCommand = storeCommand
    .command("sync")
    .description(
      "Sync your Label Store with the protocol. Settles any pending names from the PoP controller (deploys the store on first call).",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(syncCommand).action(async (options: StoreCommonOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));

      if (!jsonOutput) printCommandHeader("Sync Label Store");
      const spinner = ora();
      const ctx = buildDotnsContext(context, { onStatus: makeOnStatus(spinner, "Label Store") });

      const result = await maybeQuiet(jsonOutput, () => claimLabels(ctx, context.evmAddress));

      if (!emitJsonResult(jsonOutput, result)) {
        console.log(chalk.gray("  owner: ") + chalk.white(context.evmAddress));
        console.log(chalk.gray("  store: ") + chalk.white(result.storeAddress ?? "(not deployed)"));
        console.log(chalk.gray("  tx:    ") + chalk.blue(result.tx));
        console.log(chalk.green("\n✓ Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });
}
