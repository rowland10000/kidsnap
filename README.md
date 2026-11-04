# KidSnap 瀏覽器版

純靜態網站：偵測（YuNet）、辨識（SFace）、對齊、調色、MP4／GIF 輸出全部在瀏覽器裡用 onnxruntime-web 與 WebCodecs 完成。沒有後端、沒有帳號、沒有費用，照片不會離開裝置。

## 本機測試

```
node web/dev_server.mjs        # http://127.0.0.1:8765/
```

`web/test/` 是數值驗證頁（與 Python 版對照），部署時可以不帶。

## 部署（免費）

整個 `web/` 資料夾放到任何靜態空間即可。GitHub Pages 的做法：

1. 把 `web/` 的內容推到 repo 的 `gh-pages` 分支（或 `main` 的 `/docs`），Settings → Pages 指到它。
2. 不需要任何 header 設定：ORT 用單執行緒 WASM，不依賴 COOP／COEP。
3. 模型 38.9 MB（SFace）＋ ORT 14 MB 只有第一次載入要下載，之後走瀏覽器快取；塗鴉描邊另外 14 MB，選到才載；主標打了中文才會載中文字型，粗黑體 4.9 MB／粗明體 6.8 MB／粗圓體 6.6 MB，各載一次。

## 瀏覽器支援

- MP4 需要 WebCodecs：Safari 16.4+（iPhone／Mac）、Chrome 94+、Edge 94+、Firefox 130+。不支援時改輸出 GIF。
- HEIC：Safari（iPhone／Mac）可直接讀，iPhone 從相簿選照片時原檔直接交給網頁、不經轉檔，打勾後幾秒就回來；Chrome／Edge（含 Android）讀不到 HEIC，這類照片會標「無法讀取圖片」並略過，請先轉 JPG。頁面載入時會用一張 2×2 的內嵌 HEIC 試解（`js/image.js` 的 `heicSupported()`，不看 User-Agent）：解不開就在標題下方顯示紅字提醒，丟照片頁的格式說明也會改成「支援 JPG／PNG（這個瀏覽器讀不到 HEIC）」。
- 必須用 https（或 localhost）開，WebCodecs 與分享功能在 http 下會被瀏覽器關掉。

## 隱私：拔掉 MediaPipe 內建的使用統計紀錄器（2026-11-04）

`vendor/mediapipe/vision_bundle.mjs`（@mediapipe/tasks-vision 1.1.1，壓縮成一行）內建一個紀錄器：建立任何 task（這裡是塗鴉描邊用的 ImageSegmenter）時會一起建立，把「初始化耗時、每次推論耗時、平台（從 User-Agent 判斷 Android／iPhone／Windows／Mac）、版本」排進佇列，**每 60 秒**把佇列編成 protobuf `POST https://odml.pa.googleapis.com/v1/log`，API key 從 wasm 內取出（`_mediapipeLoggerGetEncodedApiKey`）。2026-11-04 用無頭 Chrome 實測未改的版本：選了塗鴉描邊後第 62 秒送出 OPTIONS＋POST，Google 回 200。沒有照片，但與頁面上「照片不會離開這台裝置」的承諾衝突，所以直接在 bundle 裡改成 no-op，共三處（都在 `odml.pa.googleapis.com` 原本出現的位置附近，minified 名稱在其他版本會不同，找 `fetch(t.url` 和 `6e4` 就是了）：

| 原本 | 改成 |
|---|---|
| `async send(t,e,r){var n=this.h?new AbortController:void 0,…await fetch(t.url,{method:t.cb,…})…}`（HTTP 送出端） | `async send(t,e,r){}` |
| `Nh=class{constructor(t){this.i=[],this.o=new wh,this.l=t??"",this.h=setInterval(()=>{this.flush()},6e4)}` | `…this.h=void 0}`（不再每 60 秒 flush） |
| `flush(t,e){if(this.error)…this.o.send({url:"https://odml.pa.googleapis.com/v1/log",cb:"POST",…})…}` | `flush(t,e){this.i=[],t?.()}`（丟掉佇列） |

分割模型功能不受影響（改完後塗鴉描邊照常輸出）。**之後若更新 `@mediapipe/tasks-vision`，新的 `vision_bundle.mjs` 會把這三處蓋回去**，更新後必須重做並重跑下面的驗證。

驗證（改完或更新 vendor 後都要跑）：

```
grep -rn 'googleapis\|google\.com\|sendBeacon' web/vendor/     # 只允許剩 type.googleapis.com/…（protobuf 型別名，不是網址）
python3 -m http.server 8799 --directory web                       # 或 node web/dev_server.mjs
python3 web/tools/audit_network.py http://127.0.0.1:8799/ 80       # 跑完整流程含塗鴉描邊，等 80 秒，印出所有網域；non_site_requests 必須是 []
```

`audit_network.py` 需要 `pip install websockets` 與本機的 Google Chrome，用 `../demo/照片` 前 4 張當測試照片。

## 檔案

- `js/engine.js` 模型載入、YuNet 解碼＋NMS、SFace 特徵（與 OpenCV FaceDetectorYN／FaceRecognizerSF 同一套前處理）
- `js/pipeline.js` EXIF 排序、接力選臉、鏡像背景對齊、CIELAB 統一亮度膚色
- `js/styles.js` 四種美化風格（相框／色塊海報／弧形大字／塗鴉描邊），移植自 `styles.py`；英文字型內附（`assets/fonts/`），中文字型是 Big5 子集的 woff2（`tools/subset_cjk_fonts.py` 產生），主標含中文時才下載；塗鴉描邊的人像遮罩用 MediaPipe selfie segmenter，只在選了該風格時才載入（約 14 MB）
- `js/video.js` MP4（WebCodecs + mp4-muxer）、GIF（gifenc，最長邊 720）
- `js/app.js` 介面
- `tools/audit_network.py` 無頭 Chrome 跑完整流程並列出所有網路請求的網域（見上節）
- `models/` YuNet（MIT）、SFace（Apache 2.0）；YuNet 的輸入輸出尺寸改成動態、SFace 把 initializer 移出 graph.input，權重未改
- `vendor/` onnxruntime-web 1.30.0、exifr 7.1.3、mp4-muxer 5.2.2、gifenc 1.0.3（皆 MIT）、@mediapipe/tasks-vision 1.1.1（Apache 2.0）；明細見 `vendor/LICENSES.md`
