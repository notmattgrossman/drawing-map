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
