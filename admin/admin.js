mapboxgl.accessToken = CONFIG.MAPBOX_ACCESS_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-97.5, 34.5],
    zoom: 5
});

let allImages = [];
let unplacedImages = [];
let currentIndex = 0;
let sketches = [];
let pendingLocation = null;
let placedMarkers = [];

map.on('load', () => {
    console.log('Map loaded successfully!');
    
    const layers = map.getStyle().layers;
    const keepLayers = [
        'settlement-major-label',
        'settlement-minor-label',
        'state-label',
        'country-label'
    ];
    
    layers.forEach((layer) => {
        if (layer.type === 'symbol') {
            const shouldKeep = keepLayers.some(keep => layer.id.includes(keep));
            if (!shouldKeep) {
                map.removeLayer(layer.id);
            }
        }
    });
    
    loadExistingData();
});

map.on('click', (e) => {
    if (currentIndex < allImages.length) {
        handleMapClick(e);
    }
});

async function loadExistingData() {
    try {
        const response = await fetch('../data.json');
        const data = await response.json();
        sketches = data.sketches || [];
        
        // Add markers for existing sketches
        sketches.forEach(sketch => addMarkerToMap(sketch));
        
        console.log(`Loaded ${sketches.length} existing sketches`);
    } catch (error) {
        console.log('No existing data found, starting fresh');
        sketches = [];
    }
    
    loadImages();
}

function loadImages() {
    // List of all images in sketchbook-bank folder
    allImages = [
        '2E.png', 'Alice.png', 'Alien.png', 'Amoco Sign.png', 'Berlin TV Tower.png',
        'Big Ben.png', 'Bingo.png', 'Book.png', 'Bubbles.png', 'Buchstaben Museum.png',
        'CPH Faves-1.png', 'CPH Faves.png', 'Cafe.png', 'Casa.png', 'Chair.png',
        'Coffee.png', 'Cover 2.png', 'Cover-1.png', 'Cover.png', 'Covers.png',
        'Curators.png', 'David.png', 'Demo.png', 'Double Spread.png', 'Draw 1.png',
        'Draw 10.png', 'Draw 2.png', 'Draw 3.png', 'Draw 4.png', 'Draw 5.png',
        'Draw 6.png', 'Draw 7.png', 'Draw 8.png', 'Draw 9.png', 'Dublin.png',
        'Duomo 1.png', 'Duomo 2.png', 'Eads Bridge.png', 'El Capitan.png', 'Fjord.png',
        'Flora.png', 'GGB.png', 'Gators.png', 'Gif 1.png', 'Guadalupe.png',
        'Houjse.png', 'Hygge.png', 'Iceland.png', 'Ina Coolbrith.png', 'Inside Cover.png',
        'Inside Covers.png', 'Instagram post - 1.png', 'Instagram post - 2.png', 'Instagram post - 3.png', 'Instagram post - 4.png',
        'Isalnds Brygge Painting.png', 'Islands Brygge.png', 'Jazz.png', 'Jazzy.png', 'Landscape 1.png',
        'Landscape 2.png', 'Landscape 3.png', 'Letters 2.png', 'Letters.png', 'MacArthur Bridge.png',
        'Map.png', 'Market.png', 'Metro Map.png', 'Mission Delores.png', 'Narrows.png',
        'Nightscape.png', 'Park.png', 'Phone.png', 'Rnadom.png', 'Ross Maxwell.png',
        'Scream.png', 'Scribbles.png', 'Sketchnotes.png', 'Sticker.png', 'Studio 54.png',
        'Tech.png', 'Thumbnails.png', 'Tile 1.png', 'Tile 2.png', 'Transportation.png',
        'Tulips.png', 'Ucity.png', 'Venezias.png', 'Vigeland Center.png', 'Vigeland Left.png',
        'Vigeland Right.png', 'WC Pallette.png', 'WSNP.png', 'Watercolors.png', 'Window.png',
        'weed.png'
    ];
    
    // Filter out images that are already placed
    const placedFilenames = sketches.map(s => s.filename);
    unplacedImages = allImages.filter(img => !placedFilenames.includes(img));
    
    if (unplacedImages.length === 0) {
        showAllComplete();
        return;
    }
    
    console.log(`${unplacedImages.length} images remaining to place (${sketches.length} already placed)`);
    showCurrentImage();
}

function showCurrentImage() {
    if (currentIndex >= unplacedImages.length) {
        showComplete();
        return;
    }
    
    const filename = unplacedImages[currentIndex];
    document.getElementById('current-image').src = `../sketchbook-bank/${encodeURIComponent(filename)}`;
    document.getElementById('current-filename').textContent = filename;
    document.getElementById('progress-text').textContent = `${currentIndex + 1} of ${unplacedImages.length} remaining`;
    
    document.getElementById('back-btn').disabled = currentIndex === 0;
    document.getElementById('confirm-btn').disabled = true;
    
    clearTempMarker();
    pendingLocation = null;
}

function handleMapClick(e) {
    pendingLocation = [e.lngLat.lng, e.lngLat.lat];
    
    const point = map.project(e.lngLat);
    const tempMarker = document.getElementById('temp-marker');
    tempMarker.style.left = point.x + 'px';
    tempMarker.style.top = point.y + 'px';
    tempMarker.style.display = 'block';
    
    document.getElementById('confirm-btn').disabled = false;
}

function clearTempMarker() {
    document.getElementById('temp-marker').style.display = 'none';
}

function confirmLocation() {
    if (!pendingLocation) return;
    
    const filename = unplacedImages[currentIndex];
    const sketch = {
        id: `sketch-${Date.now()}`,
        filename: filename,
        coordinates: pendingLocation,
        title: filename.replace(/\.[^/.]+$/, ''),
        date: ''
    };
    
    sketches.push(sketch);
    addMarkerToMap(sketch);
    
    // Auto-save to server
    autoSaveData();
    
    showStatus('Location saved');
    
    currentIndex++;
    showCurrentImage();
}

function skipImage() {
    currentIndex++;
    showCurrentImage();
}

function goBack() {
    if (currentIndex > 0) {
        currentIndex--;
        
        if (sketches.length > 0 && sketches[sketches.length - 1].filename === unplacedImages[currentIndex]) {
            const lastSketch = sketches.pop();
            const markerObj = placedMarkers.find(m => m.id === lastSketch.id);
            if (markerObj) {
                markerObj.marker.remove();
                placedMarkers = placedMarkers.filter(m => m.id !== lastSketch.id);
            }
            // Auto-save after removal
            autoSaveData();
        }
        
        showCurrentImage();
    }
}

function addMarkerToMap(sketch) {
    const el = document.createElement('div');
    el.className = 'placed-marker';
    el.innerHTML = `<img src="../sketchbook-bank/${encodeURIComponent(sketch.filename)}" alt="${sketch.title}">`;
    
    const marker = new mapboxgl.Marker(el)
        .setLngLat(sketch.coordinates)
        .addTo(map);
    
    placedMarkers.push({ id: sketch.id, marker: marker });
}

function showComplete() {
    document.getElementById('current-image').style.display = 'none';
    document.getElementById('current-filename').textContent = 'All remaining images placed!';
    document.getElementById('progress-text').textContent = `${sketches.length} total sketches`;
    document.getElementById('map-instruction').textContent = 'All done! Data is auto-saved.';
    
    document.getElementById('confirm-btn').style.display = 'none';
    document.getElementById('skip-btn').style.display = 'none';
    document.getElementById('back-btn').style.display = 'none';
    document.getElementById('save-data').style.display = 'block';
}

function showAllComplete() {
    document.getElementById('current-image').style.display = 'none';
    document.getElementById('current-filename').textContent = 'All images already placed!';
    document.getElementById('progress-text').textContent = `${sketches.length} total sketches`;
    document.getElementById('map-instruction').textContent = 'Nothing left to place. Reload to review.';
    
    document.getElementById('confirm-btn').style.display = 'none';
    document.getElementById('skip-btn').style.display = 'none';
    document.getElementById('back-btn').style.display = 'none';
    document.getElementById('save-data').style.display = 'block';
}

async function autoSaveData() {
    const data = {
        sketches: sketches
    };
    
    try {
        const response = await fetch('/api/save-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const msg = `✓ Saved ${sketches.length} sketches to data.json`;
            console.log(msg);
            document.getElementById('save-status').textContent = msg;
        }
    } catch (error) {
        console.log('Auto-save failed (server not running?):', error.message);
    }
}

function saveData() {
    const data = {
        sketches: sketches
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    
    // Try to save to server first
    fetch('/api/save-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: dataStr
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showStatus(`Saved ${sketches.length} sketches to data.json!`);
        }
    })
    .catch(() => {
        // Fallback to download if server not running
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus(`Server not running. Downloaded data.json - move it to your project folder.`);
    });
}

function showStatus(message) {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = 'status-message show';
    
    setTimeout(() => {
        statusEl.className = 'status-message';
    }, 3000);
}

document.getElementById('confirm-btn').addEventListener('click', confirmLocation);
document.getElementById('skip-btn').addEventListener('click', skipImage);
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('save-data').addEventListener('click', saveData);

map.on('move', () => {
    if (pendingLocation) {
        const point = map.project(pendingLocation);
        const tempMarker = document.getElementById('temp-marker');
        tempMarker.style.left = point.x + 'px';
        tempMarker.style.top = point.y + 'px';
    }
});

// Search functionality
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchTimeout;

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        searchResults.classList.remove('show');
        return;
    }
    
    searchTimeout = setTimeout(() => {
        searchLocation(query);
    }, 300);
});

searchInput.addEventListener('blur', () => {
    setTimeout(() => {
        searchResults.classList.remove('show');
    }, 200);
});

async function searchLocation(query) {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=5`
        );
        const data = await response.json();
        
        displaySearchResults(data.features);
    } catch (error) {
        console.error('Search error:', error);
    }
}

function displaySearchResults(features) {
    if (features.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item"><div class="result-name">No results found</div></div>';
        searchResults.classList.add('show');
        return;
    }
    
    searchResults.innerHTML = '';
    
    features.forEach(feature => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        const name = document.createElement('div');
        name.className = 'result-name';
        name.textContent = feature.place_name.split(',')[0];
        
        const type = document.createElement('div');
        type.className = 'result-type';
        type.textContent = feature.place_name;
        
        item.appendChild(name);
        item.appendChild(type);
        
        item.addEventListener('click', () => {
            flyToLocation(feature.center);
            searchInput.value = '';
            searchResults.classList.remove('show');
        });
        
        searchResults.appendChild(item);
    });
    
    searchResults.classList.add('show');
}

function flyToLocation(coordinates) {
    map.flyTo({
        center: coordinates,
        zoom: 12,
        essential: true
    });
}

// ── Tab navigation ────────────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.panel}-panel`).classList.add('active');
    });
});

// ── Upload ────────────────────────────────────────────────────────────────

let uploadQueue = [];
let isUploading = false;

function initUploadZones() {
    document.querySelectorAll('.upload-zone').forEach(zone => {
        const input = zone.querySelector('.zone-input');
        const type = zone.dataset.type;

        // Click anywhere in the zone triggers file picker
        zone.addEventListener('click', e => {
            if (e.target !== input) input.click();
        });

        input.addEventListener('change', () => {
            enqueue(Array.from(input.files), type);
            input.value = '';
        });

        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            enqueue(Array.from(e.dataTransfer.files), type);
        });
    });

    document.getElementById('clear-done-btn').addEventListener('click', () => {
        document.querySelectorAll('.queue-item.done, .queue-item.error').forEach(el => el.remove());
        if (!document.querySelector('.queue-item')) {
            document.getElementById('queue-section').style.display = 'none';
        }
    });
}

function enqueue(files, type) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;

    document.getElementById('queue-section').style.display = 'block';

    imageFiles.forEach(file => {
        const id = `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        uploadQueue.push({ id, file, type });
        renderQueueItem(id, file.name, type, 'queued');
    });

    processQueue();
}

function renderQueueItem(id, filename, type, status, message = '') {
    const queue = document.getElementById('upload-queue');
    let item = document.getElementById(id);

    if (!item) {
        item = document.createElement('div');
        item.id = id;
        item.className = 'queue-item';
        queue.appendChild(item);
    }

    const typeLabel = type === 'sketch' ? 'Sketch' : 'Type';
    const statusText = {
        queued:     'Queued',
        uploading:  'Uploading...',
        processing: 'Processing...',
        done:       message || 'Done',
        error:      message || 'Error',
        skipped:    message || 'Skipped',
    }[status] || status;

    item.className = `queue-item ${status}`;
    item.innerHTML = `
        <span class="queue-filename">${filename}</span>
        <span class="queue-type">${typeLabel}</span>
        <span class="queue-status">${statusText}</span>
    `;
}

async function processQueue() {
    if (isUploading || uploadQueue.length === 0) return;
    isUploading = true;

    while (uploadQueue.length > 0) {
        const { id, file, type } = uploadQueue.shift();
        renderQueueItem(id, file.name, type, 'uploading');

        try {
            const base64 = await readAsBase64(file);
            const res = await fetch('http://localhost:3000/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, filename: file.name, data: base64 })
            });

            if (!res.ok) {
                const msg = res.status === 405 || res.status === 404
                    ? 'Server not running — start with: npm start'
                    : `Server error ${res.status}`;
                renderQueueItem(id, file.name, type, 'error', msg);
                continue;
            }

            const result = await res.json();

            if (result.success) {
                const summary = parseSummary(result.output, type);
                renderQueueItem(id, file.name, type, 'done', summary);
            } else {
                const err = parseError(result.output, result.error);
                renderQueueItem(id, file.name, type, 'error', err);
            }
        } catch (err) {
            const msg = err.message.includes('fetch')
                ? 'Server not running — start with: npm start'
                : err.message;
            renderQueueItem(id, file.name, type, 'error', msg);
        }
    }

    isUploading = false;
}

function readAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function parseSummary(output, type) {
    if (!output) return 'Done';
    if (output.includes('no GPS')) return 'No GPS data — skipped';
    if (output.includes('already registered') || output.includes('already in locations')) return 'Already exists';
    const match = output.match(/added (\d+)/);
    if (match && match[1] === '0') return 'Already exists';
    if (type === 'sketch') return 'Ready to place — reload page';
    return 'Added to map — reload to see';
}

function parseError(output, error) {
    if (output && output.includes('no GPS')) return 'No GPS data — skipped';
    return error || 'Unknown error';
}

initUploadZones();
