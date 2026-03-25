import chalk from "chalk";
import { printHumanLine, printHumanSuccess } from "./reporter";

export function banner(): void {
  const width = 40;

  const line = "═".repeat(width);
  const title = "dotns developer CLI"
    .padStart(Math.floor((width + "dotns developer CLI".length) / 2), " ")
    .padEnd(width, " ");

  console.error(`\n${chalk.bold.cyan(line)}`);
  console.error(chalk.bold.cyan(title));
  console.error(`${chalk.bold.cyan(line)}\n`);
}

export function stepStart(label: string) {
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
