import chalk from "chalk";
import ora from "ora";
import { namehash, getAddress, type Address, zeroAddress, checksumAddress } from "viem";
import type { ReviveClientWrapper } from "../client/polkadot-client";
import {
  CONTRACTS,
  DOTNS_REGISTRY_ABI,
  DOTNS_RESOLVER_ABI,
  POP_RULES_ABI,
  STORE_FACTORY_ABI,
  STORE_ABI,
  DOTNS_REGISTRAR_ABI,
} from "../utils/constants";
import { stripTrailingDigits } from "../utils/validation";
import { computeDomainTokenId, performContractCall } from "../utils/contract-interactions";
import { formatNativeBalance, withTimeout } from "../utils/formatting";

export async function performDomainLookup(
  label: string,
  originSubstrateAddress: string,
  clientWrapper: ReviveClientWrapper,
): Promise<void> {
  const fullyQualifiedDomainName = `${label}.dot`;
  const namehashNode = namehash(fullyQualifiedDomainName);

  const spinner = ora("Reading registry").start();

  // Query registry for basic domain information
  const recordExists = Boolean(
    await performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRY,
      DOTNS_REGISTRY_ABI,
      "recordExists",
      [namehashNode],
    ),
  );

  const ownerAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRY,
      DOTNS_REGISTRY_ABI,
      "owner",
      [namehashNode],
    ),
  );

  const resolverAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRY,
      DOTNS_REGISTRY_ABI,
      "resolver",
      [namehashNode],
    ),
  );

  spinner.succeed("Registry read");

  // Display registry information
  console.log("\n▶ DotNS Domain Lookup");
  console.log(chalk.gray("  domain: ") + chalk.cyan(fullyQualifiedDomainName));
  console.log(chalk.gray("  node:   ") + chalk.white(namehashNode));
  console.log();

  console.log("▶ Registry (DotnsRegistry)");
  console.log(chalk.gray("  registry: ") + chalk.white(CONTRACTS.DOTNS_REGISTRY));
  console.log(chalk.gray("  exists:   ") + chalk.white(String(recordExists)));
  console.log(chalk.gray("  owner:    ") + chalk.white(ownerAddress));
  console.log(chalk.gray("  resolver: ") + chalk.white(resolverAddress));
  console.log();

  // If domain not registered, check base name reservation
  if (!recordExists || ownerAddress === zeroAddress) {
    console.log("▶ Status");
    console.log(chalk.gray("  status: ") + chalk.yellow("not registered (no record)"));
    console.log();

    const baseName = stripTrailingDigits(label);
    if (baseName !== label) {
      await displayBaseNameReservation(clientWrapper, originSubstrateAddress, baseName);
    }

    return;
  }

  // Display store factory information
  console.log("▶ User Store (StoreFactory)");
  console.log(chalk.gray("  factory: ") + chalk.white(CONTRACTS.STORE_FACTORY));

  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getDeployedStore",
      [ownerAddress],
    ),
  );

  console.log(chalk.gray("  store:   ") + chalk.white(storeAddress));
  console.log(
    chalk.gray("  status:  ") +
      chalk.white(storeAddress === zeroAddress ? "no store deployed" : "store exists"),
  );
  console.log();

  // Display forward resolution
  console.log("▶ Forward Resolution (DotnsResolver)");
  console.log(chalk.gray("  expectedResolver: ") + chalk.white(CONTRACTS.DOTNS_RESOLVER));

  if (checksumAddress(resolverAddress) !== checksumAddress(CONTRACTS.DOTNS_RESOLVER)) {
    console.log(
      chalk.gray("  note: ") +
        chalk.yellow("registry resolver is not DotnsResolver, skipping address lookup"),
    );
  } else {
    try {
      const resolvedAddress = getAddress(
        await performContractCall<Address>(
          clientWrapper,
          originSubstrateAddress,
          resolverAddress,
          DOTNS_RESOLVER_ABI,
          "addressOf",
          [namehashNode],
        ),
      );

      console.log(
        chalk.gray("  resolvedAddress: ") +
          chalk.white(resolvedAddress === zeroAddress ? "(not set)" : resolvedAddress),
      );
    } catch {
      console.log(chalk.gray("  resolvedAddress: ") + chalk.yellow("lookup failed"));
    }
  }
  console.log();

  // Display owner balance
  console.log("▶ Owner Balance");
  try {
    const ownerSubstrateAddress = await clientWrapper.getSubstrateAddress(ownerAddress);
    const accountInfo =
      await clientWrapper.client.query.System.Account.getValue(ownerSubstrateAddress);
    const freeBalance = accountInfo.data.free as bigint;
    console.log(chalk.gray("  substrate: ") + chalk.white(ownerSubstrateAddress));
    console.log(
      chalk.gray("  free:      ") + chalk.white(formatNativeBalance(freeBalance) + " PAS"),
    );
  } catch {
    console.log(chalk.gray("  balance: ") + chalk.yellow("unavailable"));
  }
  console.log();

  // Check base name reservation
  const baseName = stripTrailingDigits(label);
  if (baseName !== label) {
    await displayBaseNameReservation(clientWrapper, originSubstrateAddress, baseName);
  }

  console.log("▶ Lookup completed");
}

async function displayBaseNameReservation(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  baseName: string,
): Promise<void> {
  console.log("▶ Base Name Reservation (PopRules)");
  console.log(chalk.gray("  oracle:   ") + chalk.white(CONTRACTS.DOTNS_RULES));
  console.log(chalk.gray("  baseName: ") + chalk.cyan(baseName));

  try {
    const reservationInfo = await performContractCall<readonly [boolean, Address, bigint]>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_RULES,
      POP_RULES_ABI,
      "isBaseNameReserved",
      [baseName],
    );

    const [isReserved, reservationOwner, expirationTimestamp] = reservationInfo;
    console.log(chalk.gray("  isReserved: ") + chalk.white(String(isReserved)));
    console.log(chalk.gray("  owner:      ") + chalk.white(getAddress(reservationOwner)));
    if (expirationTimestamp > 0n) {
      console.log(
        chalk.gray("  expires:    ") +
          chalk.white(new Date(Number(expirationTimestamp) * 1000).toISOString()),
      );
    }
  } catch {
    console.log(chalk.gray("  isReserved: ") + chalk.yellow("lookup failed"));
  }

  console.log();
}

export async function listMyRegisteredNames(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
): Promise<void> {
  const evmAddress = await clientWrapper.getEvmAddress(originSubstrateAddress);

  const spinner = ora("Checking for deployed Store").start();

  const storeAddress = await performContractCall<Address>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.STORE_FACTORY,
    STORE_FACTORY_ABI,
    "getDeployedStore",
    [evmAddress],
  );

  if (storeAddress === zeroAddress) {
    spinner.fail("No Store deployed");
    console.log(
      chalk.yellow(
        "\nYou haven't registered any names yet. Your Store will be created automatically when you register your first name.",
      ),
    );
    return;
  }

  spinner.succeed("Store found");

  console.log("\n▶ My Registered Names");
  console.log(chalk.gray("  owner: ") + chalk.white(evmAddress));
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));
  console.log();

  const valueSpinner = ora("Reading registered names from Store").start();

  try {
    // Call getValues() on the store contract
    // Since this is a view function that returns values[msg.sender],
    // we need to ensure msg.sender is the user's EVM address
    const registeredNames = await performContractCall<readonly string[]>(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      STORE_ABI,
      "getValues",
      [],
    );

    valueSpinner.succeed(`Found ${registeredNames.length} registered name(s)`);

    if (registeredNames.length === 0) {
      console.log(chalk.gray("  No names found in Store"));
    } else {
      console.log(chalk.bold("  Registered names:"));
      registeredNames.forEach((name, index) => {
        console.log(chalk.gray(`    ${index + 1}. `) + chalk.cyan(name));
      });
    }
  } catch (error) {
    valueSpinner.fail("Failed to read from Store");
    console.log(
      chalk.yellow(`\n  Error: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}

export async function performOwnerOfLookup(
  name: string,
  substrateAddress: string,
  clientWrapper: ReviveClientWrapper,
): Promise<Address> {
  if (!name || name.trim().length === 0) {
    throw new Error("--owner-of requires a <label>");
  }

  const label = name.trim();

  console.log(chalk.bold("\n🔎 Ownership lookup\n"));
  console.log(chalk.gray("  Label:  ") + chalk.cyan(label));
  console.log(chalk.gray("  Domain: ") + chalk.cyan(label + ".dot"));

  const tokenId = computeDomainTokenId(label);

  let actualOwner: Address;
  let isRegistered: boolean;

  try {
    actualOwner = await withTimeout(
      performContractCall<Address>(
        clientWrapper,
        substrateAddress,
        CONTRACTS.DOTNS_REGISTRAR,
        DOTNS_REGISTRAR_ABI,
        "ownerOf",
        [tokenId],
      ),
      30000,
      "ownerOf",
    );

    isRegistered = actualOwner !== zeroAddress;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Contract reverted") || errorMessage.includes("does not exist")) {
      actualOwner = zeroAddress;
      isRegistered = false;
    } else {
      throw error;
    }
  }

  const ownerSubstrateAddress = isRegistered
    ? await clientWrapper.getSubstrateAddress(actualOwner)
    : "(none)";

  console.log(chalk.gray("\n  Registered:        ") + chalk.white(String(isRegistered)));
  console.log(
    chalk.gray("  Owner (EVM):       ") + chalk.white(isRegistered ? actualOwner : "(none)"),
  );
  console.log(chalk.gray("  Owner (Substrate): ") + chalk.white(ownerSubstrateAddress));

  return actualOwner;
}
