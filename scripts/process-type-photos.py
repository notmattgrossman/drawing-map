#!/usr/bin/env python3
"""
Drop images into upload-specs/, then run this script.
It will:
  1. Extract GPS coordinates from each image's EXIF data
  2. Copy the original into type-photos/
  3. Convert to full-size WebP  → type-photos/<name>.webp
  4. Convert to 200px thumbnail → type-photos/thumbs/<name>.webp
  5. Add the entry to type-photos/locations.json
  6. Move processed images out of upload-specs/ into upload-specs/done/
"""

import os
import json
import shutil
import subprocess
from pathlib import Path
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

ROOT = Path(__file__).parent.parent
UPLOAD_DIR = ROOT / "upload-specs"
PHOTOS_DIR = ROOT / "type-photos"
THUMBS_DIR = PHOTOS_DIR / "thumbs"
LOCATIONS_FILE = PHOTOS_DIR / "locations.json"
DONE_DIR = UPLOAD_DIR / "done"

IMAGE_EXTS = {".jpeg", ".jpg", ".png", ".JPG", ".JPEG", ".PNG"}

THUMB_WIDTH = 200
WEBP_QUALITY = 90
THUMB_QUALITY = 85


def get_gps(img):
    """Return (latitude, longitude, altitude_m) from image EXIF, or None."""
    try:
        exif_data = img._getexif()
    except Exception:
        return None
    if not exif_data:
        return None

    gps_info = {}
    for tag_id, value in exif_data.items():
        tag = TAGS.get(tag_id, tag_id)
        if tag == "GPSInfo":
            for gps_tag_id, gps_value in value.items():
                gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                gps_info[gps_tag] = gps_value

    if not gps_info:
        return None

    def dms_to_decimal(dms, ref):
        d, m, s = [float(x) for x in dms]
        decimal = d + m / 60 + s / 3600
        if ref in ("S", "W"):
            decimal = -decimal
        return decimal

    try:
        lat = dms_to_decimal(gps_info["GPSLatitude"], gps_info["GPSLatitudeRef"])
        lng = dms_to_decimal(gps_info["GPSLongitude"], gps_info["GPSLongitudeRef"])
    except KeyError:
        return None

    alt = None
    if "GPSAltitude" in gps_info:
        try:
            alt = round(float(gps_info["GPSAltitude"]), 2)
            if gps_info.get("GPSAltitudeRef") == b'\x01':
                alt = -alt
        except Exception:
            alt = None

    return lat, lng, alt


def get_date(img):
    """Return date string from EXIF, or empty string."""
    try:
        exif_data = img._getexif()
    except Exception:
        return ""
    if not exif_data:
        return ""
    for tag_id, value in exif_data.items():
        tag = TAGS.get(tag_id, tag_id)
        if tag == "DateTimeOriginal":
            return value.split(" ")[0]  # "2026:03:06"
    return ""


def to_webp(src_path, dest_path, width=None, quality=90):
    """Convert src image to WebP at dest, optionally resizing to width."""
    args = ["cwebp", "-q", str(quality)]
    if width:
        args += ["-resize", str(width), "0"]
    args += [str(src_path), "-o", str(dest_path), "-quiet"]
    subprocess.run(args, check=True)


def main():
    PHOTOS_DIR.mkdir(exist_ok=True)
    THUMBS_DIR.mkdir(exist_ok=True)
    DONE_DIR.mkdir(exist_ok=True)

    if not UPLOAD_DIR.exists():
        UPLOAD_DIR.mkdir()
        print(f"Created {UPLOAD_DIR} — drop images there and re-run.")
        return

    # Load existing locations
    if LOCATIONS_FILE.exists():
        with open(LOCATIONS_FILE) as f:
            locations = json.load(f)
    else:
        locations = {}

    images = sorted(
        p for p in UPLOAD_DIR.iterdir()
        if p.is_file() and p.suffix in IMAGE_EXTS
    )

    if not images:
        print("No images found in upload-specs/")
        return

    added = []
    skipped = []

    for src in images:
        name = src.name
        base = src.stem

        if name in locations:
            print(f"  skip (already in locations.json): {name}")
            skipped.append(name)
            continue

        print(f"  processing: {name}")

        with Image.open(src) as img:
            gps = get_gps(img)
            date = get_date(img)

        if not gps:
            print(f"    ⚠ no GPS data found — skipping")
            skipped.append(name)
            continue

        lat, lng, alt = gps

        # Copy original to type-photos/
        dest_orig = PHOTOS_DIR / name
        shutil.copy2(src, dest_orig)

        # Full-size WebP
        to_webp(dest_orig, PHOTOS_DIR / f"{base}.webp", quality=WEBP_QUALITY)

        # Thumbnail WebP
        to_webp(dest_orig, THUMBS_DIR / f"{base}.webp", width=THUMB_WIDTH, quality=THUMB_QUALITY)

        # Update locations
        entry = {"latitude": lat, "longitude": lng}
        if alt is not None:
            entry["altitude_m"] = alt
        if date:
            entry["date"] = date
        locations[name] = entry

        # Move original to done/
        shutil.move(str(src), DONE_DIR / name)

        added.append(name)
        print(f"    ✓ {lat:.5f}, {lng:.5f}")

    # Save updated locations.json
    if added:
        with open(LOCATIONS_FILE, "w") as f:
            json.dump(locations, f, indent=2)

    print()
    print(f"Done — added {len(added)}, skipped {len(skipped)}")
    if added:
        print("Reload the site to see the new markers.")


if __name__ == "__main__":
    main()
