const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawnSync } = require('child_process');

const PORT = 3000;
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Enable CORS (allow Live Server on 5500 as well as direct access)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API endpoint to upload and process an image
    if (pathname === '/api/upload' && req.method === 'POST') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const { type, filename, data } = JSON.parse(Buffer.concat(chunks).toString());

                const allowedExts = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
                if (!allowedExts.includes(path.extname(filename))) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid file type' }));
                    return;
                }

                const uploadDir = type === 'sketch'
                    ? path.join(__dirname, 'upload-sketches')
                    : path.join(__dirname, 'upload-specs');
                const script = type === 'sketch'
                    ? path.join(__dirname, 'scripts', 'process-sketches.py')
                    : path.join(__dirname, 'scripts', 'process-type-photos.py');

                fs.mkdirSync(uploadDir, { recursive: true });
                fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(data, 'base64'));

                const result = spawnSync('python3', [script], { cwd: __dirname, encoding: 'utf8' });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: result.status === 0,
                    output: result.stdout,
                    error: result.stderr || ''
                }));

                console.log(`↑ uploaded ${filename} (${type})`);
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API endpoint to save data
    if (pathname === '/api/save-data' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const filePath = path.join(__dirname, 'data.json');
                
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Data saved successfully' }));
                
                console.log(`✓ Saved ${data.sketches.length} sketches to data.json`);
            } catch (error) {
                console.error('Error saving data:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // Serve static files
    let filePath = '.' + decodeURIComponent(pathname);
    if (filePath === './') {
        filePath = './index.html';
    } else if (filePath === './admin' || filePath === './admin/') {
        filePath = './admin/index.html';
    }

    const extname = path.extname(filePath);
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║   Sketchbook Map Server Running            ║
╚════════════════════════════════════════════╝

  Admin Panel:  http://localhost:${PORT}/admin/
  Public Map:   http://localhost:${PORT}/

  Press Ctrl+C to stop the server
`);
});
