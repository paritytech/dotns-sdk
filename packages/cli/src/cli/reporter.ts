import ora from "ora";
import type { BulletinReporterMode } from "../types/types";

export type ResolvedReporterMode = "interactive" | "stream" | "quiet";

export type ReporterTask = {
  update: (message: string) => void;
  succeed: (message?: string) => void;
  warn: (message?: string) => void;
  fail: (message?: string) => void;
  stop: () => void;
};

export type CliReporter = {
  mode: ResolvedReporterMode;
  task: (message: string) => ReporterTask;
  line: (message: string) => void;
  detail: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  fail: (message: string) => void;
};

type ReporterPrefix = "line" | "detail" | "success" | "warning" | "error";

const DEFAULT_STREAM = process.stderr;

function writeHumanLine(message: string, prefix: ReporterPrefix = "line"): void {
  const rendered =
    prefix === "detail"
      ? `  ${message}`
      : prefix === "success"
        ? `✓ ${message}`
        : prefix === "warning"
          ? `! ${message}`
          : prefix === "error"
            ? `x ${message}`
            : `• ${message}`;

  DEFAULT_STREAM.write(`${rendered}\n`);
}

export function printHumanLine(message: string): void {
  writeHumanLine(message, "line");
}

export function printHumanDetail(message: string): void {
  writeHumanLine(message, "detail");
}

export function printHumanSuccess(message: string): void {
  writeHumanLine(message, "success");
}

export function printHumanWarning(message: string): void {
  writeHumanLine(message, "warning");
}

export function printHumanFailure(message: string): void {
  writeHumanLine(message, "error");
}

function resolveAutoReporterMode(): ResolvedReporterMode {
  if (!process.stderr.isTTY || process.env.CI || process.env.GITHUB_ACTIONS) {
    return "stream";
  }

  return "interactive";
}

export function resolveReporterMode(mode: BulletinReporterMode | undefined): ResolvedReporterMode {
  if (!mode || mode === "auto") {
    return resolveAutoReporterMode();
  }

  if (mode === "interactive" || mode === "stream" || mode === "quiet") {
    return mode;
  }

  throw new Error(`Unsupported reporter mode: ${mode}`);
}

function createInteractiveTask(message: string): ReporterTask {
  const spinner = ora({ text: message, stream: DEFAULT_STREAM }).start();

  return {
    update(nextMessage: string) {
      spinner.text = nextMessage;
    },
    succeed(nextMessage?: string) {
      spinner.succeed(nextMessage ?? message);
    },
    warn(nextMessage?: string) {
      spinner.warn(nextMessage ?? message);
    },
    fail(nextMessage?: string) {
      spinner.fail(nextMessage ?? message);
    },
    stop() {
      spinner.stop();
    },
  };
}

function createStreamTask(message: string): ReporterTask {
  let currentMessage = message;
  writeHumanLine(message, "line");

  return {
    update(nextMessage: string) {
      if (nextMessage === currentMessage) return;
      currentMessage = nextMessage;
      writeHumanLine(nextMessage, "detail");
    },
    succeed(nextMessage?: string) {
      currentMessage = nextMessage ?? currentMessage;
      writeHumanLine(currentMessage, "success");
    },
    warn(nextMessage?: string) {
      currentMessage = nextMessage ?? currentMessage;
      writeHumanLine(currentMessage, "warning");
    },
    fail(nextMessage?: string) {
      currentMessage = nextMessage ?? currentMessage;
      writeHumanLine(currentMessage, "error");
    },
    stop() {},
  };
}

function createQuietTask(): ReporterTask {
  return {
    update() {},
    succeed() {},
    warn() {},
    fail() {},
    stop() {},
  };
}

export function createCliReporter(mode: BulletinReporterMode | undefined): CliReporter {
  const resolvedMode = resolveReporterMode(mode);

  if (resolvedMode === "interactive") {
    return {
      mode: resolvedMode,
      task: createInteractiveTask,
      line(message: string) {
        DEFAULT_STREAM.write(`${message}\n`);
      },
      detail(message: string) {
        writeHumanLine(message, "detail");
      },
      success(message: string) {
        writeHumanLine(message, "success");
      },
      warn(message: string) {
        writeHumanLine(message, "warning");
      },
      fail(message: string) {
        writeHumanLine(message, "error");
      },
    };
  }

  if (resolvedMode === "stream") {
    return {
      mode: resolvedMode,
      task: createStreamTask,
      line(message: string) {
        writeHumanLine(message, "line");
      },
      detail(message: string) {
        writeHumanLine(message, "detail");
      },
      success(message: string) {
        writeHumanLine(message, "success");
      },
      warn(message: string) {
        writeHumanLine(message, "warning");
      },
      fail(message: string) {
        writeHumanLine(message, "error");
      },
    };
  }

  return {
    mode: resolvedMode,
    task() {
      return createQuietTask();
    },
    line() {},
    detail() {},
    success() {},
    warn() {},
    fail() {},
  };
}

export async function withConsoleToStderr<T>(callback: () => Promise<T>): Promise<T> {
  const saved = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    stdoutWrite: process.stdout.write.bind(process.stdout),
  };

  const forward = (...args: unknown[]) => {
    DEFAULT_STREAM.write(`${args.map(String).join(" ")}\n`);
  };

  console.log = forward;
  console.info = forward;
  console.warn = forward;
  console.error = forward;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    DEFAULT_STREAM.write(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;

  try {
    return await callback();
  } finally {
    console.log = saved.log;
    console.info = saved.info;
    console.warn = saved.warn;
    console.error = saved.error;
    process.stdout.write = saved.stdoutWrite;
  }
}
