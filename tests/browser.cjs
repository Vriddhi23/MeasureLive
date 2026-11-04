const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await check()) return; await delay(150); }
  throw new Error(`Timed out: ${description}`);
}
(async () => {
  fs.mkdirSync('test-results', { recursive: true });
  const server = spawn(process.execPath, ['scripts/demo-server.cjs'], { cwd: root, windowsHide: true, stdio: 'pipe', env: { ...process.env, MEASURELIVE_PORT: '4174' } });
  const baseURL = 'http://127.0.0.1:4174';
  let context;
  try {
    await until(async () => { try { return (await fetch(baseURL)).ok; } catch { return false; } }, 'demo server');
    const pregrant = process.argv.includes('--pregrant-hosts');
    let extension = path.join(root, 'extension');
    if (pregrant) {
      extension = path.join(root, 'test-results', 'extension-fixture');
      fs.cpSync(path.join(root, 'extension'), extension, { recursive: true });
      const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
      // Headless Chrome cannot accept a native permissions dialog. Only the
      // isolated test copy gets pregranted hosts; production stays optional.
      manifest.host_permissions = ['http://*/*', 'https://*/*'];
      fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
    }
    const installed = process.argv.includes('--installed-chrome');
    fs.mkdirSync(path.join(root, '.browser-profile'), { recursive: true });
    const profilePath = fs.mkdtempSync(path.join(root, '.browser-profile', 'auto-'));
    context = await chromium.launchPersistentContext(profilePath, {
      channel: installed ? 'chrome' : 'chromium', headless: true, viewport: { width: 1280, height: 960 },
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [...(installed ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]), '--no-first-run', '--no-default-browser-check', '--test-type', '--auto-confirm-extensions-install=accept']
    });
    let installedId;
    if (installed) {
      const browserSession = await context.browser().newBrowserCDPSession();
      installedId = (await browserSession.send('Extensions.loadUnpacked', { path: extension })).id;
      console.log('Loaded extension:', JSON.stringify(await browserSession.send('Extensions.getExtensions')));
    }
    let worker = context.serviceWorkers()[0];
    if (!worker && !installedId) worker = await context.waitForEvent('serviceworker');
    const id = installedId || new URL(worker.url()).hostname;
    const errors = [];
    const popup = await context.newPage(); popup.on('pageerror', error => errors.push(error.message));
    await popup.goto(`chrome-extension://${id}/popup.html`);
    worker ||= popup;
    await popup.evaluate(() => chrome.storage.local.clear()); await popup.reload();
    await popup.locator('#chest').fill('94'); await popup.locator('#waist').fill('78'); await popup.locator('#height').fill('170');
    await popup.locator('#hips').fill('98'); await popup.locator('#sleeve').fill('60'); await popup.locator('#inseam').fill('79');
    await popup.getByRole('button', { name: 'Save my measurements' }).click();
    await until(async () => (await popup.locator('#form-status').textContent()).includes('Saved.'), 'profile save');
    await popup.reload(); assert.equal(await popup.locator('#chest').inputValue(), '94');
    await popup.locator('#unit-in').click(); assert.equal(Number(await popup.locator('#chest').inputValue()), 37);
    await popup.locator('#unit-cm').click(); assert.equal(Number(await popup.locator('#chest').inputValue()), 94);
    assert.equal(Number(await popup.locator('#height').inputValue()), 170);
    assert.equal(Number(await popup.locator('#sleeve').inputValue()), 60);
    await popup.screenshot({ path: 'test-results/profile.png', fullPage: true });
    console.log('PASS: real extension loads; profile saves, persists, and converts units');
    await popup.locator('#auto-toggle').click();
    await until(async () => !(await popup.locator('#auto-toggle').isDisabled()), 'host permission response');
    const auto = await popup.locator('#auto-toggle').getAttribute('aria-checked');
    if (auto !== 'true') throw new Error('Automatic host permission was not granted: ' + await popup.locator('#scan-status').textContent());
    const registered = await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    assert.equal(registered.length, 1);
    console.log(`PASS: persistent automatic registration (${pregrant ? 'hosts pregranted in test manifest' : 'optional host permission'})`);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    async function panel(fn, args) {
      const { root: tree } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      function find(n) { if (n.attributes?.includes('measurelive-assistant')) return n.shadowRoots?.[0]; for (const child of [...(n.children || []), ...(n.shadowRoots || [])]) { const result = find(child); if (result) return result; } }
      const node = find(tree); if (!node) return null;
      const { object } = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId });
      const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: fn.toString(), arguments: args === undefined ? [] : [{ value: args }], returnByValue: true });
      await cdp.send('Runtime.releaseObject', { objectId: object.objectId });
      if (exceptionDetails) throw new Error(exceptionDetails.text);
      return result.value;
    }
    const text = () => panel(function () { return this.textContent; });
    const hasText = async value => {
      try { await until(async () => (await text())?.includes(value), value); }
      catch (error) {
        console.error('Panel at failure:', await panel(function () { return this.querySelector('main')?.textContent || this.textContent.slice(-1200); }));
        await page.screenshot({ path: 'test-results/failure.png', fullPage: true });
        throw error;
      }
    };
    await page.goto(baseURL); await hasText('Your suggested size');
    assert.equal(await panel(function () { return this.querySelector('.size')?.textContent; }), 'M');
    await page.screenshot({ path: 'test-results/recommendation.png', fullPage: true });
    console.log('PASS: automatically detects a product and recommends M from its body chart');
    await page.locator('#scenario').selectOption('horizontal'); await hasText('Your suggested size');
    await delay(1100); assert.equal(await panel(function () { return this.querySelector('.size')?.textContent; }), 'M');
    console.log('PASS: horizontal inch chart');
    // New page URL resets user choices and cached linked-guide results.
    await page.goto(baseURL + '?test=modal');
    await page.locator('#scenario').selectOption('modal'); await hasText('Let’s find your size.');
    await panel(function () { [...this.querySelectorAll('button')].find(b => b.textContent.startsWith('Show “')).click(); });
    await page.locator('#guide-trigger').click(); await hasText('Your suggested size');
    await page.locator('#close-dialog').click(); console.log('PASS: charts loaded after opening a store modal');
    await page.goto(baseURL + '?test=garment'); await page.locator('#scenario').selectOption('garment'); await hasText('This measures the clothing.');
    assert.equal(await panel(function () { return this.querySelector('.size')?.textContent || null; }), null);
    console.log('PASS: garment measurements do not generate a misleading body-size recommendation');
    await page.goto(baseURL + '?test=unknown'); await page.locator('#scenario').selectOption('unknown'); await hasText('Choose the units');
    await panel(function () { const s = this.querySelector('#ml-chartunits'); s.value = 'cm'; s.dispatchEvent(new Event('change')); });
    await hasText('What does this chart measure?');
    await panel(function () { const s = this.querySelector('#ml-chartdescribes'); s.value = 'body'; s.dispatchEvent(new Event('change')); }); await hasText('Your suggested size');
    console.log('PASS: missing units and chart type require explicit choices');
    await page.goto(baseURL + '?test=multiple'); await page.locator('#scenario').selectOption('multiple'); await hasText('Choose the right chart.');
    await panel(function () { const s = this.querySelector('#ml-sizechart'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); }); await hasText('Your suggested size');
    console.log('PASS: multiple charts require a selection');
    await page.goto(baseURL + '?test=linked'); await page.locator('#scenario').selectOption('linked'); await delay(2000); await hasText('Your suggested size');
    assert.ok((await text()).includes('Everyday shirts')); console.log('PASS: reads a same-origin linked size guide');
    await page.goto(baseURL + '?test=image'); await page.locator('#scenario').selectOption('image'); await hasText('I can read text tables.');
    await panel(function () {
      this.querySelector('textarea').value = 'Size | Chest | Waist\nM | 92–98 | 77–83';
      [...this.querySelectorAll('button')].find(b => b.textContent === 'Read pasted chart').click();
    }); await hasText('Choose the units');
    await panel(function () { const s = this.querySelector('#ml-chartunits'); s.value = 'cm'; s.dispatchEvent(new Event('change')); });
    await panel(function () { const s = this.querySelector('#ml-chartdescribes'); s.value = 'body'; s.dispatchEvent(new Event('change')); }); await hasText('Your suggested size');
    console.log('PASS: unsupported chart fallback and manual pasted chart');
    await popup.locator('#chest').fill('160'); await popup.locator('#waist').fill('150'); await popup.getByRole('button', { name: 'Save changes' }).click();
    await hasText('No clear fit in this chart.'); console.log('PASS: profile updates reach an already-open shopping page');
    await popup.locator('#auto-toggle').click(); await until(async () => !(await popup.locator('#auto-toggle').isDisabled()), 'pause');
    await until(async () => (await page.locator('#measurelive-assistant').count()) === 0, 'panel removed after pause');
    assert.equal((await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length, 0);
    if (!pregrant) assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })), false);
    console.log('PASS: disabling auto scanning unregisters scripts and removes the panel');
    await popup.locator('details.help').evaluate(node => node.open = true); await popup.locator('#delete-profile').click();
    assert.equal(await popup.evaluate(async () => (await chrome.storage.local.get('profile')).profile || null), null);
    assert.deepEqual(errors, []); console.log('PASS: profile deletion; no page script errors');
    fs.writeFileSync('test-results/browser-results.json', JSON.stringify({ passed: true, scenarios: 13, pregrantedHostPermissions: pregrant, nativePermissionDialogTested: !pregrant, errors, browser: context.browser()?.version(), checkedAt: new Date().toISOString() }, null, 2));
  } finally { if (context) await context.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
