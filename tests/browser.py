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
servers = []
def start_server(name):
    p = subprocess.Popen(["node", os.path.join(ROOT, "server.js")], env=dict(os.environ, DATA_DIR=os.path.join(data, name), PORT="0"), stdout=subprocess.PIPE, text=True)
    servers.append(p)
    return f"http://127.0.0.1:{int(re.search(r'listening on (\d+)', p.stdout.readline()).group(1))}/"
def call(url, path, body=None, tok=None, method=None):
    h = {"Content-Type": "application/json"}
    if tok: h["Authorization"] = "Bearer " + tok
    r = urllib.request.Request(url + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    try: return json.loads(urllib.request.urlopen(r).read() or b"{}")
    except urllib.error.HTTPError as e: return {"status": e.code}
URL = start_server("main")
state = lambda: json.loads(urllib.request.urlopen(URL + "api/state").read())
PUMP = []
def until(f, ms=8000):
    end = time.time() + ms / 1000
    while time.time() < end:
        try:
            if f(): return True
        except Exception: pass
        (PUMP[0].wait_for_timeout(150) if PUMP else time.sleep(0.15))   # waiting through the browser keeps its dialogs and events handled
    return False

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(); PUMP.append(b.new_page())
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

        # 6. backup file -> restore through the app's own buttons, on an empty server (photos travel inside the backup)
        A.evaluate("dataForm()")
        A.click("details[data-g=backup] > summary")
        with A.expect_download() as dl: A.click("#dlb")
        bk = os.path.join(data, "backup.json"); dl.value.save_as(bk)
        saved = json.load(open(bk))
        T(len(saved["records"]) == 3 and len(saved["vehicles"]) == 1, "the downloaded backup holds the equipment and all three records")
        T(any(str(x).startswith("data:image") for r in saved["records"] for x in r.get("rc", [])), "...with the receipt photo inside it")
        URL2 = start_server("fresh")
        C = b.new_context(viewport={"width": 400, "height": 820}).new_page(); C.errors = []; C.on("pageerror", lambda e: C.errors.append(str(e)))
        msgs = []; C.on("dialog", lambda d: (msgs.append(d.message), d.accept()))
        C.goto(URL2); C.wait_for_selector("#fab"); C.evaluate("dataForm()")
        C.click("details[data-g=backup] > summary"); C.set_input_files("#rf", bk)
        T(until(lambda: len(json.loads(urllib.request.urlopen(URL2 + "api/state").read())["records"]) == 3, 12000), "restoring the backup file puts all records on the empty server")
        st2 = json.loads(urllib.request.urlopen(URL2 + "api/state").read()); 
        rc = [x for r in st2["records"] for x in r.get("rc", [])]
        T(len(rc) == 1 and rc[0].startswith("photos/"), "the receipt photo inside the backup became a real file again")
        if rc: T(urllib.request.urlopen(URL2 + rc[0]).status == 200, "...and it can be opened")
        bad_file = os.path.join(data, "bad.json"); open(bad_file, "w").write('{"hello": 1}')
        before = len(json.loads(urllib.request.urlopen(URL2 + "api/state").read())["records"])
        C.evaluate("dataForm()"); C.click("details[data-g=backup] > summary"); C.set_input_files("#rf", bad_file); C.wait_for_timeout(600)
        T(len(json.loads(urllib.request.urlopen(URL2 + "api/state").read())["records"]) == before, "a file that isn't a backup changes nothing")
        T(C.errors == [], "no script errors while restoring")

        # 7. barcode / VIN scan (the browser's detector is replaced by a stand-in, since a headless browser has none)
        def scan_page(stub):
            ctx = b.new_context(viewport={"width": 400, "height": 820})
            if stub: ctx.add_init_script(stub)
            pg = ctx.new_page(); pg.errors = []; pg.on("pageerror", lambda e: pg.errors.append(str(e))); pg.alerts = []
            pg.on("dialog", lambda d: (pg.alerts.append(d.message), d.accept()))
            pg.goto(URL2); pg.wait_for_selector("#fab"); pg.click("#fab"); pg.wait_for_selector("#v_scan"); return pg
        D = scan_page("window.BarcodeDetector=class{async detect(){return[{rawValue:' 1ftfw1et5dfc10312 '}]}}")
        with D.expect_file_chooser() as fc: D.click("#v_scan")
        fc.value.set_files(img)
        T(until(lambda: D.input_value("#v_vin") == "1FTFW1ET5DFC10312"), "scanning fills the VIN box, trimmed and in capitals")
        D2 = scan_page("window.BarcodeDetector=class{async detect(){return[{rawValue:'I1FTFW1ET5DFC10312'}]}}")
        with D2.expect_file_chooser() as fc: D2.click("#v_scan")
        fc.value.set_files(img)
        T(until(lambda: D2.input_value("#v_vin") == "1FTFW1ET5DFC10312"), "a VIN printed with a leading I (18 characters) is corrected to 17")
        D3 = scan_page("window.BarcodeDetector=class{async detect(){return[]}}")
        with D3.expect_file_chooser() as fc: D3.click("#v_scan")
        fc.value.set_files(img)
        T(until(lambda: any("Couldn't read" in m for m in D3.alerts)) and D3.input_value("#v_vin") == "", "a photo with no barcode gives a clear message and leaves the box empty")
        D4 = scan_page("delete window.BarcodeDetector")
        D4.click("#v_scan")
        T(until(lambda: any("Type it in" in m for m in D4.alerts)), "a browser without a barcode reader (like Safari) is told to type it in")
        T(all(p.errors == [] for p in (D, D2, D3, D4)), "no script errors while scanning")

        # 8. accounts: sign-in, separate garages, private photos, signing out everywhere
        URL3 = start_server("accounts")
        tok = call(URL3, "api/accounts/setup", {"user": "mike", "pass": "password1"})["token"]
        call(URL3, "api/users", {"user": "kim", "pass": "kimspass1"}, tok)
        def signin(user, pw, expect=True):
            pg = b.new_context(viewport={"width": 400, "height": 820}).new_page(); pg.errors = []; pg.on("pageerror", lambda e: pg.errors.append(str(e)))
            pg.goto(URL3); pg.wait_for_selector("#lg_u"); pg.fill("#lg_u", user); pg.fill("#lg_p", pw); pg.click("#lg_go")
            if expect: pg.wait_for_selector("#lg_u", state="detached"); pg.wait_for_selector("#fab")
            return pg
        M0 = b.new_context().new_page(); M0.goto(URL3); M0.wait_for_selector("#lg_u")
        T(M0.locator("#lg_u").is_visible() and "Mike" not in M0.inner_text("body"), "with accounts on, the app asks for a sign-in first")
        W = signin("mike", "wrongpass1", False); W.wait_for_selector("#lg_m:not(:empty)")
        T("Wrong" in W.inner_text("#lg_m") or "wrong" in W.inner_text("#lg_m"), "a wrong password is refused with a message")
        M = signin("mike", "password1")
        M.click("#fab"); M.fill("#v_n", "Mike's Truck"); M.click("#ok"); M.wait_for_selector("#cancel"); M.click("#cancel")
        M.locator("text=Mike's Truck").first.click(); M.wait_for_selector("#fab"); M.evaluate("tab='service';render()")
        M.click("#fab"); M.wait_for_selector("#f_odo"); M.fill("#f_odo", "1000"); M.fill("#f_notes", "Mike's private receipt"); M.set_input_files("#rf", img)
        T(until(lambda: M.locator("#rc img").count() == 1), "mike attaches a receipt to his record")
        M.click("#ok")
        tm = call(URL3, "api/login", {"user": "mike", "pass": "password1"})["token"]
        T(until(lambda: len(call(URL3, "api/state", tok=tm).get("records", [])) == 1), "mike's record is saved to his account")
        M.reload(); M.wait_for_selector("#fab"); M.locator("text=Mike's Truck").first.click(); M.wait_for_selector("#fab"); M.evaluate("tab='service';render()")
        T(until(lambda: M.evaluate("[...document.images].some(i=>i.naturalWidth>0)")), "his receipt photo still shows after a reload (the private link works)")
        K = signin("kim", "kimspass1")
        T(K.locator("text=Mike's Truck").count() == 0, "kim's garage is empty: she can't see mike's equipment")
        rcfile = call(URL3, "api/state", tok=tm)["records"][0]["rc"][0]
        code = K.evaluate("async u=>{const r=await fetch(u,{headers:{Authorization:'Bearer '+localStorage.getItem('garagelog-tok')}});return r.status}", URL3 + rcfile)
        T(code == 404, f"(got {code}) kim's signed-in browser can't open mike's receipt")
        anon = b.new_context().new_page(); T(anon.goto(URL3 + rcfile).status in (401, 403, 404), "and neither can someone who isn't signed in")
        # sign out of every device from mike's phone: the other device is signed out too
        M2 = signin("mike", "password1")
        M.evaluate("settings()") if False else None
        call(URL3, "api/account/signout-all", {}, tm, "POST")
        M2.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); M2.reload()
        T(until(lambda: M2.locator("#lg_u").count() > 0), "after \"sign out of every device\" other devices are asked to sign in again")
        T(all(p.errors == [] for p in (M, K)), "no script errors in accounts mode")
        b.close()
finally:
    for p in servers: p.terminate()
    shutil.rmtree(data, ignore_errors=True)
print("ALL OK" if not bad else f"FAILURES: {bad}"); sys.exit(1 if bad else 0)
