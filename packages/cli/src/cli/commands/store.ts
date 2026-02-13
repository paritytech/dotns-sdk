import { Command } from "commander";
import chalk from "chalk";
import { isAddress, getAddress, type Address } from "viem";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { prepareAssetHubContext } from "../context";
import { prepareReadOnlyContext, getJsonFlag } from "./lookup";
import { maybeQuiet } from "./bulletin";
import {
  getStoreInfo,
  listStoreValues,
  getStoreValue,
  setStoreValue,
  deleteStoreValue,
  checkStoreAuth,
  authorizeStoreWriter,
  unauthorizeStoreWriter,
  authorizeDotnsController,
  unauthorizeDotnsController,
} from "../../commands/storeManagement";
import type { LookupActionOptions } from "../../types/types";

function validateEvmAddress(raw: string): Address {
  if (!isAddress(raw)) {
    throw new Error(`Invalid EVM address: ${raw}`);
  }
  return getAddress(raw);
}

function handleCommandError(error: unknown, cmd: any): never {
  const jsonOutput = getJsonFlag(cmd);
  const message = error instanceof Error ? error.message : String(error);

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
    .description("Manage your on-chain Store (values, authorization, controllers)");

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
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const listCommand = storeCommand
    .command("list")
    .description("List all values in your Store")
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
        console.log(chalk.green("\n✓ Complete\n"));
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
        console.log(chalk.green("\n✓ Complete\n"));
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
        console.log(chalk.green("\n✓ Complete\n"));
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
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const checkCommand = storeCommand
    .command("check <address>")
    .description("Check whether an address is authorized or a DotNS controller on your Store")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(checkCommand).action(async (address: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);
      const targetAddress = validateEvmAddress(address);

      const { clientWrapper, account, evmAddress } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      const result = await maybeQuiet(jsonOutput, () =>
        checkStoreAuth(clientWrapper, account.address, evmAddress as Address, targetAddress),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const authorizeCommand = storeCommand
    .command("authorize <address>")
    .description("Authorize an address to write to your Store (setValueFor)")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(authorizeCommand).action(async (address: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);
      const targetAddress = validateEvmAddress(address);

      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
      const { clientWrapper, substrateAddress, signer, evmAddress } = context;

      await maybeQuiet(jsonOutput, () =>
        authorizeStoreWriter(
          clientWrapper,
          substrateAddress,
          signer,
          evmAddress as Address,
          targetAddress,
        ),
      );

      if (jsonOutput) {
        console.log(JSON.stringify({ authorized: targetAddress, role: "writer" }));
      } else {
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const unauthorizeCommand = storeCommand
    .command("unauthorize <address>")
    .description("Revoke write access from an address on your Store")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(unauthorizeCommand).action(async (address: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(cmd);
      const targetAddress = validateEvmAddress(address);

      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
      const { clientWrapper, substrateAddress, signer, evmAddress } = context;

      await maybeQuiet(jsonOutput, () =>
        unauthorizeStoreWriter(
          clientWrapper,
          substrateAddress,
          signer,
          evmAddress as Address,
          targetAddress,
        ),
      );

      if (jsonOutput) {
        console.log(JSON.stringify({ unauthorized: targetAddress, role: "writer" }));
      } else {
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(error, cmd);
    }
  });

  const authorizeControllerCommand = storeCommand
    .command("authorize-controller <address>")
    .description("Authorize an address as a DotNS controller (locks keys permanently on write)")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(authorizeControllerCommand).action(
    async (address: string, options: any, cmd: any) => {
      try {
        const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
        const jsonOutput = getJsonFlag(cmd);
        const targetAddress = validateEvmAddress(address);

        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
        const { clientWrapper, substrateAddress, signer, evmAddress } = context;

        await maybeQuiet(jsonOutput, () =>
          authorizeDotnsController(
            clientWrapper,
            substrateAddress,
            signer,
            evmAddress as Address,
            targetAddress,
          ),
        );

        if (jsonOutput) {
          console.log(JSON.stringify({ authorized: targetAddress, role: "controller" }));
        } else {
          console.log(chalk.green("\n✓ Complete\n"));
        }

        process.exit(0);
      } catch (error) {
        handleCommandError(error, cmd);
      }
    },
  );

  const unauthorizeControllerCommand = storeCommand
    .command("unauthorize-controller <address>")
    .description("Revoke DotNS controller authorization from an address on your Store")
    .option("--json", "Output result as JSON", false);

  addAuthOptions(unauthorizeControllerCommand).action(
    async (address: string, options: any, cmd: any) => {
      try {
        const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
        const jsonOutput = getJsonFlag(cmd);
        const targetAddress = validateEvmAddress(address);

        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
        const { clientWrapper, substrateAddress, signer, evmAddress } = context;

        await maybeQuiet(jsonOutput, () =>
          unauthorizeDotnsController(
            clientWrapper,
            substrateAddress,
            signer,
            evmAddress as Address,
            targetAddress,
          ),
        );

        if (jsonOutput) {
          console.log(JSON.stringify({ unauthorized: targetAddress, role: "controller" }));
        } else {
          console.log(chalk.green("\n✓ Complete\n"));
        }

        process.exit(0);
      } catch (error) {
        handleCommandError(error, cmd);
      }
    },
  );
}
