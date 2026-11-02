# Evidence — dsh-labor-contract

All evidence is public/synthetic. No customer contract, real employee, ID number or payroll data is used.

| Check | Where | What it proves |
|---|---|---|
| Quickstart golden | `samples/quickstart/expected/result.json` | A real `node samples/quickstart/run.mjs --json` run over the committed contract and 6-person CSV |
| Terminal screenshot | `docs/assets/quickstart.png` + `.log` | The screenshot is rendered from the captured `--check` output; hashes are in `screenshots.json` |
| Acceptance | `ACCEPTANCE.csv` + `evidence/<run_id>/result.json` | 9 public/synthetic checks (clauses, missing clauses, probation boundaries, 80% boundary, batch, expiry, date error, path safety, export hash) plus `PS1-QS01` |
| Tests | `test/*.test.mjs` | 31 tests including boundary cases and error codes |
| Gate | `scripts/gate.mjs` | Lint + acceptance, every row `pass=true`, `PS1-QS01` counted |

Regenerate:

```sh
pnpm build
node scripts/acceptance.mjs
node scripts/gate.mjs
```

`evidence/` records the last acceptance run; `output` is not produced because every tool is read-only except `labor.export`, which writes to a temporary directory during tests.
