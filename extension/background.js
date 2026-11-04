'use strict';
const SCRIPT_ID = 'measurelive-auto';
const FILES = ['core.js', 'extractor.js', 'content.js'];
const ORIGINS = ['https://*/*', 'http://*/*'];
let registrationQueue = Promise.resolve();

function syncRegistration() {
  registrationQueue = registrationQueue.catch(() => {}).then(async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    const allowed = await chrome.permissions.contains({ origins: ORIGINS });
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (settings.autoScan && allowed && !scripts.length) {
      await chrome.scripting.registerContentScripts([{ id: SCRIPT_ID, matches: ORIGINS, js: FILES, runAt: 'document_idle', persistAcrossSessions: true }]);
    } else if ((!settings.autoScan || !allowed) && scripts.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    }
  });
  return registrationQueue;
}
chrome.runtime.onInstalled.addListener(() => { syncRegistration().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { syncRegistration().catch(console.error); });
chrome.permissions.onRemoved.addListener(() => {
  chrome.storage.local.get('settings').then(({ settings = {} }) => chrome.storage.local.set({ settings: { ...settings, autoScan: false } })).then(syncRegistration).catch(console.error);
});
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.settings) syncRegistration().catch(console.error); });

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const extensionPage = sender.url?.startsWith(chrome.runtime.getURL(''));
  if (message.type === 'OPEN_PROFILE') {
    chrome.runtime.openOptionsPage().then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
    return true;
  }
  if (!extensionPage) return false;
  if (message.type === 'SYNC_AUTO') {
    syncRegistration().then(() => respond({ ok: true })).catch(e => respond({ error: e.message }));
    return true;
  }
  if (message.type === 'SCAN_TAB' && Number.isInteger(message.tabId)) {
    (async () => {
      await chrome.scripting.executeScript({ target: { tabId: message.tabId }, files: FILES });
      return chrome.tabs.sendMessage(message.tabId, { type: 'MEASURELIVE_SCAN' });
    })().then(respond).catch(() => respond({ error: 'Open a regular shopping webpage, then try again. Chrome’s internal pages and the Web Store do not allow scanning.' }));
    return true;
  }
});
