#!/usr/bin/env python3
"""
Record an animated battle GIF for store pages.

Needs: the dev server running (npm run dev), Firefox, and Python 3 with Pillow.
Usage:  npm run gif            (or: python3 scripts/gif.py [query] [out.gif])

How it works: a tiny local server collects PNG frames that the game posts from
screenshot mode (?shot&gif...), headless Firefox runs the page, then Pillow
assembles the frames into a looping GIF.
"""
import base64
import http.server
import os
import subprocess
import sys
import tempfile
import threading

from PIL import Image

PORT = 5299
BASE = os.environ.get("BASE_URL", "http://localhost:5173/")
QUERY = sys.argv[1] if len(sys.argv) > 1 else (
    "f=aerie&e=choir&mode=2v2&seed=36&t=222&card=feather_storm"
    "&gif&frames=72&every=2&w=760&crop=110,125,1060,470&galeAt=18&cardAt=40"
)
OUT = sys.argv[2] if len(sys.argv) > 2 else "marketing/battle.gif"
FPS = 10  # every=2 ticks per frame at 20 ticks/s = 10 frames per sim-second (plays at 1x)

frame_dir = tempfile.mkdtemp(prefix="bannerfall-gif-")
received = []


class Collector(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.path.split("n=")[-1])
        body = self.rfile.read(int(self.headers["Content-Length"])).decode()
        png = base64.b64decode(body.split(",", 1)[1])
        with open(os.path.join(frame_dir, f"f{n:04d}.png"), "wb") as fh:
            fh.write(png)
        received.append(n)
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, *_):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Collector)
threading.Thread(target=server.serve_forever, daemon=True).start()

profile = os.path.join(tempfile.gettempdir(), "bannerfall-ff")
os.makedirs(profile, exist_ok=True)
url = f"{BASE}?shot&{QUERY}"
print("recording", url)
subprocess.run(
    ["firefox", "--headless", "--no-remote", "--profile", profile, "--window-size=1280,720",
     "--screenshot", os.path.join(frame_dir, "_ignore.png"), url],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600, check=False,
)
server.shutdown()

files = sorted(f for f in os.listdir(frame_dir) if f.startswith("f"))
if not files:
    sys.exit("no frames received — is the dev server running?")
frames = [Image.open(os.path.join(frame_dir, f)).convert("RGB") for f in files]

# one shared palette (sampled from several frames) keeps colours stable between frames
sample = Image.new("RGB", (frames[0].width, frames[0].height * 4))
for i, idx in enumerate(range(0, len(frames), max(1, len(frames) // 4))):
    if i < 4:
        sample.paste(frames[idx], (0, frames[0].height * i))
palette = sample.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
pal_frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]

os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
pal_frames[0].save(
    OUT, save_all=True, append_images=pal_frames[1:], duration=int(1000 / FPS), loop=0, optimize=True, disposal=1,
)
size = os.path.getsize(OUT)
print(f"{OUT}: {len(frames)} frames, {frames[0].width}x{frames[0].height}, {size / 1024 / 1024:.2f} MB")
