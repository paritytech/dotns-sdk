import { describe, expect, test } from "bun:test";
import { checksumAddress } from "viem";
import { resolveTransferRecipient } from "../../../src/cli/transfer";

// Only the EVM-address and unrecognised-input branches are exercised here; the
// SS58 and .dot-label branches resolve via the chain client and belong to
// integration coverage. Those branches return before touching ctx, so a null
// context is never dereferenced.
const NO_CTX = null as never;

describe("resolveTransferRecipient", () => {
  test("returns a raw EVM address in checksummed form without touching the chain", async () => {
    const lower = "0x35cdb23ff7fc86e8dccd577ca309bfea9c978d20";
    await expect(resolveTransferRecipient(NO_CTX, lower)).resolves.toBe(checksumAddress(lower));
  });

  test("rejects input that is neither an EVM address, SS58 address, nor .dot label", async () => {
    await expect(resolveTransferRecipient(NO_CTX, "not a name!!")).rejects.toThrow(
      "Unrecognised recipient",
    );
  });
});
