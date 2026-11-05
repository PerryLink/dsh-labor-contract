#!/usr/bin/env python3
"""Generate README image assets for dsh-labor-contract (docs/assets/).

Outputs (idempotent overwrite):
  dsh-labor-contract-flow-light.svg / dsh-labor-contract-flow-dark.svg
      Hero pipeline diagram. Two hand-written SVG files (vector — never
      rasterized to webp). Text inside is command-surface tokens only
      (labor.check, labor.batch, labor.export, $DSH_HOME/exports, ...), so
      all five README languages share the same pair. The legacy single-skin
      docs/assets/dsh-labor-contract-flow.svg is intentionally left
      untouched so external links never 404.

No raster outputs for this repo: it is pure host-side tooling with no UI
screenshots to process and no benchmark dataset for an evidence chart
(acceptance rows live in ACCEPTANCE.csv and are quoted in the README text
instead). The CJK font probe below is kept from the family skeleton so a
future Pillow-rendered (raster) asset with Chinese text aborts loudly
instead of rendering tofu boxes; the SVG hero carries Latin tokens only.

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow only when raster charts are added; the SVG path does not
           use it (the bundled DSH runtime Python already ships Pillow).
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

# --- palette: PerryLink family (accent) + GitHub page backgrounds ----------
FAMILY = "#4B67B4"   # family accent (badges labelColor family uses #2B3245)
GREEN = {"light": "#16a34a", "dark": "#3fb950"}
ORANGE = {"light": "#bc4c00", "dark": "#d29922"}
WEBP_QUALITY = 90    # reserved for future raster charts
SKIN = {
    "light": dict(bg="#ffffff", box="#f6f8fa", border="#d0d7de",
                  text="#1f2328", sub="#57606a", track="#eaeef2"),
    "dark": dict(bg="#0d1117", box="#161b22", border="#30363d",
                 text="#f0f6fc", sub="#8b949e", track="#21262d"),
}

# --- CJK font probe: Chinese must never render as tofu boxes ----------------
# Only required when a raster (webp) chart is added; the SVG hero below
# carries Latin command tokens only. Kept from the family skeleton.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",      # Microsoft YaHei
    r"C:\Windows\Fonts\simhei.ttf",    # SimHei
    r"C:\Windows\Fonts\Deng.ttf",      # DengXian
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
]


def require_cjk_font() -> str:
    path = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
    if path is None:
        sys.exit("FATAL: no CJK font found (looked for msyh.ttc, simhei.ttf, "
                 "Deng.ttf, Noto Sans CJK, PingFang). Refusing to render "
                 "Chinese as tofu boxes; install one of the probed fonts "
                 "and re-run.")
    return path


# ---------------------------------------------------------------------------
# Hero pipeline SVG (light + dark): local input -> checks -> issue CSV
# ---------------------------------------------------------------------------
FLOW_NODES = [
    ("contract + CSV", "read-only input"),
    ("labor.check", "9 clauses · cap · 80%"),
    ("labor.batch", "cap · expiry · 90-day"),
    ("labor.export", "issue CSV · sha256"),
    ("$DSH_HOME/exports", "local write · R1"),
]


def flow_svg(skin: str) -> str:
    s = SKIN[skin]
    w, h = 1200, 360
    nw, nh, gap = 180, 96, 45
    y0 = 150
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="dsh-labor-contract '
        f'pipeline">',
        f'<title>dsh-labor-contract pipeline</title>',
        f'<rect width="{w}" height="{h}" rx="18" fill="{s["bg"]}"/>',
        f'<text x="60" y="62" fill="{s["text"]}" font-family="ui-sans-serif,'
        f'system-ui,sans-serif" font-size="30" font-weight="700">'
        f'dsh-labor-contract</text>',
        f'<text x="60" y="94" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="16">labor.check → labor.batch → '
        f'labor.export · local only · no network</text>',
        f'<line x1="60" y1="116" x2="1140" y2="116" stroke="{s["border"]}"/>',
    ]
    for i, (label, sub) in enumerate(FLOW_NODES):
        x = 60 + i * (nw + gap)
        accent = GREEN[skin] if i == len(FLOW_NODES) - 1 else (
            FAMILY if i in (1, 2, 3) else s["border"])
        parts.append(
            f'<rect x="{x}" y="{y0}" width="{nw}" height="{nh}" rx="14" '
            f'fill="{s["box"]}" stroke="{accent}" stroke-width="2"/>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 40}" fill="{s["text"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="15" font-weight="700">{label}</text>')
        parts.append(
            f'<text x="{x + nw // 2}" y="{y0 + 68}" fill="{s["sub"]}" '
            f'text-anchor="middle" font-family="ui-monospace,monospace" '
            f'font-size="12">{sub}</text>')
        if i < len(FLOW_NODES) - 1:
            ax = x + nw + 6
            ay = y0 + nh // 2
            parts.append(
                f'<path d="M{ax} {ay}h{gap - 12}" stroke="{s["sub"]}" '
                f'stroke-width="3"/>')
            parts.append(
                f'<path d="M{ax + gap - 14} {ay - 7}l10 7-10 7" fill="none" '
                f'stroke="{s["sub"]}" stroke-width="3" '
                f'stroke-linecap="round" stroke-linejoin="round"/>')
    parts.append(
        f'<text x="60" y="300" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="13">9 required clauses · probation cap · '
        f'80% floor · non-compete prompt · 90-day expiry window</text>')
    parts.append(
        f'<text x="60" y="328" fill="{s["sub"]}" font-family="ui-monospace,'
        f'monospace" font-size="13">R0 read-only · R1 local write · '
        f'no model call · not legal advice</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for skin in ("light", "dark"):
        with open(os.path.join(OUT, f"dsh-labor-contract-flow-{skin}.svg"),
                  "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
    print("wrote 2 SVG assets to docs/assets/")


if __name__ == "__main__":
    main()
