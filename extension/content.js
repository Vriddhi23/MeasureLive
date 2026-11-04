(function () {
  'use strict';
  if (globalThis.__measureLive) return;
  globalThis.__measureLive = true;
  const C = MeasureLiveCore, E = MeasureLiveExtract;
  let profile, settings = {}, host, shadow, current, lastSignature = '', selected = '', unitOverride = '', kindOverride = '', categoryOverride = '', pasted = null;
  let manual = false, dismissed = false, awaitingGuide = false, timer, busy = false, rerun = false, pageURL = location.href;
  let linkedCharts = [], fetched = new Set(), observers = [], observingRoots = new WeakSet();
  const labels = { height: 'Height', chest: 'Chest / bust', waist: 'Waist', hips: 'Hips', sleeve: 'Sleeve', inseam: 'Inside leg' };
  const css = `
    :host{all:initial!important;position:fixed!important;bottom:22px!important;right:22px!important;z-index:2147483647!important;color-scheme:light!important;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:#253b33!important}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}button,select{cursor:pointer}button:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #d87842;outline-offset:3px}
    .panel{width:356px;max-width:calc(100vw - 32px);background:#fcfbf7;border:1px solid #d8ddd2;border-radius:20px;box-shadow:0 12px 50px #10271d30;overflow:hidden}
    header{padding:16px 18px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e4e6dd}.logo{font-weight:800;letter-spacing:-.5px}.dot{width:9px;height:9px;border-radius:50%;background:#86aa75}.beta{font-size:10px;color:#6b786b;border:1px solid #d9ded1;border-radius:4px;padding:0 4px}.close{margin-left:auto;border:0;background:transparent;color:#4b5d51;font-size:23px;line-height:1}
    main{padding:18px;max-height:min(560px,70vh);overflow:auto}p{margin:0 0 12px}.eyebrow{font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#63745e;font-weight:700}.product{font-size:12px;color:#627263;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:16px}h2{font-size:21px;line-height:1.2;letter-spacing:-.5px;margin:9px 0 12px}.size{font-size:52px;font-weight:700;line-height:1.1;letter-spacing:-2px;margin:7px 0 12px}.badge{display:inline-block;background:#e8efdf;color:#415d37;border-radius:6px;font-size:11px;font-weight:600;padding:4px 8px;margin-bottom:12px}.note{font-size:12px;color:#677263}.warning{background:#f5ede1;border-radius:10px;padding:11px;font-size:12px;color:#765532}
    button.primary{width:100%;border:0;background:#294e3c;color:white;border-radius:10px;padding:11px 14px;font-weight:600}button.secondary{border:1px solid #d5dcce;background:#fffef9;color:#314c37;border-radius:9px;padding:8px 11px}button.link{padding:5px 0;border:0;background:none;color:#345c40;text-decoration:underline;text-underline-offset:3px;font-size:12px}.row{display:flex;gap:8px;margin-top:12px}.row>*{flex:1}label{font-size:12px;display:block;margin:12px 0 5px}select,textarea{width:100%;border:1px solid #cbd5c3;background:white;color:#293f30;border-radius:8px;padding:9px}textarea{height:120px;resize:vertical;font-size:12px}details{border-top:1px solid #e1e4d8;margin-top:16px;padding-top:13px}summary{cursor:pointer;font-size:12px;color:#3f5d43}table{font-size:11px;width:100%;border-collapse:collapse;margin:12px 0}td,th{text-align:left;padding:7px 3px;border-bottom:1px solid #e3e7dd}.outside{color:#9c5125}.source{font-size:11px;overflow-wrap:anywhere;margin-top:12px;color:#6b7668}a{color:#345c40}footer{padding:11px 18px;background:#f0f2e9;display:flex;justify-content:space-between;font-size:10px;color:#67725f}footer button{border:0;background:none;font-size:10px;color:#3b5941;padding:0}.error{color:#9b422d;font-size:12px;margin-top:8px}.chip{border:1px solid #ccd5c3;background:#fcfbf7;color:#2d4c36;border-radius:30px;padding:12px 16px;box-shadow:0 5px 24px #163a2022;font-size:13px;font-weight:600}
    @media(max-width:480px){:host{bottom:12px!important;right:12px!important}.panel{width:340px}}
  `;
  function el(tag, text, attrs = {}) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }
  function button(text, callback, cls = 'secondary') { const node = el('button', text, { type: 'button', class: cls }); node.addEventListener('click', callback); return node; }
  function select(parent, label, choices, value, onChange) {
    const id = `ml-${label.replace(/\W/g, '').toLowerCase()}`;
    parent.append(el('label', label, { for: id }));
    const input = el('select', null, { id });
    choices.forEach(([v, t]) => input.append(el('option', t, { value: v })));
    input.value = value;
    input.addEventListener('change', () => { onChange(input.value); render(true); });
    parent.append(input);
  }
  function mount() {
    if (host?.isConnected) return;
    host = el('div', null, { id: 'measurelive-assistant' });
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.append(el('style', css));
    document.documentElement.append(host);
  }
  function candidates() {
    if (pasted) return [pasted];
    const charts = [...(current?.charts || []), ...linkedCharts];
    const category = categoryOverride || current?.product.category;
    const matching = charts.filter(chart => category === 'top' ? chart.fields.includes('chest') : category === 'bottom' ? chart.fields.some(f => ['waist', 'hips'].includes(f)) && !chart.fields.includes('chest') : true);
    const relevant = matching.length ? matching : charts;
    const fingerprint = chart => JSON.stringify([chart.matrix, chart.kind, chart.unit, chart.title.toLowerCase()]);
    return relevant.filter((chart, i) => relevant.findIndex(other => fingerprint(other) === fingerprint(chart)) === i);
  }
  function render(force = false) {
    if (!current || (!manual && (!settings.autoScan || !profile || !current.product.isProduct))) { host?.remove(); return; }
    const charts = candidates();
    if (selected && !charts.some(c => c.id === selected)) { selected = ''; kindOverride = ''; unitOverride = ''; }
    let chart = selected ? charts.find(c => c.id === selected) : charts.length === 1 ? charts[0] : null;
    if (chart && (unitOverride || kindOverride)) chart = C.parseMatrix(chart.matrix, { ...chart, unit: unitOverride || chart.unit, kind: kindOverride || chart.kind });
    const result = charts.length > 1 && !chart ? { status: 'choose', message: 'This page has more than one chart. Choose the one for this item and collection.' } : C.recommend(chart, profile, categoryOverride || current.product.category);
    const signature = JSON.stringify([current.product, result, charts.map(c => [c.id, c.title, c.kind, c.needsUnit]), current.guides.map(g => g.label), dismissed, selected, unitOverride, kindOverride, !!pasted]);
    if (!force && lastSignature === signature && host?.isConnected) return;
    lastSignature = signature;
    mount();
    while (shadow.children.length > 1) shadow.lastElementChild.remove();
    if (dismissed) { shadow.append(button('MeasureLive · Find my size', () => { dismissed = false; render(true); }, 'chip')); return; }
    const panel = el('section', null, { class: 'panel', 'aria-label': 'MeasureLive size assistant' });
    const header = el('header');
    header.append(el('span', '', { class: 'dot', 'aria-hidden': 'true' }), el('span', 'MeasureLive', { class: 'logo' }), el('span', 'BETA', { class: 'beta' }));
    const close = button('×', () => { dismissed = true; render(true); }, 'close'); close.setAttribute('aria-label', 'Minimize size assistant'); header.append(close); panel.append(header);
    const main = el('main');
    main.append(el('div', 'A little less guesswork', { class: 'eyebrow' }), el('p', current.product.name || 'Your shopping companion', { class: 'product' }));
    if (result.status === 'match') {
      main.append(el('div', 'Your suggested size', { class: 'note' }), el('div', result.size, { class: 'size' }), el('span', result.confidence, { class: 'badge' }), el('p', result.message));
      if (result.alternative) main.append(el('p', `Also close: ${result.alternative}. Check your preferred fit.`, { class: 'note' }));
      main.append(el('p', 'A chart-based suggestion, not a guarantee. Cut, fabric and personal fit still matter.', { class: 'note' }));
    } else {
      const titles = { profile: 'Make it your size.', 'no-chart': 'Let’s find your size.', choose: 'Choose the right chart.', units: 'One detail to check.', kind: 'What does this chart measure?', garment: 'This measures the clothing.', outside: 'No clear fit in this chart.', insufficient: 'A few details are missing.' };
      main.append(el('h2', titles[result.status] || 'Check this size guide.'), el('p', result.message));
    }
    if (result.status === 'profile') main.append(button('Add my measurements', () => chrome.runtime.sendMessage({ type: 'OPEN_PROFILE' }), 'primary'));
    if (charts.length > 1) select(main, 'Size chart', [['', 'Choose a chart…'], ...charts.map((c, i) => [c.id, `${i + 1}. ${c.title} · ${c.rawLabels.slice(0, 4).join(', ')}`])], selected, value => { selected = value; kindOverride = ''; unitOverride = ''; });
    if (chart?.needsUnit || unitOverride) select(main, 'Chart units', [['', 'Choose units…'], ['cm', 'Centimeters (cm)'], ['in', 'Inches (in)']], unitOverride, value => { unitOverride = value; });
    if (chart?.kind === 'unknown' || kindOverride) select(main, 'Chart describes', [['', 'Check the store’s chart label…'], ['body', 'Body measurements'], ['garment', 'Garment / product measurements']], kindOverride, value => { kindOverride = value; });
    if (result.comparisons) {
      const details = el('details'); details.append(el('summary', 'See the measurement comparison'));
      const table = el('table'); const head = el('tr'); ['Measure', 'You', 'Chart'].forEach(t => head.append(el('th', t))); table.append(head);
      const unit = profile?.unit || 'cm', factor = unit === 'in' ? 2.54 : 1, fmt = n => (n / factor).toFixed(1).replace(/\.0$/, '');
      for (const c of result.comparisons) { const row = el('tr', null, { class: c.inside ? '' : 'outside' }); row.append(el('td', labels[c.field]), el('td', `${fmt(c.body)} ${unit}`), el('td', `${fmt(c.min)}${c.max !== c.min ? '–' + fmt(c.max) : ''} ${unit}`)); table.append(row); }
      details.append(table);
      if (result.unCompared?.length) details.append(el('p', `Not compared: ${result.unCompared.map(f => labels[f]).join(', ')}.`, { class: 'note' }));
      main.append(details);
    }
    if (chart) {
      const source = el('div', `Read from: ${chart.title}`, { class: 'source' });
      if (chart.source && /^https?:/.test(chart.source)) { const a = el('a', 'View source', { href: chart.source, target: '_blank', rel: 'noopener noreferrer' }); source.append(document.createTextNode(' · '), a); }
      main.append(source);
      if (chart.flat) main.append(el('p', 'Flat-width columns were excluded. Never compare a flat chest width directly with your chest circumference.', { class: 'warning' }));
    }
    if (current.guides.length && result.status !== 'match') {
      const guide = current.guides.find(g => g.element?.getClientRects().length) || current.guides[0];
      main.append(button(`Show “${guide.label.slice(0, 48)}” on page`, () => {
        awaitingGuide = true; dismissed = true; render(true);
        guide.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const before = guide.element.style.outline;
        guide.element.style.outline = '3px solid #d87842';
        guide.element.focus({ preventScroll: true });
        setTimeout(() => { guide.element.style.outline = before; }, 4500);
      }, 'link'));
      main.append(el('p', 'Open the store’s guide. I’ll read it when it appears.', { class: 'note' }));
    }
    if (!chart && result.status !== 'profile' && result.status !== 'choose') main.append(el('p', 'I can read text tables. Image-only charts, closed widgets and some embedded charts need a manual check.', { class: 'note' }));
    const tools = el('details'); tools.append(el('summary', 'Chart tools & manual entry'));
    select(tools, 'Clothing type', [['', `Automatic (${current.product.category})`], ['top', 'Top / outerwear'], ['bottom', 'Trousers / skirt / shorts'], ['full', 'Dress / full outfit']], categoryOverride, value => { categoryOverride = value; selected = ''; });
    const textarea = el('textarea', null, { placeholder: 'Paste a table from the store:\nSize | Chest | Waist\nS | 86–91 | 71–76\nM | 92–97 | 77–82', 'aria-label': 'Paste the store’s size chart', maxlength: '18000' });
    tools.append(el('p', 'Paste text with one row per line. Separate columns with tabs, commas, or |. Use only the store’s actual chart.', { class: 'note' }), textarea);
    const error = el('p', '', { class: 'error', role: 'status' });
    tools.append(button('Read pasted chart', () => {
      const parsed = C.parseText(textarea.value, { title: 'Manually pasted chart', source: location.href });
      if (!parsed) { error.textContent = 'Could not read that table. Include a Size column and Chest, Waist or Hips measurements.'; return; }
      pasted = { ...parsed, id: 'pasted' }; selected = ''; unitOverride = ''; kindOverride = ''; render(true);
    }), error);
    if (pasted) tools.append(button('Use the page’s charts again', () => { pasted = null; selected = ''; unitOverride = ''; kindOverride = ''; render(true); }, 'link'));
    main.append(tools);
    const row = el('div', null, { class: 'row' }); row.append(button('Scan again', () => { fetched.clear(); linkedCharts = []; lastSignature = ''; schedule(0); }), button('Edit measurements', () => chrome.runtime.sendMessage({ type: 'OPEN_PROFILE' }))); main.append(row);
    panel.append(main);
    const footer = el('footer'); footer.append(el('span', 'Measurements stay on this device'), button('Hide for this visit', () => { dismissed = true; render(true); })); panel.append(footer);
    shadow.append(panel);
  }
  async function fetchGuide(url, expectedPage) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) return;
      const reader = response.body.getReader(), chunks = []; let length = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 750000) { await reader.cancel(); return; } chunks.push(value); }
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (location.href !== expectedPage) return;
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
      linkedCharts.push(...E.scan(doc, url).charts.map((c, i) => ({ ...c, id: `linked-${url}-${i}` })));
      render();
    } catch { /* Leave the on-page / manual path available when a guide cannot be fetched. */ }
    finally { clearTimeout(timeout); }
  }
  function observe(roots) {
    for (const root of roots) {
      if (observingRoots.has(root)) continue;
      observingRoots.add(root);
      const observer = new MutationObserver(records => {
        if (records.some(r => r.target !== host && !host?.contains(r.target) && [...r.addedNodes, ...r.removedNodes].some(n => n !== host) || r.type === 'characterData')) schedule();
      });
      observer.observe(root, { childList: true, subtree: true, characterData: true }); observers.push(observer);
    }
  }
  async function scan() {
    timer = null;
    if (busy) { rerun = true; return; }
    if ((!settings.autoScan && !manual) || document.visibilityState === 'hidden') return;
    busy = true;
    try {
      if (pageURL !== location.href) {
        pageURL = location.href; selected = ''; unitOverride = ''; kindOverride = ''; categoryOverride = ''; pasted = null; linkedCharts = []; fetched.clear(); dismissed = false; awaitingGuide = false; lastSignature = '';
        observers.forEach(o => o.disconnect()); observers = []; observingRoots = new WeakSet();
      }
      const discovered = E.scan(document, location.href);
      if (current && current.product.name !== discovered.product.name) {
        selected = ''; unitOverride = ''; kindOverride = ''; categoryOverride = ''; pasted = null; linkedCharts = []; fetched.clear(); dismissed = false;
      }
      current = discovered;
      if (awaitingGuide && current.charts.length) { dismissed = false; awaitingGuide = false; }
      observe(current.roots);
      render();
      if ((current.product.isProduct || manual) && profile && !current.charts.length) {
        for (const guide of current.guides) {
          const url = E.safeGuideURL(guide.href, location.href);
          if (url && !fetched.has(url) && fetched.size < 3) { fetched.add(url); void fetchGuide(url, pageURL); }
        }
      }
    } finally { busy = false; if (rerun) { rerun = false; schedule(); } }
  }
  function schedule(delay = 850) { if (!timer) timer = setTimeout(() => scan().catch(console.warn), delay); }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.type !== 'MEASURELIVE_SCAN') return;
    manual = true; dismissed = false;
    chrome.storage.local.get(['profile', 'settings']).then(data => { profile = data.profile; settings = data.settings || {}; return scan(); }).then(() => respond({ ok: true, charts: candidates().length })).catch(() => respond({ error: 'This page could not be read. Try refreshing it.' }));
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.profile) profile = changes.profile.newValue;
    if (changes.settings) { settings = changes.settings.newValue || {}; if (!settings.autoScan) { manual = false; host?.remove(); } }
    lastSignature = ''; schedule(0);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  setInterval(() => { if (!document.hidden && location.href !== pageURL) schedule(0); }, 1500);
  chrome.storage.local.get(['profile', 'settings']).then(data => { profile = data.profile; settings = data.settings || {}; schedule(0); }).catch(() => {});
})();
