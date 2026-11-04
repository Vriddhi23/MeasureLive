const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');
const matrix = [['Size', 'Chest', 'Waist'], ['S', '86–91', '70–76'], ['M', '92–98', '77–83'], ['L', '99–105', '84–90']];
const profile = { measurements: { height: 170, chest: 94, waist: 78, hips: 98, sleeve: 60, inseam: 79 }, unit: 'cm' };
const chart = (extra = {}) => C.parseMatrix(matrix, { context: 'Body measurements (cm)', ...extra });
test('matches a body range using chest and waist', () => {
  const result = C.recommend(chart(), profile, 'top');
  assert.equal(result.size, 'M'); assert.equal(result.confidence, 'Strong chart match');
  assert.deepEqual(result.comparisons.map(c => c.field), ['chest', 'waist']);
  assert.ok(result.unCompared.includes('height'));
});
test('inch conversion, decimal comma and fractions', () => {
  assert.deepEqual(C.parseRange('36–38 in', 'in'), { min: 91.44, max: 96.52 });
  assert.equal(C.parseRange('37 1/2', 'in').min, 95.25);
  assert.equal(C.parseRange('37½', 'in').min, 95.25);
  assert.equal(C.parseRange('94,5', 'cm').min, 94.5);
  for (const value of ['92 / 36', 'N/A', '-90', '94+garbage', '94-90', '1000', '<script>']) assert.equal(C.parseRange(value, 'cm'), null, value);
});
test('unknown or mixed units are never guessed from magnitude', () => {
  assert.equal(C.recommend(C.parseMatrix(matrix), profile, 'top').status, 'units');
  assert.equal(C.detectUnit('cm / inches'), null);
  assert.equal(C.detectUnit('Body measurements in centimeters'), 'cm');
  assert.equal(C.detectUnit('Chest (in)'), 'in');
});
test('per-column units handle a dual-unit chart', () => {
  const dual = C.parseMatrix([['Size', 'Chest (cm)', 'Chest (in)'], ['M', '92–98', '36–38']], { context: 'Body measurements cm / inches' });
  assert.equal(dual.needsUnit, false); assert.equal(C.recommend(dual, profile, 'top').size, 'M');
});
test('horizontal size charts are transposed', () => {
  const horizontal = C.parseMatrix([['Size', 'S', 'M', 'L'], ['Chest', '34–36', '36.5–38.5', '39–41'], ['Waist', '28–30', '30.5–32.5', '33–35']], { context: 'Body measurements in inches' });
  assert.equal(C.recommend(horizontal, profile, 'top').size, 'M');
});
test('unknown chart type and garment dimensions require a manual check', () => {
  assert.equal(C.recommend(chart({ context: 'Size chart cm' }), profile).status, 'kind');
  assert.equal(C.recommend(chart({ context: 'Garment measurements cm' }), profile).status, 'garment');
});
test('flat widths, total length and outseam are not body measurements', () => {
  for (const label of ['Chest width', 'Half chest', '1/2 bust', 'Pit-to-pit', 'Total length', 'Outseam', 'Back length', 'Shoulder width']) assert.equal(C.fieldFor(label), null, label);
  assert.equal(C.fieldFor('Sleeve length (cm)'), 'sleeve'); assert.equal(C.fieldFor('Inside leg'), 'inseam');
});
test('measurement type is not substituted for another', () => {
  const pants = C.parseMatrix([['Size', 'Waist', 'Hips'], ['M', '77–83', '95–101']], { context: 'Body measurements cm' });
  assert.equal(C.recommend(pants, profile, 'top').status, 'insufficient');
  assert.equal(C.recommend(pants, profile, 'bottom').size, 'M');
  assert.equal(C.recommend(chart(), { measurements: { height: 170 } }).status, 'profile');
});
test('far-outside measurements do not force a size', () => {
  assert.equal(C.recommend(chart(), { measurements: { chest: 160, waist: 150 } }, 'top').status, 'outside');
});
test('overlapping ranges expose ambiguity', () => {
  const ambiguous = C.parseMatrix([['Size', 'Chest'], ['M', '90–98'], ['L', '94–102']], { context: 'Body measurements cm' });
  const r = C.recommend(ambiguous, profile, 'top'); assert.equal(r.size, 'M / L'); assert.equal(r.confidence, 'Check the fit');
});
test('single reference values do not pretend to be fit ranges', () => {
  const single = C.parseMatrix([['Size', 'Chest', 'Waist'], ['M', '94', '78']], { context: 'Body measurements cm' });
  assert.equal(C.recommend(single, profile, 'top').confidence, 'Check the fit');
});
test('a missing cell cannot improve the score by omitting an important measurement', () => {
  const incomplete = C.parseMatrix([['Size', 'Chest', 'Waist'], ['S', '94', ''], ['M', '94', '78']], { context: 'Body measurements cm' });
  assert.equal(C.recommend(incomplete, profile, 'top').size, 'M');
});
test('pasted charts handle delimiters and reject unstructured text', () => {
  for (const separator of ['|', '\t', ',']) {
    const pasted = C.parseText(matrix.map(row => row.join(separator)).join('\n'), { unit: 'cm', kind: 'body' });
    assert.equal(C.recommend(pasted, profile, 'top').size, 'M');
  }
  assert.equal(C.parseText('My size is usually medium'), null);
});
test('validates measurements and classifies garments', () => {
  assert.deepEqual(C.validateProfile(profile), []);
  assert.ok(C.validateProfile({ measurements: { chest: NaN } }).includes('chest'));
  assert.ok(C.validateProfile({ measurements: { waist: 500 } }).includes('waist'));
  assert.equal(C.categoryFor('Cotton Shirt'), 'top'); assert.equal(C.categoryFor('Wide Leg Trousers'), 'bottom'); assert.equal(C.categoryFor('Midi Dress'), 'full');
});
