# Changelog

## [0.2.0] — 2026-11-13

### Breaking

- **Tool names no longer contain a dot.** The three tools are now `labor_check`, `labor_batch` and `labor_export`. Providers validate `tools[].name` against `^[a-zA-Z0-9_-]+$`; the old dotted names invalidated the whole `tools` array, so the plugin registered but every request carrying its tools was rejected with `Invalid 'tools[N].name'`. Minor bump because tool names are part of the 0.1.0 compatibility promise — update prompts, saved calls, permission rules and allow-lists that still use the old dotted names.
- `test/tool-name-wire.test.mjs` pins the wire pattern so a new tool cannot reintroduce a dot, drop the `labor_` namespace or duplicate another tool name.
- Earlier changelog entries use the new spelling, so a repository-wide search no longer finds dotted tool names.

## [0.1.0] — 2026-11-03

### Stable

- First non-alpha release: tool names and the CLI surface are covered by a
  compatibility promise (breaking changes require a minor bump).
- Ships a quickstart sample, a one-line prompt, a permission block and real captures.

## 0.1.0-alpha.1 — 2026-11-02

- Initial alpha: `labor_check` (nine required clauses, probation cap, 80% probation pay, non-compete compensation prompt), `labor_batch` (CSV batch: over-cap probation, expired / 90-day expiring contracts, probation pay below 80%), `labor_export` (RFC 4180 CSV under `safeExportPath`).
- Four stable error codes: `E_LABOR_TEXT_EMPTY`, `E_LABOR_CSV_ROW`, `E_LABOR_DATE_INVALID`, `E_LABOR_PATH_INVALID`.
- Synthetic quickstart: one 36-month labor contract with all nine clauses and a 6-person employee CSV; `samples/quickstart/expected/result.json` generated from a real `--json` run.
- Five-language README (en / zh / es / pt / hi), `TROUBLESHOOTING.md`, `screenshots.json`, flow SVG and a real terminal screenshot.
- 31 tests pass; acceptance gate has 9 public/synthetic checks plus `PS1-QS01`.

All samples are synthetic; the tool is not legal advice and does not claim production readiness.
