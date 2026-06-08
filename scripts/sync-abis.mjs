#!/usr/bin/env node
// Syncs Dotns contract ABIs from the latest paritytech/dotns GitHub release.
//
// - Downloads only the ABIs the SDK consumes (see ABI_NAMES below).
// - Writes to packages/cli/abis/ (the UI consumes ABIs via cdm.json + the SDK).
// - Skips Multicall3 and Store: not published in releases, kept as local files.
// - Idempotent: caches the synced tag in .abis-version and skips if unchanged.
// - Network/auth failures warn and exit 0 so `bun install` keeps working.
//
// Auth: dotns is private, so a token is required. Provide via GITHUB_TOKEN
// or GH_TOKEN. Locally: `GITHUB_TOKEN=$(gh auth token) bun install`.
//
// Override behaviour via env:
//   DOTNS_ABIS_TAG=v0.5.2  pin to a specific release
//   DOTNS_ABIS_SKIP=1      skip entirely
//   DOTNS_ABIS_FORCE=1     re-download even if cached tag matches

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "paritytech/dotns";
const ABI_NAMES = [
	"DotnsContentResolver",
	"DotnsNameEscrow",
	"DotnsRegistrar",
	"DotnsRegistrarController",
	"DotnsRegistry",
	"DotnsResolver",
	"DotnsReverseResolver",
	"PopRules",
	"StoreFactory",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TARGETS = [join(ROOT, "packages/cli/abis")];
const VERSION_FILE = join(ROOT, ".abis-version");

const warn = (msg) => console.warn(`[sync-abis] ${msg}`);
const info = (msg) => console.log(`[sync-abis] ${msg}`);

function authHeaders() {
	const headers = { "User-Agent": "dotns-sdk-sync-abis" };
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

async function fetchRelease() {
	const tag = process.env.DOTNS_ABIS_TAG;
	const url = tag
		? `https://api.github.com/repos/${REPO}/releases/tags/${tag}`
		: `https://api.github.com/repos/${REPO}/releases/latest`;
	const res = await fetch(url, { headers: authHeaders() });
	if (res.status === 404 || res.status === 401) {
		throw new Error(
			`GitHub API ${res.status} (private repo: set GITHUB_TOKEN, e.g. \`GITHUB_TOKEN=$(gh auth token) bun install\`)`,
		);
	}
	if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
	const body = await res.json();
	if (!body.tag_name) throw new Error("release missing tag_name");
	return body;
}

async function readCachedTag() {
	try {
		return (await readFile(VERSION_FILE, "utf8")).trim();
	} catch {
		return null;
	}
}

async function downloadAsset(asset) {
	// GitHub returns a 302 to a signed S3 URL; forwarding the Authorization
	// header to S3 fails, so we follow the redirect manually.
	const first = await fetch(asset.url, {
		headers: { ...authHeaders(), Accept: "application/octet-stream" },
		redirect: "manual",
	});
	if (first.status >= 300 && first.status < 400) {
		const location = first.headers.get("location");
		if (!location) throw new Error(`${asset.name}: ${first.status} without Location`);
		const res = await fetch(location);
		if (!res.ok) throw new Error(`${asset.name}: ${res.status} ${res.statusText}`);
		return await res.text();
	}
	if (!first.ok) throw new Error(`${asset.name}: ${first.status} ${first.statusText}`);
	return await first.text();
}

// Upstream may publish either a bare ABI array or a full forge artifact
// ({ abi, bytecode, ... }). The SDK consumes the bare array, so normalise to
// that shape here rather than letting the published format leak into the code.
function normaliseAbi(name, body) {
	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new Error(`${name}: asset is not valid JSON`);
	}
	const abi = Array.isArray(parsed) ? parsed : parsed?.abi;
	if (!Array.isArray(abi)) {
		throw new Error(`${name}: asset has no ABI array`);
	}
	return `${JSON.stringify(abi, null, 2)}\n`;
}

async function writeAbi(name, body) {
	const abi = normaliseAbi(name, body);
	await Promise.all(
		TARGETS.map(async (dir) => {
			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, `${name}.json`), abi);
		}),
	);
}

async function main() {
	if (process.env.DOTNS_ABIS_SKIP) {
		info("DOTNS_ABIS_SKIP set, skipping");
		return;
	}

	let release;
	try {
		release = await fetchRelease();
	} catch (err) {
		warn(`could not fetch release (${err.message}); keeping existing ABIs`);
		return;
	}
	const tag = release.tag_name;

	const cached = await readCachedTag();
	if (cached === tag && !process.env.DOTNS_ABIS_FORCE) {
		info(`already at ${tag}`);
		return;
	}

	info(`syncing ABIs from ${REPO} ${tag}`);
	try {
		const assetByName = new Map(release.assets.map((a) => [a.name, a]));
		const missing = ABI_NAMES.filter((n) => !assetByName.has(`${n}.json`));
		if (missing.length > 0) {
			throw new Error(`release ${tag} missing assets: ${missing.join(", ")}`);
		}
		const bodies = await Promise.all(
			ABI_NAMES.map(async (name) => [name, await downloadAsset(assetByName.get(`${name}.json`))]),
		);
		await Promise.all(bodies.map(([name, body]) => writeAbi(name, body)));
		await writeFile(VERSION_FILE, `${tag}\n`);
		info(`synced ${ABI_NAMES.length} ABIs to ${TARGETS.length} packages`);
	} catch (err) {
		warn(`download failed (${err.message}); existing ABIs left unchanged`);
	}
}

main().catch((err) => {
	warn(`unexpected error: ${err?.stack ?? err}`);
});
