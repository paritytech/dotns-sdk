export class CliExit extends Error {
  constructor(
    public code: number,
    message?: string,
  ) {
    super(message ?? `Exit ${code}`);
  }
}
