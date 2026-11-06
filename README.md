<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/dsh-labor-contract-hero-zh-dark.webp">
  <img src="docs/assets/dsh-labor-contract-hero-zh-light.webp" width="100%" alt="dsh-labor-contract 横幅：右侧是 labor.check 的九项必备条款记分板（命中 9 / 待补 0 / 缺失 0），下方三条量尺——试用期 3 / 6 个月、试用期工资 10800.00 ÷ 12000.00 = 90.00%（80% 下限用虚线标出）、竞业限制 24 / 24 个月；卡片底部是 labor.batch 6 行 → 4 个问题（已过期 1 / 90 天内 1）与 labor.export 4 行 / 566 B / sha256 3fed842f…；数值取自 samples/quickstart/expected/result.json">
</picture>

# dsh-labor-contract

**把一份劳动合同正文和一份员工合同 CSV，核对成一张可复核的问题清单。**

面向 HR 与法务的纯本地合同体检插件：九项必备条款覆盖、试用期上限、试用期工资 80% 下限、批量到期与竞业限制提示，最后导出一份带 sha256 的 CSV——不联网、不调用模型、不构成法律意见。

[安装](#三步上手) · [配置](#配置) · [FAQ](#faq) · [简体中文](README.md) · [English](README.en.md) · [Español](README.es.md) · [Português](README.pt.md) · [हिन्दी](README.hi.md)

[![License](https://img.shields.io/badge/license-Apache--2.0-3366CC?style=flat-square&labelColor=2B3245)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.1%20%3C0.4.0-4B67B4?style=flat-square&labelColor=2B3245)](#兼容性)
[![npm](https://img.shields.io/npm/v/dsh-labor-contract?style=flat-square&labelColor=2B3245&color=CB3837)](https://www.npmjs.com/package/dsh-labor-contract)
[![CI](https://img.shields.io/github/actions/workflow/status/PerryLink/dsh-labor-contract/ci.yml?branch=main&label=CI&style=flat-square&labelColor=2B3245)](https://github.com/PerryLink/dsh-labor-contract/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D24.9%20%3C25-339933?style=flat-square&labelColor=2B3245)](#兼容性)

[![Stars](https://img.shields.io/github/stars/PerryLink/dsh-labor-contract?style=flat-square&labelColor=2B3245)](https://github.com/PerryLink/dsh-labor-contract/stargazers)
[![npm downloads](https://img.shields.io/npm/dm/dsh-labor-contract?style=flat-square&labelColor=2B3245&color=CB3837)](https://www.npmjs.com/package/dsh-labor-contract)
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-labor-contract?metric=downloads)](https://dshfind.com/plugins/PerryLink/dsh-labor-contract?ref=badge)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-C71D23?style=flat-square&labelColor=2B3245&logo=gitee)](https://gitee.com/perrylink/dsh-labor-contract)

```sh
dsh plugin --profile <profile> add dsh-labor-contract
```

</div>

<sub>社区插件，与 DeepSeek 官方无关。唯一仓库：<https://github.com/PerryLink/dsh-labor-contract>（Gitee 为镜像）。状态：alpha / 公开合成 / partial / not counted / 非 GA——不含客户合同或真实员工数据，也不作生产可用或法律合规声明。</sub>

## 它是什么

`dsh-labor-contract` 读取一段劳动合同纯文本，逐项核对九项必备条款的覆盖情况，按合同期限算试用期上限，比较试用期工资与约定工资的 80% 下限，并在出现竞业限制时提示补偿与两年期限。它还能对一份员工合同 CSV 做批量体检：试用期超限、合同已到期或 90 天内到期、试用期工资不足 80%。最后把问题清单写成一个带 `sha256` 的 CSV。

它只做**条款覆盖、日期和比例**的核对：全部在本机完成，源文件只读，不联网、不调用模型。

- **适合**：HR / 法务在签前做一次结构化自查；6–500 人的合同批量体检；把问题清单交给业务或律师复核；作为合同台账的输入。
- **不适合**：替代律师出具法律意见；判断条款效力、违约金、股权、保密或知识产权归属；从 PDF、扫描件或 DOCX 直接读合同（本包只吃纯文本）；核对当地最低工资、社保基数或个税（这些要按城市和年度另行核对）。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/dsh-labor-contract-flow-v5-dark.svg">
  <img src="docs/assets/dsh-labor-contract-flow-v5-light.svg" width="100%" alt="dsh-labor-contract 结构：三层本地评审台。01 条款台——劳动合同纯文本（只读）经 labor.check（R0）逐条比对九项必备条款：关键词、具体要素两道闸门，落成 present / attention / missing（quickstart 为 9 / 0 / 0）；02 判据尺——按含结束日的整月数给出试用期上限阶梯（不满 3 → 0、3–11 → 1、12–35 → 2、≥36 或无固定期限 → 6），试用期工资按分比较 80% 下限（1080000 ≥ 960000，正好 80% 也算过），竞业限制按 24 个月上限量并提示按月补偿；03 问题单——employees.csv（7 列 6 行，as_of 2026-11-02）经 labor.batch（R0）得到 4 条问题，每条按「实测 vs 阈值」列出；labor.export（R1）把这 4 行写成 RFC 4180 CSV，落到 $DSH_HOME/dsh-labor-contract/exports/labor-issues.csv，返回 566 B 与 sha256；全程本地，不联网、不调用模型、不构成法律意见">
</picture>

## 三步上手

1. **安装**（三选一）：

   ```sh
   # npm 通道（推荐，已发布版本）
   dsh plugin --profile <profile> add dsh-labor-contract
   # git 通道（最新 main；等价于 git+https://github.com/PerryLink/dsh-labor-contract.git）
   dsh plugin --profile <profile> add github:PerryLink/dsh-labor-contract
   # tarball 通道：本仓库 pnpm pack 后
   dsh plugin --profile <profile> add ./dsh-labor-contract-<version>.tgz
   ```

   安装包自带构建好的 `lib/`，目标机器无需再构建。

2. **验证已生效**：

   ```sh
   dsh --profile <profile> --dump-config | grep dsh-labor-contract
   ```

3. **跑通自带样例**（仓库内先 `pnpm build`；一份 36 个月的合成合同 + 6 名合成员工，与金标对比）：

   ```sh
   node samples/quickstart/run.mjs --check
   ```

**卸载**：`dsh plugin --profile <profile> remove dsh-labor-contract`（或从 profile patch 删掉该行）。

## 核心能力

工具名是稳定 API；说明保留英文以匹配运行时输出。

| 工具 | 用途 | 风险 |
|---|---|---|
| `labor.check` | 单份合同：九项必备条款覆盖 + 试用期上限 + 试用期工资 80% + 竞业限制补偿提示 | R0（只读） |
| `labor.batch` | CSV 批量：试用期超限、合同到期 / 90 天内到期、试用期工资不足 80% | R0（只读） |
| `labor.export` | 把问题清单写成带引号转义的 CSV，返回路径与 sha256 | R1（只写本地 exports） |

- **九项必备条款**：合同期限、工作内容、工作地点、工时与休息休假、劳动报酬、社会保险、劳动保护与劳动条件、解除与终止、争议解决，逐项给出 `present` / `attention` / `missing` 与证据句。
- **试用期上限**：按含结束日的整数月判断 0 / 1 / 2 / 6 个月上限；识别不到合同期限就返回 `unknown`，不猜。
- **试用期工资 80%**：按分比较，正好 80% 通过，只有低于才标 `below_80`。
- **批量到期**：`CONTRACT_EXPIRED` 与 `CONTRACT_EXPIRING` 两个问题码，默认 90 天提醒窗口。
- **竞业限制提示**：检查是否写了按月经济补偿、期限是否超过 2 年；不判断是否可执行。
- **可复核交付**：导出 CSV 附 `sha256`，目录固定为 `$DSH_HOME/dsh-labor-contract/exports/`。

## 示例

把下面这句直接发给 agent：

> 帮我核对这份劳动合同的必备条款、试用期上限和试用期工资比例，再把 6 名员工的合同批量查一遍到期和试用期问题。

也可以直接走工具面：

```sh
# 1) 单份合同体检
#    工具面：labor.check({ text: "<合同正文>" })

# 2) 批量核对
#    工具面：labor.batch({ csv: "<CSV 文本>", as_of: "2026-11-02" })

# 3) 导出问题清单
#    工具面：labor.export({ issues: [...labor.batch 的 issues], filename: "labor-issues.csv" })
```

复跑自带样例并核对金标：

```sh
node samples/quickstart/run.mjs --check
```

![dsh-labor-contract quickstart 真实运行输出](docs/assets/quickstart.png)

样例是一份 36 个月的合成合同 + 6 名合成员工：9 项条款全部命中；试用期 3 个月（上限 6 个月）；试用期工资 10800 / 12000 = 90%；竞业限制 2 年且有补偿。批量结果 4 个问题：1 个试用期超限、1 个合同已到期、1 个试用期工资 79.99%、1 个 74 天后到期。金标 `samples/quickstart/expected/result.json` 由 `node samples/quickstart/run.mjs --json` 真实产生，不是手写；截图取自 `--check` 的真实终端输出（原始捕获见 [`docs/assets/quickstart.log`](docs/assets/quickstart.log)）。

## 输入

- `labor.check`：一段劳动合同**纯文本**（`.txt` / 粘贴的正文）。如果手上是 PDF、扫描件或 DOCX，请先用你信任的工具转成文本；本包不做 OCR，也不解析二进制文档。
- `labor.batch`：一份 UTF-8 CSV，表头固定为
  `employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary`。
  - `probation_salary` 可省略；省略时无法做 80% 比例检查。
  - 日期必须是 `YYYY-MM-DD`；`contract_end` 也可以写 `无固定期限`。
  - 金额写 `1234.56`，不要带 `¥`、空格或中文单位。
- `labor.export`：一组问题行（通常直接传 `labor.batch` 的 `issues`）和一个安全文件名。
- 所有输入只读；不会修改你的合同或 CSV。

| 列 | 必填 | 说明 |
|---|---|---|
| `employee` | 是 | 员工姓名或编号 |
| `position` | 是 | 岗位 |
| `contract_start` | 是 | `YYYY-MM-DD` |
| `contract_end` | 是 | `YYYY-MM-DD` 或 `无固定期限` |
| `probation_months` | 是 | 非负整数，单位月 |
| `monthly_salary` | 是 | 转正后约定月工资，元，最多两位小数 |
| `probation_salary` | 否 | 试用期月工资；省略则跳过 80% 检查 |

```csv
employee,position,contract_start,contract_end,probation_months,monthly_salary,probation_salary
陈一（合成）,前端工程师,2026-01-01,2028-12-31,3,12000,10800
```

## 输出

- `labor.check`：`clauses`（9 项，每项 `present` / `attention` / `missing` + 证据句 + 提示）、`summary`、`term`、`probation`、`probation_pay`、`non_compete`，以及 `disclaimer_zh`。
- `labor.batch`：`as_of`、`rows`、`issues`、`due.expired` / `due.expiring`、`summary.by_code`。
- `labor.export`：CSV 路径、行数、字节数、`sha256`。文件写到 `$DSH_HOME/dsh-labor-contract/exports/`。
- 所有日期都是 `YYYY-MM-DD`；金额在内部按分计算，避免浮点误差。

## 判定规则

### 九项必备条款

合同期限、工作内容、工作地点、工时与休息休假、劳动报酬、社会保险、劳动保护与劳动条件、解除与终止、争议解决。

每项三种状态：

- `present`：找到条款，且看到具体要素（日期、岗位、城市、金额、险种、通知期/补偿、仲裁路径等）。
- `attention`：找到条款关键词，但缺少具体要素（例如只有“合同期限”四个字，没有起止日期）。
- `missing`：整段没有找到该条款关键词。

这是关键词 + 句式启发式，**不是**合同解释。条款写得再漂亮，也不代表它合法有效；反过来，换一种写法也可能被误判，需要人工复核。

### 试用期上限

按合同期限的整数月（含结束日）判断：

| 合同期限 | 试用期上限 |
|---|---|
| 不满 3 个月 | 不得约定试用期 |
| 3 个月以上不满 1 年 | 1 个月 |
| 1 年以上不满 3 年 | 2 个月 |
| 3 年以上 / 无固定期限 | 6 个月 |
| 以完成一定工作任务为期限 | 不得约定试用期 |

边界按含结束日的整月计算：2026-01-01 至 2026-03-31 算 3 个月，2026-01-01 至 2026-03-30 算 2 个整月。识别不到合同期限时返回 `unknown`，不会猜。

### 试用期工资 80%

`labor.check` 从文本里找“试用期工资”“转正后月工资 / 月工资”，按分比较：`试用期工资 × 100 < 约定工资 × 80` 才算低于 80%，正好 80% 通过。`labor.batch` 对每一行做同样比较。**同时还要满足当地最低工资标准**，这个本包不知道，需要你按城市核对。

### 竞业限制提示

文本里出现“竞业限制 / 竞业禁止”时，检查是否同时写了按月经济补偿，以及期限是否超过 2 年；两者任一不满足就标 `attention`。提示不构成对竞业限制效力的判断。

### 批量到期

`labor.batch` 以 `as_of`（默认当天）为基准：

- `contract_end < as_of`：`CONTRACT_EXPIRED`，进入 `due.expired`。
- `0 ≤ contract_end - as_of ≤ 90`：`CONTRACT_EXPIRING`，进入 `due.expiring`。
- `contract_end = 无固定期限`：不参与到期判断，试用期上限按 6 个月。

90 天是本包自定的提醒窗口，不是法定值；可以改 `src/core/labor.ts` 里的 `EXPIRING_WINDOW_DAYS` 后重新构建。

## 配置

本插件没有 profile 级配置键（`cordis.patch.yml` 只插入插件本身）；可调项是三个工具每次调用时传入的参数：

```yaml
- insert:
    - id: dsh-labor-contract
      name: 'dsh-labor-contract'
```

| 参数 | 默认值 | 含义 |
|---|---|---|
| `text` | （必填，`labor.check`） | 劳动合同纯文本；只读，不做 OCR |
| `csv` | （必填，`labor.batch`） | 员工合同 CSV 文本，表头固定，逗号分隔 |
| `as_of` | 当天 | `labor.batch` 的到期基准日，`YYYY-MM-DD` |
| `issues` | （必填，`labor.export`） | 问题行数组，通常直接传 `labor.batch` 的 `issues` |
| `filename` | 按日期生成 | `labor.export` 的文件名，只允许 `[A-Za-z0-9._-]`；固定写到 `$DSH_HOME/dsh-labor-contract/exports/` |

## FAQ

<details>
<summary>这是法律意见吗？</summary>

不是。它只做条款覆盖、日期和比例的格式核对，返回 `disclaimer_zh` 明确说明；具体合规请咨询执业律师或当地人力资源社会保障部门。

</details>

<details>
<summary>能直接读 PDF / DOCX / 扫描件吗？</summary>

不能。本包只接收纯文本。请先用你信任的工具把合同转成文本；扫描件还需要先 OCR。本包不联网、不调用 OCR 服务。

</details>

<details>
<summary>试用期按自然月还是按天算？</summary>

按含结束日的整月算。`contractTermMonths` 的规则：结束日加一天后做月差，再按日修正；`2026-01-01` 至 `2026-03-31` = 3 个月。试用期本身支持“X 个月 / X 天 / X 年”，天按 30 天/月折算，因此 45 天会按 1.5 个月与上限比较。

</details>

<details>
<summary>80% 是税前还是税后？</summary>

本包只比较文本里的两个约定金额，不区分税前税后，也不扣社保、公积金和个税。请用合同里的同一口径填写 `monthly_salary` 和 `probation_salary`。

</details>

<details>
<summary>到期窗口为什么是 90 天？</summary>

这是本包默认的续签提醒窗口，不是法定值。改 `src/core/labor.ts` 里的 `EXPIRING_WINDOW_DAYS`、重新 `pnpm build` 即可；金标与截图需要同步重跑。

</details>

<details>
<summary>会把合同上传或调用模型吗？</summary>

不会。三个工具都是本地代码；不联网、不上传、不调用模型。`labor.export` 只写 `$DSH_HOME/dsh-labor-contract/exports/`。

</details>

## 权限与数据

- 读：用户指定的劳动合同文本与员工合同 CSV（样例 `samples/quickstart/input/`）；不读其他目录。
- 写：`$DSH_HOME/dsh-labor-contract/exports/`（仅 `labor.export`）；不改原合同与 CSV。
- 联网：否。
- 外部系统：无。

`labor.check`、`labor.batch` 是 **R0**（只读）；`labor.export` 是 **R1**（本地写，只写 `$DSH_HOME/dsh-labor-contract/exports/`）。可用 `DSH_LABOR_CONTRACT_HOME` 覆盖本地写根目录（测试用），默认严格等于 `$DSH_HOME/dsh-labor-contract`。

## 已知限制

- **不是法律意见**：不判断条款效力、不计算经济补偿/赔偿金、不替代律师。
- **只吃文本**：不解析 PDF/DOCX/扫描件；不做 OCR。
- **关键词启发式**：同义写法、表格排版、条款合并可能造成 `present` / `attention` / `missing` 误判，必须人工复核。
- **试用期上限按合同期限**：不处理“同一用人单位与同一劳动者只能约定一次试用期”、劳务派遣、非全日制等特殊规则。
- **80% 只比较合同里的两个金额**：不知道当地最低工资、社保基数、个税和税前/税后口径。
- **竞业限制只提示补偿和 2 年上限**：不判断人员范围、地域、业务范围是否合理。
- **90 天到期窗口是自定值**：不是法定通知期。
- **CSV 只做 RFC 4180 引号转义**：不做 Excel 公式前缀清洗；不要用 Excel 直接打开来源不明的 CSV。
- **仅公开/合成样例**：alpha/partial、not counted，不作 GA 或生产可用声明。

## 验收证据

公开/合成 fixture 在 `samples/quickstart/`；`ACCEPTANCE.csv` 记录 9 条公开检查加 1 条 quickstart 金标。除 quickstart 行外均为 `counted=false`。

| req_id | metric | threshold | actual | pass | source | counted |
|---|---|---|---|---|---|---|
| LABOR-A01 | nine required clauses present | 9/9 | 9/9 | true | public/synthetic | false |
| LABOR-A02 | missing clauses detected | 9 | 9 | true | public/synthetic | false |
| LABOR-A03 | probation cap boundary | ok/over/over | ok/over_limit/over_limit | true | public/synthetic | false |
| LABOR-A04 | 80% probation-pay boundary | ok/below_80 | ok/below_80 | true | public/synthetic | false |
| LABOR-A05 | 6-person batch issues | 4 | 6rows/4issues | true | public/synthetic | false |
| LABOR-A06 | expiry window | 1expired/1expiring | 1expired/1expiring | true | public/synthetic | false |
| LABOR-A07 | invalid date error | E_LABOR_DATE_INVALID | E_LABOR_DATE_INVALID | true | public/synthetic | false |
| LABOR-A08 | export path safety | E_LABOR_PATH_INVALID | E_LABOR_PATH_INVALID | true | public/synthetic | false |
| LABOR-A09 | export sha256/bytes | matches file | ok | true | public/synthetic | false |
| PS1-QS01 | quickstart 样例与金标一致 | 1/1 | 1 | true | synthetic/quickstart | true |

*这是 fixture 支撑的验收行，不是客户运行；没有编造输出。* 运行环境与逐命令结果见 [EVIDENCE.md](EVIDENCE.md)，历次证据运行存于 `evidence/`。

## 兼容性

| 维度 | 状态 |
|---|---|
| Harness | `dsh >=0.2.1-rc.3 <0.4.0` |
| Node | `>=24.9.0 <25` |
| 平台 | 全平台；只用本地文件 |
| 数据 | 无网络、无模型调用、无上传 |

## 生态与质量

- [Gitee 镜像](https://gitee.com/perrylink/dsh-labor-contract)（同步镜像，以 GitHub 为准）
- [dshfind 插件页](https://dshfind.com/plugins/PerryLink/dsh-labor-contract)（安装量与排名）
- [领域索引](https://perrylink.github.io/dsh-plugins/)（PerryLink 插件总目）
- 同族相关插件：[dsh-legal-intake](https://github.com/PerryLink/dsh-legal-intake)（合同/需求收件与台账）、[dsh-contract-renewal](https://github.com/PerryLink/dsh-contract-renewal)（合同到期 / 续签窗口）、[dsh-pim-lint](https://github.com/PerryLink/dsh-pim-lint)（CSV 校验类工具）

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck
node --test test/*.test.mjs
node scripts/gate.mjs
```

当前版本 `0.1.0` · 31 项测试通过（`node --test test/*.test.mjs`）。配图由 [`scripts/gen-readme-assets.py`](scripts/gen-readme-assets.py) 程序化生成（Python/Pillow；hero 横幅为 1440×576 的中英 × 深浅四版 webp，结构图为 1100×660 手写 SVG 的深浅双版，数值直接读自 quickstart 金标），可重复执行。

Topics：`deepseek-harness`, `dsh`, `dsh-plugin`, `labor`, `contract`, `hr`, `probation`, `compliance`, `perrylink`

## 家族与致谢

本项目是 [PerryLink](https://github.com/PerryLink) 维护的 DeepSeek Harness 插件家族成员（全部 Apache-2.0）。如果这个插件帮到了你，**给个 star**——它不解锁任何功能，但会让下一个人更容易找到它。

- [@PerryLink](https://github.com/PerryLink) —— 创建者与维护者：合同条款覆盖、试用期上限与 80% 比例核对、批量到期管线、quickstart 金标样例与验收证据、五语文档。

## License

[LICENSE](LICENSE)（Apache License 2.0）© 2026 dsh-labor-contract contributors。另见 `NOTICE`、`THIRD-PARTY-NOTICES`。

<p align="center"><sub>Apache-2.0 · 社区插件，与 DeepSeek 无关。</sub></p>
