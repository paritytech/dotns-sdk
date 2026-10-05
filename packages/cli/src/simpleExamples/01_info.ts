import { connectDotns } from "./00_shared";
import { formatNativeBalance } from "../utils/formatting";

async function main() {
  const { client, ctx, substrateAddress, evmAddress } = await connectDotns();
  const { nativeTokenDecimals, nativeTokenSymbol } = ctx;

  const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);

  console.log("Account");
  console.log("  substrate:", substrateAddress);
  console.log("  evm:      ", evmAddress);
  console.log("  nonce:    ", accountInfo.nonce.toString());
  const { free, reserved, frozen } = accountInfo.data;
  console.log("  free:     ", formatNativeBalance(free, nativeTokenDecimals), nativeTokenSymbol);
  console.log(
    "  reserved: ",
    formatNativeBalance(reserved, nativeTokenDecimals),
    nativeTokenSymbol,
  );
  console.log("  frozen:   ", formatNativeBalance(frozen, nativeTokenDecimals), nativeTokenSymbol);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
