import { createProgram } from "./program";
import { CliExit } from "./exit";

export async function main(argv = process.argv) {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CliExit) return error.code;
    throw error;
  }
  return 0;
}

if (import.meta.main) {
  main().then((code) => process.exit(code));
}
