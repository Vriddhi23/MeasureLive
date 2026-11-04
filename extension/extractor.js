(function (root) {
  'use strict';
  const C = root.MeasureLiveCore;
  const GUIDE = /size\s*(?:guide|chart|&\s*fit)|sizing\s*(?:guide|chart)|measurement\s*(?:guide|chart)/i;
  const text = el => C.clean(el?.textContent || '');
  function rootsFor(doc) {
    const roots = [doc];
    // Open shadow roots and same-origin frames can contain third-party size widgets.
    for (let i = 0; i < roots.length && roots.length < 30; i++) {
      for (const el of roots[i].querySelectorAll('*')) {
        if (el.id === 'measurelive-assistant') continue;
        if (el.shadowRoot) roots.push(el.shadowRoot);
        if (el.tagName === 'IFRAME') { try { if (el.contentDocument?.body) roots.push(el.contentDocument); } catch {} }
        if (roots.length >= 30) break;
      }
    }
    return roots;
  }
  function tableMatrix(table) {
    const rows = [...table.querySelectorAll('tr,[role="row"]')].filter(row => row.closest('table,[role="table"],[role="grid"]') === table);
    if (rows.length > 160) return [];
    const result = [];
    rows.forEach((row, r) => {
      result[r] ||= [];
      let col = 0;
      const cells = [...row.children].filter(el => /^(TH|TD)$/.test(el.tagName) || ['cell', 'columnheader', 'rowheader', 'gridcell'].includes(el.getAttribute('role')));
      for (const cell of cells) {
        while (result[r][col] !== undefined) col++;
        const colspan = Math.min(30, Math.max(1, +cell.getAttribute('colspan') || 1));
        const rowspan = Math.min(30, Math.max(1, +cell.getAttribute('rowspan') || 1));
        for (let a = 0; a < rowspan; a++) {
          result[r + a] ||= [];
          for (let b = 0; b < colspan; b++) result[r + a][col + b] = text(cell);
        }
        col += colspan;
      }
    });
    return result.map(row => Array.from(row, cell => cell || ''));
  }
  function contextFor(el) {
    const caption = text(el.querySelector('caption'));
    const parts = [caption, el.getAttribute('aria-label') || ''];
    let cursor = el;
    for (let depth = 0; depth < 3 && cursor?.parentElement && cursor.parentElement.tagName !== 'BODY'; depth++, cursor = cursor.parentElement) {
      let prev = cursor.previousElementSibling;
      for (let n = 0; prev && n < 3; n++, prev = prev.previousElementSibling) {
        if (!prev.querySelector('table,[role="table"]') && text(prev).length < 650) parts.push(text(prev));
      }
      parts.push(...[...cursor.parentElement.children].filter(child => /^(H[1-6]|LEGEND|LABEL)$/.test(child.tagName)).map(text));
      if (cursor.parentElement.matches('section,dialog,details,[role="dialog"]')) break;
    }
    // The table's own headers may declare both units; column-specific units take precedence.
    parts.push(text(el).slice(0, 4000));
    const context = parts.filter(Boolean).join(' · ');
    const nearest = el.closest('section,dialog,[role="dialog"],details');
    const heading = nearest?.querySelector('h1,h2,h3,h4,summary');
    return { context, title: (caption || text(heading) || parts.find(p => GUIDE.test(p) && p.length < 100) || 'Size chart').slice(0, 110) };
  }
  function productInfo(doc) {
    const heading = text(doc.querySelector('h1')) || doc.title || '';
    let product = null;
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 8 || product) return;
      const types = [].concat(value['@type'] || []);
      if (types.some(type => /^(Product|ProductGroup)$/i.test(type))) product = value;
      for (const item of Object.values(value)) {
        if (Array.isArray(item)) item.slice(0, 40).forEach(v => visit(v, depth + 1));
        else if (item && typeof item === 'object') visit(item, depth + 1);
      }
    };
    for (const script of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, 20)) {
      if (script.textContent.length > 300000) continue;
      try { visit(JSON.parse(script.textContent)); } catch {}
    }
    const name = C.clean(product?.name || heading).slice(0, 180);
    const typeText = [name, product?.category || '', text(doc.querySelector('[aria-label*="readcrumb"],.breadcrumb,.breadcrumbs'))].join(' ');
    const category = C.categoryFor(typeText);
    const buttons = [...doc.querySelectorAll('button,[role="button"],input[type="submit"]')].slice(0, 500);
    const purchase = buttons.some(el => /add to (?:bag|cart|basket)|buy now/i.test(text(el) || el.value || ''));
    const sizeControl = !!doc.querySelector('select[name*="size" i], [aria-label*="size" i], [data-testid*="size" i]');
    const clothing = category !== 'unknown' || /clothing|apparel|fashion/i.test(typeText);
    return { name, category, isProduct: clothing && (!!product || purchase || sizeControl) };
  }
  function scan(doc, source = '') {
    const roots = rootsFor(doc), charts = [], guides = [], fingerprints = new Set();
    const add = (matrix, element) => {
      const meta = contextFor(element);
      const chart = C.parseMatrix(matrix, { ...meta, source });
      if (!chart) return;
      const fingerprint = JSON.stringify([chart.matrix, chart.kind, chart.unit, chart.title]);
      if (fingerprints.has(fingerprint)) return;
      fingerprints.add(fingerprint);
      let hash = 2166136261;
      for (const character of fingerprint) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
      charts.push({ ...chart, id: `chart-${hash.toString(16)}`, element });
    };
    for (const tree of roots) {
      for (const table of [...tree.querySelectorAll('table,[role="table"],[role="grid"]')].slice(0, 80)) add(tableMatrix(table), table);
      // Many stores use CSS grids rather than semantic HTML tables.
      for (const grid of [...tree.querySelectorAll('[class*="size-chart" i],[id*="size-chart" i],[class*="sizechart" i],[class*="size_table" i],[class*="measurement-table" i]')].slice(0, 35)) {
        if (grid.matches('table') || grid.querySelector('table,[role="table"]')) continue;
        const rows = [...grid.children].filter(r => r.children.length >= 2);
        if (rows.length >= 2) add(rows.map(r => [...r.children].map(text)), grid);
      }
      for (const el of [...tree.querySelectorAll('a,button,summary,[role="button"]')].slice(0, 1800)) {
        if (el.closest('[hidden],[aria-hidden="true"]')) continue;
        const label = (text(el) || el.getAttribute('aria-label') || '').slice(0, 100);
        if (!GUIDE.test(label)) continue;
        let href = null;
        try { const url = new URL(el.getAttribute('href') || '', source || doc.URL); if (/^https?:$/.test(url.protocol) && el.hasAttribute('href')) href = url.href; } catch {}
        if (!guides.some(g => g.label === label && g.href === href)) guides.push({ label, href, element: el });
      }
    }
    return { charts, guides: guides.slice(0, 12), product: productInfo(doc), roots };
  }
  function safeGuideURL(href, current) {
    try {
      const url = new URL(href, current), origin = new URL(current);
      if (url.origin !== origin.origin || !/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      if (url.pathname === origin.pathname && url.search === origin.search) return null;
      // Never follow arbitrary product, cart, logout, account or action URLs.
      if (!/(?:siz(?:e|ing)[-_/]?(?:guide|chart)|size-guide|sizechart|size_chart|sizing-guide|sizeguide)/i.test(url.pathname)) return null;
      if (/cart|checkout|logout|delete|remove|account|add|action/i.test(url.pathname + url.search)) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }
  root.MeasureLiveExtract = { scan, tableMatrix, rootsFor, safeGuideURL };
})(globalThis);
