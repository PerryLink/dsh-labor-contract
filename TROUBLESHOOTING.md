# 故障排查 — dsh-labor-contract

每条按「症状 / 原因 / 动作」写。报错原文都是 `<一句人话>（E_XXX）｜下一步：<动作>`，
把 `E_XXX`、报错行和最小合成样例一起发到 issue 即可定位。**不要附真实劳动合同、员工姓名、身份证号或薪资表。**

## 1. 合同文本是空的（E_LABOR_TEXT_EMPTY）

- **症状**：`劳动合同文本是空的，没有可核对的条款（E_LABOR_TEXT_EMPTY）｜下一步：粘贴或传入完整的合同正文（至少包含甲乙双方和条款）后再跑一次`
- **原因**：传了空字符串、只有空格/换行，或从 PDF 复制时没复制到文字（只有图片）。
- **动作**：确认 `text` 里至少有甲方、乙方和条款正文；扫描件先 OCR 再复制。不要把二进制 PDF 当 `text` 传。

## 2. CSV 行或表头对不上（E_LABOR_CSV_ROW）

- **症状**：`员工合同 CSV 的某一行或表头对不上（E_LABOR_CSV_ROW）（row 5: expected 7 columns, got 6）｜下一步：对照样例表头 ... 重新导出`
- **原因**：缺必填列、某行列数不一致（漏逗号/多逗号）、`probation_months` 不是非负整数、`monthly_salary` 不是正数、空 CSV 或只有表头。
- **动作**：用样例表头 `employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary`；每行列数一致；金额写 `8000` 或 `8000.50`，不要带 `¥`、空格或千分位逗号以外的字符。行号从 CSV 第 1 行（表头）开始数，报错里的 `row` 是文件行号。

## 3. 日期无效（E_LABOR_DATE_INVALID）

- **症状**：`日期不是有效的 YYYY-MM-DD，或日历上不存在（E_LABOR_DATE_INVALID）（row 3: contract_end="2026-02-30"）｜下一步：把日期改成 2026-01-01 这样的 YYYY-MM-DD（合同结束日可写“无固定期限”）`
- **原因**：写了 `2026/01/01`、`2026-1-1`、`2026-02-30`，或 `as_of` 不是有效日期。
- **动作**：统一成两位月份/日期补零的 `YYYY-MM-DD`；2 月 30 日这种日历上不存在的日期会被拒绝；无固定期限合同把 `contract_end` 写成 `无固定期限`。

## 4. 导出路径不安全（E_LABOR_PATH_INVALID）

- **症状**：`导出文件名或导出路径不安全（E_LABOR_PATH_INVALID）（unsafe export filename: "../evil.csv"）｜下一步：只传一个由字母、数字、点、下划线或短横线组成的文件名`
- **原因**：`filename` 里带了 `../`、`/`、反斜杠、空格、中文、超长路径，或解析后跳出了 `exports/`；也可能是 `$DSH_HOME/dsh-labor-contract` 不可写。
- **动作**：只传一个 `[A-Za-z0-9._-]` 组成的文件名，例如 `labor-issues.csv`；不要传绝对路径。目录固定为 `$DSH_HOME/dsh-labor-contract/exports/`。如果目录不可写，确认 `$DSH_HOME` 指向可写位置（测试时设 `DSH_LABOR_CONTRACT_HOME` 到临时目录），不要用删除用户数据的方式“修复”。

## 常见问题（不是报错）

- **条款明明写了却显示 `missing`**：检查是不是用了同义写法（例如“聘用期限”“工作职责”）或条款在图片/表格里。当前是关键词启发式，换写法可能识别不到，请人工复核。
- **试用期显示 `unknown`**：文本里没有可识别的合同起止日期；补上 `2026-01-01 至 2028-12-31` 或 `无固定期限`。
- **80% 显示 `unknown`**：没有同时识别到“试用期工资”和“转正后月工资 / 月工资”；按 `试用期工资为人民币 8000 元/月，转正后月工资为人民币 10000 元/月` 的句式写。
- **到期数量和我预期不一致**：确认 `as_of`；90 天是本包默认提醒窗口，不是法定值。

## 还不行

```sh
pnpm build
node samples/quickstart/run.mjs --check   # 自带样例必须通过
node --test test/*.test.mjs               # 31 项测试
node scripts/gate.mjs                     # 元数据 + 验收门
```

仍失败时请在 <https://github.com/PerryLink/dsh-labor-contract/issues> 附上：包版本、最小**合成**合同/CSV（把姓名、身份证号、薪资替换掉）、完整报错行、Node 与 DSH 版本。**不要附真实劳动合同或员工数据。**
