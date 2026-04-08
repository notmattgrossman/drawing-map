# Sketchbook Bank

Hand-drawn sketch images mapped to their real-world locations.

## Adding new sketches

1. Drop sketch images (PNG recommended) into `upload-sketches/` at the project root
2. From the project root, run:
   ```
   python3 scripts/process-sketches.py
   ```
3. Start the local server (`npm start`) and open `http://localhost:3000/admin`
4. New sketches appear in the admin queue — click the map to place each one, then confirm

Processed originals are moved to `upload-sketches/done/` so re-running is safe.

## Folder structure

```
sketchbook-bank/
  *.png              original sketch images (source of truth)
  thumbs/*.webp      200px thumbnails (loaded as map markers)
```

## How placement works

The admin panel shows unplaced sketches one at a time (anything in `sketchbook-bank/` not yet in `data.json`). Click the map to drop a pin, confirm, and the sketch is saved to `data.json` with its coordinates. The main map picks it up on next load.
