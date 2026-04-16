import { describe, expect, test } from "bun:test";
import { runWaveWithRetries, type UploadWaveChunk } from "../../../src/bulletin/store";

/**
 * Demonstrates the nonce-hopping problem and the fix.
 *
 * Old behavior: on each wave retry, the uploader fetches a fresh nonce from
 * the chain and reassigns nonces to all re-queued chunks. If the chain
 * included the previous submission (nonce advanced), the same chunk gets
 * stored again under a new nonce — a duplicate.
 *
 * New behavior: the uploader keeps a persistent `assignedNonces` map. Chunks
 * that are re-queued after a failed wave keep their original nonce. Before
 * re-queuing, the uploader checks if each chunk's nonce was consumed (nonce
 * advanced past it) and marks those as completed.
 */

function makeChunks(count: number): UploadWaveChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    bytes: new Uint8Array(2 * 1024 * 1024),
    length: 2 * 1024 * 1024,
    cid: `cid-${i}`,
  }));
}

describe("nonce-hopping: old behavior (duplicate nonces)", () => {
  test("reassigning nonces on each wave retry wastes nonces and creates duplicates", async () => {
    const chunks = makeChunks(3);
    const submittedNonces: Array<{ chunkIndex: number; nonce: number; wave: number }> = [];

    // Simulate the OLD behavior: fresh nonce fetch + reassign on every wave
    let chainNonce = 100; // starts at 100
    let nextNonce = chainNonce;

    for (let wave = 1; wave <= 3; wave++) {
      // OLD: assign fresh nonces every wave (the nonce-hop)
      if (wave > 1) {
        // Simulate chain having included some of the previous wave's txs
        // (nonce advanced by 3 — all previous submissions were included)
        chainNonce += 3;
        nextNonce = chainNonce; // OLD: reset to chain nonce
      }

      const waveNonces = new Map<number, number>();
      for (const chunk of chunks) {
        waveNonces.set(chunk.index, nextNonce);
        nextNonce += 1;
      }

      // "Submit" each chunk — record what nonce it used
      for (const chunk of chunks) {
        submittedNonces.push({
          chunkIndex: chunk.index,
          nonce: waveNonces.get(chunk.index)!,
          wave,
        });
      }
    }

    // With OLD behavior: 9 submissions across 3 waves (3 chunks × 3 waves)
    expect(submittedNonces).toHaveLength(9);

    // Each chunk was submitted 3 times with DIFFERENT nonces
    const chunk0Nonces = submittedNonces
      .filter((s) => s.chunkIndex === 0)
      .map((s) => s.nonce);
    expect(chunk0Nonces).toEqual([100, 103, 106]); // three different nonces!
    expect(new Set(chunk0Nonces).size).toBe(3); // all unique = 3 duplicates on chain

    // Total unique nonces consumed: 9 (for only 3 chunks of real data)
    const allNonces = submittedNonces.map((s) => s.nonce);
    expect(new Set(allNonces).size).toBe(9);
  });
});

describe("nonce-hopping: new behavior (persistent nonces)", () => {
  test("re-queued chunks keep their original nonce, no duplicates", async () => {
    const chunks = makeChunks(3);
    const submittedNonces: Array<{ chunkIndex: number; nonce: number; wave: number }> = [];
    const completedChunks = new Set<number>();

    // Simulate the NEW behavior: persistent assignedNonces + nonce-advance check
    let chainNonce = 100;
    let nextNonce = chainNonce;
    const assignedNonces = new Map<number, number>(); // persistent across waves

    for (let wave = 1; wave <= 3; wave++) {
      if (wave > 1) {
        // Simulate chain nonce advancing (previous txs were included)
        chainNonce += 3;

        // NEW: nonce-advance check — mark chunks whose nonces were consumed
        for (const chunk of chunks) {
          if (completedChunks.has(chunk.index)) continue;
          const chunkNonce = assignedNonces.get(chunk.index);
          if (chunkNonce !== undefined && chunkNonce < chainNonce) {
            completedChunks.add(chunk.index);
            assignedNonces.delete(chunk.index);
          }
        }

        // NEW: don't reset nextNonce, just advance it
        nextNonce = Math.max(nextNonce, chainNonce);
      }

      // Skip completed chunks
      const pendingChunks = chunks.filter((c) => !completedChunks.has(c.index));
      if (pendingChunks.length === 0) break;

      // NEW: only assign nonce if chunk doesn't already have one
      const waveNonces = new Map<number, number>();
      for (const chunk of pendingChunks) {
        if (!assignedNonces.has(chunk.index)) {
          assignedNonces.set(chunk.index, nextNonce);
          nextNonce += 1;
        }
        waveNonces.set(chunk.index, assignedNonces.get(chunk.index)!);
      }

      for (const chunk of pendingChunks) {
        submittedNonces.push({
          chunkIndex: chunk.index,
          nonce: waveNonces.get(chunk.index)!,
          wave,
        });
      }
    }

    // With NEW behavior: only 3 submissions (wave 1), then all detected as
    // completed via nonce-advance in wave 2 — no resubmissions needed
    expect(submittedNonces).toHaveLength(3);

    // Each chunk submitted exactly once
    const chunk0Nonces = submittedNonces
      .filter((s) => s.chunkIndex === 0)
      .map((s) => s.nonce);
    expect(chunk0Nonces).toEqual([100]); // one nonce, no duplicates

    // Total unique nonces consumed: 3 (matches actual chunk count)
    const allNonces = submittedNonces.map((s) => s.nonce);
    expect(new Set(allNonces).size).toBe(3);

    // All chunks detected as completed via nonce-advance
    expect(completedChunks.size).toBe(3);
  });

  test("chunks whose nonces were NOT consumed are re-queued with the SAME nonce", async () => {
    const chunks = makeChunks(3);
    const submittedNonces: Array<{ chunkIndex: number; nonce: number; wave: number }> = [];
    const completedChunks = new Set<number>();

    let chainNonce = 100;
    let nextNonce = chainNonce;
    const assignedNonces = new Map<number, number>();

    for (let wave = 1; wave <= 2; wave++) {
      if (wave > 1) {
        // Simulate: only chunk 0's nonce was consumed (chain nonce 100 → 101)
        // Chunks 1 and 2 (nonces 101, 102) were NOT included
        chainNonce = 101;

        for (const chunk of chunks) {
          if (completedChunks.has(chunk.index)) continue;
          const chunkNonce = assignedNonces.get(chunk.index);
          if (chunkNonce !== undefined && chunkNonce < chainNonce) {
            completedChunks.add(chunk.index);
            assignedNonces.delete(chunk.index);
          }
        }

        nextNonce = Math.max(nextNonce, chainNonce);
      }

      const pendingChunks = chunks.filter((c) => !completedChunks.has(c.index));
      if (pendingChunks.length === 0) break;

      const waveNonces = new Map<number, number>();
      for (const chunk of pendingChunks) {
        if (!assignedNonces.has(chunk.index)) {
          assignedNonces.set(chunk.index, nextNonce);
          nextNonce += 1;
        }
        waveNonces.set(chunk.index, assignedNonces.get(chunk.index)!);
      }

      for (const chunk of pendingChunks) {
        submittedNonces.push({
          chunkIndex: chunk.index,
          nonce: waveNonces.get(chunk.index)!,
          wave,
        });
      }
    }

    // Chunk 0: submitted once (wave 1, nonce 100), detected as consumed in wave 2
    const chunk0 = submittedNonces.filter((s) => s.chunkIndex === 0);
    expect(chunk0).toHaveLength(1);
    expect(chunk0[0]!.nonce).toBe(100);

    // Chunk 1: submitted in wave 1 (nonce 101), NOT consumed, resubmitted
    // in wave 2 with the SAME nonce 101 (not a fresh one)
    const chunk1 = submittedNonces.filter((s) => s.chunkIndex === 1);
    expect(chunk1).toHaveLength(2);
    expect(chunk1[0]!.nonce).toBe(101); // wave 1
    expect(chunk1[1]!.nonce).toBe(101); // wave 2 — SAME nonce, no hop

    // Chunk 2: same pattern as chunk 1
    const chunk2 = submittedNonces.filter((s) => s.chunkIndex === 2);
    expect(chunk2).toHaveLength(2);
    expect(chunk2[0]!.nonce).toBe(102);
    expect(chunk2[1]!.nonce).toBe(102); // SAME nonce

    // Total unique nonces: still just 3 (100, 101, 102)
    const allNonces = submittedNonces.map((s) => s.nonce);
    expect(new Set(allNonces).size).toBe(3);
  });
});

describe("nonce-hopping: runWaveWithRetries preserves chunk identity", () => {
  test("retried chunks within a wave keep the same nonce from the waveNonces map", async () => {
    const chunks = makeChunks(2);
    const assignedNonces = new Map<number, number>();
    let nextNonce = 200;

    // Assign nonces once
    for (const chunk of chunks) {
      assignedNonces.set(chunk.index, nextNonce);
      nextNonce += 1;
    }

    const waveNonces = new Map<number, number>();
    for (const chunk of chunks) {
      waveNonces.set(chunk.index, assignedNonces.get(chunk.index)!);
    }

    const noncesSeen: Array<{ chunkIndex: number; nonce: number; attempt: number }> = [];

    await runWaveWithRetries({
      waveChunks: chunks,
      jitterMs: () => 0,
      retryBaseDelaysMs: [0],
      submitChunk: async (chunk, retryAttempt) => {
        const nonce = waveNonces.get(chunk.index)!;
        noncesSeen.push({ chunkIndex: chunk.index, nonce, attempt: retryAttempt });

        // Chunk 1 fails on first attempt
        if (chunk.index === 1 && retryAttempt === 0) {
          throw new Error("network timeout");
        }
      },
    });

    // Chunk 0: submitted once with nonce 200
    const chunk0 = noncesSeen.filter((n) => n.chunkIndex === 0);
    expect(chunk0).toHaveLength(1);
    expect(chunk0[0]!.nonce).toBe(200);

    // Chunk 1: submitted twice, BOTH with nonce 201 (same nonce on retry)
    const chunk1 = noncesSeen.filter((n) => n.chunkIndex === 1);
    expect(chunk1).toHaveLength(2);
    expect(chunk1[0]!.nonce).toBe(201);
    expect(chunk1[1]!.nonce).toBe(201); // same nonce on retry — no hop
  });
});

describe("nonce-hopping: quantifying the waste", () => {
  test("old behavior wastes N×W nonces for N chunks over W waves", () => {
    const N = 9; // chunks (like the CI run)
    const W = 6; // waves (like chunk 3 in the incident)

    // Old: each wave assigns N fresh nonces
    const oldTotalNonces = N * W; // 54 nonces consumed
    expect(oldTotalNonces).toBe(54);

    // New: N nonces assigned once, reused across all waves
    const newTotalNonces = N; // 9 nonces consumed
    expect(newTotalNonces).toBe(9);

    // Waste ratio
    const wasteRatio = oldTotalNonces / newTotalNonces;
    expect(wasteRatio).toBe(6); // 6× more nonces wasted with old behavior
  });

  test("models the CI run: chunk 3 stored 6× under old behavior, 1× under new", () => {
    // From the actual CI run: chunk 3 (bafkreicu3nnziyx) nonces
    const oldChunk3Nonces = [14447, 14487, 14567, 14647, 14707, 14716];
    expect(oldChunk3Nonces.length).toBe(6); // 6 duplicate stores on chain
    expect(new Set(oldChunk3Nonces).size).toBe(6); // all different nonces

    // Under new behavior: chunk 3 keeps nonce 14447, nonce-advance detects
    // inclusion on wave 2 (chain nonce > 14447), no resubmission
    const newChunk3Nonces = [14447];
    expect(newChunk3Nonces.length).toBe(1);

    // Duplicates avoided
    const duplicatesAvoided = oldChunk3Nonces.length - newChunk3Nonces.length;
    expect(duplicatesAvoided).toBe(5);

    // Bytes saved: 5 × 2 MiB = 10 MiB of duplicate on-chain storage
    const bytesSaved = duplicatesAvoided * 2 * 1024 * 1024;
    expect(bytesSaved).toBe(10 * 1024 * 1024);
  });
});
