import { ENV } from "./env";

export async function readSecret(promptText: string): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  stdout.write(promptText);

  if (!stdin.isTTY) {
    const fromEnv = process.env[ENV.KEYSTORE_PASSWORD];
    if (fromEnv && fromEnv.length > 0) {
      stdout.write("\n");
      return fromEnv;
    }
    stdout.write("\n");
    throw new Error(`Non-interactive input: set ${ENV.KEYSTORE_PASSWORD}`);
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let value = "";

  return await new Promise<string>((resolve) => {
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        stdout.write("\n");
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        resolve(value);
        return;
      }

      if (ch === "\u0003") {
        stdout.write("\n");
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.exit(130);
      }

      if (ch === "\u0008" || ch === "\u007f") {
        if (value.length > 0) value = value.slice(0, -1);
        return;
      }

      if (ch < " " || ch === "\u007f") return;

      value += ch;
    };

    stdin.on("data", onData);
  });
}

export async function readLine(promptText: string): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  stdout.write(promptText);

  if (!stdin.isTTY) throw new Error("Non-interactive input");

  stdin.resume();
  stdin.setEncoding("utf8");

  return await new Promise<string>((resolve) => {
    const onData = (chunk: string) => {
      if (!chunk.includes("\n")) return;
      stdin.removeListener("data", onData);
      resolve(chunk.trim());
    };
    stdin.on("data", onData);
  });
}

export async function promptNewPassword(): Promise<string> {
  const p1 = await readSecret("Keystore password: ");
  const p2 = await readSecret("Confirm password: ");
  if (p1.length < 5) throw new Error("Password too short (min 5 chars)");
  if (p1 !== p2) throw new Error("Passwords do not match");
  return p1;
}

export async function getPasswordForDecrypt(passwordOverride?: string): Promise<string> {
  const direct = String(passwordOverride ?? "").trim();
  if (direct) return direct;

  const fromEnv = process.env[ENV.KEYSTORE_PASSWORD];
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  return await readSecret("Keystore password: ");
}
