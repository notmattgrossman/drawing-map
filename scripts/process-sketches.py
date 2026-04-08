#!/usr/bin/env python3
"""
Drop sketch images into upload-sketches/, then run this script.
It will:
  1. Copy the original PNG into sketchbook-bank/
  2. Create a 200px WebP thumbnail → sketchbook-bank/thumbs/<name>.webp
  3. Register the filename in the admin panel's image list (admin/admin.js)
  4. Move processed images to upload-sketches/done/

After running, open /admin in the browser to place the new sketches on the map.
"""

import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent.parent
UPLOAD_DIR = ROOT / "upload-sketches"
BANK_DIR = ROOT / "sketchbook-bank"
THUMBS_DIR = BANK_DIR / "thumbs"
ADMIN_JS = ROOT / "admin" / "admin.js"
DONE_DIR = UPLOAD_DIR / "done"

IMAGE_EXTS = {".png", ".PNG", ".jpg", ".JPG", ".jpeg", ".JPEG"}
THUMB_WIDTH = 200
THUMB_QUALITY = 85


def to_webp_thumb(src_path, dest_path):
    subprocess.run(
        ["cwebp", "-q", str(THUMB_QUALITY), "-resize", str(THUMB_WIDTH), "0",
         str(src_path), "-o", str(dest_path), "-quiet"],
        check=True
    )


def get_all_images_from_admin():
    """Parse the allImages array out of admin.js."""
    text = ADMIN_JS.read_text()
    match = re.search(r'allImages\s*=\s*\[(.*?)\];', text, re.DOTALL)
    if not match:
        raise ValueError("Could not find allImages array in admin/admin.js")
    raw = match.group(1)
    return re.findall(r"'([^']+)'", raw)


def update_admin_images(filenames):
    """Write an updated allImages array back into admin.js."""
    text = ADMIN_JS.read_text()
    sorted_names = sorted(filenames, key=str.lower)
    entries = ",\n        ".join(f"'{f}'" for f in sorted_names)
    new_block = f"allImages = [\n        {entries}\n    ];"
    updated = re.sub(r'allImages\s*=\s*\[.*?\];', new_block, text, flags=re.DOTALL)
    ADMIN_JS.write_text(updated)


def main():
    BANK_DIR.mkdir(exist_ok=True)
    THUMBS_DIR.mkdir(exist_ok=True)
    DONE_DIR.mkdir(exist_ok=True)

    if not UPLOAD_DIR.exists():
        UPLOAD_DIR.mkdir()
        print(f"Created {UPLOAD_DIR} — drop sketch images there and re-run.")
        return

    images = sorted(
        p for p in UPLOAD_DIR.iterdir()
        if p.is_file() and p.suffix in IMAGE_EXTS
    )

    if not images:
        print("No images found in upload-sketches/")
        return

    existing = get_all_images_from_admin()
    existing_set = set(existing)
    added = []
    skipped = []

    for src in images:
        name = src.name

        if name in existing_set:
            print(f"  skip (already registered): {name}")
            skipped.append(name)
            continue

        print(f"  processing: {name}")

        # Copy original to sketchbook-bank/
        dest = BANK_DIR / name
        shutil.copy2(src, dest)

        # Create thumbnail
        base = src.stem
        to_webp_thumb(dest, THUMBS_DIR / f"{base}.webp")

        # Move to done/
        shutil.move(str(src), DONE_DIR / name)

        existing_set.add(name)
        added.append(name)
        print(f"    ✓ added to sketchbook-bank/ and admin list")

    if added:
        update_admin_images(list(existing_set))
        print()
        print(f"Done — added {len(added)}, skipped {len(skipped)}")
        print("Open /admin in the browser to place the new sketches on the map.")
    else:
        print(f"Nothing new to add ({len(skipped)} already registered).")


if __name__ == "__main__":
    main()
