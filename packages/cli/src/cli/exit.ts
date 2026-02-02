export class CliExit extends Error {
  constructor(
    public code: number,
    message?: string,
  ) {
    super(message ?? `Exit ${code}`);
  }
}

export function ok(): never {
  throw new CliExit(0);
}
export function fail(msg: string): never {
  throw new CliExit(1, msg);
}
