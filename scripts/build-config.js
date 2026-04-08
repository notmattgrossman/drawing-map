/**
 * Writes root config.js from MAPBOX_ACCESS_TOKEN (Netlify / CI).
 * Local dev: keep your own config.js; it stays gitignored.
 */
const fs = require('fs');
const path = require('path');

const token = process.env.MAPBOX_ACCESS_TOKEN;
if (!token || token === 'YOUR_MAPBOX_PUBLIC_TOKEN') {
    console.error(
        'Missing MAPBOX_ACCESS_TOKEN. In Netlify: Site settings → Environment variables.'
    );
    process.exit(1);
}

const out = `const CONFIG = {
    MAPBOX_ACCESS_TOKEN: ${JSON.stringify(token)}
};
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
`;

fs.writeFileSync(path.join(__dirname, '..', 'config.js'), out, 'utf8');
console.log('Wrote config.js');
