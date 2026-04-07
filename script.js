mapboxgl.accessToken = CONFIG.MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-97.5, 34.5],
    zoom: 5
});

let sketches = [];
let currentSketchIndex = 0;
let cityGroups = [];

const CITY_RADIUS_KM = 20;   // sketches within this distance = same city
const EXPAND_ZOOM = 11;       // zoom level at which clusters pop open

map.on('load', () => {
    const layers = map.getStyle().layers;
    const keepLayers = ['settlement-major-label', 'settlement-minor-label', 'state-label', 'country-label'];
    layers.forEach(layer => {
        if (layer.type === 'symbol' && !keepLayers.some(k => layer.id.includes(k))) {
            map.removeLayer(layer.id);
        }
    });
    loadSketches();
});

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function groupByCity(sketches) {
    const groups = [];
    sketches.forEach((sketch, i) => {
        const [lng, lat] = sketch.coordinates;
        let nearest = null;
        let nearestDist = Infinity;
        for (const group of groups) {
            const dist = haversineKm(lat, lng, group.centroid[1], group.centroid[0]);
            if (dist < CITY_RADIUS_KM && dist < nearestDist) {
                nearest = group;
                nearestDist = dist;
            }
        }
        if (nearest) {
            nearest.indices.push(i);
            nearest.centroid = [
                nearest.indices.reduce((s, idx) => s + sketches[idx].coordinates[0], 0) / nearest.indices.length,
                nearest.indices.reduce((s, idx) => s + sketches[idx].coordinates[1], 0) / nearest.indices.length
            ];
        } else {
            groups.push({ centroid: [lng, lat], indices: [i] });
        }
    });
    return groups;
}

function loadSketches() {
    fetch('data.json')
        .then(r => r.json())
        .then(data => {
            sketches = data.sketches || [];
            cityGroups = groupByCity(sketches);

            // Add sketch markers first so cluster bubbles sit on top in the DOM
            cityGroups.forEach(group => {
                const isMulti = group.indices.length > 1;

                group.markerEls = group.indices.map(i => {
                    const sketch = sketches[i];
                    const el = document.createElement('div');
                    el.className = isMulti ? 'sketch-marker clustered' : 'sketch-marker';
                    el.innerHTML = `<img src="sketchbook-bank/${encodeURIComponent(sketch.filename)}" alt="${sketch.title}">`;
                    el.addEventListener('click', () => openSketchModal(i));
                    new mapboxgl.Marker(el).setLngLat(sketch.coordinates).addTo(map);
                    return el;
                });
            });

            // Add cluster bubbles last so they're on top
            cityGroups.forEach(group => {
                if (group.indices.length > 1) {
                    const el = document.createElement('div');
                    el.className = 'city-cluster';
                    el.innerHTML = `<span>${group.indices.length}</span>`;
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        map.flyTo({
                            center: group.centroid,
                            zoom: EXPAND_ZOOM + 0.5,
                            duration: 1200,
                            speed: 0.8
                        });
                    });

                    group.clusterEl = el;
                    new mapboxgl.Marker(el).setLngLat(group.centroid).addTo(map);
                }
            });

            updateVisibility();
            map.on('zoom', updateVisibility);
        })
        .catch(err => console.error('Error loading sketches:', err));
}

function updateVisibility() {
    const zoom = map.getZoom();
    cityGroups.forEach(group => {
        if (group.indices.length === 1) return; // lone sketches always visible

        const expanded = zoom >= EXPAND_ZOOM;

        group.clusterEl.style.display = expanded ? 'none' : 'flex';

        group.markerEls.forEach(el => {
            el.classList.toggle('clustered', !expanded);
        });
    });
}

// ── Modal ──────────────────────────────────────────────────────────────────

function openSketchModal(index) {
    currentSketchIndex = index;
    displaySketch(index);
    document.getElementById('sketch-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeSketchModal() {
    document.getElementById('sketch-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function displaySketch(index) {
    if (index < 0 || index >= sketches.length) return;
    const sketch = sketches[index];
    document.getElementById('modal-image').src = `sketchbook-bank/${encodeURIComponent(sketch.filename)}`;
    document.getElementById('modal-title').textContent = sketch.title;
    document.getElementById('modal-date').textContent = sketch.date || '';
    document.getElementById('modal-location').textContent =
        `${sketch.coordinates[1].toFixed(4)}, ${sketch.coordinates[0].toFixed(4)}`;
    document.getElementById('sketch-counter').textContent = `${index + 1} / ${sketches.length}`;
    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').disabled = index === sketches.length - 1;
}

function nextSketch() {
    if (currentSketchIndex < sketches.length - 1) {
        currentSketchIndex++;
        displaySketch(currentSketchIndex);
    }
}

function prevSketch() {
    if (currentSketchIndex > 0) {
        currentSketchIndex--;
        displaySketch(currentSketchIndex);
    }
}

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('sketch-modal');
    if (modal.style.display === 'flex') {
        if (e.key === 'Escape') closeSketchModal();
        else if (e.key === 'ArrowRight') nextSketch();
        else if (e.key === 'ArrowLeft') prevSketch();
    }
});
