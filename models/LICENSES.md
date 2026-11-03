# 模型授權

兩個模型都來自 OpenCV Zoo，可免費商用，只需要 OpenCV（4.5.4 以上）即可執行。

| 檔案 | 模型 | 授權 | 用途 |
|---|---|---|---|
| face_detection_yunet_2023mar.onnx | YuNet（Shiqi Yu） | MIT（LICENSE_face_detection_yunet） | 臉部偵測＋五點（雙眼、鼻、嘴角），對齊用 |
| face_recognition_sface_2021dec.onnx | SFace | Apache 2.0（LICENSE_face_recognition_sface） | 128 維臉部特徵，判斷是不是目標人物 |

來源：https://github.com/opencv/opencv_zoo

- 相似度：餘弦，官方建議門檻 0.363（face_align.py 的 SIM_THRESHOLD）
- 2026-10-05 起取代 InsightFace buffalo_l（該模型僅限非商業研究，不能用於對外產品）
- 塗鴉描邊風格的人像分割仍用 MediaPipe Selfie Segmentation（Apache 2.0）

## selfie_segmenter.tflite

- 來源：Google MediaPipe Image Segmenter 模型（https://developers.google.com/mediapipe/solutions/vision/image_segmenter）
- 授權：Apache License 2.0
- 用途：「塗鴉描邊」風格的人像遮罩，只在選了該風格時才下載
