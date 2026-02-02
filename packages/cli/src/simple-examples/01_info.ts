import { connectDotns } from "./00_shared";
import { formatNativeBalance } from "../utils/formatting";

async function main() {
  const { client, substrateAddress, evmAddress } = await connectDotns();

  const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);

  console.log("Account");
  console.log("  substrate:", substrateAddress);
  console.log("  evm:      ", evmAddress);
  console.log("  nonce:    ", accountInfo.nonce.toString());
  console.log("  free:     ", formatNativeBalance(accountInfo.data.free), "PAS");
  console.log("  reserved: ", formatNativeBalance(accountInfo.data.reserved), "PAS");
  console.log("  frozen:   ", formatNativeBalance(accountInfo.data.frozen), "PAS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
