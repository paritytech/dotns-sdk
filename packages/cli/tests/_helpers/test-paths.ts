import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const DEFAULT_TEST_TEMPORARY_ROOT_DIRECTORY_PATH = path.join(process.cwd(), "tests", ".tmp");

export type TestKeystorePaths = {
  temporaryRootDirectoryPath: string;
  testFileTemporaryRootDirectoryPath: string;
  testFileKeystoreDirectoryPath: string;

  testTemporaryDirectoryPath: string;
  keystoreDirectoryPath: string;
};

function toSafeName(input: string): string {
  return input.replaceAll(/[^\w.-]/g, "_");
}

export function createTestKeystorePaths(testFileUrl: string, testName: string): TestKeystorePaths {
  const testFilePath = new URL(testFileUrl).pathname;

  const safeTestFileName = toSafeName(path.basename(testFilePath));
  const safeTestName = toSafeName(testName);

  const temporaryRootDirectoryPath = DEFAULT_TEST_TEMPORARY_ROOT_DIRECTORY_PATH;

  const testFileTemporaryRootDirectoryPath = path.join(
    temporaryRootDirectoryPath,
    safeTestFileName,
  );

  mkdirSync(testFileTemporaryRootDirectoryPath, { recursive: true });

  const testFileKeystoreDirectoryPath = path.join(testFileTemporaryRootDirectoryPath, "keystore");

  const testTemporaryDirectoryPath = path.join(testFileTemporaryRootDirectoryPath, safeTestName);
  mkdirSync(testTemporaryDirectoryPath, { recursive: true });

  const keystoreDirectoryPath = path.join(testTemporaryDirectoryPath, "keystore");

  return {
    temporaryRootDirectoryPath,
    testFileTemporaryRootDirectoryPath,
    testFileKeystoreDirectoryPath,
    testTemporaryDirectoryPath,
    keystoreDirectoryPath,
  };
}

function assertUnder(parentDirectoryPath: string, childPath: string): void {
  const relativePath = path.relative(parentDirectoryPath, childPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to delete path outside ${parentDirectoryPath}: ${childPath}`);
  }
}

export function cleanupTestTemporaryDirectory(testTemporaryDirectoryPath: string): void {
  assertUnder(DEFAULT_TEST_TEMPORARY_ROOT_DIRECTORY_PATH, testTemporaryDirectoryPath);
  rmSync(testTemporaryDirectoryPath, { recursive: true, force: true });
}

export function cleanupTestFileTemporaryDirectory(
  testFileTemporaryRootDirectoryPath: string,
): void {
  assertUnder(DEFAULT_TEST_TEMPORARY_ROOT_DIRECTORY_PATH, testFileTemporaryRootDirectoryPath);
  rmSync(testFileTemporaryRootDirectoryPath, { recursive: true, force: true });
}

export function createKeystorePathsForTest(testName: string): TestKeystorePaths {
  return createTestKeystorePaths(import.meta.url, testName);
}
