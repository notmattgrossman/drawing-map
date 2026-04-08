# Type Photos

Photos of type specimens mapped to their real-world locations.

## Adding new photos

1. Drop images into the `upload-specs/` folder at the project root
2. From the project root, run:
   ```
   python3 scripts/process-type-photos.py
   ```
3. Reload the site — new markers appear automatically

The script reads GPS coordinates from each photo's EXIF metadata, so **photos must have location data enabled** when shot. Images without GPS are skipped with a warning.

Processed originals are moved to `upload-specs/done/` so re-running the script is safe.

## Folder structure

```
type-photos/
  *.jpeg / *.png     original photos (source of truth)
  *.webp             full-size WebP versions (loaded in the modal)
  thumbs/*.webp      200px thumbnails (loaded as map markers)
  locations.json     GPS coordinates + date for each photo
```

## locations.json format

```json
{
  "IMG_1234.jpeg": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "altitude_m": 52.3,
    "date": "2026:03:06"
  }
}
```

Only photos with an entry here (and valid coordinates) appear on the map.
