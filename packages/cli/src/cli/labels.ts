import { ProofOfPersonhoodStatus } from "../types/types";

export function generateRandomLabel(status: ProofOfPersonhoodStatus): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const alphanumeric = "abcdefghijklmnopqrstuvwxyz0123456789";
  const randomInteger = (maxExclusive: number) => Math.floor(Math.random() * maxExclusive);

  const randomCharacters = (characterSet: string, count: number) => {
    let result = "";
    for (let i = 0; i < count; i++) result += characterSet[randomInteger(characterSet.length)];
    return result;
  };

  const twoDigits = () => String(randomInteger(99) + 1).padStart(2, "0");

  const baseEndingWithLetter = (length: number) => {
    if (length <= 0) throw new Error("Invalid base length");
    if (length === 1) return randomCharacters(alphabet, 1);
    return randomCharacters(alphanumeric, length - 1) + randomCharacters(alphabet, 1);
  };

  if (status === ProofOfPersonhoodStatus.ProofOfPersonhoodLite) {
    const baseLength = 6 + randomInteger(3);
    return baseEndingWithLetter(baseLength) + twoDigits();
  }

  if (status === ProofOfPersonhoodStatus.NoStatus) {
    const baseLength = 9 + randomInteger(6);
    return baseEndingWithLetter(baseLength) + twoDigits();
  }

  if (status === ProofOfPersonhoodStatus.ProofOfPersonhoodFull) {
    const baseLength = randomInteger(2) === 0 ? 6 + randomInteger(3) : 9 + randomInteger(6);
    return baseEndingWithLetter(baseLength);
  }

  throw new Error("Cannot auto-generate Reserved names");
}

export function parseProofOfPersonhoodStatus(statusString: string): ProofOfPersonhoodStatus {
  const normalized = statusString.toLowerCase();
  if (normalized === "none" || normalized === "nostatus") return ProofOfPersonhoodStatus.NoStatus;
  if (normalized === "lite" || normalized === "poplite")
    return ProofOfPersonhoodStatus.ProofOfPersonhoodLite;
  if (normalized === "full" || normalized === "popfull")
    return ProofOfPersonhoodStatus.ProofOfPersonhoodFull;
  throw new Error("Invalid status: use none, lite, or full");
}
