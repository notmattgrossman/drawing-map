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

let mode = 'sketches'; // 'sketches' | 'types'
let sketches = [];
let typePhotos = [];
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

function getActiveItems() {
    return mode === 'sketches' ? sketches : typePhotos;
}

function getImagePath(item, thumb = false) {
    const base = item.filename.replace(/\.[^.]+$/, '');
    if (mode === 'sketches') {
        return thumb
            ? `sketchbook-bank/thumbs/${encodeURIComponent(base)}.webp`
            : `sketchbook-bank/${encodeURIComponent(item.filename)}`;
    }
    return thumb
        ? `type-photos/thumbs/${encodeURIComponent(base)}.webp`
        : `type-photos/${encodeURIComponent(base)}.webp`;
}

// Set initial slider position once fonts/layout have settled
requestAnimationFrame(positionToggleSlider);

map.on('load', () => {
    const layers = map.getStyle().layers;
    const keepLayers = ['settlement-major-label', 'settlement-minor-label', 'state-label', 'country-label'];
    layers.forEach(layer => {
        if (layer.type === 'symbol' && !keepLayers.some(k => layer.id.includes(k))) {
            map.removeLayer(layer.id);
        }
    });
    loadSketches();
    loadTypePhotos();
});

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function groupByCity(items) {
    const groups = [];
    items.forEach((item, i) => {
        const [lng, lat] = item.coordinates;
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
                nearest.indices.reduce((s, idx) => s + items[idx].coordinates[0], 0) / nearest.indices.length,
                nearest.indices.reduce((s, idx) => s + items[idx].coordinates[1], 0) / nearest.indices.length
            ];
        } else {
            groups.push({ centroid: [lng, lat], indices: [i] });
        }
    });
    return groups;
}

function getNearbyGroups(items) {
    const groups = [];
    const processed = new Set();

    items.forEach((item, i) => {
        if (processed.has(i)) return;

        const nearby = [i];
        items.forEach((other, j) => {
            if (i !== j && !processed.has(j)) {
                const dLng = Math.abs(item.coordinates[0] - other.coordinates[0]);
                const dLat = Math.abs(item.coordinates[1] - other.coordinates[1]);
                if (dLng < PROXIMITY_THRESHOLD && dLat < PROXIMITY_THRESHOLD) {
                    nearby.push(j);
                }
            }
        });

        if (nearby.length > 1) {
            nearby.forEach(idx => processed.add(idx));
            groups.push({ indices: nearby, center: item.coordinates });
        } else {
            processed.add(i);
        }
    });

    return groups;
}

function getOffsetCoordinates(center, index, total, zoom) {
    const baseRadius = 0.0008;
    const zoomFactor = Math.max(0.5, (5 - zoom) / 5);
    const radius = baseRadius * zoomFactor;
    const angle = (index / total) * Math.PI * 2;
    return [
        center[0] + radius * Math.cos(angle),
        center[1] + radius * Math.sin(angle)
    ];
}

function updateMarkerPositions() {
    const items = getActiveItems();
    const zoom = map.getZoom();
    const nearbyGroups = getNearbyGroups(items);

    markers.forEach((markerData, i) => {
        let group = nearbyGroups.find(g => g.indices.includes(i));

        if (group && group.indices.length > 1) {
            const position = group.indices.indexOf(i);
            const offsetCoords = getOffsetCoordinates(group.center, position, group.indices.length, zoom);
            markerData.marker.setLngLat(offsetCoords);
        } else {
            markerData.marker.setLngLat(items[i].coordinates);
        }
    });
}

function renderMarkers(items) {
    cityGroups = groupByCity(items);

    items.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'sketch-marker';
        el.innerHTML = `<img src="${getImagePath(item, true)}" alt="${item.title}">`;
        el.addEventListener('click', () => handleMarkerClick(i));

        const marker = new mapboxgl.Marker(el).setLngLat(item.coordinates).addTo(map);
        markers.push({ marker, index: i });
    });

    updateMarkerPositions();
}

function preload(srcs) {
    srcs.forEach(src => { new Image().src = src; });
}

function loadSketches() {
    fetch('data.json')
        .then(r => r.json())
        .then(data => {
            sketches = data.sketches || [];
            renderMarkers(sketches);                            // 1. sketch thumbnails (in DOM)
            map.on('zoom', updateMarkerPositions);
            map.on('move', updateMarkerPositions);

            setTimeout(() =>                                   // 3. sketch full images
                preload(sketches.map(s => `sketchbook-bank/${encodeURIComponent(s.filename)}`))
            , 3000);
        })
        .catch(err => console.error('Error loading sketches:', err));
}

function loadTypePhotos() {
    fetch('type-photos/locations.json')
        .then(r => r.json())
        .then(data => {
            typePhotos = Object.entries(data)
                .filter(([, info]) => info.latitude != null && info.longitude != null)
                .map(([filename, info]) => ({
                    filename,
                    coordinates: [info.longitude, info.latitude],
                    title: filename.replace(/\.[^.]+$/, ''),
                    date: info.date ? info.date.replace(/:/g, '-') : ''
                }));

            preload(typePhotos.map(item => {                   // 2. type thumbnails (background, ~3 MB)
                const base = item.filename.replace(/\.[^.]+$/, '');
                return `type-photos/thumbs/${encodeURIComponent(base)}.webp`;
            }));

            setTimeout(() =>                                   // 4. type full images
                preload(typePhotos.map(item => {
                    const base = item.filename.replace(/\.[^.]+$/, '');
                    return `type-photos/${encodeURIComponent(base)}.webp`;
                }))
            , 6000);
        })
        .catch(err => console.error('Error loading type photos:', err));
}

function positionToggleSlider() {
    const toggle = document.getElementById('mode-toggle');
    const activeBtn = toggle.querySelector('.toggle-btn.active');
    const slider = toggle.querySelector('.toggle-slider');
    const toggleRect = toggle.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    slider.style.width = btnRect.width + 'px';
    slider.style.transform = `translateX(${btnRect.left - toggleRect.left - 4}px)`;
}

function switchMode(newMode) {
    if (mode === newMode) return;
    mode = newMode;

    // Clear existing markers
    markers.forEach(m => m.marker.remove());
    markers = [];

    // Update toggle UI
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === newMode);
    });
    positionToggleSlider();

    // Exit tour if switching away from sketches
    if (newMode !== 'sketches' && tourActive) {
        exitTour();
    }

    // Apply body class for CSS-driven show/hide of tour UI
    document.body.classList.toggle('mode-types', newMode === 'types');

    renderMarkers(getActiveItems());
}

// Mode toggle events
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// ── Marker click ──────────────────────────────────────────────────────────

function handleMarkerClick(index) {
    const items = getActiveItems();
    const group = cityGroups.find(g => g.indices.includes(index));
    if (group && group.indices.length > 1 && map.getZoom() < EXPAND_ZOOM) {
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        group.indices.forEach(i => {
            const [lng, lat] = items[i].coordinates;
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
    const items = getActiveItems();
    if (index < 0 || index >= items.length) return;
    const item = items[index];
    document.getElementById('modal-image').src = getImagePath(item, false);
    document.getElementById('modal-title').textContent = item.title;
    document.getElementById('modal-date').textContent = item.date || '';

    const lat = item.coordinates[1];
    const lng = item.coordinates[0];
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const formattedCoords = `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;

    document.getElementById('modal-location').textContent = formattedCoords;
    document.getElementById('sketch-counter').textContent = `${index + 1} / ${items.length}`;
    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').disabled = index === items.length - 1;
}

function nextSketch() {
    if (currentSketchIndex < getActiveItems().length - 1) {
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

    const radius = city.radius || 50;
    const sketchesInCity = sketches.filter(sketch => {
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
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        sketchesInCity.forEach(sketch => {
            const [lng, lat] = sketch.coordinates;
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        });

        const padding = 0.05;
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

    document.getElementById('tour-prev-btn').disabled = currentTourIndex === 0;
    document.getElementById('tour-next-btn').disabled = currentTourIndex === tourCities.length - 1;

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
