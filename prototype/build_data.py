#!/usr/bin/env python3
"""Assemble ARTISTS + works JS from the generated-image manifests and print them."""
import json, pathlib
root = pathlib.Path(__file__).parent
man = json.loads((root/"gen"/"manifest.json").read_text(encoding="utf-8"))
young = json.loads((root/"gen"/"portraits_young.json").read_text(encoding="utf-8"))

CATMAP = {"color":"Abstract","bw":"Monochrome","landscape":"Landscape","minimal":"Minimal","sculpture":"Sculpture"}
by = {}
for m in man:
    if m["cat"]=="portrait": continue
    by.setdefault(m["cat"], []).append(m["file"])

ARTISTS = [
 ("Sofia Romano","Rome · Belgrade","Works between landscape and abstraction, chasing the quiet moment before a scene resolves.", young[0]),
 ("Marko Đurić","Belgrade","Geometric abstraction — colour treated as structure, not decoration.", young[1]),
 ("Lena Haas","Vienna","Abstraction built from layered fields and slow, deliberate mark-making.", young[2]),
 ("Tomas Berg","Oslo","Landscapes and still forms pared back to weight, light and edge.", young[3]),
 ("Ana Vidal","Lisbon","Sculptor and painter; the human gesture carried into material.", young[4]),
 ("Karl Mensch","Berlin","Monochrome and minimal — what's left when colour is taken away.", young[5]),
 ("Mira Solano","Barcelona","Light on water and stone; plein-air studies and cast forms.", young[6]),
]
TITLES = ["Untitled","Drift","Threshold","Nocturne","Field No. 4","Verge","Quiet Ground","Tide","Ash & Gold","Margin","Ember","Signal","Fold","Salt","Pale Morning","Interval","Low Sun","Reach","Stilllife","Cadence","Hollow","Spar","Ridge","Bloom","Current","Vael","Onyx","Litho","Sediment","Crest","Halo","Vesper","Plinth","Torque","Knot","Husk","Strata","Meridian","Cusp","Relic","Lumen","Coda"]
SIZE_P = ["40 × 50 cm","60 × 80 cm","50 × 70 cm","100 × 120 cm","50 × 50 cm","70 × 90 cm","80 × 100 cm","30 × 40 cm"]
SIZE_S = ["h 48 cm","h 58 cm","h 64 cm","h 40 cm","h 72 cm"]
MED_P  = ["Oil on canvas","Oil on linen","Acrylic on canvas","Oil on board","Mixed media on canvas"]
MED_S  = ["Cast bronze, ed. 8","Carrara marble","Patinated bronze","Steel","Wood & wax"]
PRICE = {"Abstract":(2200,7400),"Monochrome":(1800,4200),"Landscape":(2400,6800),"Minimal":(1600,3800),"Sculpture":(5200,14000)}

# interleave categories so each artist gets a varied spread
order = ["color","landscape","bw","minimal","sculpture"]
seq = []
idxs = {c:0 for c in order}
while any(idxs[c] < len(by.get(c,[])) for c in order):
    for c in order:
        if idxs[c] < len(by.get(c,[])):
            seq.append((c, by[c][idxs[c]])); idxs[c]+=1

works=[]
for i,(cat,file) in enumerate(seq):
    disp = CATMAP[cat]
    lo,hi = PRICE[disp]
    price = lo + ((i*53)%(hi-lo)); price = int(round(price/50)*50)
    is_s = (disp=="Sculpture")
    works.append({
        "id":i,"img":file,"cat":disp,
        "title":TITLES[i%len(TITLES)] + (f" {i}" if TITLES[i%len(TITLES)]=="Untitled" else ""),
        "artist":ARTISTS[i%7][0],
        "size":(SIZE_S if is_s else SIZE_P)[i%(len(SIZE_S) if is_s else len(SIZE_P))],
        "medium":(MED_S if is_s else MED_P)[i%(len(MED_S) if is_s else len(MED_P))],
        "price":price,
    })

artists_js = "const ARTISTS = {\n" + "\n".join(
    f'  {json.dumps(a[0])}:{{loc:{json.dumps(a[1])}, bio:{json.dumps(a[2])}, portrait:{json.dumps(a[3])}}},'
    for a in ARTISTS) + "\n};"
works_js = "const works = " + json.dumps(works, ensure_ascii=False) + ";"

(root/"_data_artists.js").write_text(artists_js, encoding="utf-8")
(root/"_data_works.js").write_text(works_js, encoding="utf-8")
print(artists_js)
print()
print(works_js[:400], "...")
print(f"\n{len(works)} works, {len(ARTISTS)} artists")
