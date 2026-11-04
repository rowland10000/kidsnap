#!/bin/bash
# 部署前的守門檢查：確認 vendor/ 裡沒有任何會對外送資料的程式。
#
# 為什麼需要這個：vendor/mediapipe/vision_bundle.mjs 是 Google MediaPipe 的壓縮檔，
# 原版內含每 60 秒把使用統計 POST 到 odml.pa.googleapis.com 的程式。我們把送出的
# 三處改成 no-op。那個檔案不會自己更新，但只要有人重新下載一份乾淨的 MediaPipe
# 覆蓋上去，修改就會無聲消失，而頁面上「照片不會上傳」的承諾會變成不實。
#
# 這支腳本讓那種情況變成「部署失敗」，而不是「沒人發現」。
#
# 只檢查文字檔。wasm 二進位檔裡本來就含有那個網址字串與 API key（我們沒有改 wasm），
# 但送出請求的程式在 JS 這一層，JS 被改成 no-op 之後 wasm 裡的字串就是死的。
# 這一點有實際抓封包驗證過，見 README。
#
# 用法： bash tools/check_no_outbound.sh        （在 web/ 底下執行）
# 回傳： 0 = 乾淨可以部署； 1 = 發現問題，不要部署

set -u
cd "$(dirname "$0")/.." || exit 1

FAIL=0
MP=vendor/mediapipe/vision_bundle.mjs

# 允許清單：這些是字串比對用的命名空間或 protobuf 型別名，不是會被請求的網址。
# 新增任何一條之前，請先確認它真的不會發出請求。
ALLOW='type\.googleapis\.com|ns\.adobe\.com|www\.w3\.org|purl\.org'

echo "一、掃 vendor/ 的文字檔有沒有對外網址或送出函式"

HITS=$(grep -rInoE '[a-zA-Z0-9.-]*googleapis\.com[a-zA-Z0-9./_-]*|[a-zA-Z0-9.-]*google\.com[a-zA-Z0-9./_-]*|sendBeacon|new WebSocket' vendor/ 2>/dev/null \
  | grep -vE "$ALLOW" || true)

if [ -n "$HITS" ]; then
  echo "  ✗ 發現可疑的對外程式："
  echo "$HITS" | sed 's/^/    /'
  FAIL=1
else
  echo "  ✓ 沒有"
fi

echo "二、確認 MediaPipe 的三處 no-op 還在"

if [ ! -f "$MP" ]; then
  echo "  ✗ 找不到 $MP"
  FAIL=1
else
  if grep -q 'async send(t,e,r){}' "$MP"; then
    echo "  ✓ 送出函式仍是 no-op"
  else
    echo "  ✗ 找不到 'async send(t,e,r){}' —— 送出函式的 no-op 不見了"
    FAIL=1
  fi

  if grep -q 'setInterval(()=>{this.flush()},6e4)' "$MP"; then
    echo "  ✗ 60 秒計時器又回來了"
    FAIL=1
  else
    echo "  ✓ 60 秒計時器仍被拿掉"
  fi

  if grep -q 'url:"https://odml.pa.googleapis.com/v1/log"' "$MP"; then
    echo "  ✗ flush() 裡送往 odml.pa.googleapis.com 的那段又回來了"
    FAIL=1
  else
    echo "  ✓ flush() 仍是 no-op"
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✓ 乾淨，可以部署。"
else
  echo "✗ 部署已中止。"
  echo "  最可能的原因：有人重新下載了乾淨版的 MediaPipe，把修改蓋掉了。"
  echo "  處理方式寫在 README 的「隱私：拔掉 MediaPipe 內建的使用統計紀錄器」一節。"
  echo "  完整驗證（實際抓封包）： python3 tools/audit_network.py http://127.0.0.1:8799/ 80"
fi

exit "$FAIL"
