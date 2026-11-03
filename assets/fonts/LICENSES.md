# 字型授權

全部來自 Google Fonts，可免費商用、可內嵌於 app。

| 檔案 | 字型 | 授權 | 用途 |
|---|---|---|---|
| Poppins-ExtraBold.ttf | Poppins | SIL OFL 1.1 | 小寫疊排標題、藥丸貼紙 |
| ArchivoBlack-Regular.ttf | Archivo Black | SIL OFL 1.1 | 海報標題、弧形大字、圓章數字 |
| BagelFatOne-Regular.ttf | Bagel Fat One | SIL OFL 1.1 | 圓胖標題、弧形大字 |
| Anton-Regular.ttf | Anton | SIL OFL 1.1 | 高瘦粗體：側邊直排、弧形大字 |
| Yellowtail-Regular.ttf | Yellowtail | Apache 2.0 | 英文「草寫」（預設） |
| BarlowCondensed-SemiBold.ttf | Barlow Condensed | SIL OFL 1.1 | 加字距的小字 |
| DMMono-Medium.ttf | DM Mono | SIL OFL 1.1 | 等寬小字 |
| NotoSansTC-Black.woff2 | Noto Sans TC（字重 900 靜態化、Big5 子集） | SIL OFL 1.1 | 中文主標「粗黑體」（預設） |
| NotoSerifTC-Black.woff2 | Noto Serif TC（字重 900 靜態化、Big5 子集） | SIL OFL 1.1 | 中文主標「粗明體」 |
| GenSenRounded2TW-H.woff2 | 源泉圓體 TW Heavy（Big5 子集） | SIL OFL 1.1 | 中文主標「粗圓體」 |
| CoveredByYourGrace.ttf | Covered By Your Grace | SIL OFL 1.1 | 塗鴉描邊的手寫字 |

來源：https://github.com/google/fonts （各字型資料夾內附完整授權全文）；
源泉圓體來自 https://github.com/ButTaiwan/gensen-font

三套中文字型用 `web/tools/subset_cjk_fonts.py` 從 `assets/fonts/` 的原檔切出 Big5 全字集（含常用符號），OFL 允許子集化與內嵌。

介面另透過 Google Fonts CSS 載入 Lilita One、Rubik、Noto Sans TC（皆 SIL OFL 1.1）。
