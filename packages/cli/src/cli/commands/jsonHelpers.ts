import { Command } from "commander";
import chalk from "chalk";
import { formatErrorMessage } from "../../utils/formatting";
import type { CommandOptions } from "../../types/types";

/**
 * Shared helpers for --json output and Commander option merging.
 *
 * JSON envelope convention:
 * - Mutations (register, set, etc.) return { ok: true, ...fields }
 * - Reads (view, info, lookup) return the data directly (no ok field)
 * - Errors always return { error: "message" } on stderr with exit code 1
 */

/**
 * Walk up the Commander parent chain and merge options from ancestor
 * commands into a single object. Child options take precedence.
 */
export function getMergedOptions<T>(command: Command | undefined, fallback: T): CommandOptions & T {
  const mergedOptions: any = { ...(fallback ?? {}) };

  let currentCommand: Command | null | undefined = command?.parent;
  while (currentCommand) {
    if (typeof currentCommand.opts === "function") {
      const parentOptions = currentCommand.opts();
      for (const key in parentOptions) {
        if (!(key in mergedOptions) && parentOptions[key] !== undefined) {
          mergedOptions[key] = parentOptions[key];
        }
      }
    }
    currentCommand = currentCommand.parent;
  }

  return mergedOptions;
}

/**
 * Read the --json flag from a Commander command, checking optsWithGlobals
 * first (covers parent-level flags), then local opts.
 */
export function getJsonFlag(command: any): boolean {
  if (command && typeof command.optsWithGlobals === "function") {
    const options = command.optsWithGlobals();
    if (typeof options?.json === "boolean") return options.json;
  }

  const localOptions =
    command && typeof command.opts === "function" ? (command.opts() as any) : undefined;
  if (typeof localOptions?.json === "boolean") return localOptions.json;

  return false;
}

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

/**
 * Capture all console and stream output during a callback, suppressing it.
 * On error, the captured output is dumped to stderr before re-throwing.
 */
export async function withCapturedConsole<T>(callback: () => Promise<T>): Promise<T> {
  const MAX_CAPTURED_ENTRIES = 400;
  const captured: string[] = [];
  const pushCaptured = (value: string) => {
    captured.push(value);
    if (captured.length > MAX_CAPTURED_ENTRIES) {
      captured.splice(0, captured.length - MAX_CAPTURED_ENTRIES);
    }
  };
  const capture = (...args: any[]) => {
    pushCaptured(args.map(String).join(" "));
  };
  const captureWrite = (chunk: any) => {
    pushCaptured(String(chunk));
    return true;
  };

  const saved = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    stdoutWrite: process.stdout.write.bind(process.stdout),
    stderrWrite: process.stderr.write.bind(process.stderr),
  };

  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;
  process.stdout.write = captureWrite as any;
  process.stderr.write = captureWrite as any;

  try {
    return await callback();
  } catch (error) {
    saved.error("[captured output before failure]\n" + captured.join("\n"));
    throw error;
  } finally {
    console.log = saved.log;
    console.error = saved.error;
    console.warn = saved.warn;
    console.info = saved.info;
    process.stdout.write = saved.stdoutWrite;
    process.stderr.write = saved.stderrWrite;
  }
}

/**
 * When --json is active, suppress human-readable output by capturing it.
 * Ora caches process.stderr (the object), not .write (the method).
 * withCapturedConsole replaces .write on the object, so spinner
 * output is captured as long as start/succeed/fail run inside maybeQuiet.
 */
export function maybeQuiet<T>(jsonOutput: boolean, callback: () => Promise<T>): Promise<T> {
  return jsonOutput ? withCapturedConsole(callback) : callback();
}
