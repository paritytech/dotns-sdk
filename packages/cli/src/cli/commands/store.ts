import { Command } from "commander";
import chalk from "chalk";
import type { Address } from "viem";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { prepareAssetHubContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { getJsonFlag, maybeQuiet } from "./jsonHelpers";
import { formatErrorMessage } from "../../utils/formatting";
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
import type { LookupActionOptions } from "../../types/types";

function handleCommandError(error: unknown, cmd: any): never {
  const jsonOutput = getJsonFlag(cmd);
  const message = formatErrorMessage(error);

  if (jsonOutput) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(chalk.red(`\n✗ Error: ${message}\n`));
  }

  process.exit(1);
}

export function attachStoreCommands(root: Command): void {
  const storeCommand = root
    .command("store")
    .description("Manage your on-chain User Store (claim, key/value data) and Label Store names");

  const claimCommand = storeCommand
    .command("claim")
    .description("Claim your User Store (required once before setting values)")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(claimCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
      const { clientWrapper, substrateAddress, signer, evmAddress } = context;

      const result = await maybeQuiet(jsonOutput, () =>
        claimUserStore(clientWrapper, substrateAddress, signer, evmAddress as Address),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ User Store claimed\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const infoCommand = storeCommand
    .command("info")
    .description("Show Store address and deployment status")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(infoCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const { clientWrapper, account, evmAddress } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      const result = await maybeQuiet(jsonOutput, () =>
        getStoreInfo(clientWrapper, account.address, evmAddress as Address),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Store info retrieved\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const listCommand = storeCommand
    .command("list")
    .description("List all values in your UserStore")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(listCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const { clientWrapper, account, evmAddress } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      const result = await maybeQuiet(jsonOutput, () =>
        listStoreValues(clientWrapper, account.address, evmAddress as Address),
      );

      if (jsonOutput) {
        console.log(JSON.stringify({ values: result }));
      } else {
        console.log(chalk.green("\n✓ Store values listed\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const namesCommand = storeCommand
    .command("names")
    .description("List .dot names in your LabelStore (second-level names only by default)")
    .option("--all", "Include subdomains (default: only second-level .dot names)", false)
    .option("--json", "Output result as JSON", false);

  addAuthOptions(namesCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const { clientWrapper, account, evmAddress } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      const allNames = await listStoreNames(clientWrapper, account.address, evmAddress as Address);
      const names = options.all ? allNames : allNames.filter(isSecondLevelDotName);

      if (jsonOutput) {
        console.log(JSON.stringify({ names }));
      } else {
        if (names.length === 0) {
          console.log(chalk.gray("\n  No names found in Store\n"));
        } else {
          console.log(chalk.green(`\n✓ ${names.length} name(s) found\n`));
          for (const name of names) {
            console.log(chalk.gray("  • ") + chalk.cyan(name));
          }
          console.log();
        }
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const cidsCommand = storeCommand
    .command("cids")
    .description("List all uploaded CIDs in your Store")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(cidsCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const { clientWrapper, account, evmAddress } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      const cids = await listStoreCids(clientWrapper, account.address, evmAddress as Address);

      if (jsonOutput) {
        console.log(JSON.stringify({ cids }));
      } else {
        if (cids.length === 0) {
          console.log(chalk.gray("\n  No CIDs found in Store\n"));
        } else {
          console.log(chalk.green(`\n✓ ${cids.length} CID(s) found\n`));
          for (const cid of cids) {
            console.log(chalk.gray("  • ") + chalk.cyan(cid));
          }
          console.log();
        }
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const getCommand = storeCommand
    .command("get <key>")
    .description("Get a value by key (hex bytes32 or string, hashed via keccak256)")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(getCommand).action(async (key: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const { clientWrapper, account, evmAddress } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      const result = await maybeQuiet(jsonOutput, () =>
        getStoreValue(clientWrapper, account.address, evmAddress as Address, key),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Value retrieved\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const setCommand = storeCommand
    .command("set <key> <value>")
    .description("Set a key-value pair in your Store")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(setCommand).action(async (key: string, value: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
      const { clientWrapper, substrateAddress, signer, evmAddress } = context;

      const result = await maybeQuiet(jsonOutput, () =>
        setStoreValue(clientWrapper, substrateAddress, signer, evmAddress as Address, key, value),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Value set\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const deleteCommand = storeCommand
    .command("delete <key>")
    .description("Delete a value from your Store by key")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(deleteCommand).action(async (key: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
      const { clientWrapper, substrateAddress, signer, evmAddress } = context;

      const result = await maybeQuiet(jsonOutput, () =>
        deleteStoreValue(clientWrapper, substrateAddress, signer, evmAddress as Address, key),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Value deleted\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const syncCommand = storeCommand
    .command("sync")
    .description(
      "Sync your Label Store with the protocol. Settles any pending names from the PoP controller (deploys the store on first call).",
    )
    .option("--json", "Output result as JSON", false);

  addAuthOptions(syncCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);

      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
      const { clientWrapper, substrateAddress, signer, evmAddress } = context;

      const result = await maybeQuiet(jsonOutput, () =>
        claimLabels(clientWrapper, substrateAddress, signer, evmAddress as Address),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Label Store synced\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });
}
