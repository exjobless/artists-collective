// Shared data pools for dynamically-created artist profiles.
// Mirrors build_data.py so dynamic artists match the seeded gallery's look.
// Profiles are DETERMINISTIC from the wallet address: same address -> same
// profile, every time (so /join is idempotent even without storage).

export const IMAGES = {
  Abstract: ["gen/color/color_0.jpg","gen/color/color_1.jpg","gen/color/color_2.jpg","gen/color/color_6.jpg","gen/color/color_8.jpg","gen/color/color_9.jpg","gen/color/color_3.jpg","gen/color/color_10.jpg","gen/color/color_4.jpg","gen/color/color_5.jpg","gen/color/color_7.jpg","gen/color/color_11.jpg"],
  Monochrome: ["gen/bw/bw_5.jpg","gen/bw/bw_0.jpg","gen/bw/bw_3.jpg","gen/bw/bw_6.jpg","gen/bw/bw_7.jpg","gen/bw/bw_1.jpg","gen/bw/bw_2.jpg","gen/bw/bw_4.jpg"],
  Landscape: ["gen/landscape/landscape_3.jpg","gen/landscape/landscape_0.jpg","gen/landscape/landscape_6.jpg","gen/landscape/landscape_4.jpg","gen/landscape/landscape_7.jpg","gen/landscape/landscape_1.jpg","gen/landscape/landscape_5.jpg","gen/landscape/landscape_2.jpg"],
  Minimal: ["gen/minimal/minimal_5.jpg","gen/minimal/minimal_0.jpg","gen/minimal/minimal_4.jpg","gen/minimal/minimal_1.jpg","gen/minimal/minimal_2.jpg","gen/minimal/minimal_3.jpg"],
  Sculpture: ["gen/sculpture/sculpture_7.jpg","gen/sculpture/sculpture_6.jpg","gen/sculpture/sculpture_0.jpg","gen/sculpture/sculpture_1.jpg","gen/sculpture/sculpture_2.jpg","gen/sculpture/sculpture_3.jpg","gen/sculpture/sculpture_4.jpg","gen/sculpture/sculpture_5.jpg"],
};
// Portraits split by gender so /join can match the artist's chosen gender.
// (Classified by eye from the AI-generated set: 0/2/4/6 read female, 1/3/5/7 read male.)
export const PORTRAITS_F = ["gen/portrait_young/artist_0.jpg","gen/portrait_young/artist_2.jpg","gen/portrait_young/artist_4.jpg","gen/portrait_young/artist_6.jpg"];
export const PORTRAITS_M = ["gen/portrait_young/artist_1.jpg","gen/portrait_young/artist_3.jpg","gen/portrait_young/artist_5.jpg","gen/portrait_young/artist_7.jpg"];
// Combined list (original order) — the fallback when gender is unknown / "prefer not to say".
// Kept in the original order so artists created before gender existed keep the same portrait.
export const PORTRAITS = ["gen/portrait_young/artist_0.jpg","gen/portrait_young/artist_1.jpg","gen/portrait_young/artist_2.jpg","gen/portrait_young/artist_3.jpg","gen/portrait_young/artist_4.jpg","gen/portrait_young/artist_5.jpg","gen/portrait_young/artist_6.jpg","gen/portrait_young/artist_7.jpg"];

// "male"/"female"/"m"/"f" -> the matching set; anything else (na, blank) -> all.
export function portraitsForGender(gender){
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'female' || g === 'f') return PORTRAITS_F;
  if (g === 'male'   || g === 'm') return PORTRAITS_M;
  return PORTRAITS;
}
export const CATS = ["Abstract","Monochrome","Landscape","Minimal","Sculpture"];
export const TITLES = ["Untitled","Drift","Threshold","Nocturne","Field No. 4","Verge","Quiet Ground","Tide","Ash & Gold","Margin","Ember","Signal","Fold","Salt","Pale Morning","Interval","Low Sun","Reach","Still Life","Cadence","Hollow","Spar","Ridge","Bloom","Current","Vael","Onyx","Litho","Sediment","Crest","Halo","Vesper","Plinth","Torque","Knot","Husk","Strata","Meridian","Cusp","Relic","Lumen","Coda"];
export const SIZE_P = ["40 × 50 cm","60 × 80 cm","50 × 70 cm","100 × 120 cm","50 × 50 cm","70 × 90 cm","80 × 100 cm","30 × 40 cm"];
export const SIZE_S = ["h 48 cm","h 58 cm","h 64 cm","h 40 cm","h 72 cm"];
export const MED_P  = ["Oil on canvas","Oil on linen","Acrylic on canvas","Oil on board","Mixed media on canvas"];
export const MED_S  = ["Cast bronze, ed. 8","Carrara marble","Patinated bronze","Steel","Wood & wax"];
export const PRICE  = { Abstract:[2200,7400], Monochrome:[1800,4200], Landscape:[2400,6800], Minimal:[1600,3800], Sculpture:[5200,14000] };
export const LOCS   = ["Belgrade","Vienna","Lisbon","Berlin","Barcelona","Oslo","Rome","Paris","Athens","Porto","Ljubljana","Prague","Amsterdam","Copenhagen"];
export const BIOS   = [
  "Works between landscape and abstraction, chasing the quiet moment before a scene resolves.",
  "Geometric abstraction — colour treated as structure, not decoration.",
  "Abstraction built from layered fields and slow, deliberate mark-making.",
  "Landscapes and still forms pared back to weight, light and edge.",
  "Sculptor and painter; the human gesture carried into material.",
  "Monochrome and minimal — what's left when colour is taken away.",
  "Light on water and stone; plein-air studies and cast forms.",
  "Paints in long sessions, building a surface until it finally holds still.",
  "Interested in the edge where a mark becomes an image and then lets go of it.",
  "Quiet, reductive work — a few forms, a held silence, room to breathe.",
  "Colour as weather: fields that shift the longer you stand with them.",
  "Material-first; the trace of the hand kept in every surface.",
];
export const BUYERS = ["A. Kovač","Private collector, Vienna","M. Lindqvist","The Hollis Collection","R. Mwangi","Atelier Sud","Private collector, Lisbon","D. Fischer","The Verge Fund","K. Aalto","Private collector, Berlin","Galerie Onze","S. Petrov","Private collector, London"];

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function rngFromString(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return mulberry32(h>>>0); }
const pick = (rng, arr) => arr[Math.floor(rng()*arr.length)];

// Deterministic profile for a given wallet address.
// `gender` ("male"/"female"/"na"/blank) only narrows the portrait pool; all
// other fields stay address-deterministic. rng call order is unchanged so
// no-gender artists keep the exact portrait they had before.
export function makeProfile(addr, name, gender){
  const rng = rngFromString(addr);
  const short = addr.replace(/^ut1?/,'').slice(0,6) || addr.slice(0,6);
  const handle = (name && name.trim()) ? name.trim() : ('artist-' + short);
  const bio = pick(rng, BIOS);
  const loc = pick(rng, LOCS);
  const portrait = pick(rng, portraitsForGender(gender));
  const nWorks = 5 + Math.floor(rng()*2); // 5 or 6
  const used = new Set();
  const works = [];
  for (let i=0;i<nWorks;i++){
    const cat = pick(rng, CATS);
    const img = pick(rng, IMAGES[cat]);
    let title, guard=0;
    do { title = pick(rng, TITLES); guard++; } while (used.has(title) && guard<24);
    used.add(title);
    const isS = cat === "Sculpture";
    const [lo,hi] = PRICE[cat];
    works.push({
      id: short + '-' + i,
      img, cat,
      title: title === 'Untitled' ? `Untitled ${i}` : title,
      size: pick(rng, isS?SIZE_S:SIZE_P),
      medium: pick(rng, isS?MED_S:MED_P),
      price: Math.round((lo + Math.floor(rng()*(hi-lo)))/50)*50,
    });
  }
  const nSales = 2 + Math.floor(rng()*3); // 2..4 seeded sales
  const sales = [];
  for (let i=0;i<nSales;i++){
    const w = pick(rng, works);
    sales.push({ id: short+'-s'+i, artwork_id:w.id, title:w.title, buyer: pick(rng, BUYERS), price:w.price });
  }
  return { address: addr, handle, bio, loc, portrait, works, sales };
}
