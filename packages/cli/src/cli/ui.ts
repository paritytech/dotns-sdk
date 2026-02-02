import chalk from "chalk";

export function banner() {
  console.log(`\n${chalk.bold.cyan("═══════════════════════════════════════")}`);
  console.log(`${chalk.bold.cyan("              dotns developer CLI               ")}`);
  console.log(`${chalk.bold.cyan("═══════════════════════════════════════")}\n`);
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
