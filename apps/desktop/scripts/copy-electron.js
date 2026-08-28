const fs = require('fs');
const path = require('path');

// electron files are already in place; ensure dist exists after vite build
const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) {
  fs.mkdirSync(dist, { recursive: true });
}
console.log('Electron assets ready');
