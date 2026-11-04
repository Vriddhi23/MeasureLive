# MeasureLive

A free, local-first Chrome extension that saves your body measurements and compares them with clothing size charts. This is an installable **first version**, not a claim of universal retailer compatibility.

## Install in Chrome — no payment or account required

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select `C:\Vriddhi Work\MeasureLive\extension` (the folder containing `manifest.json`).
5. Open Chrome’s puzzle-piece Extensions menu and pin **MeasureLive**.
6. Click its icon. Add your measurements in centimeters or inches, then click **Save my measurements**.
7. Turn on **Find my size as I shop** and allow website access if you want automatic suggestions. Open or refresh a clothing product page afterward. You can also use **Find my size on this page** without enabling access everywhere.

You do not need Node, Python, an API key, a server, or a subscription to use the installed extension. Those tools are only used to develop and test it. Local installation is free; publishing in the Chrome Web Store is a separate process.

Chrome’s official installation instructions: [Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## What to enter

Use a flexible measuring tape. Store full circumferences, not the width of a shirt laid flat.

| Measurement | How to measure |
| --- | --- |
| Height | Head to floor, barefoot |
| Chest / bust | Around the fullest part, tape level |
| Waist | Around your natural waist |
| Hips | Around the fullest part; especially helpful for bottoms |
| Arm / sleeve length | Shoulder to wrist with arm relaxed |
| Inside leg / inseam | Crotch to ankle along the inner leg |

Chest, waist, or hips is enough to save a profile. A recommendation needs a relevant measurement also present in the store’s chart. You can edit or delete your profile at any time. Sleeve and leg measurement methods vary: always compare with the store’s instructions. This version is intended for adult clothing within the supported input ranges.

## Shopping behavior

- Recognizes clothing product pages using product metadata, product headings, purchase controls and size controls.
- Searches semantic HTML tables, ARIA tables, common CSS size-chart grids, hidden tables, open shadow roots, and accessible same-origin frames.
- Reads charts with sizes in rows or columns, numerical or letter sizes, centimeters or inches, and measurement ranges.
- Watches for dynamically inserted size charts. If a store loads its chart only after you open **Size guide**, open it normally and the extension rescans.
- Can read up to three same-origin HTML guide links whose paths explicitly identify a size guide. It fetches those pages without credentials and with a size/time limit. It does not click store controls, select sizes, or add anything to your cart.
- Shows an in-page assistant with a suggested size, source, comparison, and missing measurements.
- Requires your choice when multiple charts could apply, or when units or body/garment meaning are unclear.
- Offers manual table entry if automatic discovery fails. Paste the actual chart with one row per line and columns separated by tabs, commas, semicolons, or `|`.
- Remains quiet on pages it does not recognize as clothing product pages. A manual scan can still open the assistant there.

**Example:** chest 94 cm and waist 78 cm match M in a body chart where M lists chest 92–98 cm and waist 77–83 cm. This conclusion comes from that chart; it does not assume that M means the same thing at another store.

## Limits to understand

No universal size-chart reader can guarantee a perfect fit. This version does **not** claim verified support for Zara, H&M, Temu, SHEIN, Ralph Lauren, or any other retailer. It uses general page patterns rather than a fixed list of brand-specific locations. The tests use representative local fixtures, not live retailer certification.

- **Image-only charts / PDFs / canvases:** no OCR is included. Read the chart yourself or transcribe it into manual entry.
- **Closed shadow roots and cross-origin embedded widgets:** inaccessible to this reader. Open the guide directly or paste its text.
- **Language:** chart field names and product detection currently use English. Storefronts in other languages may need a manual check.
- **Garment measurements:** a shirt’s dimensions are not your body dimensions. Ease, stretch, cut and preferred fit matter. This version identifies these charts but deliberately does not issue a body-size recommendation from them. Use the retailer’s body size chart.
- **Flat widths:** half-chest, pit-to-pit and similar measurements are excluded from direct body comparison.
- **Unclear context:** a store may include many collections, sizes, unit tabs or measuring methods. Choose the relevant chart and confirm the type/units; the extension does not guess silently.
- **Unusual markup or heavily restricted sites:** may need a future site adapter. Some dynamically switched charts will need **Scan again**.
- **Browser access:** works on ordinary HTTP/HTTPS pages in desktop Chrome. It does not run inside mobile shopping apps, Chrome internal pages, or the Chrome Web Store.
- **Recommendation:** closest chart match, never a guarantee. Out-of-range profiles are shown as no clear fit. Overlapping ranges remain ambiguous.

## Privacy and permissions

Measurements live in `chrome.storage.local` in this Chrome profile. They are not synced to an account or sent to an external service. There are no analytics, ads, affiliate links, remote scripts, or paid model calls. Uninstalling the extension removes its local storage. The **Delete my saved measurements** control removes the profile immediately.

- `storage`: save your profile and automatic-scanning preference.
- `activeTab` and `scripting`: scan the current page after you click the extension.
- Optional HTTP/HTTPS site access: register the automatic page reader when you enable it. Turning automatic scanning off unregisters the reader, removes its panel and revokes broad website access. Already-injected scripts stay inert until the page is refreshed or explicitly scanned again.

Normal requests for linked size-guide HTML may reach the shop’s own server. No body measurements are included in those requests. The on-page assistant displays the recommendation; its comparison details display measurements when expanded. This is local storage, not encrypted vault storage, so someone using your Chrome profile can see your measurements.

Implementation follows Chrome’s documentation for [optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), and [local storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Try the demo

For developers with Node installed:

```sh
npm install
npm run demo
```

Open `http://127.0.0.1:4173` in Chrome with MeasureLive installed. Save chest **94 cm**, waist **78 cm**, and optionally height **170 cm**, hips **98 cm**, sleeve **60 cm**, inseam **79 cm**. The example body chart suggests **M**. The demo has eight chart scenarios, including a chart that appears after opening a dialog, multiple collections, linked guides and unreadable-chart fallbacks. It is a fictional store and cannot make purchases.

## Development and checks

The extension itself is plain JavaScript, HTML and CSS with no build step or runtime dependencies.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run package
```

The browser test uses an isolated browser profile, saves a profile, and verifies automatic scanning and the fallback flows. On this Windows machine the downloaded browser could not start, so the checks use installed Chrome with its extension-testing interface:

```sh
npm run test:browser -- --installed-chrome --pregrant-hosts
node tests/manual-browser.cjs
```

The `--pregrant-hosts` option creates a copy inside `test-results/` with website access pregranted for the headless tests. It does **not** change the installable extension. Chrome’s native optional-permission dialog itself is not covered by those tests. The separate manual-scan test loads the original manifest and checks `activeTab` access without permission to all sites. Test screenshots and results go in `test-results/`; the installable ZIP goes in `dist/`. These are not shipped inside the extension.

- `extension/core.js`: table parsing, measurement validation and size matching.
- `extension/extractor.js`: chart and product discovery.
- `extension/content.js`: dynamic rescans and the on-page assistant.
- `extension/background.js`: optional automatic registration and manual injection.
- `extension/popup.*`: measurement profile and controls.
- `demo/`: representative fictional shopping pages.
- `tests/`: parser, DOM extraction and browser integration checks.

For broader compatibility, the next useful work is to collect failing product URLs, then add focused extraction adapters with fixtures. Image OCR and garment-fit modeling are separate features and require their own accuracy evaluation.
