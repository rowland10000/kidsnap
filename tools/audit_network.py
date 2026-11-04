# 用無頭 Chrome 跑完整流程並列出每一個網路請求的網域，確認只有本站。
#   python3 tools/audit_network.py <網址> [等待秒數=80] [照片資料夾=../demo/照片]
# 流程：載入 → 第 1 張設主角 → 第 2~4 張對齊 → 塗鴉描邊（會載 MediaPipe）→ 輸出 MP4 → 從載入分割模型起算等滿「等待秒數」
# 等待是為了 MediaPipe 內建的紀錄器：它原本每 60 秒把使用統計 POST 到 odml.pa.googleapis.com（見 README）。
# 需要 pip install websockets；Chrome 路徑可用環境變數 CHROME 覆寫。
import asyncio, json, subprocess, sys, time, urllib.request, os, glob, tempfile, shutil
import websockets

CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PORT = 9333
URL = sys.argv[1]
WAIT = int(sys.argv[2]) if len(sys.argv) > 2 else 80
PHOTOS = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), "..", "..", "demo", "照片")
SITE = URL.split("/")[2]

class CDP:
    def __init__(self, ws): self.ws = ws; self.n = 0; self.pending = {}; self.reqs = {}; self.fails = []
    async def run(self):
        async for raw in self.ws:
            m = json.loads(raw)
            if "id" in m:
                fut = self.pending.pop(m["id"], None)
                if fut: fut.set_result(m)
            else: self.on_event(m)
    def on_event(self, m):
        p = m.get("params", {}); meth = m["method"]
        if meth == "Network.requestWillBeSent":
            self.reqs[p["requestId"]] = {"url": p["request"]["url"], "method": p["request"]["method"], "t": time.time(), "status": None, "bytes": 0}
        elif meth == "Network.responseReceived":
            r = self.reqs.get(p["requestId"])
            if r: r["status"] = p["response"]["status"]
        elif meth == "Network.loadingFinished":
            r = self.reqs.get(p["requestId"])
            if r: r["bytes"] = p.get("encodedDataLength", 0)
        elif meth == "Network.loadingFailed":
            r = self.reqs.get(p["requestId"], {})
            self.fails.append({"url": r.get("url"), "error": p.get("errorText"), "blocked": p.get("blockedReason")})
    async def send(self, method, params=None):
        self.n += 1; i = self.n
        fut = asyncio.get_event_loop().create_future(); self.pending[i] = fut
        await self.ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
        m = await asyncio.wait_for(fut, 120)
        if "error" in m: raise RuntimeError(f"{method}: {m['error']}")
        return m.get("result", {})
    async def eval(self, expr):
        r = await self.send("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in r: raise RuntimeError(json.dumps(r["exceptionDetails"], ensure_ascii=False)[:500])
        return r.get("result", {}).get("value")
    async def wait_for(self, expr, timeout=120, every=0.5):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if await self.eval(expr): return time.time() - t0
            await asyncio.sleep(every)
        raise TimeoutError(expr)
    async def set_files(self, selector, paths):
        doc = await self.send("DOM.getDocument", {"depth": 1})
        node = await self.send("DOM.querySelector", {"nodeId": doc["root"]["nodeId"], "selector": selector})
        await self.send("DOM.setFileInputFiles", {"files": paths, "nodeId": node["nodeId"]})

async def main():
    photos = sorted(glob.glob(os.path.join(PHOTOS, "*.jp*g")) + glob.glob(os.path.join(PHOTOS, "*.png")))
    assert len(photos) >= 4, f"{PHOTOS} 至少要 4 張 jpg/png"
    profile = tempfile.mkdtemp(prefix="kidsnap_audit_")
    def stage(path):   # 無頭 Chrome 讀不到 ~/Documents 等受保護資料夾裡的檔案，先複製到暫存區
        dst = os.path.join(profile, os.path.basename(path)); shutil.copy(path, dst); return dst
    chrome = subprocess.Popen([CHROME, "--headless=new", "--enable-unsafe-swiftshader", "--no-first-run", f"--user-data-dir={profile}", f"--remote-debugging-port={PORT}", "--window-size=1280,900", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list")); break
            except Exception: await asyncio.sleep(0.2)
        page = [t for t in tabs if t["type"] == "page"][0]
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
            c = CDP(ws); asyncio.create_task(c.run())
            await c.send("Network.enable"); await c.send("Page.enable"); await c.send("Runtime.enable")
            out = {"url": URL, "chrome": (await c.send("Browser.getVersion"))["product"]}
            await c.send("Page.navigate", {"url": URL})
            out["model_ready_s"] = round(await c.wait_for("document.querySelector('#model-status')?.innerText.includes('模型就緒')", 300), 1)
            out["heic_note"] = await c.eval("(()=>{const n=document.querySelector('#heic-note');return n&&!n.hidden?n.innerText:null})()")
            out["drop_sub"] = await c.eval("document.querySelector('#drop-sub')?.innerText")
            tried = {}
            for ref in photos:   # 找第一張只有一張臉的當主角
                await c.eval("document.querySelector('#ref-status').innerText='偵測中…'; 1")
                await c.set_files("#ref-file", [stage(ref)])
                await c.wait_for("!/偵測中/.test(document.querySelector('#ref-status')?.innerText||'')", 60)
                tried[os.path.basename(ref)] = await c.eval("document.querySelector('#ref-status').innerText")
                if "已設定" in tried[os.path.basename(ref)]: break
            else: raise RuntimeError("沒有一張照片能當主角: " + json.dumps(tried, ensure_ascii=False))
            out["ref_photo"] = os.path.basename(ref)
            await c.set_files("#batch-files", [stage(p) for p in photos if p != ref][:3])
            await asyncio.sleep(1); await c.eval("document.querySelector('#batch-run').click(); 1")
            await c.wait_for("document.querySelector('#batch-run').disabled===false && document.querySelector('#batch-status').innerText.includes('完成')", 180)
            out["batch_status"] = await c.eval("document.querySelector('#batch-status').innerText")
            await c.eval("document.querySelectorAll('.tabs [role=tab]').forEach(b=>{ if(b.innerText.includes('加風格')) b.click(); }); [...document.querySelectorAll('#style-chips *')].filter(e=>e.innerText.trim().startsWith('塗鴉')).slice(0,1).forEach(e=>e.click()); 1")
            tseg = time.time()
            await c.wait_for("(document.querySelector('#style-status')?.innerText||'').length>0 && !/載入|下載|中…/.test(document.querySelector('#style-status').innerText)", 300, 1)
            out["doodle_status"] = await c.eval("document.querySelector('#style-status')?.innerText")
            await c.eval("document.querySelector('#export-run').click(); 1")
            await c.wait_for("!document.querySelector('#export-run').disabled && /完成|失敗|錯誤|不支援/.test(document.querySelector('#export-status')?.innerText||'')", 300, 1)
            out["export_status"] = await c.eval("document.querySelector('#export-status')?.innerText")
            out["wait_after_segmenter_s"] = WAIT
            await asyncio.sleep(max(0, WAIT - (time.time() - tseg)))
            hosts = {}
            for r in c.reqs.values():
                if r["url"].startswith(("data:", "blob:")): continue
                h = r["url"].split("/")[2]; hosts.setdefault(h, [0, 0]); hosts[h][0] += 1; hosts[h][1] += r["bytes"]
            out["hosts(requests, bytes)"] = hosts
            out["non_site_requests"] = [{"t_after_segmenter_s": round(r["t"] - tseg, 1), "method": r["method"], "url": r["url"], "status": r["status"]} for r in c.reqs.values() if SITE not in r["url"] and not r["url"].startswith(("data:", "blob:"))]
            out["failed_requests"] = c.fails
            print(json.dumps(out, ensure_ascii=False, indent=1))
    finally:
        chrome.terminate(); subprocess.run(["rm", "-rf", profile])
asyncio.run(main())
