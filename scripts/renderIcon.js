const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ICON_SIZE = 256;
const mediaDirectory = path.join(__dirname, '..', 'media');

async function renderIcon() {
  const svg = fs.readFileSync(path.join(mediaDirectory, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: ICON_SIZE, height: ICON_SIZE } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: path.join(mediaDirectory, 'icon.png'), omitBackground: true, clip: { x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE } });
  await browser.close();
}

renderIcon().catch((error) => {
  console.error(error);
  process.exit(1);
});
