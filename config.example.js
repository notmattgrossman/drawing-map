// Copy to config.js and add your Mapbox public token:
// https://account.mapbox.com/access-tokens/

const CONFIG = {
    MAPBOX_ACCESS_TOKEN: 'YOUR_MAPBOX_PUBLIC_TOKEN'
};

if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
