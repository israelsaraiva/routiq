const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { themes } = require('./themes');
const fx = require('./fixtures');
const kfx = require('./kafkaFixtures');

const distDirectory = path.resolve(__dirname, '..', '..', 'dist');
const outDirectory = path.join(__dirname, 'out');
const nonce = 'harnessnonce0123456789ab';
const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

function pageHtml(origin, view) {
  const policy = `default-src 'none'; style-src ${origin} 'nonce-${nonce}'; font-src ${origin}; script-src 'nonce-${nonce}'`;
  const viewAttribute = view ? ` data-view="${view}"` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<link rel="stylesheet" href="${origin}/webview.css">
</head><body><div id="root"${viewAttribute}></div>
<script nonce="${nonce}" src="${origin}/webview.js"></script></body></html>`;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') {
        const origin = `http://${request.headers.host}`;
        response.setHeader('content-type', 'text/html');
        response.end(pageHtml(origin, url.searchParams.get('view')));
        return;
      }
      const file = path.join(distDirectory, path.basename(url.pathname));
      if (!fs.existsSync(file)) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('content-type', contentTypes[path.extname(file)] ?? 'application/octet-stream');
      response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const mockVsCodeApi = () => {
  window.__posted = [];
  window.acquireVsCodeApi = () => ({
    postMessage: (message) => window.__posted.push(message),
    getState: () => undefined,
    setState: () => undefined,
  });
};

const applyTheme = ({ variables, bodyClass }) => {
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement;
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(`--vscode-${name}`, value));
    document.body.className = bodyClass;
    document.body.style.cssText = 'background-color: var(--vscode-editor-background); color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); margin: 0; padding: 0 20px;';
  });
};

const host = (page, message) => page.evaluate((data) => window.postMessage(data, '*'), message);
const settle = (page) => page.waitForTimeout(250);
const load = (page, request, collectionName = 'Demo API') => host(page, { type: 'load', request, collectionName });
const respond = (page, response) => host(page, { type: 'response', response });
const clickTab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}\\b`) }).click();

const baseLoad = async (page, request) => {
  await host(page, fx.environmentState);
  await host(page, fx.variableSuggestions);
  await load(page, request);
  await settle(page);
};

const wsEntries = [
  { sequence: 1, timestamp: Date.now(), direction: 'sent', text: '{"hello":"world"}', sizeBytes: 17, binary: false },
  { sequence: 2, timestamp: Date.now(), direction: 'received', text: '{"echo":"world"} '.repeat(10), sizeBytes: 170, binary: false },
  { sequence: 3, timestamp: Date.now(), direction: 'received', text: '', sizeBytes: 2048, binary: true, payloadBase64: 'AAEC' },
];
const sseEntries = [
  { sequence: 1, timestamp: Date.now(), event: { event: 'message', data: '{"tick":1}', id: '1' } },
  { sequence: 2, timestamp: Date.now(), event: { event: 'update', data: 'plain text data '.repeat(10), id: '2', retry: 3000 } },
];


const answerAdmin = async (page, kind, build) => {
  const handle = await page.waitForFunction((commandKind) => window.__posted.find((message) => message.type === 'adminRequest' && message.command.kind === commandKind && !message.__answered), kind);
  const request = await handle.jsonValue();
  await page.evaluate((id) => { window.__posted.find((message) => message.requestId === id).__answered = true; }, request.requestId);
  await host(page, { ...build, result: { ...build.result, requestId: request.requestId } });
};
const kafkaTab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
const kafkaBase = async (page) => { await host(page, kfx.init); await host(page, kfx.templates); await host(page, { type: 'kafkaLag', totalLag: 1284 }); await settle(page); };
const kafkaScenes = {
  messages: kafkaBase,
  send: async (page) => {
    await kafkaBase(page);
    await kafkaTab(page, 'Send');
    await page.getByLabel('Topic', { exact: true }).fill('orders.paid');
    await settle(page);
  },
  topics: async (page) => { await kafkaBase(page); await kafkaTab(page, 'Topics'); await answerAdmin(page, 'listTopics', kfx.topics); await settle(page); },
  groups: async (page) => {
    await kafkaBase(page);
    await kafkaTab(page, 'Consumer groups');
    await answerAdmin(page, 'listGroups', kfx.groups);
    await page.getByText('billing-service').first().click();
    await answerAdmin(page, 'describeGroup', kfx.group);
    await settle(page);
  },
  cluster: async (page) => { await kafkaBase(page); await kafkaTab(page, 'Cluster'); await answerAdmin(page, 'describeCluster', kfx.cluster); await settle(page); },
};
const runnerScene = async (page) => {
  await host(page, { type: 'start', title: 'Demo API run', total: 4, delayMs: 0 });
  for (const [index, result] of kfx.runnerResults.entries()) await host(page, { type: 'result', index, result });
  await host(page, { type: 'done', summary: kfx.runnerSummary });
  await settle(page);
};

const grpcScene = async (page) => {
  await baseLoad(page, fx.grpcRequest);
  await host(page, { type: 'grpcServices', services: [{ name: 'helloworld.Greeter', methods: [{ name: 'SayHello', requestStream: false, responseStream: false, exampleBody: '{}' }, { name: 'Chat', requestStream: true, responseStream: true, exampleBody: '{}' }] }] });
  await host(page, { type: 'streamStatus', status: 'closed' });
  await host(page, { type: 'wsMessage', entry: { sequence: 1, timestamp: Date.now(), direction: 'received', text: '{"message":"Hello world"}', sizeBytes: 25, binary: false } });
  await host(page, { type: 'grpcStatus', status: { code: 0, codeName: 'OK', details: '', trailers: [['x-trailer', 'v']] } });
};

const scenarios = [
  { name: 'empty-request', themes: ['dark', 'light', 'hc'], run: (page) => baseLoad(page, fx.emptyRequest) },
  { name: 'filled-params', themes: ['dark', 'light', 'hc'], run: (page) => baseLoad(page, fx.filledRequest) },
  { name: 'filled-headers', themes: ['dark', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'Headers'); } },
  { name: 'body-json', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'Body'); } },
  { name: 'body-json-narrow-320', width: 320, height: 800, themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'Body'); } },
  { name: 'body-form-narrow-320', width: 320, height: 800, themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, { ...fx.filledRequest, body: { type: 'form', text: '', form: [{ key: 'a', value: '1', enabled: true }] } }); await clickTab(page, 'Body'); } },
  { name: 'graphql-query-narrow-320', width: 320, height: 900, themes: ['dark', 'light', 'hc'], run: (page) => baseLoad(page, fx.graphqlRequest) },
  { name: 'body-select-open', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'Body'); await page.getByLabel('Body type').click(); } },
  { name: 'body-form', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, { ...fx.filledRequest, body: { type: 'form', text: '', form: [{ key: 'a', value: '1', enabled: true }] } }); await clickTab(page, 'Body'); } },
  { name: 'body-multipart', themes: ['dark'], run: async (page) => { await baseLoad(page, { ...fx.filledRequest, body: { type: 'multipart', text: '', form: [], multipart: [{ key: 'file', kind: 'file', value: '/Users/dev/a.png', enabled: true }, { key: 'note', kind: 'text', value: 'hi', enabled: true }] } }); await clickTab(page, 'Body'); } },
  { name: 'body-binary', themes: ['dark'], run: async (page) => { await baseLoad(page, { ...fx.filledRequest, body: { type: 'binary', text: '', form: [], filePath: '/Users/dev/a.bin' } }); await clickTab(page, 'Body'); } },
  ...['basic', 'apikey', 'digest', 'oauth2'].map((type) => ({
    name: `auth-${type}`, themes: ['dark', 'hc'].filter(() => type === 'oauth2' || type === 'basic'),
    run: async (page) => {
      const auths = {
        basic: { type: 'basic', username: 'ada', password: 'secret' },
        apikey: { type: 'apikey', key: 'X-API-Key', value: 'abc', location: 'header' },
        digest: { type: 'digest', username: 'ada', password: 'secret' },
        oauth2: { type: 'oauth2', grant: 'password', tokenUrl: 'https://auth.example.com/token', clientId: 'id', clientSecret: 'shh', scope: 'read write', username: 'ada', password: 'pw' },
      };
      await baseLoad(page, { ...fx.filledRequest, auth: auths[type] });
      await clickTab(page, 'Auth');
      if (type === 'oauth2') await host(page, { type: 'oauthTokenResult', ok: true, message: 'Token fetched (expires in 3600s)' });
    },
  })),
  { name: 'auth-select-open', themes: ['dark'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'Auth'); await page.getByRole('combobox').first().click(); } },
  { name: 'scripts', themes: ['dark', 'light'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'Scripts'); } },
  { name: 'response-200', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, fx.response(201, 'Created', fx.jsonBody, { scripts: fx.scriptsOutcome })); } },
  { name: 'response-200-wide', width: 1400, height: 900, themes: ['dark'], run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, fx.response(200, 'OK', fx.jsonBody)); } },
  { name: 'response-200-horizontal', width: 1400, height: 900, themes: ['dark', 'hc'], layout: { orientation: 'horizontal', ratio: 0.5 }, run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, fx.response(200, 'OK', fx.jsonBody)); } },
  { name: 'response-4xx', themes: ['dark', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, fx.response(404, 'Not Found', '{"error":"not found"}')); } },
  { name: 'response-5xx', themes: ['dark', 'light'], run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, fx.response(503, 'Service Unavailable', '<html><body>Bad gateway</body></html>', { headers: [['content-type', 'text/html']] })); } },
  { name: 'response-error', themes: ['dark', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, { status: 0, statusText: '', timeMs: 5000, sizeBytes: 0, headers: [], body: '', error: 'connect ECONNREFUSED 127.0.0.1:3000' }); } },
  { name: 'response-loading', themes: ['dark'], run: async (page) => { await baseLoad(page, fx.filledRequest); await host(page, { type: 'sending' }); } },
  { name: 'response-narrow-320', width: 320, height: 800, themes: ['dark', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await respond(page, fx.response(200, 'OK', fx.jsonBody)); } },
  { name: 'empty-narrow-320', width: 320, height: 700, themes: ['dark'], run: (page) => baseLoad(page, fx.emptyRequest) },
  { name: 'sse', themes: ['dark', 'light'], run: async (page) => { await baseLoad(page, fx.sseRequest); await host(page, { type: 'streamStatus', status: 'open' }); for (const entry of sseEntries) await host(page, { type: 'sseEvent', entry }); } },
  { name: 'websocket', themes: ['dark', 'hc'], run: async (page) => { await baseLoad(page, fx.wsRequest); await host(page, { type: 'streamStatus', status: 'open' }); for (const entry of wsEntries) await host(page, { type: 'wsMessage', entry }); } },
  { name: 'stream-error', themes: ['dark'], run: async (page) => { await baseLoad(page, fx.wsRequest); await host(page, { type: 'streamStatus', status: 'error', detail: 'ECONNREFUSED' }); } },
  { name: 'grpc', themes: ['dark', 'light', 'hc'], run: grpcScene },
  { name: 'graphql-query', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.graphqlRequest); await respond(page, fx.response(200, 'OK', JSON.stringify({ errors: [{ message: 'Cannot query field "foo" on type "Country".', path: ['country', 'foo'] }], data: null }))); } },
  { name: 'graphql-schema', width: 1200, height: 1000, themes: ['dark', 'hc'], layout: { orientation: 'horizontal', ratio: 0.6 }, run: async (page) => {
    await baseLoad(page, fx.graphqlRequest);
    await host(page, { type: 'graphqlSchema', schema: fx.schema, fetchedAt: Date.now(), cached: true });
    await settle(page);
    const schemaToggle = page.getByRole('button', { name: 'Schema', exact: true });
    if ((await schemaToggle.getAttribute('aria-expanded')) !== 'true') await schemaToggle.click();
    await page.getByRole('button', { name: /^Query/ }).last().click();
    await page.getByRole('button', { name: /^Country/ }).last().click();
    await page.getByLabel('Search schema').scrollIntoViewIfNeeded();
  } },
  { name: 'graphql-completion', width: 900, height: 900, themes: ['dark', 'light', 'hc'], run: async (page) => {
    await baseLoad(page, fx.graphqlRequest);
    await host(page, { type: 'graphqlSchema', schema: fx.schema, fetchedAt: Date.now(), cached: true });
    await settle(page);
    const editor = page.locator('textarea').first();
    await editor.click();
    await editor.press('Control+End');
    await editor.pressSequentially('\n{ coun');
    await settle(page);
  } },
  { name: 'history', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'History'); await host(page, { type: 'historyList', entries: fx.history }); } },
  { name: 'history-empty', themes: ['dark'], run: async (page) => { await baseLoad(page, fx.filledRequest); await clickTab(page, 'History'); await host(page, { type: 'historyList', entries: [] }); } },
  { name: 'env-select-open', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await page.getByLabel('Environment').click(); } },
  { name: 'dropdown-menu-open', themes: ['dark', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await page.getByRole('button', { name: 'More actions' }).click(); } },
  { name: 'method-select-open', themes: ['dark', 'light'], run: async (page) => { await baseLoad(page, fx.filledRequest); await page.getByRole('combobox').first().click(); } },
  { name: 'tooltip', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, fx.filledRequest); await page.getByRole('button', { name: 'Toggle split orientation' }).hover(); await page.waitForTimeout(900); } },
  { name: 'autocomplete', themes: ['dark', 'light', 'hc'], run: async (page) => { await baseLoad(page, { ...fx.emptyRequest, url: 'https://{{b' }); const input = page.getByLabel('Request URL'); await input.focus(); await input.press('End'); await input.pressSequentially('a'); await page.getByRole('listbox').waitFor(); } },
  ...Object.entries(kafkaScenes).map(([name, run]) => ({ name: `kafka-${name}`, view: 'kafka', width: 1200, height: 800, themes: ['dark'], run })),
  { name: 'runner', view: 'runner', themes: ['dark'], run: runnerScene },
  { name: 'environments-dialog', view: 'environments', themes: ['dark', 'light', 'hc'], run: async (page) => { await host(page, { type: 'environmentsLoad', collectionName: 'Demo API', draft: fx.environmentsDraft }); await settle(page); } },
  { name: 'environments-dialog-narrow', view: 'environments', width: 320, height: 700, themes: ['dark'], run: async (page) => { await host(page, { type: 'environmentsLoad', collectionName: 'Demo API', draft: fx.environmentsDraft }); await settle(page); } },
];

async function runScenario(browser, origin, scenario, themeName) {
  const width = scenario.width ?? 700;
  const height = scenario.height ?? 800;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));
  await page.addInitScript(mockVsCodeApi);
  await page.addInitScript(applyTheme, themes[themeName]);
  if (scenario.layout) {
    await page.addInitScript((layout) => window.localStorage.setItem('routiq.splitLayout', JSON.stringify(layout)), scenario.layout);
  }
  await page.goto(`${origin}/${scenario.view ? `?view=${scenario.view}` : ''}`);
  try {
    await page.waitForSelector('#root > *', { timeout: 5000 });
    await scenario.run(page);
  } catch (error) {
    problems.push(`scenario failed: ${error.message.split('\n')[0]}`);
  }
  await settle(page);
  const overflowing = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= limit) return undefined;
    return [...document.querySelectorAll('#root *')]
      .filter((element) => element.getBoundingClientRect().right > limit + 0.5)
      .filter((element) => {
        for (let ancestor = element.parentElement; ancestor && ancestor.id !== 'root'; ancestor = ancestor.parentElement) {
          if (getComputedStyle(ancestor).overflowX !== 'visible') return false;
        }
        return true;
      })
      .slice(0, 3)
      .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`);
  });
  if (process.env.HARNESS_DEBUG) {
    const scrollables = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.tagName}.${element.className} ${element.scrollWidth}/${element.clientWidth} ${getComputedStyle(element).overflowX}`));
    console.log(scrollables.join('\n'));
  }
  if (overflowing) problems.push(`horizontal page overflow: ${overflowing.join(', ')}`);
  const fontLoaded = await page.evaluate(() => document.fonts.load('400 13px Jost').then((faces) => faces.length > 0 && faces.every((face) => face.status === 'loaded')));
  if (!fontLoaded) problems.push('Jost font not loaded');
  const file = path.join(outDirectory, `${scenario.name}.${themeName}.${width}.png`);
  await page.screenshot({ path: file });
  await context.close();
  return { file, problems };
}

async function main() {
  const only = process.argv[2];
  fs.mkdirSync(outDirectory, { recursive: true });
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  let failures = 0;
  for (const scenario of scenarios) {
    if (only && !scenario.name.includes(only)) continue;
    for (const themeName of scenario.themes) {
      const { file, problems } = await runScenario(browser, origin, scenario, themeName).catch((error) => ({ file: scenario.name, problems: [`scenario failed: ${error.message.split('\n')[0]}`] }));
      failures += problems.length ? 1 : 0;
      console.log(`${problems.length ? 'WARN' : 'ok  '} ${path.relative(process.cwd(), file)}`);
      problems.forEach((problem) => console.log(`       ${problem}`));
    }
  }
  await browser.close();
  server.close();
  console.log(`${failures} screenshot(s) with problems`);
}

module.exports = { startServer, mockVsCodeApi, applyTheme, host, settle, load, respond, clickTab, baseLoad, kafkaScenes, runnerScene, grpcScene, pageUrl: (origin, view) => `${origin}/${view ? `?view=${view}` : ''}` };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
