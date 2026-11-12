import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getActiveDotnsEnvironment, type DotnsEnvironmentId } from "../utils/environments";
import type { UploadRecord } from "../types/types";

const HISTORY_DIR = path.join(os.homedir(), ".dotns");
const HISTORY_FILE = path.join(HISTORY_DIR, "uploads.json");

function formatLocalTimestamp(date: Date): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");

  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}.${ms}`;
}

export function formatRecordTimestamp(record: UploadRecord): string {
  return formatLocalTimestamp(new Date(record.timestamp));
}

async function ensureHistoryDir(): Promise<void> {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  } catch {
    // ignore if exists
  }
}

export async function readHistory(): Promise<UploadRecord[]> {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeHistory(records: UploadRecord[]): Promise<void> {
  await ensureHistoryDir();
  await fs.writeFile(HISTORY_FILE, JSON.stringify(records, null, 2));
}

export async function addUploadRecord(
  record: Omit<UploadRecord, "timestamp">,
): Promise<UploadRecord> {
  const history = await readHistory();

  const fullRecord: UploadRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  };

  history.unshift(fullRecord);
  await writeHistory(history);

  return fullRecord;
}

export async function removeUploadRecord(cid: string): Promise<boolean> {
  const history = await readHistory();
  const initialLength = history.length;

  const filtered = history.filter((r) => r.cid !== cid);

  if (filtered.length === initialLength) {
    return false;
  }

  await writeHistory(filtered);
  return true;
}

export async function clearHistory(): Promise<number> {
  const history = await readHistory();
  const count = history.length;

  await writeHistory([]);
  return count;
}

export function getHistoryPath(): string {
  return HISTORY_FILE;
}

function encodeForPreview(cid: string): string {
  const base64 = Buffer.from(cid).toString("base64");
  return base64.replace(/\+/g, "-").replace(/[/]/g, "_").replace(/=+$/, "");
}

// Where the dotNS app is deployed, which no stack descriptor records. Other networks, and any
// `--stack` stack, have no known deployment.
const PREVIEW_BASE_URLS: Partial<Record<string, string>> = {
  "paseo-v2": "https://dotns.paseo.li/#/preview",
} satisfies Partial<Record<DotnsEnvironmentId, string>>;

/** The dotNS web app's preview link for `record`, or `null` where the app is not deployed. */
export function getPreviewUrl(record: UploadRecord): string | null {
  const previewBaseUrl = PREVIEW_BASE_URLS[getActiveDotnsEnvironment().id];
  return previewBaseUrl ? `${previewBaseUrl}/${encodeForPreview(record.cid)}` : null;
}
