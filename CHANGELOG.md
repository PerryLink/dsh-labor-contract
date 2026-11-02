# Changelog

## 0.1.0-alpha.1 — 2026-11-02

- Initial alpha: `labor.check` (nine required clauses, probation cap, 80% probation pay, non-compete compensation prompt), `labor.batch` (CSV batch: over-cap probation, expired / 90-day expiring contracts, probation pay below 80%), `labor.export` (RFC 4180 CSV under `safeExportPath`).
- Four stable error codes: `E_LABOR_TEXT_EMPTY`, `E_LABOR_CSV_ROW`, `E_LABOR_DATE_INVALID`, `E_LABOR_PATH_INVALID`.
- Synthetic quickstart: one 36-month labor contract with all nine clauses and a 6-person employee CSV; `samples/quickstart/expected/result.json` generated from a real `--json` run.
- Five-language README (en / zh / es / pt / hi), `TROUBLESHOOTING.md`, `screenshots.json`, flow SVG and a real terminal screenshot.
- 31 tests pass; acceptance gate has 9 public/synthetic checks plus `PS1-QS01`.

All samples are synthetic; the tool is not legal advice and does not claim production readiness.
