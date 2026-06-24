#!/usr/bin/env python3
"""Downscale all gallery/portrait images to web size (max 1500px, JPEG q82),
rename to .jpg, and update the manifests so the site references the light versions."""
import json, pathlib
from PIL import Image
root = pathlib.Path(__file__).parent
MAX = 1500; Q = 82

def shrink(relpath):
    p = root / relpath
    if not p.exists():
        return relpath
    im = Image.open(p)
    if im.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA"); bg.paste(im, mask=im.split()[-1]); im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((MAX, MAX), Image.LANCZOS)
    newrel = str(pathlib.PurePosixPath(relpath).with_suffix(".jpg"))
    newp = root / newrel
    im.save(newp, "JPEG", quality=Q, optimize=True, progressive=True)
    if newp != p and p.exists():
        p.unlink()
    return newrel

# artworks
man = json.loads((root/"gen"/"manifest.json").read_text(encoding="utf-8"))
before = sum((root/m["file"]).stat().st_size for m in man if (root/m["file"]).exists())
for m in man:
    m["file"] = shrink(m["file"])
(root/"gen"/"manifest.json").write_text(json.dumps(man, indent=2), encoding="utf-8")
after = sum((root/m["file"]).stat().st_size for m in man)
# portraits
yp = json.loads((root/"gen"/"portraits_young.json").read_text(encoding="utf-8"))
yp = [shrink(f) for f in yp]
(root/"gen"/"portraits_young.json").write_text(json.dumps(yp, indent=2), encoding="utf-8")

print(f"artworks: {before//1024//1024} MB -> {after//1024//1024} MB ({len(man)} files)")
