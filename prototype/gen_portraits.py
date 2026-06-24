#!/usr/bin/env python3
"""Generate younger artist portraits (concurrent), save to gen/portrait_young/ + json."""
import json, os, time, urllib.request, pathlib
root = pathlib.Path(__file__).parent
KEY = next(l.split("=",1)[1].strip() for l in (root.parents[1]/"_meta"/"env"/"kie.env").read_text().splitlines() if l.startswith("KIE_API_KEY="))
BASE="https://api.kie.ai"; MODEL="nano-banana-2"
OUT = root/"gen"/"portrait_young"; OUT.mkdir(parents=True, exist_ok=True)
PROMPTS = [
 "Portrait photograph of a young female contemporary artist in her bright studio, mid-20s, long hair, paint-flecked apron, natural window light, candid, professional headshot",
 "Portrait of a young male contemporary artist, late 20s, casual t-shirt, sunny studio, relaxed, canvases behind him, candid",
 "Portrait of a young female artist, early 30s, short dark hair, holding a brush, modern studio, soft daylight",
 "Portrait of a young male artist, early 30s, beanie, in a bright industrial studio, candid friendly expression",
 "Portrait of a young female sculptor, late 20s, hair tied back, clay-dusted hands, studio, natural light",
 "Portrait of a young male painter, mid-20s, glasses and denim, bright airy studio, warm smile",
 "Portrait of a young female artist, early 30s, curly hair, colourful clothes, vibrant studio, candid",
 "Portrait of a young male artist, late 20s, dark curly hair, minimalist white studio, confident",
]
def req(m,u,b=None):
    r=urllib.request.Request(u,data=(json.dumps(b).encode() if b else None),method=m)
    r.add_header("Authorization",f"Bearer {KEY}");r.add_header("Content-Type","application/json")
    return json.loads(urllib.request.urlopen(r,timeout=60).read().decode())
tasks=[]
for i,p in enumerate(PROMPTS):
    d=(req("POST",BASE+"/api/v1/jobs/createTask",{"model":MODEL,"input":{"prompt":p}}).get("data") or {})
    if d.get("taskId"): tasks.append({"taskId":d["taskId"],"i":i,"file":None})
    time.sleep(0.4)
print("created",len(tasks))
pending=list(tasks); start=time.time()
while pending and time.time()-start<1200:
    for t in list(pending):
        try:
            d=(req("GET",BASE+f"/api/v1/jobs/recordInfo?taskId={t['taskId']}").get("data") or {})
            st=str(d.get("state") or "").lower()
            if st in("success","completed","done","succeeded"):
                rj=d.get("resultJson"); rj=json.loads(rj) if isinstance(rj,str) else rj
                urls=(rj or {}).get("resultUrls") or []
                if urls:
                    u=urls[0]; ext=os.path.splitext(u.split("?")[0])[1] or ".png"
                    dest=OUT/f"artist_{t['i']}{ext}"
                    dl=urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"})
                    dest.write_bytes(urllib.request.urlopen(dl,timeout=120).read())
                    t["file"]=str(dest.relative_to(root)).replace("\\","/"); print("saved",t["file"])
                pending.remove(t)
            elif st in("fail","failed","error"): pending.remove(t)
        except Exception: pass
    if pending: time.sleep(6)
(root/"gen"/"portraits_young.json").write_text(json.dumps([t["file"] for t in tasks if t["file"]],indent=2))
print("DONE portraits:",sum(1 for t in tasks if t["file"]))
