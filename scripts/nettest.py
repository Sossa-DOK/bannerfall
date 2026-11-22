#!/usr/bin/env python3
"""
Dev-only: play an online match between two headless Firefox instances over the
real PeerJS service and check both simulations stay identical.
Needs the dev server (npm run dev), Firefox and internet access.
Usage: python3 scripts/nettest.py [turns]
"""
import http.server, json, os, subprocess, sys, tempfile, threading, time

PORT = 5299
BASE = os.environ.get("BASE_URL", "http://localhost:5173/")
TURNS = sys.argv[1] if len(sys.argv) > 1 else "400"
reports = []

class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        reports.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(200); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*"); self.end_headers()
    def log_message(self, *_): pass

srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

def browser(url, name):
    prof = os.path.join(tempfile.gettempdir(), f"bannerfall-nettest-{name}")
    os.makedirs(prof, exist_ok=True)
    return subprocess.Popen(["firefox", "--headless", "--no-remote", "--profile", prof, "--window-size=1280,720", url],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

procs = [browser(f"{BASE}?nettest=host&turns={TURNS}", "host")]
deadline = time.time() + 40
code = None
while time.time() < deadline and not code:
    code = next((r["code"] for r in reports if r.get("code")), None)
    time.sleep(0.2)
if not code:
    print("host never got a room code:", reports)
else:
    print("room code", code)
    procs.append(browser(f"{BASE}?nettest=join&code={code}&turns={TURNS}", "guest"))
    deadline = time.time() + 30 + int(TURNS) * 0.1 * 1.5
    while time.time() < deadline and len([r for r in reports if "hash" in r or "error" in r]) < 2:
        time.sleep(0.5)
for p in procs:
    p.terminate()
results = [r for r in reports if "hash" in r or "error" in r]
for r in results:
    print(json.dumps(r))
hashes = {(r["turn"], r["hash"]) for r in results if "hash" in r}
ok = len(results) == 2 and all("hash" in r and not r.get("desync") for r in results)
same_turn = len({r.get("turn") for r in results}) == 1
print("RESULT:", "IN SYNC" if ok and (not same_turn or len(hashes) == 1) else "PROBLEM")
