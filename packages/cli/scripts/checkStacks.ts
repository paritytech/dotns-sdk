// Fails the build when a stack copy in .trinity lacks a required field, does not
// verify against its link's key, or is past its expiresAt, and warns about one past
// its validUntil. Run after `trinity-stack generate`.
import { formatErrorMessage } from "../src/utils/formatting";

try {
  // Imported here because the stacks are read at import, and a failure should print only
  // its message.
  const { DOTNS_ENVIRONMENTS, assertBundledStacksUnexpired, assertBundledStacksSigned } =
    await import("../src/utils/environments");
  for (const { id, descriptor } of Object.values(DOTNS_ENVIRONMENTS)) {
    console.log(`${id}: stack ${descriptor.id}, sequence ${descriptor.sequence}`);
  }
  assertBundledStacksSigned();
  for (const warning of assertBundledStacksUnexpired()) {
    console.warn(`warning: stale bundled stack in .trinity: ${warning}`);
  }
} catch (error) {
  console.error(formatErrorMessage(error));
  process.exit(1);
}
