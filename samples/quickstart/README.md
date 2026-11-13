# quickstart sample

Synthetic inputs for `dsh-labor-contract`; no real person, company or contract is involved.

- `input/labor-contract.txt` — one complete 2-page-equivalent labor contract with all nine
  required clauses, a 36-month fixed term, a 3-month probation, probation pay at 90% of the
  agreed wage, and a two-year non-compete clause with monthly compensation. This one is
  expected to pass every check.
- `input/employees.csv` — six synthetic employees. The rows deliberately cover:
  - a clean 3-year contract (probation 3 months, 90% pay);
  - a 3-month probation on a 2-year contract (over the 2-month cap);
  - a contract that expired 247 days before the reporting date;
  - probation pay at 79.99% (below the 80% floor);
  - a short 7-month contract with a lawful 1-month probation;
  - probation pay at exactly 80% and a contract inside the 90-day expiry window.
- `expected/result.json` — the real stdout of `node samples/quickstart/run.mjs --json`.
- `run.mjs` — `--check` recomputes the review and diffs it against the golden file;
  `--json` prints the payload; no flag prints a short summary.

Regenerate the golden after an intentional output change:

```sh
pnpm build
node samples/quickstart/run.mjs --json > samples/quickstart/expected/result.json
node samples/quickstart/run.mjs --check
```

The reporting date is fixed at `2026-11-02` in `run.mjs`, so expiry counts are deterministic.
`docs/assets/quickstart.log` and `docs/assets/quickstart.png` are captured from the real
`--check` output; update `screenshots.json` hashes when they change.

The review is a clause/date/ratio check, **not legal advice**. See the disclaimer returned by
`labor_check`.
