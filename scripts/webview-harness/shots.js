const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { themes } = require('./themes');
const fx = require('./fixtures');
const kfx = require('./kafkaFixtures');
const harness = require('./run');

const outDirectory = path.resolve(__dirname, '..', '..', 'media', 'screenshots');
const { host, settle, baseLoad, clickTab, respond, kafkaScenes, runnerScene, pageUrl } = harness;

const demoRequest = { ...fx.filledRequest, name: 'Create project', url: '{{baseUrl}}/v1/users/{{userId}}/projects?include=members&sort=-createdAt' };

const shots = [
  { name: 'response', width: 1000, height: 820, run: async (page) => { await baseLoad(page, demoRequest); await respond(page, fx.response(201, 'Created', fx.jsonBody)); } },
  { name: 'variables', width: 1000, height: 420, run: async (page) => {
    await baseLoad(page, { ...fx.emptyRequest, name: 'Get user', url: '{{baseUrl}}/v1/users/{{missing}}?token={{t' });
    const input = page.getByLabel('Request URL');
    await input.focus();
    await input.press('End');
    await input.pressSequentially('o');
    await page.getByRole('listbox').waitFor();
  } },
  { name: 'graphql', width: 1000, height: 800, layout: { orientation: 'horizontal', ratio: 0.5 }, run: async (page) => {
    await baseLoad(page, fx.graphqlRequest);
    await host(page, { type: 'graphqlSchema', schema: fx.schema, fetchedAt: Date.now(), cached: true });
    await respond(page, fx.response(200, 'OK', JSON.stringify({ data: { country: { name: 'Belgium', capital: 'Brussels' } } }, null, 2)));
    await settle(page);
  } },
  { name: 'grpc', width: 1000, height: 760, run: harness.grpcScene },
  { name: 'scripts', width: 1000, height: 640, run: async (page) => { await baseLoad(page, demoRequest); await clickTab(page, 'Scripts'); } },
  { name: 'environments', view: 'environments', width: 900, height: 560, run: async (page) => { await host(page, { type: 'environmentsLoad', collectionName: 'Demo API', draft: fx.environmentsDraft }); await settle(page); } },
  { name: 'kafka-messages', view: 'kafka', width: 1200, height: 860, run: async (page) => {
    await kafkaScenes.messages(page);
    await page.getByLabel('Show message details').nth(1).click();
    await settle(page);
  } },
  { name: 'kafka-groups', view: 'kafka', width: 1200, height: 720, run: kafkaScenes.groups },
  { name: 'kafka-topics', view: 'kafka', width: 1200, height: 720, run: kafkaScenes.topics },
  { name: 'kafka-cluster', view: 'kafka', width: 1200, height: 720, run: kafkaScenes.cluster },
  { name: 'kafka-send', view: 'kafka', width: 1200, height: 720, run: kafkaScenes.send },
  { name: 'runner', view: 'runner', width: 800, height: 520, run: runnerScene },
];

function optimize(file) {
  const script = 'import sys\nfrom PIL import Image\nimage = Image.open(sys.argv[1]).convert("RGB").quantize(colors=128, dither=Image.Dither.NONE)\nimage.save(sys.argv[1], optimize=True)';
  try {
    execFileSync('python3', ['-c', script, file]);
  } catch {
    console.log(`     (not optimized: ${path.basename(file)})`);
  }
}

async function capture(browser, origin, shot) {
  const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height } });
  const page = await context.newPage();
  await page.addInitScript(harness.mockVsCodeApi);
  await page.addInitScript(harness.applyTheme, themes.dark);
  if (shot.layout) await page.addInitScript((layout) => window.localStorage.setItem('routiq.splitLayout', JSON.stringify(layout)), shot.layout);
  await page.goto(pageUrl(origin, shot.view));
  await page.waitForSelector('#root > *', { timeout: 5000 });
  await shot.run(page);
  await settle(page);
  const file = path.join(outDirectory, `${shot.name}.png`);
  await page.screenshot({ path: file });
  await context.close();
  optimize(file);
  console.log(`${path.relative(process.cwd(), file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}

async function main() {
  const only = process.argv[2];
  fs.mkdirSync(outDirectory, { recursive: true });
  const server = await harness.startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  for (const shot of shots) if (!only || shot.name.includes(only)) await capture(browser, origin, shot);
  await browser.close();
  server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
