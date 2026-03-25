#!/usr/bin/env bun

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

type BenchmarkFixture = {
  size: string;
  slug: string;
};

const BENCHMARKS_CONFIG_PATH = resolve(import.meta.dir, "benchmarks.json");
const DEFAULT_SIZES = (JSON.parse(
  readFileSync(BENCHMARKS_CONFIG_PATH, "utf8"),
) as BenchmarkFixture[]).map(({ size }) => size);
const DEFAULT_OUTPUT_DIR = resolve(import.meta.dir, "generated");

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    sizes: { type: "string", default: DEFAULT_SIZES.join(",") },
    "output-dir": { type: "string", default: DEFAULT_OUTPUT_DIR },
    clean: { type: "boolean", default: true },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Usage: bun examples/deploy/sized-sites/generate.ts [options]

Options:
  --sizes <list>       Comma-separated sizes (default: ${DEFAULT_SIZES.join(",")})
  --output-dir <path>  Directory for generated projects (default: ${DEFAULT_OUTPUT_DIR})
  --clean              Remove the output directory before generation (default: true)
  --help, -h           Show this message
`);
  process.exit(0);
}

function parseSize(raw: string): number {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match || !match[1]) {
    throw new Error(`Cannot parse size: "${raw}"`);
  }

  const value = Number.parseFloat(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
  };

  return Math.floor(value * (multipliers[unit] ?? 1));
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function slugForSize(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getDirectorySizeBytes(dirPath: string): number {
  let total = 0;

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(fullPath);
    } else if (entry.isFile()) {
      total += statSync(fullPath).size;
    }
  }

  return total;
}

function buildIndexHtml(sizeLabel: string, targetBytes: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DotNS ${sizeLabel} Deploy Fixture</title>
  <link rel="stylesheet" href="./assets/styles.css">
</head>
<body>
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">DotNS Deploy Benchmark</p>
      <h1>${sizeLabel} example project</h1>
      <p class="lede">
        This static site fixture is generated to reach a total directory size of
        <strong>${humanSize(targetBytes)}</strong> for repeatable deployment timing.
      </p>
      <div class="meta">
        <span>Bulletin upload fixture</span>
        <span>Deterministic payload</span>
        <span>Target: ${sizeLabel}</span>
      </div>
    </section>

    <section class="panel">
      <h2>What is included</h2>
      <ul>
        <li>A lightweight landing page</li>
        <li>Static CSS and JavaScript assets</li>
        <li>A deterministic payload file used to hit the target artifact size</li>
      </ul>
      <a class="button" href="./payload/payload.bin" download>Download payload.bin</a>
    </section>
  </main>

  <script type="module" src="./assets/app.js"></script>
</body>
</html>
`;
}

function buildStyles(): string {
  return `:root {
  color-scheme: dark;
  --bg: #0f1016;
  --surface: rgba(255, 255, 255, 0.04);
  --surface-strong: rgba(255, 255, 255, 0.08);
  --text: #f5f7fb;
  --muted: #a7b0c3;
  --accent: #ff4fa3;
  --border: rgba(255, 255, 255, 0.12);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at top, rgba(255, 79, 163, 0.18), transparent 40%),
    linear-gradient(180deg, #11131c 0%, #0a0b10 100%);
}

.shell {
  width: min(960px, calc(100vw - 2rem));
  margin: 0 auto;
  padding: 4rem 0 5rem;
}

.hero,
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 24px;
  backdrop-filter: blur(14px);
  padding: 2rem;
}

.panel {
  margin-top: 1rem;
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: clamp(2.25rem, 4vw, 4rem);
  line-height: 1.05;
}

.lede {
  max-width: 56ch;
  color: var(--muted);
  line-height: 1.7;
  margin: 1rem 0 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.meta span,
.panel li {
  color: var(--muted);
}

.meta span {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  background: var(--surface-strong);
}

ul {
  padding-left: 1.1rem;
  line-height: 1.8;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 1rem;
  border-radius: 999px;
  padding: 0.9rem 1.2rem;
  color: var(--text);
  text-decoration: none;
  background: linear-gradient(135deg, #ff4fa3, #ff7f50);
}

.button:hover {
  filter: brightness(1.05);
}
`;
}

function buildScript(sizeLabel: string, targetBytes: number): string {
  return `const target = ${targetBytes};
const sizeLabel = ${JSON.stringify(sizeLabel)};

console.log(\`DotNS deploy fixture ready: \${sizeLabel} (\${target} bytes)\`);
`;
}

function writePayload(filePath: string, sizeBytes: number): void {
  const chunkSize = 64 * 1024;
  const writer = Bun.file(filePath).writer();
  const chunk = new Uint8Array(chunkSize);

  for (let index = 0; index < chunk.length; index += 1) {
    chunk[index] = (index * 31 + 17) & 0xff;
  }

  let written = 0;
  while (written < sizeBytes) {
    const remaining = sizeBytes - written;
    const slice = remaining < chunk.length ? chunk.subarray(0, remaining) : chunk;
    writer.write(slice);
    written += slice.length;
  }

  writer.end();
}

function generateProject(outputDir: string, sizeLabel: string): { slug: string; totalBytes: number } {
  const targetBytes = parseSize(sizeLabel);
  const slug = slugForSize(sizeLabel);
  const projectDir = join(outputDir, slug);
  const assetsDir = join(projectDir, "assets");
  const payloadDir = join(projectDir, "payload");

  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(payloadDir, { recursive: true });

  writeFileSync(join(projectDir, "index.html"), buildIndexHtml(sizeLabel, targetBytes));
  writeFileSync(join(assetsDir, "styles.css"), buildStyles());
  writeFileSync(join(assetsDir, "app.js"), buildScript(sizeLabel, targetBytes));

  const currentBytes = getDirectorySizeBytes(projectDir);
  const payloadBytes = targetBytes - currentBytes;

  if (payloadBytes <= 0) {
    throw new Error(
      `Base site for ${sizeLabel} is already ${currentBytes} bytes, which exceeds the target.`,
    );
  }

  writePayload(join(payloadDir, "payload.bin"), payloadBytes);

  const totalBytes = getDirectorySizeBytes(projectDir);
  if (totalBytes !== targetBytes) {
    throw new Error(
      `Generated ${slug} at ${totalBytes} bytes, expected ${targetBytes} bytes for ${sizeLabel}.`,
    );
  }

  return { slug, totalBytes };
}

const sizeLabels = String(values.sizes)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const outputDir = resolve(String(values["output-dir"]));

if (values.clean) {
  rmSync(outputDir, { recursive: true, force: true });
}

mkdirSync(outputDir, { recursive: true });

console.log(`Generating deploy fixtures in ${outputDir}`);

for (const sizeLabel of sizeLabels) {
  const result = generateProject(outputDir, sizeLabel);
  console.log(`  ${result.slug.padEnd(5)} -> ${result.totalBytes} bytes`);
}

console.log("Done.");
