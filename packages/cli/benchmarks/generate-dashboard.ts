#!/usr/bin/env bun
/**
 * Build a self-contained benchmark results dashboard from every run written to
 * `results/<timestamp>.json` by benchmark.ts. The output is a single responsive
 * HTML file (`results/index.html`) with interactive charts, a date-range filter,
 * a paginated data table, and CSV/JSON export, so management can see how upload
 * performance trends across all previous runs.
 *
 * The styling mirrors the dotNS UI package (packages/ui): dark surface tokens,
 * DM Sans / DM Serif Display / JetBrains Mono, and the same table pagination UX.
 *
 * Throughput comes straight from the SDK: benchmark.ts records each upload's
 * `throughputBytesPerSecond` (from `dotns bulletin upload --profile-upload
 * --json`) as `throughputMBps` per size. "Peak throughput" is the max of those
 * per-size values within a run; it is derived here, not an SDK field.
 *
 * Usage: bun benchmarks/generate-dashboard.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CHART_JS_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
const FONTS_CDN =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&display=swap";

type SizeEntry = { label: string; sizeBytes: number };

type RunResult = {
  label: string;
  sizeBytes: number;
  success: boolean;
  attempts?: number;
  elapsedMs?: number;
  totalUploadTimeSeconds?: number;
  throughputMBps?: number;
  peakHeapMB?: number;
  peakRssMB?: number;
  retries?: number;
  error?: string;
};

type Run = {
  startedAtIso?: string;
  finishedAtIso?: string;
  createdAtIso?: string;
  rpc?: string;
  successfulUploads?: number;
  failedUploads?: number;
  totalUploadTimeSeconds?: number;
  sizes?: SizeEntry[];
  results: RunResult[];
};

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, "results");

function loadRuns(): Array<{ id: string; run: Run }> {
  const files = readdirSync(resultsDir).filter((name) => name.endsWith(".json"));
  const runs: Array<{ id: string; run: Run }> = [];

  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(resultsDir, file), "utf8")) as Run;
      if (Array.isArray(parsed?.results)) {
        runs.push({ id: file.replace(/\.json$/, ""), run: parsed });
      }
    } catch {
      // Skip anything that is not a valid run file.
    }
  }

  runs.sort((a, b) => runTime(a.run) - runTime(b.run));
  return runs;
}

function runTime(run: Run): number {
  const iso = run.startedAtIso ?? run.createdAtIso ?? run.finishedAtIso;
  return iso ? Date.parse(iso) : 0;
}

function runDateLabel(run: Run): string {
  const iso = run.startedAtIso ?? run.createdAtIso ?? run.finishedAtIso;
  return iso ? iso.slice(0, 10) : "unknown";
}

const successResults = (run: Run): RunResult[] => run.results.filter((r) => r.success);

function largestSuccessBytes(run: Run): number {
  return successResults(run).reduce((max, r) => Math.max(max, r.sizeBytes), 0);
}

function peakThroughput(run: Run): number {
  return successResults(run).reduce((max, r) => Math.max(max, r.throughputMBps ?? 0), 0);
}

// Prevent the inlined JSON from terminating the surrounding <script> element.
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildCsvRows(runs: Array<{ id: string; run: Run }>): string[][] {
  const header = [
    "run",
    "date",
    "size",
    "size_bytes",
    "status",
    "time_seconds",
    "throughput_mbps",
    "peak_heap_mb",
    "peak_rss_mb",
    "retries",
  ];
  const rows = [header];

  for (const { id, run } of runs) {
    const date = runDateLabel(run);
    for (const result of run.results) {
      rows.push([
        id,
        date,
        result.label,
        String(result.sizeBytes),
        result.success ? "ok" : "failed",
        result.totalUploadTimeSeconds != null
          ? result.totalUploadTimeSeconds.toFixed(1)
          : result.elapsedMs != null
            ? (result.elapsedMs / 1000).toFixed(1)
            : "",
        result.throughputMBps != null ? result.throughputMBps.toFixed(3) : "",
        result.peakHeapMB != null ? result.peakHeapMB.toFixed(1) : "",
        result.peakRssMB != null ? result.peakRssMB.toFixed(1) : "",
        result.retries != null ? String(result.retries) : "",
      ]);
    }
  }

  return rows;
}

function renderHtml(runs: Array<{ id: string; run: Run }>, generatedAtIso: string): string {
  const payload = {
    generatedAtIso,
    runs: runs.map(({ id, run }) => ({
      id,
      date: runDateLabel(run),
      rpc: run.rpc ?? "",
      successfulUploads: run.successfulUploads ?? successResults(run).length,
      totalUploads: run.results.length,
      largestSuccessBytes: largestSuccessBytes(run),
      peakThroughputMBps: peakThroughput(run),
      totalUploadTimeSeconds: run.totalUploadTimeSeconds ?? 0,
      results: run.results,
    })),
    csv: buildCsvRows(runs),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bulletin Upload Benchmarks — Results</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${FONTS_CDN}" rel="stylesheet" />
    <script defer src="${CHART_JS_CDN}"></script>
    <style>
      :root {
        --bg: #0f0f0f;
        --surface: #1c1917;
        --surface-2: #292524;
        --text-1: #fafaf9;
        --text-2: #d6d3d1;
        --text-3: #a8a29e;
        --border: #44403c;
        --border-strong: #57534e;
        --accent: #d6d3d1;
        --success: #059669;
        --error: #dc2626;
        --font-sans: "DM Sans", system-ui, sans-serif;
        --font-serif: "DM Serif Display", Georgia, serif;
        --font-mono: "JetBrains Mono", ui-monospace, monospace;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text-1);
        font-family: var(--font-sans);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }
      .wrap { max-width: 1120px; margin: 0 auto; padding: clamp(16px, 4vw, 40px); }
      header h1 { font-family: var(--font-serif); font-weight: 400; font-size: clamp(1.7rem, 4vw, 2.6rem); margin: 0 0 0.15em; }
      .eyebrow { text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.72rem; font-weight: 600; color: var(--text-3); }
      .standfirst { color: var(--text-3); max-width: 64ch; margin: 0.4em 0 0; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 28px 0; }
      .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
      .card .tag { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.66rem; font-weight: 600; color: var(--text-3); }
      .card .metric { font-family: var(--font-mono); font-size: clamp(1.3rem, 3vw, 1.7rem); font-weight: 500; margin-top: 6px; color: var(--text-1); }
      .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin: 8px 0 28px; }
      .range { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
      .field { display: flex; flex-direction: column; gap: 4px; }
      .field label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); font-weight: 600; }
      .spacer { flex: 1 1 auto; }
      button {
        font: inherit; font-size: 0.85rem; cursor: pointer; color: var(--text-2);
        background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
        padding: 8px 14px; transition: border-color 0.15s, color 0.15s;
      }
      button:hover { border-color: var(--border-strong); color: var(--text-1); }
      input[type="date"] {
        font: inherit; font-size: 0.85rem; color: var(--text-1); color-scheme: dark;
        background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px;
      }
      input[type="date"]:hover { border-color: var(--border-strong); }
      .table-filters { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 4px; }
      .table-filters input[type="search"], .table-filters select {
        font: inherit; font-size: 0.82rem; color: var(--text-1); color-scheme: dark;
        background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px;
      }
      .table-filters input[type="search"] { flex: 1 1 200px; min-width: 160px; }
      .table-filters input[type="search"]::placeholder { color: var(--text-3); }
      .table-filters input[type="search"]:hover, .table-filters select:hover { border-color: var(--border-strong); }
      .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 24px; overflow: hidden; }
      .panel-head { padding: 16px clamp(14px, 2vw, 20px) 0; }
      .panel h2 { font-family: var(--font-serif); font-weight: 400; font-size: 1.25rem; margin: 0 0 4px; }
      .panel .hint { color: var(--text-3); font-size: 0.84rem; margin: 0; }
      .chart-box { position: relative; width: 100%; height: clamp(240px, 42vw, 380px); padding: 12px clamp(14px, 2vw, 20px) 18px; }
      .chart-empty { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; color: var(--text-3); font-size: 0.9rem; }
      .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { border-collapse: collapse; width: 100%; min-width: 720px; font-size: 0.86rem; }
      thead th { position: sticky; top: 0; background: var(--surface-2); color: var(--text-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.7rem; }
      th, td { text-align: left; padding: 9px 14px; border-bottom: 1px solid var(--border); white-space: nowrap; }
      td.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--text-2); }
      tbody tr:hover { background: var(--surface-2); }
      .pill { display: inline-block; font-size: 0.68rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
      .pill.ok { color: #6ee7b7; background: rgba(5, 150, 105, 0.16); }
      .pill.failed { color: #fca5a5; background: rgba(220, 38, 38, 0.16); }
      .pagination {
        display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
        justify-content: space-between; padding: 10px 14px; border-top: 1px solid var(--border); background: var(--surface-2);
      }
      @media (min-width: 640px) { .pagination { flex-direction: row; align-items: center; } }
      .page-meta { display: flex; align-items: center; gap: 12px; font-size: 0.78rem; color: var(--text-3); flex-wrap: wrap; }
      .page-size { display: flex; align-items: center; gap: 6px; }
      select {
        appearance: none; font: inherit; font-size: 0.78rem; cursor: pointer; color: var(--text-1);
        background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px;
      }
      select:hover { border-color: var(--border-strong); }
      .pager { display: flex; align-items: center; gap: 4px; }
      .pager button, .pager .page-btn {
        min-width: 28px; height: 28px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center;
        font-size: 0.78rem; border: none; background: transparent; color: var(--text-2); border-radius: 6px;
      }
      .pager .page-btn:hover { background: var(--surface); color: var(--text-1); }
      .pager .page-btn.active { background: rgba(214, 211, 209, 0.12); color: var(--text-1); font-weight: 600; }
      .pager button:disabled { opacity: 0.3; cursor: not-allowed; }
      .pager .ellipsis { color: var(--text-3); padding: 0 2px; user-select: none; }
      footer { color: var(--text-3); font-size: 0.78rem; padding: 12px 14px; }
      .empty { padding: 40px; text-align: center; color: var(--text-3); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="eyebrow">Bulletin Upload Benchmarks</div>
        <h1>Results across all runs</h1>
        <p class="standfirst">
          Upload throughput and reliability by file size, tracked over every recorded benchmark run.
          Filter by date, hover a chart for detail, page through the data, or export the current view.
        </p>
      </header>

      <section class="cards" aria-label="Summary for the selected range">
        <div class="card"><div class="tag">Latest run</div><div class="metric" id="card-date">—</div></div>
        <div class="card"><div class="tag">Largest success</div><div class="metric" id="card-largest">—</div></div>
        <div class="card"><div class="tag">Peak throughput</div><div class="metric" id="card-peak">—</div></div>
        <div class="card"><div class="tag">Passed</div><div class="metric" id="card-pass">—</div></div>
      </section>

      <div class="toolbar">
        <div class="range">
          <div class="field"><label for="from-date">From</label><input type="date" id="from-date" /></div>
          <div class="field"><label for="to-date">To</label><input type="date" id="to-date" /></div>
          <div class="field">
            <label for="size-filter">Size</label>
            <select id="size-filter" aria-label="Filter by size"><option value="">All sizes</option></select>
          </div>
          <button type="button" id="reset-range">Reset</button>
        </div>
        <div class="spacer"></div>
        <button type="button" id="download-csv">Download CSV</button>
        <button type="button" id="download-json">Download JSON</button>
      </div>

      <section class="panel">
        <div class="panel-head">
          <h2>Throughput by file size</h2>
          <p class="hint">Effective MB/s at each size. Log size axis. One line per run; failed sizes are not plotted.</p>
        </div>
        <div class="chart-box">
          <canvas id="throughput-chart"></canvas>
          <div class="chart-empty" id="throughput-empty">No runs in the selected range.</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Largest successful upload over time</h2>
          <p class="hint">The biggest file each run completed. Rising is better.</p>
        </div>
        <div class="chart-box">
          <canvas id="trend-chart"></canvas>
          <div class="chart-empty" id="trend-empty">No runs in the selected range.</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Per-size results</h2>
          <p class="hint">Every size from every run in range. Search, filter, page through, or export the current view.</p>
          <div class="table-filters">
            <input type="search" id="row-search" placeholder="Search date, size, status…" aria-label="Search results" />
            <select id="status-filter" aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="ok">Passed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        <div class="table-scroll"><table id="results"></table></div>
        <div class="pagination" id="pagination"></div>
        <footer id="generated"></footer>
      </section>
    </div>

    <script>
      window.__DASHBOARD__ = ${inlineJson(payload)};
    </script>
    <script>
      (function () {
        var data = window.__DASHBOARD__;
        var ALL_RUNS = data.runs || [];
        var CSV_HEADER = (data.csv || [[]])[0];
        var ALL_ROWS = (data.csv || []).slice(1); // [run,date,size,size_bytes,status,time_s,mbps,heap,rss,retries]

        var PAGE_SIZE_OPTIONS = [10, 30, 50, 100];
        var pageSize = PAGE_SIZE_OPTIONS[0];
        var page = 1;
        var fromDate = "";
        var toDate = "";
        var searchTerm = "";
        var statusFilter = "";
        var sizeFilter = "";
        var throughputChart = null;
        var trendChart = null;

        function humanBytes(bytes) {
          if (!bytes || bytes <= 0) return "0";
          var units = ["B", "KB", "MB", "GB", "TB"];
          var e = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
          var v = bytes / Math.pow(1024, e);
          return (v >= 100 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + units[e];
        }

        function inRange(date) {
          return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
        }
        function filteredRuns() {
          return ALL_RUNS.filter(function (r) { return inRange(r.date); });
        }
        function filteredRows() {
          return ALL_ROWS.filter(function (r) { return inRange(r[1]); });
        }
        // Date range + status + size + free-text search, composed. [date,size,status] = r[1],r[2],r[4].
        function tableRows() {
          return filteredRows().filter(function (r) {
            if (statusFilter && r[4] !== statusFilter) return false;
            if (sizeFilter && r[2] !== sizeFilter) return false;
            if (searchTerm && r.join(" ").toLowerCase().indexOf(searchTerm) === -1) return false;
            return true;
          });
        }

        function download(filename, text, type) {
          var blob = new Blob([text], { type: type });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        function toCsv(grid) {
          return grid
            .map(function (row) {
              return row
                .map(function (cell) {
                  var s = String(cell == null ? "" : cell);
                  return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
                })
                .join(",");
            })
            .join("\\n");
        }

        document.getElementById("download-csv").addEventListener("click", function () {
          download("bulletin-benchmarks.csv", toCsv([CSV_HEADER].concat(tableRows())), "text/csv");
        });
        document.getElementById("download-json").addEventListener("click", function () {
          download("bulletin-benchmarks.json", JSON.stringify(filteredRuns(), null, 2), "application/json");
        });

        // ---- Summary cards (reflect the active date range) ----
        function setCard(id, value) {
          document.getElementById(id).textContent = value;
        }
        function renderCards() {
          var runs = filteredRuns();
          var latest = runs[runs.length - 1];
          setCard("card-date", latest ? latest.date : "—");
          setCard("card-largest", latest ? humanBytes(latest.largestSuccessBytes) : "—");
          setCard("card-peak", latest ? latest.peakThroughputMBps.toFixed(3) + " MB/s" : "—");
          setCard("card-pass", latest ? latest.successfulUploads + "/" + latest.totalUploads : "—");
        }

        // ---- Paginated results table (mirrors the dotNS UI TablePagination UX) ----
        var table = document.getElementById("results");
        var pagination = document.getElementById("pagination");

        function totalPages(rows) {
          return Math.max(1, Math.ceil(rows.length / pageSize));
        }
        function visiblePages(total) {
          if (total <= 7) return Array.from({ length: total }, function (_, i) { return i + 1; });
          var pages = [1];
          if (page > 3) pages.push("...");
          var start = Math.max(2, page - 1);
          var end = Math.min(total - 1, page + 1);
          for (var i = start; i <= end; i++) pages.push(i);
          if (page < total - 2) pages.push("...");
          pages.push(total);
          return pages;
        }

        function renderTable() {
          var rows = tableRows();
          if (page > totalPages(rows)) page = totalPages(rows);
          var startIdx = (page - 1) * pageSize;
          var pageRows = rows.slice(startIdx, startIdx + pageSize);

          var head =
            "<thead><tr><th>Run</th><th>Size</th><th>Status</th><th>Time (s)</th>" +
            "<th>MB/s</th><th>Heap (MB)</th><th>RSS (MB)</th><th>Retries</th></tr></thead>";
          var body = pageRows.length
            ? pageRows
                .map(function (r) {
                  var ok = r[4] === "ok";
                  return (
                    "<tr><td>" + r[1] + "</td><td class='num'>" + r[2] + "</td>" +
                    "<td><span class='pill " + (ok ? "ok" : "failed") + "'>" + (ok ? "OK" : "Failed") + "</span></td>" +
                    "<td class='num'>" + (r[5] || "—") + "</td>" +
                    "<td class='num'>" + (r[6] || "—") + "</td>" +
                    "<td class='num'>" + (r[7] || "—") + "</td>" +
                    "<td class='num'>" + (r[8] || "—") + "</td>" +
                    "<td class='num'>" + (r[9] || "0") + "</td></tr>"
                  );
                })
                .join("")
            : "<tr><td colspan='8' style='color:var(--text-3);padding:24px;text-align:center'>No rows match the current filters.</td></tr>";
          table.innerHTML = head + "<tbody>" + body + "</tbody>";
          renderPagination(rows, startIdx, pageRows.length);
        }

        function renderPagination(rows, startIdx, shown) {
          if (!rows.length) {
            pagination.innerHTML = "";
            return;
          }
          var sizeSelect =
            "<span class='page-size'><span>Show</span><select id='page-size'>" +
            PAGE_SIZE_OPTIONS.map(function (s) {
              return "<option value='" + s + "'" + (s === pageSize ? " selected" : "") + ">" + s + "</option>";
            }).join("") +
            "</select><span>per page</span></span>";

          var meta =
            "<div class='page-meta'><span>" + (startIdx + 1) + "\\u2013" + (startIdx + shown) +
            " of " + rows.length + " rows</span>" + sizeSelect + "</div>";

          var total = totalPages(rows);
          var pager = "";
          if (total > 1) {
            pager += "<div class='pager'>";
            pager += "<button type='button' data-nav='prev'" + (page <= 1 ? " disabled" : "") + " aria-label='Previous page'>&#8249;</button>";
            visiblePages(total).forEach(function (p) {
              pager +=
                p === "..."
                  ? "<span class='ellipsis'>…</span>"
                  : "<button type='button' class='page-btn" + (p === page ? " active" : "") + "' data-page='" + p + "'>" + p + "</button>";
            });
            pager += "<button type='button' data-nav='next'" + (page >= total ? " disabled" : "") + " aria-label='Next page'>&#8250;</button>";
            pager += "</div>";
          }
          pagination.innerHTML = meta + pager;

          var select = document.getElementById("page-size");
          if (select) {
            select.addEventListener("change", function (e) {
              pageSize = Number(e.target.value);
              page = 1;
              renderTable();
            });
          }
          pagination.querySelectorAll("[data-page]").forEach(function (btn) {
            btn.addEventListener("click", function () {
              page = Number(btn.getAttribute("data-page"));
              renderTable();
            });
          });
          var prev = pagination.querySelector("[data-nav='prev']");
          var next = pagination.querySelector("[data-nav='next']");
          if (prev) prev.addEventListener("click", function () { if (page > 1) { page--; renderTable(); } });
          if (next) next.addEventListener("click", function () { if (page < totalPages(tableRows())) { page++; renderTable(); } });
        }

        // ---- Charts (rebuilt on filter change) ----
        function toggleChart(canvasId, emptyId, hasData) {
          document.getElementById(canvasId).style.display = hasData ? "block" : "none";
          document.getElementById(emptyId).style.display = hasData ? "none" : "flex";
        }

        function buildCharts() {
          if (throughputChart) { throughputChart.destroy(); throughputChart = null; }
          if (trendChart) { trendChart.destroy(); trendChart = null; }

          var runs = filteredRuns();
          var ready = typeof Chart !== "undefined";
          toggleChart("throughput-chart", "throughput-empty", ready && runs.length > 0);
          toggleChart("trend-chart", "trend-empty", ready && runs.length > 0);
          if (!ready) {
            document.getElementById("throughput-empty").textContent = "Charts unavailable (offline). Use the table and exports.";
            document.getElementById("trend-empty").textContent = "Charts unavailable (offline).";
          }
          if (!ready || !runs.length) return;

          var palette = ["#d6d3d1", "#d97706", "#dc2626", "#3b82f6", "#a78bfa", "#10b981"];

          throughputChart = new Chart(document.getElementById("throughput-chart"), {
            type: "line",
            data: {
              datasets: runs.map(function (r, i) {
                return {
                  label: r.date,
                  borderColor: palette[i % palette.length],
                  backgroundColor: palette[i % palette.length],
                  tension: 0.25,
                  pointRadius: 3,
                  data: r.results
                    .filter(function (x) {
                      return (
                        x.success &&
                        x.throughputMBps != null &&
                        (!sizeFilter || x.label === sizeFilter)
                      );
                    })
                    .map(function (x) { return { x: x.sizeBytes, y: x.throughputMBps, label: x.label }; }),
                };
              }),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "nearest", intersect: false },
              scales: {
                x: { type: "logarithmic", title: { display: true, text: "File size" }, ticks: { callback: function (v) { return humanBytes(v); } } },
                y: { title: { display: true, text: "MB/s" }, beginAtZero: true },
              },
              plugins: {
                tooltip: {
                  callbacks: {
                    title: function (items) { return items[0].raw.label; },
                    label: function (item) { return item.dataset.label + ": " + item.raw.y.toFixed(3) + " MB/s"; },
                  },
                },
              },
            },
          });

          trendChart = new Chart(document.getElementById("trend-chart"), {
            type: "line",
            data: {
              labels: runs.map(function (r) { return r.date; }),
              datasets: [
                {
                  label: "Largest successful upload",
                  borderColor: "#10b981",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  fill: true,
                  tension: 0.25,
                  pointRadius: 4,
                  data: runs.map(function (r) { return r.largestSuccessBytes / (1024 * 1024); }),
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: { y: { title: { display: true, text: "MB" }, beginAtZero: true, ticks: { callback: function (v) { return humanBytes(v * 1024 * 1024); } } } },
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (item) { return humanBytes(item.raw * 1024 * 1024); } } } },
            },
          });
        }

        function applyFilter() {
          page = 1;
          renderCards();
          renderTable();
          buildCharts();
        }

        // ---- Date range controls ----
        var fromInput = document.getElementById("from-date");
        var toInput = document.getElementById("to-date");
        var dates = ALL_RUNS.map(function (r) { return r.date; }).filter(Boolean).sort();
        if (dates.length) {
          fromInput.min = toInput.min = dates[0];
          fromInput.max = toInput.max = dates[dates.length - 1];
        }
        fromInput.addEventListener("change", function () { fromDate = fromInput.value; applyFilter(); });
        toInput.addEventListener("change", function () { toDate = toInput.value; applyFilter(); });
        document.getElementById("reset-range").addEventListener("click", function () {
          fromDate = "";
          toDate = "";
          sizeFilter = "";
          fromInput.value = "";
          toInput.value = "";
          sizeSelect.value = "";
          applyFilter();
        });

        // ---- Table filters: search, status, size (compose with the date range) ----
        var sizeSelect = document.getElementById("size-filter");
        var seenSize = {};
        ALL_ROWS.filter(function (r) { return !seenSize[r[2]] && (seenSize[r[2]] = true); })
          .map(function (r) { return { label: r[2], bytes: Number(r[3]) || 0 }; })
          .sort(function (a, b) { return a.bytes - b.bytes; })
          .forEach(function (s) {
            var opt = document.createElement("option");
            opt.value = s.label;
            opt.textContent = s.label;
            sizeSelect.appendChild(opt);
          });

        document.getElementById("row-search").addEventListener("input", function (e) {
          searchTerm = e.target.value.trim().toLowerCase();
          page = 1;
          renderTable();
        });
        document.getElementById("status-filter").addEventListener("change", function (e) {
          statusFilter = e.target.value;
          page = 1;
          renderTable();
        });
        sizeSelect.addEventListener("change", function (e) {
          sizeFilter = e.target.value;
          page = 1;
          renderTable();
          buildCharts();
        });

        document.getElementById("generated").textContent =
          "Generated " + data.generatedAtIso + " from " + ALL_RUNS.length + " run(s).";

        renderCards();
        renderTable();
        if (document.readyState === "complete") buildCharts();
        else window.addEventListener("load", buildCharts);
      })();
    </script>
  </body>
</html>
`;
}

const runs = loadRuns();
const generatedAtIso = new Date().toISOString();
const outputPath = join(resultsDir, "index.html");
writeFileSync(outputPath, renderHtml(runs, generatedAtIso), "utf8");
console.log(`Wrote ${outputPath} from ${runs.length} run(s).`);
