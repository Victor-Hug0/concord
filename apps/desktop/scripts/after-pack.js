/**
 * Garante app-update.yml com feed genérico (API pública) mesmo quando
 * o CI publica instaladores no GitHub Releases (repo privado).
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_FEED =
  process.env.UPDATE_FEED_URL ||
  (process.env.VITE_API_URL
    ? `${process.env.VITE_API_URL.replace(/\/$/, '')}/updates`
    : 'https://concord.televei.dev/updates');

async function afterPack(context) {
  const feedUrl = DEFAULT_FEED.replace(/\/$/, '');
  const resourcesDir = path.join(context.appOutDir, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });

  const yml = ['provider: generic', `url: ${feedUrl}`, ''].join('\n');
  fs.writeFileSync(path.join(resourcesDir, 'app-update.yml'), yml, 'utf8');
  console.log('[afterPack] app-update.yml →', feedUrl);
}

module.exports = afterPack;
module.exports.default = afterPack;
