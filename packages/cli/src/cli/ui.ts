import chalk from "chalk";

export function banner(): void {
  const width = 40;

  const line = "═".repeat(width);
  const title = "dotns developer CLI"
    .padStart(Math.floor((width + "dotns developer CLI".length) / 2), " ")
    .padEnd(width, " ");

  console.log(`\n${chalk.bold.cyan(line)}`);
  console.log(chalk.bold.cyan(title));
  console.log(`${chalk.bold.cyan(line)}\n`);
}

export function stepStart(label: string) {
  process.stdout.write(chalk.gray(`• ${label}\n`));
}

export function stepOk(label: string) {
  process.stdout.write(chalk.green(`✓ ${label}\n`));
}

export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  stepStart(label);
  const res = await fn();
  stepOk(label);
  return res;
}
