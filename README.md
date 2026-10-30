# Niimbot Label Studio

Browser-based label designer with Web Bluetooth printing for Niimbot printers. No build step.

## Run
```
python3 -m http.server 8080     # or: npx serve
```
Open http://localhost:8080 in **Chrome or Edge** (Web Bluetooth needs localhost or https; Safari/Firefox don't support it).

## Features
Text (fonts, system/uploaded fonts), shapes, freehand, 40 built-in symbols, PNG/JPG/SVG upload (drag & drop / paste),
QR codes, barcodes, layers, align/snap, undo/redo, live 1-bit print preview (threshold/dither),
save to browser library, project .json files, PNG export.

## Printer notes
Printing uses [niimbluelib](https://github.com/MultiMote/niimbluelib) (MIT, vendored in `vendor/`). On connect it
detects the model and adopts its dpi, print-head width and feed direction, and picks the matching print task.
If the model is unknown, choose a "Print task" manually (B1 / B21_V1 / D110 / D110M_V4 / ...) and check the "Printer log".
