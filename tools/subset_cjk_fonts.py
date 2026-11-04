"""把 assets/fonts 的三套中文字型切成瀏覽器版用的 woff2 子集（Big5 全字集＋常用符號）。
用法：.venv/bin/python web/tools/subset_cjk_fonts.py
"""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "fonts"
DST = ROOT / "web" / "assets" / "fonts"

FONTS = [
    ("NotoSansTC[wght].ttf", "NotoSansTC-Black.woff2", 900),
    ("NotoSerifTC[wght].ttf", "NotoSerifTC-Black.woff2", 900),
    ("GenSenRounded2TW-H.ttf", "GenSenRounded2TW-H.woff2", None),
]


def charset():
    chars = set()
    for hi in range(0xA1, 0xFA):
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try:
                chars.add(bytes([hi, lo]).decode("big5"))
            except UnicodeDecodeError:
                pass
    for a, b in [(0x20, 0x7F), (0xA0, 0x100), (0x2000, 0x2070), (0x2190, 0x21FF), (0x2460, 0x2500),
                 (0x2600, 0x2700), (0x3000, 0x3040), (0xFF00, 0xFFF0)]:
        chars.update(chr(c) for c in range(a, b))
    return "".join(sorted(chars))


def main():
    text = charset()
    DST.mkdir(parents=True, exist_ok=True)
    for src, dst, wght in FONTS:
        font = TTFont(SRC / src)
        if wght is not None:
            font = instancer.instantiateVariableFont(font, {"wght": wght})
        opts = subset.Options(flavor="woff2", notdef_outline=True, layout_features=[], hinting=False)
        opts.drop_tables += ["vhea", "vmtx", "BASE", "GSUB", "GPOS", "GDEF"]
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(font)
        font.save(DST / dst)
        print(f"{dst}: {(DST / dst).stat().st_size / 1e6:.2f} MB, {len(font.getGlyphOrder())} glyphs")


if __name__ == "__main__":
    main()
