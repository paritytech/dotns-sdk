import chalk from "chalk";
import { formatErrorMessage } from "../../utils/formatting";

/**
 * Shared helpers for --json output across CLI commands.
 *
 * JSON envelope convention:
 * - Mutations (register, set, etc.) return { ok: true, ...fields }
 * - Reads (view, info, lookup) return the data directly (no ok field)
 * - Errors always return { error: "message" } on stderr with exit code 1
 */

/**
 * Emit a JSON result to stdout if --json is active.
 * Returns true if JSON was emitted, false otherwise (so the caller
 * can provide human-readable output in the else branch).
 */
export function emitJsonResult(jsonOutput: boolean, result: unknown): boolean {
  if (jsonOutput) {
    console.log(JSON.stringify(result));
    return true;
  }
  return false;
}

/**
 * Handle a command error, formatting as JSON or human-readable depending
 * on the --json flag. Always exits with code 1.
 */
export function handleCommandError(jsonOutput: boolean, error: unknown): never {
  const message = formatErrorMessage(error);

  if (jsonOutput) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(chalk.red(`\n✗ Error: ${message}\n`));
  }

  process.exit(1);
}
