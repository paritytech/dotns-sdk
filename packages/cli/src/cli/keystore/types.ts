export type StoredAuth = { mnemonic?: string; keyUri?: string };

export type KeystorePayload = {
  version: 2;
  defaultAccount: string;
  accounts: Record<string, StoredAuth>;
  updatedAtIso: string;
};

export type DotnsKeystore = {
  version: 1;
  kdf: {
    name: "scrypt";
    saltB64: string;
    cost: number;
    blockSize: number;
    parallelization: number;
    keyLen: number;
  };
  cipher: {
    name: "aes-256-gcm";
    ivB64: string;
    tagB64: string;
  };
  ciphertextB64: string;
  createdAtIso: string;
};
