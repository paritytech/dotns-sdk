# DotNS Sized Deploy Examples

This example generates a repeatable set of static sites for deployment timing:

- `1MB`
- `5MB`
- `10MB`
- `25MB`
- `50MB`
- `100MB`

The generated projects are kept out of git history and written to `generated/` on demand.
Each site is a small static frontend plus a deterministic payload file sized to hit the exact
target directory size.

## Why this exists

These fixtures make it easy to benchmark deployment duration against a stable set of example
projects instead of ad-hoc test folders.

## Generate the example sites

```bash
bun examples/deploy/sized-sites/generate.ts
```

You can also generate a subset:

```bash
bun examples/deploy/sized-sites/generate.ts --sizes 1MB,10MB,100MB
```

The output folders will look like:

```text
examples/deploy/sized-sites/generated/
├── 1mb/
├── 5mb/
├── 10mb/
├── 25mb/
├── 50mb/
└── 100mb/
```

Each folder contains:

- `index.html`
- `assets/styles.css`
- `assets/app.js`
- `payload/payload.bin`

## Deploy timing workflow

See [workflows/deploy-benchmarks.yml](workflows/deploy-benchmarks.yml) for a GitHub Actions
example that:

1. Generates the sized sites
2. Uploads each size as an artifact
3. Deploys each one through the reusable DotNS deploy workflow
4. Records elapsed deploy time in the job summary

The workflow uses `skip-cache: true` so timing runs measure fresh uploads instead of cache hits.
It also assigns a dedicated base domain per size to keep deployments isolated.

In this repository, [`.github/workflows/deploy-sized-examples.yml`](../../../.github/workflows/deploy-sized-examples.yml)
dogfoods the same fixtures on pull requests and posts the benchmark table back as a sticky PR comment.

## Daily benchmark dashboard

The scheduled workflow [`.github/workflows/daily-deploy-sized-benchmarks.yml`](../../../.github/workflows/daily-deploy-sized-benchmarks.yml)
publishes a fixed dashboard at `bulletin-benchmarks.dot` using the static page in
[`dashboard/index.html`](dashboard/index.html). The workflow appends the latest run to a single
`benchmarks.json` dataset, republishes that dataset to Bulletin, and opens or updates a GitHub issue
with the same results and hidden JSON payload.

The page only depends on the JSON structure it fetches from `dashboard/benchmarks.json`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-03-23T22:07:00.000Z",
  "dashboardUrl": "https://bulletin-benchmarks.paseo.li",
  "sizes": [
    { "size": "1MB", "slug": "1mb" }
  ],
  "runs": [
    {
      "benchmarkDate": "2026-03-24",
      "benchmarkTimestamp": "2026-03-24 00:07 CET",
      "runUrl": "https://github.com/paritytech/dotns-sdk/actions/runs/123456789",
      "reports": [
        {
          "size": "1MB",
          "slug": "1mb",
          "status": "success",
          "failureStage": "",
          "fqdn": "1mb.bulletin-benchmarks.dot",
          "url": "https://1mb.bulletin-benchmarks.paseo.li",
          "durationSeconds": 12
        }
      ]
    }
  ]
}
```
