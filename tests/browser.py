"""Browser checks for the main workflows. Needs: pip install playwright && playwright install chromium
Run with: python3 tests/browser.py   (starts its own server on a temporary data folder)"""
import json, os, struct, subprocess, sys, tempfile, time, urllib.request, zlib, re, shutil
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad = 0
def T(ok, msg):
    global bad
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: bad += 1

def png(w=40, h=30):
    raw = b"".join(b"\x00" + bytes([200, 60, 20] * w) for _ in range(h))
    def ch(t, d): c = struct.pack(">I", len(d)) + t + d; return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")

data = tempfile.mkdtemp(prefix="gl-browser-")
img = os.path.join(data, "receipt.png"); open(img, "wb").write(png())
srv = subprocess.Popen(["node", os.path.join(ROOT, "server.js")], env=dict(os.environ, DATA_DIR=os.path.join(data, "d"), PORT="0"), stdout=subprocess.PIPE, text=True)
port = int(re.search(r"listening on (\d+)", srv.stdout.readline()).group(1))
URL = f"http://127.0.0.1:{port}/"
state = lambda: json.loads(urllib.request.urlopen(URL + "api/state").read())
def until(f, ms=8000):
    end = time.time() + ms / 1000
    while time.time() < end:
        try:
            if f(): return True
        except Exception: pass
        time.sleep(0.15)
    return False

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def device():
            ctx = b.new_context(viewport={"width": 400, "height": 820}); pg = ctx.new_page()
            pg.errors = []; pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.goto(URL); pg.wait_for_selector("#fab"); return pg
        A = device()

        # 1. add equipment
        A.click("#fab"); A.fill("#v_n", "Tacoma"); A.fill("#v_m", "2018 Toyota Tacoma"); A.click("#ok")
        T(until(lambda: len(state()["vehicles"]) == 1), "equipment added and saved to the server")
        A.wait_for_selector("#cancel"); T("Common reminders" in A.inner_text("#dbody"), "the app offers common reminders for the new equipment")
        A.click("#cancel")
        T(A.locator("text=Tacoma").first.is_visible(), "the new equipment shows in the garage")

        # 2. record maintenance, with a receipt
        A.locator("text=Tacoma").first.click(); A.wait_for_selector("#fab")
        A.evaluate("tab='service';render()")
        A.click("#fab"); A.wait_for_selector("#f_odo")
        A.fill("#f_odo", "52000"); A.fill("#f_notes", "Oil and filter"); A.fill("#f_by", "Me")
        A.set_input_files("#rf", img)
        T(until(lambda: A.locator("#rc img").count() == 1), "a receipt photo is attached to the form")
        A.click("#ok")
        T(until(lambda: len(state()["records"]) == 1), "the service record is saved")
        rec = state()["records"][0]
        T(rec.get("notes") == "Oil and filter" and str(rec.get("odo")) == "52000", "the record keeps its notes and odometer")
        T(len(rec.get("rc", [])) == 1 and rec["rc"][0].startswith("photos/"), "the receipt is stored as a file on the server")
        if rec.get("rc"):
            r = urllib.request.urlopen(URL + rec["rc"][0]); T(r.status == 200 and r.headers.get("Content-Type", "").startswith("image/") and len(r.read()) > 50, "the receipt file can be opened")
        T("Oil and filter" in A.inner_text("body"), "the record is listed on screen")

        # 3. a second device sees it
        B = device()
        T(until(lambda: B.locator("text=Tacoma").count() > 0), "a second device shows the same equipment")
        B.locator("text=Tacoma").first.click(); B.wait_for_selector("#fab"); B.evaluate("tab='service';render()")
        T(until(lambda: "Oil and filter" in B.inner_text("body")), "...and the maintenance record")
        T(until(lambda: B.evaluate("[...document.images].some(i=>i.naturalWidth>0)")), "...and the receipt image loads there")

        # 4. changes made on each device without syncing first are merged
        A.evaluate("tab='service';render()"); A.click("#fab"); A.wait_for_selector("#f_odo")
        A.fill("#f_odo", "53000"); A.fill("#f_notes", "Tire rotation from A"); A.click("#ok")
        B.click("#fab"); B.wait_for_selector("#f_odo")
        B.fill("#f_odo", "54000"); B.fill("#f_notes", "Brake check from B"); B.click("#ok")
        T(until(lambda: len(state()["records"]) == 3), "records added on two devices both end up on the server")
        notes = sorted(r.get("notes") for r in state()["records"])
        T(notes == ["Brake check from B", "Oil and filter", "Tire rotation from A"], "none of the three records was lost in the merge")
        A.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        T(until(lambda: "Brake check from B" in A.inner_text("body")), "device A picks up device B's record when it comes back to the app")
        B.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        T(until(lambda: "Tire rotation from A" in B.inner_text("body")), "device B picks up device A's record too")

        # 5. everything is still there after a reload
        A.reload(); A.wait_for_selector("#fab")
        T(A.locator("text=Tacoma").count() > 0, "after a reload the equipment is still there")
        T(A.errors == [] and B.errors == [], "no script errors on either device" + (" " + str(A.errors + B.errors) if A.errors or B.errors else ""))
        b.close()
finally:
    srv.terminate(); shutil.rmtree(data, ignore_errors=True)
print("ALL OK" if not bad else f"FAILURES: {bad}"); sys.exit(1 if bad else 0)
