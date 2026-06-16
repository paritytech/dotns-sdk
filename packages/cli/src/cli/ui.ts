import chalk from "chalk";
import { printHumanLine, printHumanSuccess } from "./reporter";
import { version } from "../../package.json";
import { getActiveDotnsEnvironment } from "../utils/constants";

// One contextual line per command, replacing the old decorative banner: identity
// (version), the operation, an optional target, and the active network. Greppable
// in CI logs and written to stderr via the reporter, so --json stdout stays clean.
export function printCommandHeader(action: string, target?: string): void {
  const segments = [`dotns ${version}`, action];
  if (target) segments.push(target);
  segments.push(`(${getActiveDotnsEnvironment().id})`);
  printHumanLine(segments.join("  "));
}

function stepStart(label: string) {
  printHumanLine(chalk.gray(label));
}

export function stepOk(label: string) {
  printHumanSuccess(chalk.green(label));
}

export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  stepStart(label);
  const res = await fn();
  stepOk(label);
  return res;
}
