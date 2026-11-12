import { mock } from "bun:test";
import * as heliaClientModule from "../../src/bulletin/heliaClient";
import * as bulletinPeersModule from "../../src/bulletin/bulletinPeers";

export type MockHeliaClientBehaviour = {
  fetchBlock: (cid: string, signal: AbortSignal) => Promise<Uint8Array>;
  destroy: () => Promise<void>;
};

// Copied before `mock.module` replaces the exports of the loaded modules.
const realHeliaClient = { ...heliaClientModule };
const realBulletinPeers = { ...bulletinPeersModule };

// Replaces BulletinHeliaClient for modules imported afterwards. Each call reads
// `behaviour` at that moment, so tests can swap its functions between cases.
// Peer resolution is replaced too, so it does not fetch a light spec through a mocked `fetch`.
// bun keeps module mocks for the rest of the process, so the calling file runs the returned
// function in its `afterAll`; both modules then pass through to the real implementations.
export function mockHeliaClient(behaviour: MockHeliaClientBehaviour): () => void {
  let active = true;

  mock.module("../../src/bulletin/bulletinPeers", () => ({
    ...realBulletinPeers,
    resolveBulletinPeers: (...args: Parameters<typeof realBulletinPeers.resolveBulletinPeers>) =>
      active ? Promise.resolve([]) : realBulletinPeers.resolveBulletinPeers(...args),
  }));
  mock.module("../../src/bulletin/heliaClient", () => ({
    ...realHeliaClient,
    BulletinHeliaClient: class {
      constructor(peerAddresses: readonly string[]) {
        if (!active) return new realHeliaClient.BulletinHeliaClient(peerAddresses);
      }
      fetchBlock(cid: string, signal: AbortSignal) {
        return behaviour.fetchBlock(cid, signal);
      }
      destroy() {
        return behaviour.destroy();
      }
    },
  }));
  return () => {
    active = false;
  };
}

export function waitForAbort(signal: AbortSignal): Promise<never> {
  const { promise, reject } = Promise.withResolvers<never>();
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  return promise;
}
