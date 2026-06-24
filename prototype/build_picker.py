#!/usr/bin/env python3
"""Build an image picker: query the Art Institute of Chicago open API for
public-domain paintings & sculpture, download a browsable pool, and generate
picker.html so Nemanja can click-select which works the gallery should use."""
import urllib.request, urllib.parse, json, os, html

UA = "artists-collective-demo (contact: demo@example.com)"
POOL = "pool"
os.makedirs(POOL, exist_ok=True)

# category -> search terms (first category that grabs a work wins)
CATS = {
    "Abstract":   ["Kandinsky", "Paul Klee", "Marsden Hartley", "abstraction painting", "Kupka"],
    "Landscape":  ["Cezanne landscape", "Monet", "Gauguin landscape", "Seurat", "Pissarro", "Sisley", "van Gogh landscape"],
    "Figurative": ["Modigliani", "Toulouse-Lautrec", "Degas dancer", "Renoir", "Cassatt", "Manet portrait"],
    "Minimal":    ["Mondrian", "Matisse still life", "Cezanne still life", "Morandi", "geometric"],
    "Sculpture":  ["Rodin", "Matisse sculpture", "Maillol", "bronze figure", "marble bust", "Brancusi", "Degas dancer sculpture"],
}
PER_CAT = 12

def api(term):
    qs = urllib.parse.urlencode({
        "q": term,
        "query[term][is_public_domain]": "true",
        "fields": "id,title,artist_title,image_id,classification_title",
        "limit": 15,
    })
    url = "https://api.artic.edu/api/v1/artworks/search?" + qs
    req = urllib.request.Request(url, headers={"AIC-User-Agent": UA, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("data", [])

seen = set()
pool = []
for cat, terms in CATS.items():
    got = 0
    for term in terms:
        if got >= PER_CAT:
            break
        try:
            data = api(term)
        except Exception as e:
            print("  ! query failed", term, e); continue
        for a in data:
            if got >= PER_CAT:
                break
            iid = a.get("image_id"); cls = (a.get("classification_title") or "").lower()
            if not iid or iid in seen:
                continue
            want_sculpt = (cat == "Sculpture")
            ok = ("sculpt" in cls) if want_sculpt else ("paint" in cls)
            if not ok:
                continue
            seen.add(iid)
            pool.append({"iid": iid, "title": a.get("title") or "Untitled",
                         "artist": a.get("artist_title") or "Unknown", "cat": cat, "cls": cls})
            got += 1
    print(f"{cat}: {got}")

# download thumbnails
for n, p in enumerate(pool):
    dst = os.path.join(POOL, f"{n}.jpg")
    if os.path.exists(dst):
        continue
    url = f"https://www.artic.edu/iiif/2/{p['iid']}/full/400,/0/default.jpg"
    try:
        req = urllib.request.Request(url, headers={"AIC-User-Agent": UA, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as f:
            f.write(r.read())
    except Exception as e:
        print("  ! image failed", n, e)
print("pool size:", len(pool))

# embed manifest (n, iid, title, artist, cat) so picker works offline on file://
manifest = [{"n": n, "iid": p["iid"], "title": p["title"], "artist": p["artist"], "cat": p["cat"]}
            for n, p in enumerate(pool)]
DATA = json.dumps(manifest, ensure_ascii=False)

page = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Pick the artworks — The Artists' Collective</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
:root{--paper:#fff;--mat:#ece6d9;--ink:#1d1b16;--soft:#615c51;--line:#e4ded2;--accent:#8a3b2e}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;padding:0 0 130px}
.serif{font-family:'Cormorant Garamond',serif}
header{padding:42px 34px 18px;max-width:1300px;margin:0 auto}
h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:40px}
p.lead{color:var(--soft);margin-top:10px;max-width:70ch;font-size:15px}
.filters{display:flex;gap:8px;flex-wrap:wrap;padding:22px 34px 0;max-width:1300px;margin:0 auto}
.filters button{font-size:13px;padding:8px 16px;border:1px solid var(--line);border-radius:100px;color:var(--soft);background:none;cursor:pointer}
.filters button.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:20px;padding:26px 34px;max-width:1300px;margin:0 auto}
@media(max-width:1100px){.grid{grid-template-columns:repeat(4,1fr)}}
@media(max-width:800px){.grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:520px){.grid{grid-template-columns:repeat(2,1fr)}}
.card{cursor:pointer;border:2px solid transparent;border-radius:5px;padding:7px;transition:.15s;position:relative}
.card:hover{background:#faf7f0}
.card.sel{border-color:var(--accent);background:#faf3ee}
.thumb{aspect-ratio:1/1;background:var(--mat);border:1px solid var(--line);display:grid;place-items:center;padding:9%;overflow:hidden}
.thumb img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 5px 16px rgba(0,0,0,.18)}
.num{position:absolute;top:12px;left:12px;background:var(--ink);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:100px;z-index:2}
.card.sel .num{background:var(--accent)}
.check{position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:none;place-items:center;font-size:14px;z-index:2}
.card.sel .check{display:grid}
.t{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:16px;margin-top:9px;line-height:1.15}
.a{font-size:12px;color:var(--soft);margin-top:2px}
.tray{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:16px 34px;display:flex;align-items:center;gap:18px}
.tray .n{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600}
.tray .list{flex:1;font-size:13px;color:var(--soft);font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tray button{background:var(--ink);color:#fff;border:none;padding:11px 20px;border-radius:4px;font-family:inherit;font-weight:600;cursor:pointer}
.tray button.clear{background:none;color:var(--soft);border:1px solid var(--line)}
</style></head><body>
<header>
  <h1 class="serif">Pick the artworks</h1>
  <p class="lead">These are public-domain works from the Art Institute of Chicago's open collection — the source I pull from. Click any piece to select it. When you're happy, hit <b>Copy selection</b> and paste the numbers back to me, and I'll build the gallery from exactly those. Filter by type below.</p>
</header>
<div class="filters" id="filters"></div>
<div class="grid" id="grid"></div>
<div class="tray">
  <span class="n" id="cnt">0</span>
  <span class="list" id="list">nothing selected yet</span>
  <button class="clear" onclick="clearSel()">Clear</button>
  <button onclick="copySel()">Copy selection</button>
</div>
<script>
const POOL=__DATA__;
const sel=new Set();
const cats=['All',...[...new Set(POOL.map(p=>p.cat))]];
let filter='All';
const $=s=>document.querySelector(s);
function renderFilters(){$('#filters').innerHTML=cats.map(c=>`<button class="${c===filter?'active':''}" onclick="setF('${c}')">${c}</button>`).join('')}
function setF(c){filter=c;renderFilters();renderGrid()}
function renderGrid(){
  const list=POOL.filter(p=>filter==='All'||p.cat===filter);
  $('#grid').innerHTML=list.map(p=>`<div class="card ${sel.has(p.n)?'sel':''}" onclick="tog(${p.n})">
    <div class="num">#${p.n}</div><div class="check">✓</div>
    <div class="thumb"><img loading="lazy" src="pool/${p.n}.jpg" alt=""></div>
    <div class="t">${p.title}</div><div class="a">${p.artist} · ${p.cat}</div></div>`).join('');
}
function tog(n){sel.has(n)?sel.delete(n):sel.add(n);renderGrid();updateTray()}
function clearSel(){sel.clear();renderGrid();updateTray()}
function updateTray(){
  const arr=[...sel].sort((a,b)=>a-b);
  $('#cnt').textContent=arr.length;
  $('#list').textContent=arr.length?arr.join(', '):'nothing selected yet';
}
function copySel(){
  const arr=[...sel].sort((a,b)=>a-b);
  const txt=arr.map(n=>{const p=POOL.find(x=>x.n===n);return `#${n} ${p.title} (${p.cat})`}).join('\\n');
  navigator.clipboard.writeText('Selected works:\\n'+txt).then(()=>alert('Copied '+arr.length+' works. Paste to Charlie.'));
}
renderFilters();renderGrid();updateTray();
</script></body></html>"""
page = page.replace("__DATA__", DATA)
with open("picker.html", "w", encoding="utf-8") as f:
    f.write(page)
print("wrote picker.html")
