import chalk from "chalk";
import ora from "ora";
import {
  getAddress,
  zeroAddress,
  keccak256,
  toHex,
  encodeFunctionData,
  decodeFunctionResult,
  namehash,
  type Address,
  type Abi,
} from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import {
  CONTRACTS,
  STORE_FACTORY_ABI,
  STORE_ABI,
  DOTNS_REGISTRAR_ABI,
  DOTNS_REGISTRY_ABI,
} from "../utils/constants";
import {
  performContractCall,
  submitContractTransaction,
  computeDomainTokenId,
} from "../utils/contractInteractions";
import Multicall3Json from "../../abis/Multicall3.json" assert { type: "json" };
import type {
  StoreInfo,
  StoreValueResult,
  StoreAuthStatus,
  StoreEnsureAuthResult,
  StoreDeleteResult,
  CacheCidToStoreOptions,
  Multicall3Call,
  Multicall3Result,
} from "../types/types";

const MULTICALL3_ABI = Multicall3Json.abi as Abi;
const MULTICALL_CHUNK_SIZE = 20;

function normalizeKeyToBytes32(raw: string): `0x${string}` {
  if (raw.startsWith("0x") && raw.length === 66) {
    return raw as `0x${string}`;
  }
  return keccak256(toHex(raw));
}

async function resolveStoreAddress(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<Address> {
  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getDeployedStore",
      [evmAddress],
    ),
  );

  if (storeAddress === zeroAddress) {
    throw new Error("No Store deployed for this account. Register a domain first to create one.");
  }

  return storeAddress;
}

export async function getStoreInfo(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<StoreInfo> {
  const spinner = ora("Looking up Store").start();

  const storeAddress = getAddress(
    await performContractCall<Address>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.STORE_FACTORY,
      STORE_FACTORY_ABI,
      "getDeployedStore",
      [evmAddress],
    ),
  );

  const exists = storeAddress !== zeroAddress;
  spinner.succeed("Store lookup complete");

  console.log("\n▶ Store Info");
  console.log(chalk.gray("  factory: ") + chalk.white(CONTRACTS.STORE_FACTORY));
  console.log(chalk.gray("  owner:   ") + chalk.white(evmAddress));
  console.log(chalk.gray("  store:   ") + chalk.white(exists ? storeAddress : "(not deployed)"));
  console.log(chalk.gray("  exists:  ") + chalk.white(String(exists)));

  return { owner: evmAddress, storeAddress: exists ? storeAddress : null, exists };
}

export async function listStoreValues(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<string[]> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const spinner = ora("Reading Store values").start();

  const values = await performContractCall<readonly string[]>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    STORE_ABI,
    "getValues",
    [],
  );

  spinner.succeed(`Found ${values.length} value(s)`);

  console.log("\n▶ Store Values");
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));

  if (values.length === 0) {
    console.log(chalk.gray("  (empty)"));
  } else {
    values.forEach((value, index) => {
      console.log(chalk.gray(`  ${index + 1}. `) + chalk.cyan(value));
    });
  }

  return [...values];
}

export async function listStoreNames(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<string[]> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const spinner = ora("Reading Store names").start();

  const values = await performContractCall<readonly string[]>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    STORE_ABI,
    "getValues",
    [],
  );

  if (values.length === 0) {
    spinner.succeed("Found 0 verified name(s)");
    return [];
  }

  spinner.text = `Verifying ${values.length} value(s) on-chain via Multicall3`;

  function isSubname(value: string): boolean {
    const name = value.endsWith(".dot") ? value.slice(0, -4) : value;
    return name.includes(".");
  }

  const callMeta = values.map((value) => {
    if (isSubname(value)) {
      const fullName = value.endsWith(".dot") ? value : `${value}.dot`;
      return {
        target: CONTRACTS.DOTNS_REGISTRY as Address,
        allowFailure: true as const,
        callData: encodeFunctionData({
          abi: DOTNS_REGISTRY_ABI,
          functionName: "owner",
          args: [namehash(fullName)],
        }),
        isSubnameCall: true,
      };
    }
    return {
      target: CONTRACTS.DOTNS_REGISTRAR as Address,
      allowFailure: true as const,
      callData: encodeFunctionData({
        abi: DOTNS_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [computeDomainTokenId(value)],
      }),
      isSubnameCall: false,
    };
  });

  const calls: Multicall3Call[] = callMeta.map(({ target, allowFailure, callData }) => ({
    target,
    allowFailure,
    callData,
  }));

  const results: Multicall3Result[] = [];
  for (let i = 0; i < calls.length; i += MULTICALL_CHUNK_SIZE) {
    const chunk = calls.slice(i, i + MULTICALL_CHUNK_SIZE);
    const chunkResults = await performContractCall<readonly Multicall3Result[]>(
      clientWrapper,
      originSubstrateAddress,
      CONTRACTS.MULTICALL3,
      MULTICALL3_ABI,
      "aggregate3",
      [chunk],
    );
    results.push(...chunkResults);
  }

  const normalizedOwner = getAddress(evmAddress);
  const names = values.filter((_, i) => {
    const result = results[i];
    if (!result?.success) return false;
    try {
      const meta = callMeta[i];
      const abi = meta?.isSubnameCall ? DOTNS_REGISTRY_ABI : DOTNS_REGISTRAR_ABI;
      const functionName = meta?.isSubnameCall ? "owner" : "ownerOf";
      const decoded = decodeFunctionResult({
        abi,
        functionName,
        data: result.returnData,
      }) as Address;
      return decoded && getAddress(decoded) === normalizedOwner;
    } catch {
      return false;
    }
  });

  spinner.succeed(`Found ${names.length} verified name(s)`);
  return names;
}

export async function listStoreCids(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
): Promise<string[]> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const spinner = ora("Reading Store CIDs").start();

  const values = await performContractCall<readonly string[]>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    STORE_ABI,
    "getValues",
    [],
  );

  const verifiedNames = new Set(
    await listStoreNames(clientWrapper, originSubstrateAddress, evmAddress),
  );
  const cids = values.filter((value) => !verifiedNames.has(value));
  spinner.succeed(`Found ${cids.length} CID(s)`);

  return cids;
}

export async function getStoreValue(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
  rawKey: string,
): Promise<StoreValueResult> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Reading Store value").start();

  const value = await performContractCall<string>(
    clientWrapper,
    originSubstrateAddress,
    storeAddress,
    STORE_ABI,
    "getValue",
    [key],
  );

  const exists = value.length > 0;
  spinner.succeed("Value read");

  console.log("\n▶ Store Value");
  console.log(chalk.gray("  store: ") + chalk.white(storeAddress));
  console.log(chalk.gray("  key:   ") + chalk.white(key));
  console.log(chalk.gray("  value: ") + chalk.white(exists ? value : "(empty)"));

  return { key, value, exists };
}

export async function setStoreValue(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  rawKey: string,
  value: string,
): Promise<StoreValueResult> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Writing to Store").start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "setValue",
    [key, value],
    substrateAddress,
    signer,
    spinner,
    "Store write",
  );

  console.log("\n▶ Store Set");
  console.log(chalk.gray("  tx:    ") + chalk.blue(tx));
  console.log(chalk.gray("  key:   ") + chalk.white(key));
  console.log(chalk.gray("  value: ") + chalk.white(value));

  return { key, value, exists: true };
}

export async function deleteStoreValue(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  rawKey: string,
): Promise<StoreDeleteResult> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const key = normalizeKeyToBytes32(rawKey);
  const spinner = ora("Deleting Store value").start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "deleteValue",
    [key],
    substrateAddress,
    signer,
    spinner,
    "Store delete",
  );

  console.log("\n▶ Store Delete");
  console.log(chalk.gray("  tx:  ") + chalk.blue(tx));
  console.log(chalk.gray("  key: ") + chalk.white(key));

  return { key, deleted: true };
}

export async function checkStoreAuth(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  evmAddress: Address,
  targetAddress: Address,
): Promise<StoreAuthStatus> {
  const storeAddress = await resolveStoreAddress(clientWrapper, originSubstrateAddress, evmAddress);
  const spinner = ora("Checking authorization status").start();

  const isAuthorized = Boolean(
    await performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      STORE_ABI,
      "isAuthorized",
      [targetAddress],
    ),
  );

  const isDotnsController = Boolean(
    await performContractCall<boolean>(
      clientWrapper,
      originSubstrateAddress,
      storeAddress,
      STORE_ABI,
      "isDotnsController",
      [targetAddress],
    ),
  );

  spinner.succeed("Authorization check complete");

  console.log("\n▶ Authorization Status");
  console.log(chalk.gray("  store:      ") + chalk.white(storeAddress));
  console.log(chalk.gray("  target:     ") + chalk.white(targetAddress));
  console.log(chalk.gray("  authorized: ") + chalk.white(String(isAuthorized)));
  console.log(chalk.gray("  controller: ") + chalk.white(String(isDotnsController)));

  return { address: targetAddress, isAuthorized, isDotnsController };
}

export async function authorizeStoreWriter(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Authorizing ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "authorizeStore",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Authorize writer",
  );

  console.log("\n▶ Authorize Writer");
  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function unauthorizeStoreWriter(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Revoking ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "unauthorizeStore",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Revoke writer",
  );

  console.log("\n▶ Revoke Writer");
  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function authorizeDotnsController(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Authorizing controller ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "authorizeDotnsController",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Authorize controller",
  );

  console.log("\n▶ Authorize Controller");
  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function unauthorizeDotnsController(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
  targetAddress: Address,
): Promise<void> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora(`Revoking controller ${targetAddress}`).start();

  const tx = await submitContractTransaction(
    clientWrapper,
    storeAddress,
    0n,
    STORE_ABI,
    "unauthorizeDotnsController",
    [targetAddress],
    substrateAddress,
    signer,
    spinner,
    "Revoke controller",
  );

  console.log("\n▶ Revoke Controller");
  console.log(chalk.gray("  tx:     ") + chalk.blue(tx));
  console.log(chalk.gray("  target: ") + chalk.white(targetAddress));
}

export async function ensureStoreAuthorizations(
  clientWrapper: ReviveClientWrapper,
  substrateAddress: string,
  signer: PolkadotSigner,
  evmAddress: Address,
): Promise<StoreEnsureAuthResult> {
  const storeAddress = await resolveStoreAddress(clientWrapper, substrateAddress, evmAddress);
  const spinner = ora("Checking Store authorizations").start();

  const [controllerAuthorized, registryAuthorized] = await Promise.all([
    Boolean(
      await performContractCall<boolean>(
        clientWrapper,
        substrateAddress,
        storeAddress,
        STORE_ABI,
        "isAuthorized",
        [CONTRACTS.DOTNS_REGISTRAR_CONTROLLER],
      ),
    ),
    Boolean(
      await performContractCall<boolean>(
        clientWrapper,
        substrateAddress,
        storeAddress,
        STORE_ABI,
        "isAuthorized",
        [CONTRACTS.DOTNS_REGISTRY],
      ),
    ),
  ]);

  const result: StoreEnsureAuthResult = {
    controllerAddress: CONTRACTS.DOTNS_REGISTRAR_CONTROLLER,
    controllerAuthorized,
    registryAddress: CONTRACTS.DOTNS_REGISTRY,
    registryAuthorized,
  };

  if (controllerAuthorized && registryAuthorized) {
    spinner.succeed("Store authorizations verified");

    console.log("\n▶ Store Authorizations");
    console.log(chalk.gray("  store:      ") + chalk.white(storeAddress));
    console.log(
      chalk.gray("  controller: ") +
        chalk.green("authorized") +
        chalk.gray(` (${CONTRACTS.DOTNS_REGISTRAR_CONTROLLER})`),
    );
    console.log(
      chalk.gray("  registry:   ") +
        chalk.green("authorized") +
        chalk.gray(` (${CONTRACTS.DOTNS_REGISTRY})`),
    );

    return result;
  }

  spinner.warn("Store authorizations need update");

  if (!controllerAuthorized) {
    const controllerSpinner = ora("Authorizing registrar controller as Store writer").start();

    const tx = await submitContractTransaction(
      clientWrapper,
      storeAddress,
      0n,
      STORE_ABI,
      "authorizeStore",
      [CONTRACTS.DOTNS_REGISTRAR_CONTROLLER],
      substrateAddress,
      signer,
      controllerSpinner,
      "Authorize controller",
    );

    result.controllerTx = tx;
    result.controllerAuthorized = true;
    console.log(chalk.gray("  tx:         ") + chalk.blue(tx));
    console.log(chalk.gray("  controller: ") + chalk.white(CONTRACTS.DOTNS_REGISTRAR_CONTROLLER));
  }

  if (!registryAuthorized) {
    const registrySpinner = ora("Authorizing registry as Store writer").start();

    const tx = await submitContractTransaction(
      clientWrapper,
      storeAddress,
      0n,
      STORE_ABI,
      "authorizeStore",
      [CONTRACTS.DOTNS_REGISTRY],
      substrateAddress,
      signer,
      registrySpinner,
      "Authorize registry",
    );

    result.registryTx = tx;
    result.registryAuthorized = true;
    console.log(chalk.gray("  tx:         ") + chalk.blue(tx));
    console.log(chalk.gray("  registry:   ") + chalk.white(CONTRACTS.DOTNS_REGISTRY));
  }

  return result;
}

export async function cacheCidToStore(options: CacheCidToStoreOptions): Promise<void> {
  const storeKey = `dotns.bulletin.${options.cid}`;
  await setStoreValue(
    options.clientWrapper,
    options.substrateAddress,
    options.signer,
    options.evmAddress,
    storeKey,
    options.cid,
  );
}
