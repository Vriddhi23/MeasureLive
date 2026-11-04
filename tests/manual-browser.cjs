const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
(async () => {
  const root = path.resolve(__dirname, '..');
  const server = spawn(process.execPath, ['scripts/demo-server.cjs'], { cwd: root, windowsHide: true, stdio: 'pipe', env: { ...process.env, MEASURELIVE_PORT: '4175' } });
  let context;
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch('http://127.0.0.1:4175')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    fs.mkdirSync(path.join(root, '.browser-profile'), { recursive: true });
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const profilePath = fs.mkdtempSync(path.join(root, '.browser-profile', 'manual-'));
    context = await chromium.launchPersistentContext(profilePath, { channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'], viewport: { width: 1280, height: 960 } });
    const browserSession = await context.browser().newBrowserCDPSession();
    const { id } = await browserSession.send('Extensions.loadUnpacked', { path: path.join(root, 'extension') });
    const profile = await context.newPage();
    await profile.goto(`chrome-extension://${id}/popup.html`);
    await profile.evaluate(() => chrome.storage.local.clear());
    await profile.reload();
    await profile.locator('#chest').fill('94'); await profile.locator('#waist').fill('78');
    await profile.getByRole('button', { name: 'Save my measurements' }).click();
    await profile.waitForFunction(() => document.getElementById('form-status').textContent.includes('Saved.'));
    assert.equal(await profile.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })), false);
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4175');
    assert.equal(await page.locator('#measurelive-assistant').count(), 0);
    const cdp = await context.newCDPSession(page);
    const targets = await browserSession.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    const targetInfo = targets.targetInfos.find(t => t.url === page.url());
    assert.ok(targetInfo, 'Product tab target must be available');
    // Chrome's testing API performs the toolbar action and grants activeTab.
    await browserSession.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
    const result = await profile.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(t => t.url?.includes('127.0.0.1:4175'));
      if (!tab) throw new Error('The toolbar action did not grant access to the product tab.');
      return { tabId: tab.id, result: await chrome.runtime.sendMessage({ type: 'SCAN_TAB', tabId: tab.id }) };
    });
    assert.equal(result.result?.ok, true);
    await page.locator('#measurelive-assistant').waitFor();
    const { root: tree } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const nodes = []; function walk(n) { nodes.push(n); for (const child of [...(n.children || []), ...(n.shadowRoots || [])]) walk(child); } walk(tree);
    assert.ok(nodes.some(n => n.nodeValue === 'Your suggested size'));
    assert.ok(nodes.some(n => n.nodeValue === 'M'));
    const again = await profile.evaluate(tabId => chrome.runtime.sendMessage({ type: 'SCAN_TAB', tabId }), result.tabId);
    assert.equal(again.ok, true); assert.equal(await page.locator('#measurelive-assistant').count(), 1);
    assert.equal(await profile.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })), false);
    console.log('PASS: original extension scans and recommends M using only activeTab; repeated scans do not duplicate the panel');
    const restricted = await context.newPage(); await restricted.goto('chrome://version');
    const error = await profile.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.runtime.sendMessage({ type: 'SCAN_TAB', tabId: tab.id });
    });
    assert.ok(error.error.includes('regular shopping webpage'));
    console.log('PASS: restricted pages get a helpful error');
    fs.writeFileSync('test-results/manual-browser-results.json', JSON.stringify({ passed: true, originalManifest: true, broadPermissions: false, checkedAt: new Date().toISOString() }, null, 2));
  } finally { if (context) await context.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
