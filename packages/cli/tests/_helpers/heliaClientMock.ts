import { mock } from "bun:test";

export type MockHeliaClientBehaviour = {
  fetchBlock: (cid: string, signal: AbortSignal) => Promise<Uint8Array>;
  destroy: () => Promise<void>;
};

// Replaces BulletinHeliaClient for modules imported afterwards. Each call reads
// `behaviour` at that moment, so tests can swap its functions between cases.
export function mockHeliaClient(behaviour: MockHeliaClientBehaviour): void {
  mock.module("../../src/bulletin/heliaClient", () => ({
    BulletinHeliaClient: class {
      fetchBlock(cid: string, signal: AbortSignal) {
        return behaviour.fetchBlock(cid, signal);
      }
      destroy() {
        return behaviour.destroy();
      }
    },
  }));
}

export function waitForAbort(signal: AbortSignal): Promise<never> {
  const { promise, reject } = Promise.withResolvers<never>();
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  return promise;
}
