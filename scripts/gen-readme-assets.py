#!/usr/bin/env python3
"""README visuals for dsh-labor-contract (docs/assets/).

Two figures, both derived from the shipped code and the golden quickstart
fixture -- not from a shared family template.

hero 1440x576  (Pillow; zh/en x light/dark = 4 webp files)
    Left column: kicker / title / two value lines / sub / meta / footer.
    Right card: the nine-clause coverage board (3x3; one chip per entry of
    CLAUSES in src/core/labor.ts) sitting over the three non-clause
    verdicts of labor_check: the probation cap derived from contract term
    months (0/1/2/6), probation pay against the 80% floor compared in
    cents, and the 24-month non-compete ruler. A batch/export strip closes
    the card. Statuses, 3/6 months, 90.00%, 24 months, 6 rows -> 4 issues,
    4 rows / 566 B / sha256 prefix all come from
    samples/quickstart/expected/result.json at build time, so the banner
    cannot drift from the golden fixture.

flow 1100x660  (hand-written SVG; light/dark = 2 files)
    A three-tier review bench, not a row of boxes:
      01 CLAUSE BENCH  labor-contract.txt -> labor_check: nine clause rows,
                       each with two gates (keyword, concrete element) that
                       resolve into present / attention / missing.
      02 SCALES        the other three verdicts: a four-step staircase
                       (inclusive term months -> probation cap), the 80%
                       floor track compared in cents, and the 24-month
                       non-compete ruler.
      03 ISSUE SHEET   employees.csv -> labor_batch: the four real issue
                       rows as measured-vs-threshold, then labor_export's
                       receipt (safe filename, CSV, sha256, bytes).
    The measured/threshold cell of every issue row is recomputed from
    samples/quickstart/input/employees.csv and cross-checked against the
    matching detail_zh sentence in the fixture, so a drift aborts the build
    instead of shipping a wrong number. SVG text is ASCII command tokens
    only, so all five README languages share the same light/dark pair.

The legacy single-skin docs/assets/dsh-labor-contract-flow-{light,dark}.svg
files are intentionally left untouched so old external links never 404.

Run once:  python scripts/gen-readme-assets.py
Requires:  Python 3.10+ with Pillow; Windows fonts msyh.ttc / msyhbd.ttc /
           consola.ttf.
"""
from __future__ import annotations

import csv as csvmod
import datetime as dt
import json
import os
import sys
from html import escape

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")
FIXTURE = os.path.join(ROOT, "samples", "quickstart", "expected", "result.json")
EMPLOYEES = os.path.join(ROOT, "samples", "quickstart", "input", "employees.csv")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"

for _path in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO):
    if not os.path.exists(_path):
        raise SystemExit(f"FATAL: font missing: {_path}")

FALLAS: list[str] = []          # layout problems: non-empty means "do not ship"
_MEASURE = ImageDraw.Draw(Image.new("RGB", (8, 8)))


# ---------------------------------------------------------------- primitives


def font(size: float, kind: str = "cjk") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(
        {"cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD, "mono": FONT_MONO}[kind],
        max(8, int(round(size))))


def measure(s: str, size: float, kind: str = "mono") -> float:
    return _MEASURE.textlength(s, font=font(size, kind))


def hx(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def gradient(w: int, h: int, c1: str, c2: str) -> Image.Image:
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    a, b = hx(c1), hx(c2)
    for y in range(h):
        t = 0.22 * (y / h) + 0.78 * (y / h) ** 1.55
        d.line([(0, y), (w, y)],
               fill=tuple(int(p + (q - p) * t) for p, q in zip(a, b)))
    return img


def glow(img: Image.Image, cx: int, cy: int, r: int, color: tuple, alpha: int) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(12, 0, -1):
        rr = r * i / 12
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=color + (int(alpha * (1 - i / 13)),))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img: Image.Image, box: tuple[int, int, int, int], skin: dict,
         radius: int = 22, shadow: int = 30) -> Image.Image:
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 6, y0 + i // 2, x1 + i // 6, y1 + i],
                             radius=radius + i // 6,
                             fill=skin["shadow"] + (int(8 * (1 - i / shadow)),))
    base = Image.alpha_composite(img.convert("RGBA"),
                                 sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=hx(skin["card"]),
                        outline=hx(skin["card_edge"]), width=2)
    return base.convert("RGB")


def text(img: Image.Image, xy: tuple[float, float], s: str, size: float,
         kind: str, color: str, anchor: str = "ls", max_w: float | None = None,
         min_size: float = 14, hard_min: float | None = None,
         tag: str = "") -> float:
    """Draw text by baseline; shrink to fit max_w and record a hard failure."""
    d = ImageDraw.Draw(img)
    size = float(size)
    if max_w is not None:
        while size > min_size and measure(s, size, kind) > max_w:
            size -= 0.5
        if measure(s, size, kind) > max_w + 0.5:
            FALLAS.append(f"{tag or s!r}: {measure(s, size, kind):.0f}px > {max_w:.0f}px")
    if hard_min is not None and size < hard_min:
        FALLAS.append(f"{tag or s!r}: shrunk to {size:.1f}px < {hard_min:.1f}px")
    d.text(xy, s, font=font(size, kind), fill=hx(color), anchor=anchor)
    return size


def pill(img: Image.Image, xy: tuple[int, int], s: str, skin: dict, size: float,
         kind: str, fg: str | None = None, bg: str | None = None,
         tag: str = "") -> None:
    d = ImageDraw.Draw(img)
    tw = measure(s, size, kind)
    x, y = xy
    h = size + 22
    d.rounded_rectangle([x, y, x + tw + 36, y + h], radius=h / 2,
                        fill=hx(bg or skin["pill"]))
    d.text((x + 18, y + h / 2 + 1), s, font=font(size, kind),
           fill=hx(fg or skin["accent"]), anchor="lm")
    if tw + 36 > 480:
        FALLAS.append(f"pill {tag or s!r}: {tw + 36:.0f}px wide")


def badge(img: Image.Image, cx: float, cy: float, r: float, state: str, skin: dict) -> None:
    """Status badge: check / attention / missing, drawn as vectors (no glyphs)."""
    d = ImageDraw.Draw(img)
    color = {"present": skin["good"], "attention": skin["warn"],
             "missing": skin["danger"]}.get(state, skin["faint"])
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hx(color))
    w = max(2, int(round(r * 0.30)))
    white = (255, 255, 255)
    if state == "present":
        d.line([(cx - r * 0.44, cy + r * 0.02), (cx - r * 0.10, cy + r * 0.36)],
               fill=white, width=w)
        d.line([(cx - r * 0.10, cy + r * 0.36), (cx + r * 0.46, cy - r * 0.30)],
               fill=white, width=w)
    elif state == "attention":
        d.line([(cx, cy - r * 0.44), (cx, cy + r * 0.10)], fill=white, width=w)
        d.ellipse([cx - w * 0.55, cy + r * 0.30, cx + w * 0.55, cy + r * 0.30 + w * 1.1],
                  fill=white)
    else:
        d.line([(cx - r * 0.40, cy - r * 0.40), (cx + r * 0.40, cy + r * 0.40)],
               fill=white, width=w)
        d.line([(cx + r * 0.40, cy - r * 0.40), (cx - r * 0.40, cy + r * 0.40)],
               fill=white, width=w)


def rounded_bar(img: Image.Image, box: tuple[float, float, float, float], color: str,
                radius: float | None = None) -> None:
    x0, y0, x1, y1 = box
    if x1 - x0 < 1.5:
        return
    r = (y1 - y0) / 2 if radius is None else radius
    ImageDraw.Draw(img).rounded_rectangle([x0, y0, x1, y1],
                                          radius=min(r, (x1 - x0) / 2, (y1 - y0) / 2),
                                          fill=hx(color))


# ------------------------------------------------------------------ palette

SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff", card_edge="#e6e2f1",
        zone="#f5f2fb", text="#141419", sub="#4d5261", faint="#8a8fa0",
        accent="#4B67B4", good="#16a34a", warn="#bc4c00", danger="#b4442c",
        pill="#ece7f9", track="#eae6f3", grid="#e7e4f0", shadow=(34, 28, 66),
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016", card="#1b2231", card_edge="#2e374b",
        zone="#171e2d", text="#f0f3f9", sub="#a8b1c4", faint="#767f92",
        accent="#8496f5", good="#3fb950", warn="#d29922", danger="#f0885c",
        pill="#242d42", track="#243049", grid="#1e2636", shadow=(0, 0, 0),
    ),
}

# ------------------------------------------------------------------ fixture


def load_fixture() -> dict:
    with open(FIXTURE, encoding="utf-8") as fh:
        data = json.load(fh)
    clauses = data["check"]["clauses"]
    if len(clauses) != 9:
        raise SystemExit(f"FATAL: expected 9 clause rows in the fixture, got {len(clauses)}")
    states = {c["status"] for c in clauses}
    if not states <= {"present", "attention", "missing"}:
        raise SystemExit(f"FATAL: unexpected clause states {states}")
    if data["check"]["probation"]["limit_months"] not in (0, 1, 2, 6):
        raise SystemExit("FATAL: probation cap is not one of the four statutory tiers")
    if len(data["batch"]["issues"]) != data["export"]["rows"]:
        raise SystemExit("FATAL: fixture export rows do not match batch issues")
    return data


FIX = load_fixture()
CHK = FIX["check"]
BAT = FIX["batch"]
EXP = FIX["export"]
CLAUSES = CHK["clauses"]
SUMMARY = CHK["summary"]
TERM = CHK["term"]
PROB = CHK["probation"]
PAY = CHK["probation_pay"]
NC = CHK["non_compete"]
AS_OF = BAT["as_of"]

CLAUSE_EN = {
    "term": "term", "duties": "duties", "location": "location", "hours": "hours",
    "pay": "pay", "insurance": "insurance", "protection": "protection",
    "termination": "termination", "dispute": "dispute",
}


def clause_label(clause: dict, lang: str) -> str:
    return clause.get("label_zh", clause["key"]) if lang == "zh" else CLAUSE_EN[clause["key"]]


def money(cents: int | None) -> str:
    return "n/a" if cents is None else f"{cents / 100:.2f}"


SHA_SHORT = f"{EXP['sha256'][:8]}…"
PAY_RATIO = f"{PAY['ratio_pct']:.2f}%"
PAY_LOW, PAY_HIGH = money(PAY["probation_salary_cents"]), money(PAY["regular_salary_cents"])
PAY_CENTS = PAY["probation_salary_cents"]
PAY_FLOOR = (None if PAY["regular_salary_cents"] is None
             else round(PAY["regular_salary_cents"] * 0.8))
CAP = PROB["limit_months"]
PROB_MONTHS = PROB["months"]
NC_MONTHS = NC["duration_months"]
NC_CAP = 24
BATCH_ROWS = BAT["rows"]
ISSUES = len(BAT["issues"])
DUE = BAT["summary"]


# ------------------------------------------------- batch rows for the sheet


def load_employee_rows() -> dict[int, dict]:
    with open(EMPLOYEES, encoding="utf-8-sig", newline="") as fh:
        records = list(csvmod.DictReader(fh))
    if len(records) != BATCH_ROWS:
        raise SystemExit(f"FATAL: employees.csv has {len(records)} rows, fixture says {BATCH_ROWS}")
    return {index: rec for index, rec in enumerate(records, start=2)}


def term_months(start: str, end: str) -> int:
    a = dt.date.fromisoformat(start)
    b = dt.date.fromisoformat(end)
    after = b + dt.timedelta(days=1)
    months = (after.year - a.year) * 12 + (after.month - a.month)
    if after.day < a.day:
        months -= 1
    return months


def cap_for(months: int) -> int:
    if months < 3:
        return 0
    if months < 12:
        return 1
    if months < 36:
        return 2
    return 6


EMPLOYEES_BY_ROW = load_employee_rows()
AS_OF_DATE = dt.date.fromisoformat(AS_OF)


def issue_cells(issue: dict) -> tuple[str, str]:
    """Recompute measured / threshold for one fixture issue and cross-check it."""
    rec = EMPLOYEES_BY_ROW.get(issue["row"])
    if rec is None:
        raise SystemExit(f"FATAL: issue row {issue['row']} is not in employees.csv")
    detail = issue["detail_zh"]
    code = issue["code"]
    end_raw = rec["contract_end"].strip()
    open_ended = end_raw in ("无固定期限", "open-ended", "open")
    probm = int(rec["probation_months"])
    months = 0 if open_ended else term_months(rec["contract_start"], end_raw)
    cap = 6 if open_ended else cap_for(months)
    if code == "PROBATION_OVER_LIMIT":
        if f"试用期 {probm} 个月" not in detail or f"上限 {cap} 个月" not in detail:
            raise SystemExit(f"FATAL: probation detail drifted: {detail}")
        return f"{probm} mo", f"≤ {cap} mo"
    if code == "CONTRACT_EXPIRED":
        days = (dt.date.fromisoformat(end_raw) - AS_OF_DATE).days
        if days >= 0 or f"{-days} 天前" not in detail:
            raise SystemExit(f"FATAL: expired detail drifted: {detail}")
        return f"{days} d", "< 0 d"
    if code == "CONTRACT_EXPIRING":
        days = (dt.date.fromisoformat(end_raw) - AS_OF_DATE).days
        if days < 0 or days > 90 or f"还剩 {days} 天" not in detail:
            raise SystemExit(f"FATAL: expiring detail drifted: {detail}")
        return f"+{days} d", "≤ 90 d"
    if code == "PROBATION_PAY_BELOW_80":
        low = round(float(rec["probation_salary"]) * 100)
        high = round(float(rec["monthly_salary"]) * 100)
        if low * 100 >= high * 80:
            raise SystemExit(f"FATAL: row {issue['row']} is not below the 80% floor")
        ratio = round(low * 10_000 / high) / 100
        if f"{ratio:.2f}%" not in detail:
            raise SystemExit(f"FATAL: below-80 detail drifted: {detail}")
        return f"{ratio:.2f}%", "80%"
    if code == "CONTRACT_DATE_ORDER":
        return f"{months} mo", "≥ 0 mo"
    raise SystemExit(f"FATAL: unexpected issue code {code}")


ISSUE_VIEW = [(issue["code"], issue["row"], *issue_cells(issue)) for issue in BAT["issues"]]

# --------------------------------------------------------------------- hero

HERO = {
    "zh": dict(
        kicker="DeepSeek Harness · 劳动合同体检插件",
        kicker_size=18.5,
        title=["劳动合同体检"], title_size=86, title_baselines=[206],
        value=["九项必备条款，逐条给状态与证据句", "试用期上限与 80% 下限，按分计算"],
        value_size=30, value_baselines=[262, 304],
        sub="纯文本合同 + 员工 CSV → 带 sha256 的问题清单",
        sub_size=25, sub_baseline=352,
        meta="R0 只读 / R1 本地写 · 不联网 · 不调用模型",
        meta_size=20, meta_baseline=400,
        foot="Apache-2.0 · PerryLink DSH plugin family",
        foot_size=17, foot_baseline=466,
        panel_title="labor_check",
        panel_sub="九项必备条款 · 关键词 → 具体要素 → 三态判定",
        counts=f"命中 {SUMMARY['present']} · 待补 {SUMMARY['attention']} · 缺失 {SUMMARY['missing']}",
        scale_names=["试用期上限", "试用期工资", "竞业限制"],
        scale_values=[f"{PROB_MONTHS} / {CAP} 个月", PAY_RATIO,
                      "n/a" if NC_MONTHS is None else f"{NC_MONTHS} / {NC_CAP} 个月"],
        scale_notes=[
            f"{TERM['months']} 个月合同 → 上限 {CAP} 个月",
            f"{PAY_LOW} ÷ {PAY_HIGH} · 按分比较",
            ("按月补偿" if NC["compensation_mentioned"] else "未写按月补偿") + " · 期限 ≤ 2 年",
        ],
        strip=[f"labor_batch · {BATCH_ROWS} 行 → {ISSUES} 个问题 · 已过期 {DUE['expired']} / 90 天内 {DUE['expiring']}",
               f"labor_export · {EXP['rows']} 行 · {EXP['bytes']} B · sha256 {SHA_SHORT}"],
        body="cjk", bold="cjk_bold",
    ),
    "en": dict(
        kicker="DeepSeek Harness · labor-contract review plugin",
        kicker_size=17.5,
        title=["Labor", "contract"], title_size=88, title_baselines=[172, 262],
        value=["Nine required clauses, each with evidence",
               "Probation cap and 80% floor, in cents"],
        value_size=28, value_baselines=[312, 354],
        sub="Text + CSV in, sha256-stamped issue CSV out",
        sub_size=25, sub_baseline=400,
        meta="R0 read-only · R1 local write · offline · no model call",
        meta_size=20, meta_baseline=444,
        foot="Apache-2.0 · PerryLink DSH plugin family",
        foot_size=17, foot_baseline=498,
        panel_title="labor_check",
        panel_sub="nine clauses · keyword → specific → status",
        counts=f"present {SUMMARY['present']} · attention {SUMMARY['attention']} · missing {SUMMARY['missing']}",
        scale_names=["PROBATION", "PROBATION PAY", "NON-COMPETE"],
        scale_values=[f"{PROB_MONTHS} / {CAP} mo", PAY_RATIO,
                      "n/a" if NC_MONTHS is None else f"{NC_MONTHS} / {NC_CAP} mo"],
        scale_notes=[
            f"{TERM['months']}-mo term → cap {CAP} mo",
            f"{PAY_LOW} / {PAY_HIGH} = {PAY_RATIO}",
            ("monthly comp" if NC["compensation_mentioned"] else "no monthly comp") + " · cap 24 mo",
        ],
        strip=[f"labor_batch · {BATCH_ROWS} rows → {ISSUES} issues · expired {DUE['expired']} / expiring {DUE['expiring']}",
               f"labor_export · {EXP['rows']} rows · {EXP['bytes']} B · sha256 {SHA_SHORT}"],
        body="cjk", bold="cjk_bold",
    ),
}

CARD = (648, 40, 1392, 528)
CHIP_W, CHIP_H, CHIP_GAP_X, CHIP_GAP_Y = 224, 50, 12, 10
CHIP_X0, CHIP_Y0 = 672, 130
SCALE_W = 224
SCALE_X = (672, 908, 1144)


def hero(lang: str, skin_name: str) -> None:
    s = SKIN[skin_name]
    m = HERO[lang]
    w, h = 1440, 576
    img = gradient(w, h, s["bg_from"], s["bg_to"])
    img = glow(img, 1216, 24, 420, hx(s["accent"]), 20 if skin_name == "light" else 38)
    img = glow(img, 96, 566, 300, hx(s["accent"]), 8 if skin_name == "light" else 15)

    # --------------------------------------------------------- left column
    pill(img, (60, 46), m["kicker"], s, m["kicker_size"], m["body"],
         tag=f"{lang}.kicker")

    for line, base in zip(m["title"], m["title_baselines"]):
        text(img, (60, base), line, m["title_size"], m["bold"], s["text"],
             max_w=560, min_size=54, hard_min=79, tag=f"{lang}.title")

    for i, (line, base) in enumerate(zip(m["value"], m["value_baselines"])):
        text(img, (61, base), line, m["value_size"], m["bold"], s["text"],
             max_w=558, min_size=23, hard_min=24, tag=f"{lang}.value{i}")
    text(img, (61, m["sub_baseline"]), m["sub"], m["sub_size"], m["body"],
         s["sub"], max_w=558, min_size=18, hard_min=24.5, tag=f"{lang}.sub")
    text(img, (62, m["meta_baseline"]), m["meta"], m["meta_size"], m["body"],
         s["faint"], max_w=558, min_size=15, hard_min=19.6, tag=f"{lang}.meta")
    d = ImageDraw.Draw(img)
    d.line([62, m["foot_baseline"] - 34, 618, m["foot_baseline"] - 34],
           fill=hx(s["grid"]), width=2)
    text(img, (62, m["foot_baseline"]), m["foot"], m["foot_size"], "mono",
         s["faint"], max_w=558, min_size=13, tag=f"{lang}.foot")

    # --------------------------------------------------------- right card
    img = card(img, CARD, s, radius=22)
    d = ImageDraw.Draw(img)

    text(img, (672, 84), m["panel_title"], 21, "mono", s["text"], max_w=260,
         min_size=17, tag=f"{lang}.panel_title")
    text(img, (672, 108), m["panel_sub"], 13, m["body"], s["faint"],
         max_w=600, min_size=11, tag=f"{lang}.panel_sub")

    cw = measure(m["counts"], 12.5, m["body"])
    if cw + 30 > 300:
        FALLAS.append(f"{lang}.counts pill: {cw + 30:.0f}px")
    d.rounded_rectangle([1368 - cw - 30, 68, 1368, 102], radius=17, fill=hx(s["pill"]))
    text(img, (1368 - 15, 89), m["counts"], 12.5, m["body"], s["accent"],
         anchor="rs", max_w=280, min_size=10.5, tag=f"{lang}.counts")
    d.line([672, 120, 1368, 120], fill=hx(s["grid"]), width=2)

    # nine-clause coverage board
    for i, clause in enumerate(CLAUSES):
        col, row = i % 3, i // 3
        x = CHIP_X0 + col * (CHIP_W + CHIP_GAP_X)
        y = CHIP_Y0 + row * (CHIP_H + CHIP_GAP_Y)
        d.rounded_rectangle([x, y, x + CHIP_W, y + CHIP_H], radius=13,
                            fill=hx(s["zone"]), outline=hx(s["card_edge"]), width=2)
        badge(img, x + 24, y + CHIP_H / 2, 9, clause["status"], s)
        text(img, (x + 42, y + CHIP_H / 2 + 5), clause_label(clause, lang), 14,
             m["bold"], s["text"], max_w=CHIP_W - 54, min_size=10.5,
             tag=f"{lang}.chip{i}")

    d.line([672, 316, 1368, 316], fill=hx(s["grid"]), width=2)

    # three measurement scales (probation cap / 80% floor / non-compete)
    bar_y, bar_h = 378, 12
    for i in range(3):
        x = SCALE_X[i]
        text(img, (x, 344), m["scale_names"][i], 12.5, m["body"], s["faint"],
             max_w=SCALE_W - 6, min_size=10, tag=f"{lang}.scale_name{i}")
        text(img, (x + SCALE_W, 368), m["scale_values"][i], 18, m["bold"],
             s["accent"], anchor="rs", max_w=SCALE_W - 6, min_size=13,
             tag=f"{lang}.scale_value{i}")
        if i == 0:      # probation: one tick per allowed month
            if CAP > 0:
                pitch = SCALE_W / CAP
                for k in range(CAP):
                    fill = s["accent"] if k < PROB_MONTHS else s["track"]
                    rounded_bar(img, (x + k * pitch, bar_y, x + k * pitch + pitch - 6,
                                      bar_y + bar_h), fill, radius=4)
            else:
                rounded_bar(img, (x, bar_y, x + SCALE_W, bar_y + bar_h), s["track"])
        elif i == 1:    # probation pay: 0-100% track with an 80% threshold
            rounded_bar(img, (x, bar_y, x + SCALE_W, bar_y + bar_h), s["track"])
            ratio = min(PAY["ratio_pct"] or 0, 100.0) / 100.0
            rounded_bar(img, (x, bar_y, x + SCALE_W * ratio, bar_y + bar_h), s["accent"])
            tx = x + SCALE_W * 0.8
            d.line([tx, bar_y - 7, tx, bar_y + bar_h + 7], fill=hx(s["faint"]), width=2)
        else:           # non-compete: one tick per capped month (24)
            pitch = SCALE_W / NC_CAP
            for k in range(NC_CAP):
                filled = k < (NC_MONTHS or 0)
                rounded_bar(img, (x + k * pitch, bar_y, x + k * pitch + pitch - 3,
                                  bar_y + bar_h),
                            s["accent"] if filled else s["track"], radius=2.5)
        text(img, (x, 414), m["scale_notes"][i], 12, m["body"], s["sub"],
             max_w=SCALE_W - 4, min_size=9.5, tag=f"{lang}.scale_note{i}")

    d.line([672, 444, 1368, 444], fill=hx(s["grid"]), width=2)
    text(img, (672, 470), m["strip"][0], 12.5, m["body"], s["text"],
         max_w=696, min_size=10.5, tag=f"{lang}.strip0")
    text(img, (672, 492), m["strip"][1], 11.5, m["body"], s["faint"],
         max_w=696, min_size=10, tag=f"{lang}.strip1")

    img.save(os.path.join(OUT, f"dsh-labor-contract-hero-{lang}-{skin_name}.webp"),
             "WEBP", quality=92)
    print(f"wrote dsh-labor-contract-hero-{lang}-{skin_name}.webp")


# ------------------------------------------------------------- flow (SVG)

FLOW = {
    "light": dict(bg_from="#f9f6fd", bg_to="#e4eaf8", card="#ffffff",
                  edge="#e6e2f1", zone="#f5f2fb", text="#141419", sub="#4d5261",
                  faint="#8a8fa0", accent="#4B67B4", good="#16a34a",
                  warn="#bc4c00", danger="#b4442c", pill="#ece7f9",
                  track="#eae6f3", grid="#e7e4f0", dot="#d9d3ea"),
    "dark": dict(bg_from="#131a2a", bg_to="#0c1016", card="#1b2231",
                 edge="#2e374b", zone="#171e2d", text="#f0f3f9", sub="#a8b1c4",
                 faint="#767f92", accent="#8496f5", good="#3fb950",
                 warn="#d29922", danger="#f0885c", pill="#242d42",
                 track="#243049", grid="#1e2636", dot="#26314a"),
}

MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace"
SANS = ("ui-sans-serif, system-ui, -apple-system, 'Segoe UI', "
        "'Microsoft YaHei', sans-serif")

P = 44
TIERS = {
    "left": (44, 116, 688, 404),
    "right": (712, 116, 1056, 404),
    "issues": (44, 414, 636, 556),
    "receipt": (704, 414, 1056, 556),
}


def svg_text(x: float, y: float, s: str, size: float = 13, kind: str = "mono",
             fill: str = "#000", anchor: str = "start", weight: str | None = None,
             ls: float | None = None, budget: float | None = None,
             tag: str = "") -> str:
    if budget is not None:
        # the browser can resolve the family stack to a wider face than
        # Consolas/YaHei; keep a safety margin so nothing clips on GitHub.
        raw = measure(s, size, "mono" if kind == "mono" else "cjk")
        got = raw * (1.14 if kind == "mono" else 1.06)
        if ls:
            got += ls * max(0, len(s) - 1)
        if got > budget:
            FALLAS.append(f"svg {tag or s!r}: {got:.0f}px > {budget:.0f}px")
    attr = [f'x="{x:g}"', f'y="{y:g}"', f'fill="{fill}"',
            f'font-family="{MONO if kind == "mono" else SANS}"',
            f'font-size="{size:g}"']
    if anchor != "start":
        attr.append(f'text-anchor="{anchor}"')
    if weight:
        attr.append(f'font-weight="{weight}"')
    if ls:
        attr.append(f'letter-spacing="{ls:g}"')
    return f'<text {" ".join(attr)}>{escape(s)}</text>'


def srect(x0: float, y0: float, x1: float, y1: float, fill: str, r: float = 18,
          stroke: str | None = None, sw: float = 1.5, filt: bool = False,
          dash: str | None = None, opacity: float | None = None) -> str:
    a = [f'x="{x0:g}"', f'y="{y0:g}"', f'width="{x1 - x0:g}"',
         f'height="{y1 - y0:g}"', f'rx="{r:g}"', f'fill="{fill}"']
    if stroke:
        a += [f'stroke="{stroke}"', f'stroke-width="{sw:g}"']
    if dash:
        a.append(f'stroke-dasharray="{dash}"')
    if opacity is not None:
        a.append(f'opacity="{opacity:g}"')
    body = f'<rect {" ".join(a)}/>'
    return f'<g filter="url(#soft)">{body}</g>' if filt else body


def arrow(x1: float, y1: float, x2: float, y2: float, color: str,
          width: float = 2.0, head: float = 7) -> str:
    line = (f'<path d="M{x1:g} {y1:g}L{x2:g} {y2:g}" fill="none" '
            f'stroke="{color}" stroke-width="{width:g}" stroke-linecap="round"/>')
    tri = (f'<path d="M{x2 - head:g} {y2 - head * 0.62:g}'
           f'L{x2 - head:g} {y2 + head * 0.62:g}'
           f'L{x2:g} {y2:g} Z" fill="{color}"/>')
    return line + tri


def gate_mark(cx: float, cy: float, hit: bool, color: str, r: float = 6.4) -> str:
    """Clause gate mark: filled disc + white check when the gate matched."""
    if not hit:
        return (f'<circle cx="{cx:g}" cy="{cy:g}" r="{r:g}" fill="none" '
                f'stroke="{color}" stroke-width="1.6" opacity=".5"/>')
    return (f'<circle cx="{cx:g}" cy="{cy:g}" r="{r:g}" fill="{color}"/>'
            f'<path d="M{cx - r * 0.44:g} {cy + r * 0.02:g}L{cx - r * 0.1:g} {cy + r * 0.36:g}'
            f'L{cx + r * 0.46:g} {cy - r * 0.3:g}" fill="none" stroke="#ffffff" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')


def flow_svg(skin_name: str) -> str:
    s = FLOW[skin_name]
    shadow_op = "0.10" if skin_name == "light" else "0.55"
    shadow_col = "#1b1735" if skin_name == "light" else "#000000"
    g = s["grid"]
    left, right = TIERS["left"], TIERS["right"]
    issues_box, receipt = TIERS["issues"], TIERS["receipt"]
    p: list[str] = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="660" viewBox="0 0 1100 660" role="img" aria-labelledby="flowTitle flowDesc">
<title id="flowTitle">dsh-labor-contract structure: a three-tier local review bench, nine clause gates, three measurement scales, and a batch issue sheet that labor_export writes as a sha256-stamped CSV</title>
<desc id="flowDesc">Tier 01 clause bench: labor-contract.txt goes through labor_check (R0); each of the nine required clauses is tested twice, once for its keyword pattern and once for a concrete element, and lands on present, attention or missing; the quickstart fixture returns present 9, attention 0, missing 0. Tier 02 scales: the inclusive contract term in whole months picks the probation cap (under 3 months gives 0, 3 to 11 gives 1, 12 to 35 gives 2, 36 or more and open-ended give 6; fixture 36 months gives 6 against a 3-month probation), probation pay is compared in cents against the 80% floor (fixture 10800 of 12000 = 90.00%, so it passes), and the non-compete clause is measured against 24 months with a monthly-compensation prompt (fixture 24 months with compensation). Tier 03 issue sheet: employees.csv with seven columns and six rows goes through labor_batch (R0) with as_of 2026-11-02 and yields four issues, each shown as measured versus threshold; labor_export (R1) writes them as RFC 4180 CSV under $DSH_HOME/dsh-labor-contract/exports/labor-issues.csv, returning 4 rows, 566 bytes and a sha256 receipt. Everything is local: no network, no model call, not legal advice.</desc>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="{s['bg_from']}"/>
    <stop offset="1" stop-color="{s['bg_to']}"/>
  </linearGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="180%">
    <feDropShadow dx="0" dy="7" stdDeviation="10" flood-color="{shadow_col}" flood-opacity="{shadow_op}"/>
  </filter>
  <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
    <circle cx="1.4" cy="1.4" r="1.4" fill="{s['dot']}"/>
  </pattern>
</defs>
<rect width="1100" height="660" fill="url(#bg)"/>
<rect width="1100" height="660" fill="url(#dots)" opacity=".45"/>''']

    # ------------------------------------------------------------- header
    p.append(svg_text(P, 58, "dsh-labor-contract", 33, "mono", s["text"],
                      weight=700, budget=420, tag="title"))
    p.append(svg_text(P, 84, "9 clause gates · 4 probation tiers · 80% floor in cents · "
                             "5 issue codes", 13.5, "sans", s["sub"], budget=600,
                      tag="sub"))
    p.append(srect(664, 42, 1056, 76, s["pill"], r=17))
    p.append(svg_text(860, 63, "fixture 1 contract · 6 rows · as_of 2026-11-02",
                      12.5, "mono", s["accent"], anchor="middle", budget=370,
                      tag="pill"))
    p.append(f'<line x1="{P}" y1="102" x2="1056" y2="102" stroke="{g}" stroke-width="1.5"/>')

    # --------------------------------------------------- 01 clause bench
    p.append(srect(*left, s["zone"], r=20, stroke=s["edge"]))
    p.append(svg_text(64, 142, "01  CLAUSE BENCH · labor_check · R0", 12, "mono",
                      s["accent"], weight=700, ls=0.6, budget=420, tag="c-eyebrow"))
    p.append(svg_text(64, 164, "INPUT labor-contract.txt · plain text · read-only",
                      11.5, "mono", s["sub"], budget=560, tag="c-input"))

    for label, hx_ in (("clause", 64), ("keyword", 256), ("specific", 386), ("status", 526)):
        p.append(svg_text(hx_, 188, label, 11, "mono", s["faint"], ls=0.4,
                          budget=120, tag=f"c-hdr-{label}"))

    for i, clause in enumerate(CLAUSES):
        y = 210 + i * 21
        state = clause["status"]
        key_hit = state in ("present", "attention")       # keyword pattern matched
        spec_hit = state == "present"                     # concrete element matched
        color = {"present": s["good"], "attention": s["warn"], "missing": s["danger"]}[state]
        p.append(svg_text(64, y, clause["key"], 13, "mono", s["text"],
                          budget=150, tag=f"c-key-{clause['key']}"))
        p.append(gate_mark(262, y - 4.5, key_hit, color))
        p.append(gate_mark(392, y - 4.5, spec_hit, color))
        p.append(f'<rect x="514" y="{y - 13:g}" width="3" height="16" rx="1.5" fill="{color}"/>')
        p.append(svg_text(526, y, state, 12.5, "mono", color, budget=130,
                          tag=f"c-state-{clause['key']}"))

    p.append(f'<line x1="64" y1="382" x2="668" y2="382" stroke="{g}" stroke-width="1.4"/>')
    p.append(svg_text(64, 398, f"summary present {SUMMARY['present']} · attention "
                               f"{SUMMARY['attention']} · missing {SUMMARY['missing']}",
                      11.5, "mono", s["sub"], budget=420, tag="c-summary"))
    p.append(svg_text(668, 398, "keyword + element heuristic · human review",
                      11, "sans", s["faint"], anchor="end", budget=290, tag="c-note"))

    # ------------------------------------------------------- 02 scales
    p.append(srect(*right, s["zone"], r=20, stroke=s["edge"]))
    p.append(svg_text(728, 142, "02  SCALES · term · pay · cap", 12, "mono",
                      s["accent"], weight=700, ls=0.6, budget=320, tag="s-eyebrow"))

    # --- probation cap staircase: inclusive term months -> 0 / 1 / 2 / 6
    p.append(svg_text(728, 166, "PROBATION CAP", 11, "mono", s["faint"], ls=0.5,
                      budget=180, tag="s-cap-label"))
    p.append(svg_text(1040, 166, f"{TERM['months']} mo → {CAP} mo", 13, "mono",
                      s["accent"], anchor="end", budget=150, tag="s-cap-value"))
    x0, x1 = 728.0, 1040.0
    seg = (x1 - x0) / 4
    step_y = [226.0, 212.0, 196.0, 182.0]          # cap 0, 1, 2, 6
    d_path = [f'M{x0:g} {step_y[0]:g}']
    for k in range(1, 4):
        d_path.append(f'L{x0 + k * seg:g} {step_y[k - 1]:g}')
        d_path.append(f'L{x0 + k * seg:g} {step_y[k]:g}')
    d_path.append(f'L{x1:g} {step_y[3]:g}')
    p.append(f'<path d="{" ".join(d_path)}" fill="none" stroke="{s["accent"]}" '
             f'stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
    for k, (tier, cap) in enumerate((("<3", 0), ("3–11", 1), ("12–35", 2), ("≥36", 6))):
        cx = x0 + (k + 0.5) * seg
        p.append(f'<circle cx="{cx:g}" cy="{step_y[k]:g}" r="3.2" fill="{s["accent"]}"/>')
        p.append(svg_text(cx, 248, f"{tier} · {cap}", 11, "mono", s["sub"],
                          anchor="middle", budget=72, tag=f"s-tier{k}"))

    # --- 80% floor: cents compare on a 0-100% track
    p.append(svg_text(728, 274, "80% FLOOR", 11, "mono", s["faint"], ls=0.5,
                      budget=180, tag="s-pay-label"))
    p.append(svg_text(1040, 274, PAY_RATIO, 13, "mono", s["accent"], anchor="end",
                      budget=110, tag="s-pay-value"))
    ty0, ty1 = 286.0, 298.0
    p.append(f'<rect x="{x0:g}" y="{ty0:g}" width="{x1 - x0:g}" height="{ty1 - ty0:g}" '
             f'rx="6" fill="{s["track"]}"/>')
    ratio_w = (x1 - x0) * min(PAY["ratio_pct"] or 0, 100.0) / 100.0
    p.append(f'<rect x="{x0:g}" y="{ty0:g}" width="{ratio_w:.1f}" height="{ty1 - ty0:g}" '
             f'rx="6" fill="{s["accent"]}"/>')
    thr = x0 + (x1 - x0) * 0.8
    p.append(f'<line x1="{thr:g}" y1="{ty0 - 7:g}" x2="{thr:g}" y2="{ty1 + 7:g}" '
             f'stroke="{s["faint"]}" stroke-width="2"/>')
    p.append(svg_text(thr - 4, 313, "80%", 11, "mono", s["faint"], anchor="end",
                      budget=60, tag="s-pay-thr"))
    p.append(svg_text(x0, 330, f"cents {PAY_CENTS} ≥ {PAY_FLOOR} · exactly 80% passes",
                      11, "sans", s["sub"], budget=312, tag="s-pay-note"))

    # --- non-compete: 24 monthly ticks + compensation prompt
    p.append(svg_text(728, 350, "NON-COMPETE", 11, "mono", s["faint"], ls=0.5,
                      budget=180, tag="s-nc-label"))
    p.append(svg_text(1040, 350, "n/a" if NC_MONTHS is None else f"{NC_MONTHS} / {NC_CAP} mo",
                      13, "mono", s["accent"], anchor="end", budget=150, tag="s-nc-value"))
    pitch = (x1 - x0) / NC_CAP
    for k in range(NC_CAP):
        filled = k < (NC_MONTHS or 0)
        p.append(f'<rect x="{x0 + k * pitch:g}" y="362" width="{pitch - 3:g}" height="10" '
                 f'rx="2.5" fill="{s["accent"] if filled else s["track"]}"/>')
    comp = "monthly compensation ok" if NC["compensation_mentioned"] else "compensation missing"
    p.append(svg_text(x0, 394, f"{comp} · 2-year cap · prompt only",
                      11, "sans", s["sub"], budget=312, tag="s-nc-note"))

    # ---------------------------------------------------- 03 issue sheet
    p.append(srect(*issues_box, s["zone"], r=20, stroke=s["edge"]))
    p.append(svg_text(64, 438, "03  ISSUE SHEET · labor_batch · R0", 12, "mono",
                      s["accent"], weight=700, ls=0.6, budget=340, tag="i-eyebrow"))
    p.append(svg_text(616, 438, f"due {DUE['expired']} / {DUE['expiring']}", 11,
                      "mono", s["faint"], anchor="end", budget=140, tag="i-due"))
    p.append(svg_text(64, 458, "employees.csv · 7 columns · 6 rows · as_of 2026-11-02",
                      11, "mono", s["sub"], budget=560, tag="i-input"))
    for label, hx_ in (("row", 64), ("code", 104), ("measured", 356), ("against", 516)):
        p.append(svg_text(hx_, 478, label, 11, "mono", s["faint"], ls=0.4,
                          budget=160, tag=f"i-hdr-{label}"))

    for i, (code, row_no, measured, against) in enumerate(ISSUE_VIEW):
        y = 498 + i * 18
        p.append(svg_text(64, y, str(row_no), 12.5, "mono", s["sub"], budget=34,
                          tag=f"i-row{i}"))
        p.append(svg_text(104, y, code, 13, "mono", s["text"], budget=210,
                          tag=f"i-code{i}"))
        p.append(svg_text(356, y, measured, 13, "mono", s["text"], budget=120,
                          tag=f"i-measured{i}"))
        p.append(svg_text(516, y, against, 13, "mono", s["danger"], budget=120,
                          tag=f"i-against{i}"))

    # ------------------------------------------------ labor_export receipt
    p.append(srect(*receipt, s["card"], r=20, stroke=s["edge"], filt=True))
    p.append(svg_text(724, 438, "labor_export · R1", 12, "mono", s["accent"],
                      weight=700, ls=0.6, budget=280, tag="e-eyebrow"))
    p.append(svg_text(724, 466, "labor-issues.csv", 14, "mono", s["text"],
                      weight=700, budget=300, tag="e-name"))
    p.append(svg_text(724, 486, "$DSH_HOME/dsh-labor-contract/", 11, "mono",
                      s["faint"], budget=300, tag="e-path1"))
    p.append(svg_text(724, 502, "exports/labor-issues.csv", 11, "mono",
                      s["faint"], budget=300, tag="e-path2"))
    p.append(svg_text(724, 526, f"{EXP['rows']} rows · {EXP['bytes']} B · safe name",
                      12, "mono", s["sub"], budget=300, tag="e-metrics"))
    p.append(svg_text(724, 546, f"sha256 {EXP['sha256'][:12]}…", 11, "mono",
                      s["faint"], budget=300, tag="e-sha"))

    # issues[] -> labor_export
    p.append(arrow(636, 485, 702, 485, s["accent"], 2, head=6))
    p.append(svg_text(669, 474, "issues[4]", 11, "mono", s["sub"], anchor="middle",
                      budget=64, tag="e-arrow"))

    # ------------------------------------------------------------ footer
    p.append(svg_text(P, 582, "present = keyword + concrete element · attention = keyword only · "
                              "missing = no keyword — heuristics, always human-reviewed",
                      12, "mono", s["sub"], budget=1004, tag="foot1"))
    p.append(svg_text(P, 606, "cap by inclusive whole months: <3 → 0 · 3–11 → 1 · 12–35 → 2 · "
                              "≥36 or open-ended → 6 · unknown term → unknown, never guessed",
                      12, "sans", s["sub"], budget=1004, tag="foot2"))
    p.append(svg_text(P, 630, "expiry days = contract_end − as_of · <0 expired · ≤90 expiring · "
                              "cents compare · 2-year non-compete cap · no network · no model call · "
                              "not legal advice", 11.5, "sans", s["faint"], budget=1004,
                      tag="foot3"))
    p.append('</svg>')

    path = os.path.join(OUT, f"dsh-labor-contract-flow-v5-{skin_name}.svg")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(p) + "\n")
    print(f"wrote dsh-labor-contract-flow-v5-{skin_name}.svg")


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for skin_name in ("light", "dark"):
        for lang in ("zh", "en"):
            hero(lang, skin_name)
        flow_svg(skin_name)

    import xml.etree.ElementTree as ET

    for skin_name in ("light", "dark"):
        ET.parse(os.path.join(OUT, f"dsh-labor-contract-flow-v5-{skin_name}.svg"))

    if FALLAS:
        for f in FALLAS:
            print(f"FAIL {f}")
        return 1
    print("all layout budgets satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
