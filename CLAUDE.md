# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Niimbot Label Studio: a browser-based label designer that prints to Niimbot printers over Web Bluetooth. It is a static site with **no build step, no bundler, no tests and no linter**. Deployment is a GitHub Pages workflow (`.github/workflows/static.yml`) that publishes the repo root on push to `main`.

## Run

```
npm start        # python3 -m http.server 8080
```

Open http://localhost:8080 in Chrome or Edge. Web Bluetooth needs localhost or https, and Safari/Firefox don't support it. Printing can only be checked with a real printer. Design, preview and export work in any browser.

## Architecture

`index.html` loads the vendored libraries as classic scripts, which define globals (`fabric`, `JsBarcode`, `QRCode`, `niimbluelib`). It then loads `js/app.js` as an ES module. Don't add npm dependencies. Third-party code is copied into `vendor/` and fonts are bundled in `fonts/` (Lora).

- `js/app.js` (about 1100 lines) is the whole UI and editor. It is organised in banner-commented sections: settings, canvas, history, object adders (`ADDERS`), QR and barcode builders, tools, fonts, property panel (`syncPanel`), layers, clipboard, drag & drop, and the save library and projects. It is built on a **fabric.js** canvas.
- `js/printer.js` is a thin wrapper over the vendored **niimbluelib**. It handles connecting, reading model metadata, and building and running the print task.
- `js/bitmap.js` converts a canvas to a packed 1-bit bitmap using a threshold or Floyd–Steinberg dithering.
- `js/symbols.js` holds the built-in 24×24 stroke icon library as inner-SVG strings.

### Print pipeline (spans app.js, bitmap.js and printer.js)

1. The fabric canvas works in **label dots**. `S.dpi` converts mm to px (`mm2px`), and `renderDesign(scale)` re-renders the design at an arbitrary scale.
2. `finalCanvas()` produces the canvas as it will physically print. It applies the user's rotation (`S.orient`), then trims up to 3 mm of overhang when the label is wider than the print head (for example a 50 mm label on a 48 mm head).
3. `updatePreview()` runs `canvasToBitmap` on the result to show the 1-bit preview, and warns when the label is wider than the head. `S.direction` (`top` or `left`) decides which canvas dimension runs across the head (`acrossHead`).
4. `Printer.print()` hands the canvas to niimbluelib's `ImageEncoder` and a print task. The task name is auto-detected from the printer model, or taken from the manual "Print task" setting (`TASKS` in printer.js).

### State and persistence

- `S` holds the settings. It is the `DEFAULTS` object merged with `localStorage` key `niimbot.settings`, and `saveSettings()` writes it back. Always use the `store` helper for storage, because it swallows storage errors.
- Undo and redo store fabric JSON snapshots (`hist`). `afterChange()` pushes history and autosaves to `niimbot.autosave`.
- Project files, the browser library and autosave all use the `projectJSON()` and `loadCore()` format. Custom per-object metadata lives in `o.data` (for example `data.kind` is `qr`, `barcode`, `symbol`, `svg` or `drawing`). Fabric only serializes it because the keys are listed in `PROPS`. If you add a custom object property, add it to `PROPS` too.
- `kindOf(o)` returns the logical object type used by the property panel and layers (`data.kind` or the fabric type).
