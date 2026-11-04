/* Shared, dependency-free chart parsing and conservative size matching. */
(function (root) {
  'use strict';
  const FIELDS = ['height', 'chest', 'waist', 'hips', 'sleeve', 'inseam'];
  const LIMITS = { height: [80, 250], chest: [35, 220], waist: [30, 220], hips: [35, 240], sleeve: [20, 110], inseam: [20, 130] };
  const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  function fieldFor(label) {
    const t = clean(label).toLowerCase();
    // Flat widths and garment length are not body circumferences or height.
    if (/half|1\/2|flat|pit[ -]to|across|width|outseam|outside leg|total length|body length|back length|shoulder|neck|bicep/.test(t)) return null;
    if (/\b(chest|bust)\b/.test(t)) return 'chest';
    if (/\bwaist\b/.test(t)) return 'waist';
    if (/\bhips?\b|seat circumference/.test(t)) return 'hips';
    if (/\binseam\b|inside leg|inner leg/.test(t)) return 'inseam';
    if (/\bsleeve\b|arm length/.test(t)) return 'sleeve';
    if (/\bheight\b|stature/.test(t)) return 'height';
    return null;
  }
  function detectUnit(text) {
    const t = clean(text).toLowerCase();
    const cm = /\bcm\b|centimet(?:er|re)s?/.test(t);
    const inch = /\binch(?:es)?\b|\(\s*in\s*\)|\bin\s*$/.test(t) || /[″"]/.test(t);
    return cm && !inch ? 'cm' : inch && !cm ? 'in' : null;
  }
  function detectKind(text) {
    const t = clean(text).toLowerCase();
    if (/garment measurements|product measurements|item measurements|measurements of (?:the )?(?:garment|product)|measured flat|laid flat/.test(t)) return 'garment';
    if (/body measurements|body size|measurements of your body|to fit (?:your )?(?:body|chest|waist)|body dimensions/.test(t)) return 'body';
    return 'unknown';
  }
  function parseRange(value, unit) {
    if (!['cm', 'in'].includes(unit)) return null;
    let s = clean(value).toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    s = s.replace(/(\d+)\s+(\d+)\/(\d+)/g, (_, a, b, c) => String(+a + +b / +c));
    s = s.replace(/(\d*)([¼½¾])/g, (_, a, fraction) => String(+(a || 0) + ({ '¼': .25, '½': .5, '¾': .75 })[fraction]));
    s = s.replace(/\b(?:cm|centimeters?|centimetres?|in|inches|inch)\b/g, '').replace(/["″]/g, '').trim();
    const match = s.match(/^(\d+(?:\.\d+)?)\s*(?:[-–—~]|to)?\s*(\d+(?:\.\d+)?)?$/);
    if (!match) return null;
    const factor = unit === 'in' ? 2.54 : 1;
    const min = +match[1] * factor, max = +(match[2] || match[1]) * factor;
    if (!Number.isFinite(min) || min <= 0 || max < min || max > 300) return null;
    return { min, max };
  }
  function isSize(value) {
    return /^(?:(?:US|UK|EU|AU|IT|FR|W)\s*)?(?:\d{1,3}(?:[/.\-]\d{1,3})?|\d?X{0,4}[SML]|[SML]|XXS|XXL|XXXL|XXXXL|small|medium|large|extra small|extra large|one size|OS|\dXL)(?:\s*\([^)]{1,18}\))?$/i.test(clean(value));
  }
  function parseMatrix(matrix, meta = {}) {
    const rows = matrix.map(r => r.map(clean)).filter(r => r.some(Boolean));
    if (rows.length < 2 || rows.length > 160) return null;
    let headerIndex = rows.findIndex(r => r.filter(c => fieldFor(c)).length >= 1 && r.some(c => /^(size|sizes|label|international|alpha|us|uk|eu)(\b|$)/i.test(c)));
    if (headerIndex < 0) headerIndex = rows.findIndex(r => r.filter(c => fieldFor(c)).length >= 2);
    let header, rawRows;
    if (headerIndex >= 0) {
      header = rows[headerIndex];
      const sizeIndex = header.findIndex(c => /^(size|sizes|label|international|alpha|us|uk|eu)(\b|$)/i.test(c));
      const idx = sizeIndex >= 0 ? sizeIndex : 0;
      rawRows = rows.slice(headerIndex + 1).filter(r => isSize(r[idx])).map(r => ({ size: r[idx], values: r }));
    } else {
      // Horizontal charts: Size | S | M | L, then Chest | ...
      const topIndex = rows.findIndex(r => r.slice(1).filter(isSize).length >= 2);
      if (topIndex < 0) return null;
      const top = rows[topIndex];
      const measures = rows.slice(topIndex + 1).filter(r => fieldFor(r[0]));
      if (!measures.length) return null;
      header = ['Size', ...measures.map(r => r[0])];
      rawRows = top.slice(1).map((size, i) => ({ size, values: [size, ...measures.map(r => r[i + 1])] })).filter(r => isSize(r.size));
    }
    if (!rawRows.length) return null;
    const unit = meta.unit || detectUnit(meta.context || '');
    const columns = header.map((label, index) => ({ field: fieldFor(label), unit: meta.unit || detectUnit(label) || unit, index, label })).filter(c => c.field);
    if (!columns.length) return null;
    const parsedRows = rawRows.map(row => {
      const values = {};
      for (const col of columns) {
        const range = parseRange(row.values[col.index], col.unit);
        if (range && !values[col.field]) values[col.field] = range;
      }
      return { size: row.size, values };
    });
    const missingUnits = columns.some(c => !c.unit);
    return {
      title: meta.title || 'Size chart', source: meta.source || '',
      kind: meta.kind || detectKind(meta.context || ''), unit,
      rows: parsedRows, matrix: rows, context: meta.context || '',
      fields: [...new Set(columns.map(c => c.field))],
      needsUnit: missingUnits, flat: /half|1\/2|pit[ -]to|measured flat|laid flat/i.test(header.join(' ') + ' ' + (meta.context || '')),
      rawLabels: rawRows.map(r => r.size)
    };
  }
  function parseText(text, meta = {}) {
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const matrix = lines.map(line => line.includes('\t') ? line.split('\t') : line.includes('|') ? line.split('|').filter(Boolean) : line.includes(';') ? line.split(';') : line.includes(',') ? line.split(',') : line.split(/\s{2,}/));
    return parseMatrix(matrix, { ...meta, context: meta.context || text });
  }
  function validateProfile(profile) {
    const errors = [];
    for (const field of FIELDS) {
      const value = profile?.measurements?.[field];
      if (value == null || value === '') continue;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < LIMITS[field][0] || value > LIMITS[field][1]) errors.push(field);
    }
    if (!profile?.measurements?.chest && !profile?.measurements?.waist && !profile?.measurements?.hips) errors.push('required');
    return [...new Set(errors)];
  }
  function categoryFor(text) {
    const t = clean(text).toLowerCase();
    if (/\b(dress(?:es)?|jumpsuits?|rompers?|bodysuits?|overalls?)\b/.test(t)) return 'full';
    if (/\b(trousers?|pants?|jeans?|shorts?|skirts?|leggings?|joggers?)\b/.test(t)) return 'bottom';
    if (/\b(shirts?|t-shirts?|tees?|tops?|blouses?|sweaters?|jumpers?|hoodies?|jackets?|coats?|blazers?|cardigans?|vests?|sweatshirts?)\b/.test(t)) return 'top';
    return 'unknown';
  }
  function recommend(chart, profile, category = 'unknown') {
    const fail = (status, message) => ({ status, message });
    if (!profile || validateProfile(profile).length) return fail('profile', 'Add your measurements to compare sizes.');
    if (!chart) return fail('no-chart', 'Open the store’s size guide so I can read its chart.');
    if (chart.needsUnit) return fail('units', 'Choose the units used in this chart before comparing.');
    if (chart.kind === 'unknown') return fail('kind', 'Does this chart describe body measurements or the garment itself?');
    if (chart.kind === 'garment') return fail('garment', 'Garment dimensions need room for movement and depend on stretch and cut. Use a body size chart for a recommendation; do not treat garment dimensions as your body size.');
    const relevant = category === 'top' ? ['chest', 'waist', 'sleeve', 'height'] : category === 'bottom' ? ['waist', 'hips', 'inseam', 'height'] : FIELDS;
    const fields = chart.fields.filter(f => relevant.includes(f) && profile.measurements[f] != null);
    const primary = fields.filter(f => ['chest', 'waist', 'hips'].includes(f));
    if (!primary.length || (category === 'top' && !primary.includes('chest')) || (category === 'bottom' && !primary.some(f => ['waist', 'hips'].includes(f)))) return fail('insufficient', 'This chart and your saved measurements do not share the measurements needed for this item.');
    const candidates = chart.rows.map(row => {
      const comparisons = fields.filter(f => row.values[f]).map(field => {
        const body = profile.measurements[field], range = row.values[field];
        const exact = Math.abs(range.max - range.min) < .01;
        // Single values are reference points, not an invented fit range.
        const delta = body < range.min ? range.min - body : body > range.max ? body - range.max : 0;
        return { field, body, ...range, delta, exact, inside: delta < .01 };
      });
      const required = comparisons.filter(c => primary.includes(c.field));
      if (required.length !== primary.length) return null;
      const score = required.reduce((n, c) => n + c.delta * (c.field === 'chest' ? 1.2 : 1), 0) / required.length;
      return { size: row.size, score, comparisons, allInside: comparisons.every(c => c.inside), exact: comparisons.some(c => c.exact) };
    }).filter(Boolean).sort((a, b) => a.score - b.score);
    if (!candidates.length) return fail('insufficient', 'There are not enough readable measurements to compare this chart.');
    const best = candidates[0], next = candidates[1];
    const ties = candidates.filter(c => Math.abs(c.score - best.score) < .1);
    const referenceOnly = best.exact;
    const tooFar = best.comparisons.some(c => primary.includes(c.field) && c.delta > (c.exact ? 5 : 3));
    if (tooFar) return { ...fail('outside', 'Your measurements fall outside the closest listed size. Check with the store rather than relying on a suggested size.'), comparisons: best.comparisons };
    const size = ties.length > 1 ? ties.map(c => c.size).join(' / ') : best.size;
    const confidence = best.allInside && !referenceOnly && primary.length >= 2 && ties.length === 1 ? 'Strong chart match' : 'Check the fit';
    return {
      status: 'match', size, confidence, comparisons: best.comparisons,
      alternative: ties.length === 1 && next && next.score - best.score < 2 ? next.size : null,
      message: ties.length > 1 ? 'These sizes are equally close. Check the store’s fit notes.' : referenceOnly ? 'Closest listed body measurements. The chart gives reference values, not a fit range.' : best.allInside ? 'Your compared measurements fit the listed body ranges.' : 'Some measurements fall between sizes. Review the comparison before choosing.',
      unCompared: relevant.filter(f => profile.measurements[f] != null && !best.comparisons.some(c => c.field === f))
    };
  }
  const api = { FIELDS, LIMITS, clean, fieldFor, detectUnit, detectKind, parseRange, parseMatrix, parseText, validateProfile, categoryFor, recommend, isSize };
  root.MeasureLiveCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
