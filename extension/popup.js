'use strict';
const C = MeasureLiveCore;
const $ = id => document.getElementById(id);
const ORIGINS = ['https://*/*', 'http://*/*'];
let unit = 'cm', settings = {}, savedProfile = null;
const draftCm = {};
const placeholders = { height: 170, chest: 94, waist: 78, hips: 98, sleeve: 60, inseam: 79 };
function status(id, message, error = false) { const node = $(id); node.textContent = message; node.className = `status ${error ? 'error' : 'success'}`; }
function updateUnits(next, convert = true) {
  const previous = unit; unit = next;
  for (const field of C.FIELDS) {
    const input = $(field);
    if (convert && previous !== next && input.value !== '') {
      draftCm[field] ??= Number(input.value) * (previous === 'in' ? 2.54 : 1);
      input.value = +(draftCm[field] / (next === 'in' ? 2.54 : 1)).toFixed(1);
    }
    const factor = unit === 'in' ? 2.54 : 1;
    input.min = (C.LIMITS[field][0] / factor).toFixed(1); input.max = (C.LIMITS[field][1] / factor).toFixed(1);
    input.placeholder = `e.g. ${+(placeholders[field] / factor).toFixed(1)}`;
  }
  document.querySelectorAll('.unit-label').forEach(node => { node.textContent = unit; });
  $('unit-cm').setAttribute('aria-pressed', String(unit === 'cm')); $('unit-in').setAttribute('aria-pressed', String(unit === 'in'));
}
function renderAuto() {
  $('auto-toggle').setAttribute('aria-checked', String(!!settings.autoScan));
  $('auto-help').textContent = settings.autoScan ? 'On. New shopping pages are checked for readable size charts.' : 'Optional access to websites. Your measurements stay here.';
}
function renderSaved() {
  $('saved-label').textContent = savedProfile ? 'Saved on this device. Edit whenever you need.' : 'A small setup for a better starting point.';
  $('save-text').textContent = savedProfile ? 'Save changes' : 'Save my measurements';
}
$('unit-cm').addEventListener('click', () => updateUnits('cm'));
$('unit-in').addEventListener('click', () => updateUnits('in'));
C.FIELDS.forEach(field => $(field).addEventListener('input', () => {
  if ($(field).value === '') delete draftCm[field];
  else draftCm[field] = Number($(field).value) * (unit === 'in' ? 2.54 : 1);
}));
$('profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const measurements = {};
  for (const field of C.FIELDS) { if ($(field).value !== '') measurements[field] = Math.round((draftCm[field] ?? Number($(field).value) * (unit === 'in' ? 2.54 : 1)) * 100) / 100; }
  const profile = { version: 1, unit, measurements, updatedAt: new Date().toISOString() };
  const errors = C.validateProfile(profile);
  if (errors.length) { status('form-status', errors.includes('required') ? 'Add at least chest, waist or hips to get started.' : `Check the measurement entered for ${errors.join(', ')}.`, true); return; }
  try { await chrome.storage.local.set({ profile }); savedProfile = profile; renderSaved(); status('form-status', 'Saved. Your next fit check will use these measurements.'); }
  catch { status('form-status', 'Could not save. Try reopening the extension.', true); }
});
$('auto-toggle').addEventListener('click', async () => {
  const toggle = $('auto-toggle'); toggle.disabled = true;
  try {
    if (!settings.autoScan) {
      // Must run directly from a user gesture for Chrome's permission prompt.
      const allowed = await chrome.permissions.request({ origins: ORIGINS });
      if (!allowed) { status('scan-status', 'Automatic access wasn’t enabled. You can still scan the current page.'); return; }
      settings = { ...settings, autoScan: true };
    } else { settings = { ...settings, autoScan: false }; }
    await chrome.storage.local.set({ settings });
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_AUTO' });
    if (!result?.ok) throw new Error(result?.error || 'The extension did not respond.');
    renderAuto();
    if (!settings.autoScan) await chrome.permissions.remove({ origins: ORIGINS });
    status('scan-status', settings.autoScan ? 'Ready. Open or refresh a clothing product page, or scan this page now.' : 'Automatic scanning is off and website access has been removed.');
  } catch { status('scan-status', 'Could not change automatic scanning. Reopen the extension and try again.', true); }
  finally { toggle.disabled = false; }
});
$('scan-button').addEventListener('click', async () => {
  if (!savedProfile) { status('scan-status', 'Save your measurements first.', true); $('chest').focus(); return; }
  $('scan-button').disabled = true; status('scan-status', 'Looking for size charts…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Open a shopping page first.');
    const result = await chrome.runtime.sendMessage({ type: 'SCAN_TAB', tabId: tab.id });
    if (!result?.ok) throw new Error(result?.error || 'The extension did not respond. Try reopening it.');
    status('scan-status', 'The size assistant is open on your page. Close this popup to see it.');
  } catch (error) { status('scan-status', error.message || 'This page cannot be scanned.', true); }
  finally { $('scan-button').disabled = false; }
});
$('delete-profile').addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove('profile'); savedProfile = null;
    C.FIELDS.forEach(field => { $(field).value = ''; delete draftCm[field]; }); renderSaved(); status('form-status', 'Your saved measurements have been deleted.');
  } catch { status('form-status', 'Could not delete your measurements. Try again.', true); }
});
(async () => {
  try {
    const data = await chrome.storage.local.get(['profile', 'settings']); savedProfile = data.profile || null; settings = data.settings || {};
    if (settings.autoScan && !(await chrome.permissions.contains({ origins: ORIGINS }))) { settings.autoScan = false; await chrome.storage.local.set({ settings }); }
    updateUnits(savedProfile?.unit || 'cm', false);
    if (savedProfile) for (const field of C.FIELDS) { const value = savedProfile.measurements[field]; if (value != null) { draftCm[field] = value; $(field).value = +(value / (unit === 'in' ? 2.54 : 1)).toFixed(1); } }
    renderSaved(); renderAuto();
  } catch { status('form-status', 'Open this screen from the installed Chrome extension to save measurements.', true); }
})();
