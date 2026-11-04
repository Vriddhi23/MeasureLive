const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
function setup(html) {
  const dom = new JSDOM(html, { url: 'https://shop.example/products/shirt', runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('extension/core.js', 'utf8'));
  dom.window.eval(fs.readFileSync('extension/extractor.js', 'utf8'));
  return dom;
}
const table = '<section><h2>Body measurements (cm)</h2><table><tr><th>Size</th><th>Chest</th><th>Waist</th></tr><tr><td>S</td><td>86-91</td><td>70-76</td></tr><tr><td>M</td><td>92-98</td><td>77-83</td></tr></table></section>';
test('finds hidden charts and detects a clothing product', () => {
  const dom = setup('<h1>Cotton Shirt</h1><button>Add to bag</button><div hidden>' + table + '</div>');
  const result = dom.window.MeasureLiveExtract.scan(dom.window.document);
  assert.equal(result.charts.length, 1); assert.equal(result.charts[0].kind, 'body'); assert.equal(result.charts[0].needsUnit, false); assert.equal(result.product.isProduct, true);
  dom.window.close();
});
test('ignores unrelated number tables and non-clothing products', () => {
  const dom = setup('<h1>Headphones</h1><button>Add to cart</button><table><tr><th>Model</th><th>Price</th></tr><tr><td>M</td><td>99</td></tr></table>');
  const result = dom.window.MeasureLiveExtract.scan(dom.window.document); assert.equal(result.charts.length, 0); assert.equal(result.product.isProduct, false); dom.window.close();
});
test('finds chart controls without triggering clicks', () => {
  const dom = setup('<button id="guide">Size guide</button><a href="/size-guide">Size chart</a>'); let clicks = 0;
  dom.window.document.getElementById('guide').onclick = () => clicks++;
  const result = dom.window.MeasureLiveExtract.scan(dom.window.document, dom.window.location.href); assert.equal(result.guides.length, 2); assert.equal(clicks, 0); dom.window.close();
});
test('reads ARIA tables, CSS grid rows, and open shadow-root widgets', () => {
  const aria = '<section><h2>Body measurements cm</h2><div role="table"><div role="row"><span role="columnheader">Size</span><span role="columnheader">Chest</span></div><div role="row"><span role="cell">M</span><span role="cell">92–98</span></div></div></section>';
  const grid = '<section><h2>Body measurements cm</h2><div class="size-chart"><div><span>Size</span><span>Chest</span></div><div><span>L</span><span>99–105</span></div></div></section>';
  const dom = setup(aria + grid + '<div id="widget"></div>'); dom.window.document.getElementById('widget').attachShadow({ mode: 'open' }).innerHTML = table;
  const result = dom.window.MeasureLiveExtract.scan(dom.window.document); assert.equal(result.charts.length, 3); dom.window.close();
});
test('deduplicates repeated tables but preserves distinct charts', () => {
  const dom = setup(table + table + table.replaceAll('92-98', '100-106'));
  assert.equal(dom.window.MeasureLiveExtract.scan(dom.window.document).charts.length, 2); dom.window.close();
});
test('guide fetch is limited to safe same-origin guide URLs', () => {
  const dom = setup(''); const safe = dom.window.MeasureLiveExtract.safeGuideURL, origin = dom.window.location.href;
  assert.equal(safe('/pages/size-guide', origin), 'https://shop.example/pages/size-guide');
  for (const url of ['https://evil.example/size-guide', '/logout?next=size-guide', '/cart/size-chart', '/size-guide?action=delete', 'javascript:alert(1)', '#size-guide', 'https://user:pass@shop.example/size-guide']) assert.equal(safe(url, origin), null, url);
  dom.window.close();
});
test('handles merged cells without shifting size values', () => {
  const dom = setup('<section><h2>Body measurements cm</h2><table><tr><th rowspan="2">Size</th><th colspan="2">Measurements</th></tr><tr><th>Chest</th><th>Waist</th></tr><tr><td>M</td><td>92-98</td><td>77-83</td></tr></table></section>');
  const charts = dom.window.MeasureLiveExtract.scan(dom.window.document).charts;
  assert.equal(charts.length, 1); assert.equal(charts[0].rows[0].values.chest.min, 92); dom.window.close();
});
test('units from unrelated page controls do not contaminate a local chart', () => {
  const dom = setup('<section><div><select><option>Chart in inches</option></select></div><div>' + table + '</div></section>');
  const charts = dom.window.MeasureLiveExtract.scan(dom.window.document).charts;
  assert.equal(charts[0].unit, 'cm'); assert.equal(charts[0].needsUnit, false); dom.window.close();
});
