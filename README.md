# Sketchbook Map

An interactive map built with Mapbox GL JS that plots hand-drawn sketchbook pages and real-world type specimen photos at their locations. Toggle between the two collections at the bottom of the screen.

## Running locally

```
npm start
```

Serves the app at `http://localhost:3000`. Requires a `config.js` with your Mapbox token — copy `config.example.js` and fill it in.

## Structure

```
sketchbook-bank/       sketch images + thumbs/
type-photos/           type specimen photos + thumbs/ (see type-photos/README.md)
upload-sketches/       drop new sketch images here before processing
upload-specs/          drop new type photos here before processing
admin/                 drag-and-drop tool for placing sketches on the map
scripts/               build + image processing scripts
data.json              sketch locations (96 entries)
type-photos/locations.json   type photo GPS data
```

## Adding content

**Sketches** — open `/admin` in the browser while the server is running. Images from `sketchbook-bank/` that haven't been placed yet will appear one at a time; click the map to set a location, then confirm.

**Type photos** — drop photos into `upload-specs/` and run:
```
python3 scripts/process-type-photos.py
```
Photos need GPS EXIF data (location enabled on your phone). See `type-photos/README.md` for details.

## Deployment

Deployed to GitHub Pages via GitHub Actions. Push to `main` — the action builds `config.js` from the `MAPBOX_ACCESS_TOKEN` repository secret and deploys automatically.
