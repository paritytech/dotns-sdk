import { expect } from "bun:test";
import type { CliRunResult } from "../_helpers/cli-helpers";

export function expectSuccessfulContentView(result: CliRunResult, label: string) {
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Content View");
  expect(result.combinedOutput).toContain(label + ".dot");
  expect(result.combinedOutput).toContain("resolver:");
  expect(result.combinedOutput).toContain("✓ Complete");
}

export function expectSuccessfulContentSet(result: CliRunResult, label: string, cid: string) {
  expect(result.exitCode).toBe(0);
  expect(result.combinedOutput).not.toContain("✗ Error:");
  expect(result.combinedOutput).toContain("▶ Content Set");
  expect(result.combinedOutput).toContain(label + ".dot");
  expect(result.combinedOutput).toContain(cid);
  expect(result.combinedOutput).toContain("✓ Complete");
}

export function expectContentViewRegistryInfo(result: CliRunResult) {
  expect(result.combinedOutput).toContain("registry:");
  expect(result.combinedOutput).toContain("exists:");
  expect(result.combinedOutput).toContain("owner:");
}

export function expectContentViewContentHash(result: CliRunResult) {
  expect(result.combinedOutput).toContain("contenthash:");
  expect(result.combinedOutput).toContain("cid:");
}

export function expectContentSetOwnershipInfo(result: CliRunResult) {
  expect(result.combinedOutput).toContain("exists:");
  expect(result.combinedOutput).toContain("owner:");
  expect(result.combinedOutput).toContain("caller:");
}

export function expectDomainNotRegistered(result: CliRunResult) {
  expect(result.combinedOutput).toContain("Domain is not registered");
}

export function expectNotOwnerRejection(result: CliRunResult) {
  expect(result.combinedOutput).toContain("You do not own this domain");
}

export function expectAuthenticationRequired(result: CliRunResult) {
  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("Error");
}

export function expectCannotSpecifyBothAuthMethods(result: CliRunResult) {
  expect(result.exitCode).toBe(1);
  expect(result.combinedOutput).toContain("Cannot specify both");
}
