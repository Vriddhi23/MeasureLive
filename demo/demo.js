const slot = document.getElementById('chart-slot'), dialog = document.getElementById('size-dialog');
const bodyChart = '<section><h3>Body measurements · cm</h3><table><caption>Everyday shirts · body measurements (cm)</caption><tr><th>Size</th><th>Chest</th><th>Waist</th></tr><tr><td>S</td><td>86–91</td><td>70–76</td></tr><tr><td>M</td><td>92–98</td><td>77–83</td></tr><tr><td>L</td><td>99–105</td><td>84–90</td></tr><tr><td>XL</td><td>106–112</td><td>91–98</td></tr></table></section>';
function changeScenario() {
  slot.innerHTML = ''; document.getElementById('dialog-content').innerHTML = ''; document.getElementById('guide-link').hidden = true;
  switch (document.getElementById('scenario').value) {
    case 'visible': slot.innerHTML = bodyChart; break;
    case 'horizontal': slot.innerHTML = '<section><h3>Body measurements (inches)</h3><table><tr><th>Size</th><th>S</th><th>M</th><th>L</th></tr><tr><th>Chest</th><td>34–36</td><td>36.5–38.5</td><td>39–41</td></tr><tr><th>Waist</th><td>28–30</td><td>30.5–32.5</td><td>33–35</td></tr></table></section>'; break;
    case 'garment': slot.innerHTML = bodyChart.replaceAll('body measurements', 'garment measurements').replace('Body measurements', 'Garment measurements'); break;
    case 'unknown': slot.innerHTML = bodyChart.replaceAll('Body measurements · cm', 'Size guide').replaceAll('body measurements (cm)', 'size chart'); break;
    case 'multiple': slot.innerHTML = bodyChart + bodyChart.replaceAll('Everyday shirts', 'Other collection').replaceAll('92–98', '100–106'); break;
    case 'linked': document.getElementById('guide-link').hidden = false; break;
    case 'image': slot.innerHTML = '<div class="image-fallback">Example: a store uses an image instead of a text table.<br>MeasureLive should explain that it cannot read this chart.</div>'; break;
  }
}
document.getElementById('scenario').addEventListener('change', changeScenario);
document.getElementById('guide-trigger').addEventListener('click', () => { document.getElementById('dialog-content').innerHTML = bodyChart; dialog.showModal(); });
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
changeScenario();
