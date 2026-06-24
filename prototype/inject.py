#!/usr/bin/env python3
import pathlib
root = pathlib.Path(__file__).parent
html = (root/"index.html").read_text(encoding="utf-8")
artists_js = (root/"_data_artists.js").read_text(encoding="utf-8")
works_js = (root/"_data_works.js").read_text(encoding="utf-8")

desc_js = (
"const desc=(w)=>{const d={"
"Abstract:`builds its image from layered colour and gesture rather than line — worked slowly until the balance held.`,"
"Monochrome:`reduces the painting to black, white and the raw ground — every mark deliberate, nothing spare.`,"
"Landscape:`catches a landscape at the edge of abstraction, with light and distance doing most of the work.`,"
"Minimal:`holds a single quiet idea: a few forms, a held silence, room to breathe.`,"
"Sculpture:`is a cast form worked in the round; the surface keeps the trace of the hand.`"
"};return `<em>${w.title}</em> ${d[w.cat]||''}`;};"
)
new_block = "/* ---------- artists ---------- */\n" + artists_js + "\n/* ---------- catalog (AI-generated, local files) ---------- */\n" + desc_js + "\n" + works_js + "\n\n"

start = html.index("/* ---------- artists ---------- */")
end = html.index("/* ---------- helpers ---------- */")
html = html[:start] + new_block + html[end:]

# category chips
old_chips = '''      <button class="active" data-f="all">All work</button>
      <button data-f="Abstract">Abstract</button>
      <button data-f="Landscape">Landscape</button>
      <button data-f="Figurative">Figurative</button>
      <button data-f="Minimal">Minimal</button>
      <button data-f="Sculpture">Sculpture</button>'''
new_chips = '''      <button class="active" data-f="all">All work</button>
      <button data-f="Abstract">Abstract</button>
      <button data-f="Monochrome">Monochrome</button>
      <button data-f="Landscape">Landscape</button>
      <button data-f="Minimal">Minimal</button>
      <button data-f="Sculpture">Sculpture</button>'''
html = html.replace(old_chips, new_chips)

# avatar -> portrait photo
html = html.replace(
  '<div class="avatar">${initials(name)}</div>',
  '<div class="avatar" style="padding:0;overflow:hidden">${a.portrait?`<img src="${a.portrait}" alt="${name}" style="width:100%;height:100%;object-fit:cover">`:initials(name)}</div>'
)

(root/"index.html").write_text(html, encoding="utf-8")
print("injected:", html.count('"img":'), "works; ARTISTS portraits wired; chips updated")
