import { afterEach, expect, test } from "bun:test";
import { service } from "@parity/trinity-stack/reader";
import {
  DOTNS_ENVIRONMENTS,
  setActiveDotnsEnvironment,
  webGatewayUrl,
  type DotnsEnvironmentConfig,
} from "../../../src/utils/environments";

afterEach(() => {
  setActiveDotnsEnvironment("paseo-v2");
});

function gatewayUrl(environment: DotnsEnvironmentConfig): URL {
  return new URL(service(environment.descriptor, "web-gateway").urls[0]!);
}

test("each environment links to a name on the web gateway its stack lists", () => {
  for (const environment of Object.values(DOTNS_ENVIRONMENTS)) {
    setActiveDotnsEnvironment(environment);
    const expected = gatewayUrl(environment);
    expected.hostname = `alice.${expected.hostname}`;
    expect(webGatewayUrl("alice")).toBe(expected.href);
  }
});

// The label carries no TLD, so a subname must not be rejected or get a second TLD.
test("serves a subname under its parent", () => {
  setActiveDotnsEnvironment("polkadot");
  const expected = new URL("blog.alice", gatewayUrl(DOTNS_ENVIRONMENTS.polkadot));
  expect(webGatewayUrl("blog.alice")).toBe(expected.href);
});
