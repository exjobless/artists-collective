#!/usr/bin/env python3
"""Batch-generate the gallery artworks + artist portraits via kie.ai nano-banana-2.
Creates all tasks up front (concurrent server-side render), then polls + downloads.
Writes gen/<cat>/<cat>_<n>.<ext> and gen/manifest.json."""
import json, os, time, urllib.request, urllib.error, pathlib

KEY = None
for line in (pathlib.Path(__file__).resolve().parents[2] / "_meta" / "env" / "kie.env").read_text().splitlines():
    if line.startswith("KIE_API_KEY="):
        KEY = line.split("=", 1)[1].strip()
BASE = "https://api.kie.ai"
MODEL = "nano-banana-2"
OUT = pathlib.Path(__file__).parent / "gen"

FLAT = "full frame, flat straight-on view of the artwork only, no frame, no wall, no room, no background scene, just the artwork itself"
PROMPTS = []
def add(cat, n, base):
    for i in range(n):
        PROMPTS.append((cat, base))

# ---- color abstract (12) ----
COLOR = [
 "Contemporary abstract painting, vibrant primary colours, bold gestural oil brushstrokes, thick impasto",
 "Contemporary abstract painting, warm earthy ochre rust and terracotta, layered palette-knife fields",
 "Contemporary abstract painting, cool blues teals and white, fluid acrylic pour",
 "Contemporary abstract expressionist painting, energetic multicolour strokes on a white ground",
 "Contemporary abstract painting, pink magenta and orange, soft blended colour fields",
 "Contemporary geometric abstraction, bold saturated colour blocks with hard edges",
 "Contemporary abstract painting, deep greens and gold, organic forms, heavy texture",
 "Contemporary abstract painting, bright yellow red and blue confetti strokes, playful",
 "Contemporary abstract painting, muted pastel palette, gentle gestural marks",
 "Contemporary abstract painting, dark moody jewel tones with one bright accent",
 "Contemporary colour-field painting, two large saturated zones with a soft seam",
 "Contemporary abstract painting, turquoise coral and cream, dynamic sweeping strokes",
]
# ---- black & white (8) ----
BW = [
 "Contemporary black and white abstract painting, bold black ink gestural strokes on raw linen",
 "Contemporary monochrome abstract, charcoal smudges and white, minimal",
 "Contemporary black and white abstract, dripping ink splatter on white canvas",
 "Contemporary minimalist black painting, a single sweeping brush arc on white",
 "Contemporary grayscale abstract, layered greys and blacks, scraped texture",
 "Contemporary black and white abstract, calligraphic strokes with generous negative space",
 "Contemporary monochrome abstract, dense black marks with fine white scratches",
 "Contemporary black and white abstract, soft grey wash with one bold black accent",
]
# ---- landscape (8) ----
LAND = [
 "Contemporary semi-abstract landscape painting, fields and sky reduced to colour bands, palette knife",
 "Contemporary impressionistic landscape, loose brushwork, warm sunset palette",
 "Contemporary abstract seascape, blue and white horizon, heavy texture",
 "Contemporary mountain landscape, simplified geometric forms, muted palette",
 "Contemporary landscape painting, autumn trees in expressive strokes",
 "Contemporary minimal landscape, foggy field in soft tonal greys and greens",
 "Contemporary coastal landscape, cliffs and sea in bold colour",
 "Contemporary abstract landscape, layered horizon lines in golden light",
]
# ---- minimal (6) ----
MIN = [
 "Contemporary minimalist painting, a single colour field with a subtle tonal shift",
 "Contemporary minimalist painting, one thin line across a neutral ground",
 "Contemporary minimalist painting, two stacked muted rectangles, soft edges",
 "Contemporary minimalist painting, a small off-centre square on a large blank canvas",
 "Contemporary minimalist painting, pale beige monochrome with faint texture",
 "Contemporary minimalist painting, a pale blue field with a single horizon line",
]
# ---- sculpture (8) ----
SCULPT_BG = "plain seamless light-grey studio background, single object centered, clean product photograph of the sculpture only"
SCULPT = [
 f"Contemporary abstract sculpture, polished bronze flowing knot form, {SCULPT_BG}",
 f"Contemporary abstract sculpture, white marble organic curves, {SCULPT_BG}",
 f"Contemporary abstract sculpture, twisted matte steel ribbon, {SCULPT_BG}",
 f"Contemporary abstract sculpture, smooth black stone monolith with a hole, {SCULPT_BG}",
 f"Contemporary abstract sculpture, intertwined warm wooden form, {SCULPT_BG}",
 f"Contemporary abstract sculpture, stacked geometric concrete cubes, {SCULPT_BG}",
 f"Contemporary abstract sculpture, reflective fluid silver metal wave, {SCULPT_BG}",
 f"Contemporary elongated abstract figurative bronze, {SCULPT_BG}",
]
# ---- artist portraits (8) ----
PORTRAITS = [
 "Portrait photograph of a contemporary female artist in her studio, 30s, paint-stained apron, natural window light, canvases behind, candid, professional",
 "Portrait photograph of a contemporary male artist in his studio, 40s, short beard, holding brushes, warm light, candid",
 "Portrait of a contemporary female sculptor in her studio, 50s, short grey hair, clay on her hands, natural light",
 "Portrait of a young male painter, late 20s, in a bright airy studio, relaxed, large canvases around him",
 "Portrait of a contemporary female artist, 30s, dark hair, thoughtful expression, studio background, soft light",
 "Portrait of a contemporary male artist, 60s, glasses, in his studio, warm candid photograph",
 "Portrait of a contemporary female artist, 40s, curly hair, paint on her apron, bright studio",
 "Portrait of a contemporary male artist, 30s, casual clothes, standing before a large abstract painting in his studio",
]

for c, base in [("color", COLOR), ("bw", BW), ("landscape", LAND), ("minimal", MIN), ("sculpture", SCULPT)]:
    for p in base:
        PROMPTS.append((c, p + ", " + FLAT))
for p in PORTRAITS:
    PROMPTS.append(("portrait", p))

print(f"total prompts: {len(PROMPTS)}")

def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {KEY}")
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode())

# phase 1: create all tasks
tasks = []
for idx, (cat, prompt) in enumerate(PROMPTS):
    try:
        res = req("POST", BASE + "/api/v1/jobs/createTask", {"model": MODEL, "input": {"prompt": prompt}})
        d = res.get("data") or {}
        tid = d.get("taskId")
        if tid:
            tasks.append({"taskId": tid, "cat": cat, "prompt": prompt, "idx": idx, "done": False, "file": None})
        else:
            print("create failed", idx, res.get("msg"))
    except Exception as e:
        print("create error", idx, e)
    time.sleep(0.4)
print(f"created {len(tasks)} tasks")

# phase 2: poll + download
OUT.mkdir(exist_ok=True)
counts = {}
start = time.time()
pending = [t for t in tasks]
while pending and time.time() - start < 2400:
    for t in list(pending):
        try:
            info = req("GET", BASE + f"/api/v1/jobs/recordInfo?taskId={t['taskId']}")
            d = info.get("data") or {}
            state = str(d.get("state") or d.get("status") or "").lower()
            if state in ("success", "succeeded", "completed", "done"):
                rj = d.get("resultJson")
                if isinstance(rj, str):
                    rj = json.loads(rj)
                urls = (rj or {}).get("resultUrls") or (rj or {}).get("urls") or []
                if urls:
                    u = urls[0]
                    ext = os.path.splitext(u.split("?")[0])[1] or ".png"
                    n = counts.get(t["cat"], 0); counts[t["cat"]] = n + 1
                    catdir = OUT / t["cat"]; catdir.mkdir(exist_ok=True)
                    dest = catdir / f"{t['cat']}_{n}{ext}"
                    dl = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(dl, timeout=120) as fp:
                        dest.write_bytes(fp.read())
                    t["file"] = str(dest.relative_to(OUT.parent)).replace("\\", "/")
                    print("saved", t["file"])
                t["done"] = True; pending.remove(t)
            elif state in ("fail", "failed", "error"):
                print("FAILED", t["idx"], t["prompt"][:40]); t["done"] = True; pending.remove(t)
        except Exception as e:
            pass
    if pending:
        time.sleep(6)

manifest = [{"file": t["file"], "cat": t["cat"], "prompt": t["prompt"]} for t in tasks if t["file"]]
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"DONE: {len(manifest)} images saved. counts={counts}")
