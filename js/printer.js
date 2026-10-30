// Thin wrapper around niimbluelib (vendor/niimbluelib.min.js, global `niimbluelib`).
const SERVICES = ['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'];
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join(' ');

export const TASKS = ['B1', 'B21_V1', 'B21_L2B', 'D110', 'D110M_V4', 'D11_V1', 'H1S'];

export class Printer {
  constructor(log = () => {}) {
    this.log = log;
    this.client = new niimbluelib.NiimbotBluetoothClient();
    this.client.setServiceUuidFilter(SERVICES);
    this.onDisconnect = () => {};
    this.onProgress = () => {};
    this.device = null;
    const c = this.client;
    c.on('rawpacketsent', (e) => log('→ ' + hex(e.data), true));
    c.on('rawpacketreceived', (e) => log('← ' + hex(e.data), true));
    c.on('disconnect', () => { log('Disconnected'); this.onDisconnect(); });
    c.on('printprogress', (e) => this.onProgress(Math.max(e.pagePrintProgress, 0) / 100));
  }

  get connected() { return this.client.isConnected(); }
  get name() { return this.device?.name || ''; }

  /** Must be called from a user gesture. Returns model info. */
  async connect() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available. Use Chrome/Edge on https or localhost.');
    // Request both known GATT services up front, otherwise Chrome hides the one we need.
    this.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    const res = await this.client.connect({ authorizedDevice: this.device });
    const info = this.client.getPrinterInfo();
    const meta = this.client.getModelMetadata();
    const task = this.client.getPrintTaskType();
    this.log(`Connected: ${this.device.name} | modelId=${info.modelId} model=${meta?.model} protocol=v${info.protocolVersion} task=${task} result=${res.result}`);
    if (meta) this.log(`Model: ${meta.dpi} dpi, head ${meta.printheadPixels}px, direction ${meta.printDirection}, density ${meta.densityMin}-${meta.densityMax}`);
    return { info, meta, task };
  }

  disconnect() { return this.client.disconnect(); }

  /** @param canvas pure black/white canvas, oriented like the visual label */
  async print(canvas, { density, labelType, copies, direction, taskName }) {
    const name = taskName && taskName !== 'auto' ? taskName : this.client.getPrintTaskType();
    if (!name) throw new Error('Unknown printer model: choose a "Print task" manually in the Printer panel (see log for modelId).');
    this.log(`Print task: ${name}, direction ${direction}, density ${density}, labelType ${labelType}, copies ${copies}`);
    const L = niimbluelib;
    const encoded = L.ImageEncoder.encodeCanvas(canvas, L.PageColorType?.SingleColor ?? 0, direction);
    const task = this.client.protocol.newPrintTask(name, { totalPages: copies, density, labelType, statusPollIntervalMs: 200, statusTimeoutMs: 15000 });
    try {
      await task.printInit();
      await task.printPage(encoded, copies);
      await task.waitForFinished();
    } finally {
      await task.printEnd();
    }
  }
}
