#!/usr/bin/env python3
"""Read gen/manifest.json and build gallery-preview.html — a grouped contact sheet
of every generated image with click-to-cull, so Nemanja can approve the set."""
import json, pathlib
root = pathlib.Path(__file__).parent
manifest = json.loads((root / "gen" / "manifest.json").read_text(encoding="utf-8"))
for i, m in enumerate(manifest):
    m["n"] = i
DATA = json.dumps(manifest, ensure_ascii=False)
page = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Generated artworks — preview</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
:root{--paper:#fff;--mat:#f0ece3;--ink:#1d1b16;--soft:#615c51;--line:#e4ded2;--accent:#8a3b2e}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:'Hanken Grotesk',system-ui,sans-serif;padding:0 0 120px}
.serif{font-family:'Cormorant Garamond',serif}
header{padding:42px 34px 14px;max-width:1320px;margin:0 auto}
h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:40px}
p.lead{color:var(--soft);margin-top:10px;max-width:74ch;font-size:15px}
.filters{display:flex;gap:8px;flex-wrap:wrap;padding:20px 34px 0;max-width:1320px;margin:0 auto}
.filters button{font-size:13px;padding:8px 16px;border:1px solid var(--line);border-radius:100px;color:var(--soft);background:none;cursor:pointer}
.filters button.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;padding:24px 34px;max-width:1320px;margin:0 auto}
@media(max-width:1100px){.grid{grid-template-columns:repeat(4,1fr)}}
@media(max-width:800px){.grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:520px){.grid{grid-template-columns:repeat(2,1fr)}}
.card{cursor:pointer;border:2px solid transparent;border-radius:6px;padding:6px;position:relative;transition:.15s}
.card.cut{opacity:.32;border-color:#c0392b}
.thumb{aspect-ratio:1/1;background:var(--mat);border:1px solid var(--line);overflow:hidden;display:grid;place-items:center}
.thumb img{width:100%;height:100%;object-fit:cover}
.num{position:absolute;top:11px;left:11px;background:var(--ink);color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:100px}
.cut .num{background:#c0392b}
.x{position:absolute;top:9px;right:9px;width:24px;height:24px;border-radius:50%;background:#c0392b;color:#fff;display:none;place-items:center;font-size:13px}
.cut .x{display:grid}
.cat{font-size:11px;color:var(--soft);margin-top:7px;text-transform:uppercase;letter-spacing:.04em}
.tray{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:16px 34px;display:flex;align-items:center;gap:18px}
.tray .n{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600}
.tray .list{flex:1;font-size:13px;color:var(--soft);font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tray button{background:var(--ink);color:#fff;border:none;padding:11px 20px;border-radius:4px;font-weight:600;cursor:pointer;font-family:inherit}
</style></head><body>
<header><h1 class="serif">Generated artworks — preview</h1>
<p class="lead">All AI-generated pieces, grouped by type. They're all <b>kept</b> by default. Click any image you DON'T want to <b>cut</b> it (turns red). When done, hit <b>Copy cut list</b> and send me the numbers to drop — or just say "use them all".</p></header>
<div class="filters" id="filters"></div>
<div class="grid" id="grid"></div>
<div class="tray"><span class="n" id="cnt">0</span><span class="list" id="list">none cut — keeping all</span><button onclick="copyCut()">Copy cut list</button></div>
<script>
const POOL=__DATA__;
const cut=new Set(); let filter='All';
const cats=['All',...[...new Set(POOL.map(p=>p.cat))]];
const $=s=>document.querySelector(s);
function rf(){$('#filters').innerHTML=cats.map(c=>`<button class="${c===filter?'active':''}" onclick="sf('${c}')">${c} ${c==='All'?'('+POOL.length+')':'('+POOL.filter(p=>p.cat===c).length+')'}</button>`).join('')}
function sf(c){filter=c;rf();rg()}
function rg(){$('#grid').innerHTML=POOL.filter(p=>filter==='All'||p.cat===filter).map(p=>`<div class="card ${cut.has(p.n)?'cut':''}" onclick="tg(${p.n})"><div class="num">#${p.n}</div><div class="x">✕</div><div class="thumb"><img loading="lazy" src="${p.file}"></div><div class="cat">${p.cat}</div></div>`).join('')}
function tg(n){cut.has(n)?cut.delete(n):cut.add(n);rg();ut()}
function ut(){const a=[...cut].sort((x,y)=>x-y);$('#cnt').textContent=a.length;$('#list').textContent=a.length?'cut: '+a.join(', '):'none cut — keeping all'}
function copyCut(){const a=[...cut].sort((x,y)=>x-y);navigator.clipboard.writeText(a.length?'Cut these: '+a.join(', '):'Use them all').then(()=>alert('Copied. Paste to Charlie.'))}
rf();rg();ut();
</script></body></html>"""
(root / "gallery-preview.html").write_text(page.replace("__DATA__", DATA), encoding="utf-8")
print("wrote gallery-preview.html with", len(manifest), "images")
