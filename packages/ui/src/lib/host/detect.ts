import { isInsideContainerSync } from "@parity/product-sdk-host";

export function isInHost(): boolean {
  return isInsideContainerSync();
}
