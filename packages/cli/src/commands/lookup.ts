import chalk from "chalk";
import ora from "ora";
import { namehash, getAddress, type Address, zeroAddress, checksumAddress } from "viem";
import type { ReviveClientWrapper } from "../client/polkadotClient";
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
import { computeDomainTokenId, performContractCall } from "../utils/contractInteractions";
import { formatNativeBalance, withTimeout } from "../utils/formatting";
import type { DomainLookupResult, BaseNameReservation, DomainOwnership } from "../types/types";

export async function performDomainLookup(
  label: string,
  originSubstrateAddress: string,
  clientWrapper: ReviveClientWrapper,
): Promise<DomainLookupResult> {
  const fullyQualifiedDomainName = `${label}.dot`;
  const namehashNode = namehash(fullyQualifiedDomainName);

  const result: DomainLookupResult = {
    domain: fullyQualifiedDomainName,
    node: namehashNode,
    exists: false,
    owner: zeroAddress,
    resolver: zeroAddress,
    store: null,
    resolvedAddress: null,
    ownerBalance: null,
    baseNameReservation: null,
  };

  const spinner = ora("Reading registry").start();

  result.exists = Boolean(
    await performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRY,
      DOTNS_REGISTRY_ABI,
      "recordExists",
      [namehashNode],
    ),
  );

  result.owner = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.DOTNS_REGISTRY,
      DOTNS_REGISTRY_ABI,
      "owner",
      [namehashNode],
    ),
  );

  result.resolver = getAddress(
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

  console.log("\n▶ DotNS Domain Lookup");
  console.log(chalk.gray("  domain: ") + chalk.cyan(fullyQualifiedDomainName));
  console.log(chalk.gray("  node:   ") + chalk.white(namehashNode));
  console.log();

  console.log("▶ Registry (DotnsRegistry)");
  console.log(chalk.gray("  registry: ") + chalk.white(CONTRACTS.DOTNS_REGISTRY));
  console.log(chalk.gray("  exists:   ") + chalk.white(String(result.exists)));
  console.log(chalk.gray("  owner:    ") + chalk.white(result.owner));
  console.log(chalk.gray("  resolver: ") + chalk.white(result.resolver));
  console.log();

  if (!result.exists || result.owner === zeroAddress) {
    console.log("▶ Status");
    console.log(chalk.gray("  status: ") + chalk.yellow("not registered (no record)"));
    console.log();

    const baseName = stripTrailingDigits(label);
    if (baseName !== label) {
      result.baseNameReservation = await lookupBaseNameReservation(
        clientWrapper,
        originSubstrateAddress,
        baseName,
      );
      displayBaseNameReservation(result.baseNameReservation);
    }

    return result;
  }

  console.log("▶ User Store (StoreFactory)");
  console.log(chalk.gray("  factory: ") + chalk.white(CONTRACTS.STORE_FACTORY));

  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getDeployedStore",
      [result.owner],
    ),
  );

  result.store = storeAddress === zeroAddress ? null : storeAddress;

  console.log(chalk.gray("  store:   ") + chalk.white(storeAddress));
  console.log(
    chalk.gray("  status:  ") +
      chalk.white(storeAddress === zeroAddress ? "no store deployed" : "store exists"),
  );
  console.log();

  console.log("▶ Forward Resolution (DotnsResolver)");
  console.log(chalk.gray("  expectedResolver: ") + chalk.white(CONTRACTS.DOTNS_RESOLVER));

  if (checksumAddress(result.resolver) !== checksumAddress(CONTRACTS.DOTNS_RESOLVER)) {
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
          result.resolver,
          DOTNS_RESOLVER_ABI,
          "addressOf",
          [namehashNode],
        ),
      );

      result.resolvedAddress = resolvedAddress === zeroAddress ? null : resolvedAddress;

      console.log(
        chalk.gray("  resolvedAddress: ") +
          chalk.white(resolvedAddress === zeroAddress ? "(not set)" : resolvedAddress),
      );
    } catch {
      console.log(chalk.gray("  resolvedAddress: ") + chalk.yellow("lookup failed"));
    }
  }
  console.log();

  console.log("▶ Owner Balance");
  try {
    const ownerSubstrateAddress = await clientWrapper.getSubstrateAddress(result.owner);
    const accountInfo =
      await clientWrapper.client.query.System.Account.getValue(ownerSubstrateAddress);
    const freeBalance = accountInfo.data.free as bigint;

    result.ownerBalance = {
      substrate: ownerSubstrateAddress,
      free: formatNativeBalance(freeBalance),
    };

    console.log(chalk.gray("  substrate: ") + chalk.white(ownerSubstrateAddress));
    console.log(
      chalk.gray("  free:      ") + chalk.white(formatNativeBalance(freeBalance) + " PAS"),
    );
  } catch {
    console.log(chalk.gray("  balance: ") + chalk.yellow("unavailable"));
  }
  console.log();

  const baseName = stripTrailingDigits(label);
  if (baseName !== label) {
    result.baseNameReservation = await lookupBaseNameReservation(
      clientWrapper,
      originSubstrateAddress,
      baseName,
    );
    displayBaseNameReservation(result.baseNameReservation);
  }

  console.log("▶ Lookup completed");

  return result;
}

async function lookupBaseNameReservation(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  baseName: string,
): Promise<BaseNameReservation> {
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

    return {
      baseName,
      isReserved,
      reservedBy: getAddress(reservationOwner),
      expires:
        expirationTimestamp > 0n
          ? new Date(Number(expirationTimestamp) * 1000).toISOString()
          : null,
    };
  } catch {
    return {
      expires: null,
      baseName,
      isReserved: false,
      reservedBy: zeroAddress,
    };
  }
}

function displayBaseNameReservation(reservation: BaseNameReservation): void {
  console.log("▶ Base Name Reservation (PopRules)");
  console.log(chalk.gray("  oracle:   ") + chalk.white(CONTRACTS.DOTNS_RULES));
  console.log(chalk.gray("  baseName: ") + chalk.cyan(reservation.baseName));
  console.log(chalk.gray("  isReserved: ") + chalk.white(String(reservation.isReserved)));
  console.log(chalk.gray("  owner:      ") + chalk.white(reservation.reservedBy));
  if (reservation.expires) {
    console.log(chalk.gray("  expires:    ") + chalk.white(reservation.expires));
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
): Promise<DomainOwnership> {
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

  return {
    label,
    domain: `${label}.dot`,
    registered: isRegistered,
    ownerEvm: isRegistered ? actualOwner : zeroAddress,
    ownerSubstrate: ownerSubstrateAddress,
  };
}
