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
- HEIC：Safari（iPhone／Mac）可直接讀，iPhone 從相簿選照片時原檔直接交給網頁、不經轉檔，打勾後幾秒就回來；Chrome／Edge（含 Android）讀不到 HEIC，這類照片會標「無法讀取圖片」並略過，請先轉 JPG。
- 必須用 https（或 localhost）開，WebCodecs 與分享功能在 http 下會被瀏覽器關掉。

## 檔案

- `js/engine.js` 模型載入、YuNet 解碼＋NMS、SFace 特徵（與 OpenCV FaceDetectorYN／FaceRecognizerSF 同一套前處理）
- `js/pipeline.js` EXIF 排序、接力選臉、鏡像背景對齊、CIELAB 統一亮度膚色
- `js/styles.js` 四種美化風格（相框／色塊海報／弧形大字／塗鴉描邊），移植自 `styles.py`；英文字型內附（`assets/fonts/`），中文字型是 Big5 子集的 woff2（`tools/subset_cjk_fonts.py` 產生），主標含中文時才下載；塗鴉描邊的人像遮罩用 MediaPipe selfie segmenter，只在選了該風格時才載入（約 14 MB）
- `js/video.js` MP4（WebCodecs + mp4-muxer）、GIF（gifenc，最長邊 720）
- `js/app.js` 介面
- `models/` YuNet（MIT）、SFace（Apache 2.0）；YuNet 的輸入輸出尺寸改成動態、SFace 把 initializer 移出 graph.input，權重未改
- `vendor/` onnxruntime-web 1.30.0、exifr 7.1.3、mp4-muxer 5.2.2、gifenc 1.0.3（皆 MIT）、@mediapipe/tasks-vision 1.1.1（Apache 2.0）；明細見 `vendor/LICENSES.md`
