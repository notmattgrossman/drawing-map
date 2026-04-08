#!/bin/bash
# Converts images in sketchbook-bank/ and type-photos/ to:
#   - <folder>/thumbs/*.webp  200px-wide WebP thumbnail (for map markers)
#   - type-photos/*.webp      full-size WebP (for type photo modal; sketchbooks stay as PNG)
# Originals are left untouched.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

convert_folder() {
    local DIR="$1"
    local full="$2"   # "yes" to also write full-size WebP alongside originals
    local THUMBS="$DIR/thumbs"
    mkdir -p "$THUMBS"
    local count=0 skipped=0

    for f in "$DIR"/*.jpeg "$DIR"/*.jpg "$DIR"/*.JPG "$DIR"/*.png "$DIR"/*.PNG; do
        [ -f "$f" ] || continue
        base="${f%.*}"
        name="$(basename "$base")"
        thumb_out="$THUMBS/${name}.webp"
        converted=0

        if [ "$full" = "yes" ]; then
            full_out="${base}.webp"
            if [ ! -f "$full_out" ]; then
                cwebp -q 90 "$f" -o "$full_out" -quiet
                ((converted++))
            fi
        fi

        if [ ! -f "$thumb_out" ]; then
            cwebp -q 85 -resize 200 0 "$f" -o "$thumb_out" -quiet
            ((converted++))
        fi

        if [ "$converted" -gt 0 ]; then ((count++)); else ((skipped++)); fi
    done

    echo "  Converted: $count  |  Already done: $skipped"
}

echo "sketchbook-bank/"
convert_folder "$ROOT/sketchbook-bank" "no"

echo "type-photos/"
convert_folder "$ROOT/type-photos" "yes"
