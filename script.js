mapboxgl.accessToken = CONFIG.MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-95, 40],
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
    pitchWithRotate: false,
    dragRotate: false
});

let sketches = [];
let currentSketchIndex = 0;
let cityGroups = [];
let markers = [];

const CITY_RADIUS_KM = 20;   // sketches within this distance = same city
const EXPAND_ZOOM = 11;       // zoom level at which clusters pop open

// Tour data
const tourCities = [
    { name: 'Copenhagen', center: [12.57, 55.68], zoom: 11, radius: 50 },
    { name: 'Oslo', center: [10.75, 59.91], zoom: 11, radius: 50 },
    { name: 'Arles', center: [4.63, 43.68], zoom: 12, radius: 40, exclude: [[5.3656, 43.3005]] },
    { name: 'Florence', center: [11.26, 43.77], zoom: 12, radius: 50 },
    { name: 'London', center: [-0.13, 51.51], zoom: 11, radius: 50 },
    { name: 'Guadalupe Mountains National Park', center: [-104.87, 31.89], zoom: 10, radius: 50 },
    { name: 'San Francisco', center: [-122.42, 37.77], zoom: 11, radius: 50 },
    { name: 'St. Louis', center: [-90.25, 38.63], zoom: 11, radius: 50 }
];

let tourActive = false;
let currentTourIndex = 0;

const PROXIMITY_THRESHOLD = 0.001; // ~100 meters for detecting overlaps
const MIN_SPREAD_DISTANCE = 60; // pixels - minimum distance before spreading

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

function getNearbyGroups() {
    // Group sketches that are very close together
    const groups = [];
    const processed = new Set();

    sketches.forEach((sketch, i) => {
        if (processed.has(i)) return;

        const nearby = [i];
        sketches.forEach((otherSketch, j) => {
            if (i !== j && !processed.has(j)) {
                const dLng = Math.abs(sketch.coordinates[0] - otherSketch.coordinates[0]);
                const dLat = Math.abs(sketch.coordinates[1] - otherSketch.coordinates[1]);
                if (dLng < PROXIMITY_THRESHOLD && dLat < PROXIMITY_THRESHOLD) {
                    nearby.push(j);
                }
            }
        });

        if (nearby.length > 1) {
            nearby.forEach(idx => processed.add(idx));
            groups.push({ indices: nearby, center: sketch.coordinates });
        } else {
            processed.add(i);
        }
    });

    return groups;
}

function getOffsetCoordinates(center, index, total, zoom) {
    // Spread radius increases as zoom decreases (more spread when zoomed out)
    const baseRadius = 0.0008;
    const zoomFactor = Math.max(0.5, (5 - zoom) / 5); // More spread at low zoom
    const radius = baseRadius * zoomFactor;
    const angle = (index / total) * Math.PI * 2;
    return [
        center[0] + radius * Math.cos(angle),
        center[1] + radius * Math.sin(angle)
    ];
}

function updateMarkerPositions() {
    const zoom = map.getZoom();
    const nearbyGroups = getNearbyGroups();

    markers.forEach((markerData, i) => {
        // Find if this marker is in a nearby group
        let group = nearbyGroups.find(g => g.indices.includes(i));

        if (group && group.indices.length > 1) {
            // Calculate offset position
            const position = group.indices.indexOf(i);
            const offsetCoords = getOffsetCoordinates(group.center, position, group.indices.length, zoom);
            markerData.marker.setLngLat(offsetCoords);
        } else {
            // Reset to actual coordinates
            markerData.marker.setLngLat(sketches[i].coordinates);
        }
    });
}

function loadSketches() {
    fetch('data.json')
        .then(r => r.json())
        .then(data => {
            sketches = data.sketches || [];
            cityGroups = groupByCity(sketches);

            // Add sketch markers
            sketches.forEach((sketch, i) => {
                const el = document.createElement('div');
                el.className = 'sketch-marker';
                el.innerHTML = `<img src="sketchbook-bank/${encodeURIComponent(sketch.filename)}" alt="${sketch.title}">`;
                el.addEventListener('click', () => handleMarkerClick(i));

                const marker = new mapboxgl.Marker(el).setLngLat(sketch.coordinates).addTo(map);
                markers.push({ marker, index: i });
            });

            // Update positions on zoom/pan
            updateMarkerPositions();
            map.on('zoom', updateMarkerPositions);
            map.on('move', updateMarkerPositions);
        })
        .catch(err => console.error('Error loading sketches:', err));
}

// ── Marker click ──────────────────────────────────────────────────────────

function handleMarkerClick(index) {
    const group = cityGroups.find(g => g.indices.includes(index));
    if (group && group.indices.length > 1 && map.getZoom() < EXPAND_ZOOM) {
        // Zoom to fit the whole group
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        group.indices.forEach(i => {
            const [lng, lat] = sketches[i].coordinates;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        });
        map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 80, maxZoom: EXPAND_ZOOM + 1, duration: 600 }
        );
    } else {
        openSketchModal(index);
    }
}

// ── Modal ──────────────────────────────────────────────────────────────────

function openSketchModal(index) {
    currentSketchIndex = index;
    displaySketch(index);
    const modal = document.getElementById('sketch-modal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Close on background click (but not on modal-content click)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSketchModal();
        }
    });
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

    const lat = sketch.coordinates[1];
    const lng = sketch.coordinates[0];
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const formattedCoords = `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;

    document.getElementById('modal-location').textContent = formattedCoords;
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

// ── Tour ──────────────────────────────────────────────────────────────────

function startTour() {
    tourActive = true;
    currentTourIndex = 0;
    updateTourUI();
    goToTourCity(0);
}

function exitTour() {
    tourActive = false;
    document.getElementById('tour-btn').style.display = 'block';
    document.getElementById('tour-bar').style.display = 'none';
    map.flyTo({ center: [-95, 40], zoom: 3.5, duration: 1000 });
}

function goToTourCity(index) {
    if (index < 0 || index >= tourCities.length) return;

    currentTourIndex = index;
    const city = tourCities[index];

    // Find sketches near this city
    const radius = city.radius || 50;
    const sketchesInCity = sketches.filter(sketch => {
        // Check if excluded
        if (city.exclude) {
            const isExcluded = city.exclude.some(excluded =>
                Math.abs(sketch.coordinates[0] - excluded[0]) < 0.01 &&
                Math.abs(sketch.coordinates[1] - excluded[1]) < 0.01
            );
            if (isExcluded) return false;
        }

        const dist = haversineKm(
            sketch.coordinates[1],
            sketch.coordinates[0],
            city.center[1],
            city.center[0]
        );
        return dist < radius;
    });

    if (sketchesInCity.length > 0) {
        // Calculate bounds of sketches
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        sketchesInCity.forEach(sketch => {
            const [lng, lat] = sketch.coordinates;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        });

        // Add padding and fit bounds
        const padding = 0.05; // 5% padding
        const lngPadding = (maxLng - minLng) * padding;
        const latPadding = (maxLat - minLat) * padding;

        map.fitBounds(
            [
                [minLng - lngPadding, minLat - latPadding],
                [maxLng + lngPadding, maxLat + latPadding]
            ],
            {
                duration: 1200,
                maxZoom: 15,
                padding: { top: 80, bottom: 40, left: 40, right: 40 }
            }
        );
    } else {
        // Fallback if no sketches found
        map.flyTo({
            center: city.center,
            zoom: city.zoom,
            duration: 1200,
            speed: 0.8
        });
    }

    updateTourUI();
}

function updateTourUI() {
    const city = tourCities[currentTourIndex];
    document.getElementById('tour-city-name').textContent = city.name;

    // Enable/disable buttons
    document.getElementById('tour-prev-btn').disabled = currentTourIndex === 0;
    document.getElementById('tour-next-btn').disabled = currentTourIndex === tourCities.length - 1;

    // Show bar
    document.getElementById('tour-bar').style.display = 'flex';
}

// Tour button events
document.getElementById('tour-btn').addEventListener('click', () => {
    document.getElementById('tour-btn').style.display = 'none';
    startTour();
});

document.getElementById('tour-prev-btn').addEventListener('click', () => {
    if (currentTourIndex > 0) {
        goToTourCity(currentTourIndex - 1);
    }
});

document.getElementById('tour-next-btn').addEventListener('click', () => {
    if (currentTourIndex < tourCities.length - 1) {
        goToTourCity(currentTourIndex + 1);
    }
});

document.getElementById('tour-exit-btn').addEventListener('click', exitTour);
