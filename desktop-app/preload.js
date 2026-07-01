// ===== PRELOAD BRIDGE — Impresion TCP directa desde Electron =====
// Este archivo conecta el WebView (POS/Kiosk) con Node.js para imprimir
// directamente a la impresora térmica vía TCP, sin necesitar PrintBridge.exe
//
// Patron identico al APK de Android:
//   Android: WebView -> @JavascriptInterface("AndroidPrint") -> Socket TCP
//   Electron: WebView -> contextBridge("DesktopPrint") -> net.Socket TCP

const { contextBridge, ipcRenderer } = require('electron');
const net = require('net');
const path = require('path');
const fs = require('fs');

// ===== LOAD ESC/POS BUILDER =====
const { EscPosBuilder, buildTicket, buildComanda, buildReport } = require('./escpos-builder');

// ===== CONFIG PERSISTENCE =====
// Cada PC guarda su propia configuracion en su carpeta de usuario
// Asi dos PCs con el mismo programa pueden tener impresoras diferentes
function getConfigPath() {
  // In packaged app, use userData. In dev, use current dir.
  const userDataPath = ipcRenderer.sendSync('get-user-data-path');
  return path.join(userDataPath, 'printer-config.json');
}

let printerConfig = {
  printer_ip: '192.168.20.30',
  printer_port: 9100,
  paper_width: 48,
  auto_cut: true,
  beep_on_print: true
};

function loadConfig() {
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      printerConfig = { ...printerConfig, ...data };
      console.log('[DesktopPrint] Config cargada:', printerConfig.printer_ip + ':' + printerConfig.printer_port);
    } else {
      console.log('[DesktopPrint] Sin config local, usando defaults:', printerConfig.printer_ip);
    }
  } catch (e) {
    console.error('[DesktopPrint] Error cargando config:', e.message);
  }
}

function saveConfig() {
  try {
    const cfgPath = getConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(printerConfig, null, 2));
    console.log('[DesktopPrint] Config guardada en:', cfgPath);
  } catch (e) {
    console.error('[DesktopPrint] Error guardando config:', e.message);
  }
}

// Load config on startup
loadConfig();

// ===== TCP PRINT FUNCTION =====
// Identica a sendToPrinter() en print-server/server.js
function sendToPrinter(data, targetIp, targetPort) {
  const ip = targetIp || printerConfig.printer_ip;
  const port = targetPort || printerConfig.printer_port;

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout: No se pudo conectar a la impresora en ' + ip + ':' + port));
    }, 5000);

    client.connect(port, ip, () => {
      clearTimeout(timeout);
      client.write(Buffer.from(data), () => {
        client.end();
        resolve('OK');
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error('Error impresora (' + ip + '): ' + err.message));
    });
  });
}

// ===== EXPOSE TO WEBVIEW =====
// El frontend detectara window.DesktopPrint exactamente como detecta window.AndroidPrint
contextBridge.exposeInMainWorld('DesktopPrint', {

  // Imprimir ticket de venta (recibo para cliente)
  printTicket: async (jsonStr) => {
    try {
      const d = JSON.parse(jsonStr);
      console.log('[DesktopPrint] Imprimiendo ticket para:', d.customer_name || 'Cliente');

      // Build ESC/POS bytes (sin logo por ahora, logo requiere Jimp que es pesado)
      const data = buildTicket(d, printerConfig);

      // Determinar IP destino (puede venir del payload si hay multiples impresoras)
      const targetIp = d.target_ip || null;
      const targetPort = d.target_port || null;

      const result = await sendToPrinter(data, targetIp, targetPort);
      console.log('[DesktopPrint] Ticket OK');
      return result;
    } catch (e) {
      console.error('[DesktopPrint] Error ticket:', e.message);
      return 'ERROR: ' + e.message;
    }
  },

  // Imprimir comanda (orden para cocina, sin precios)
  printComanda: async (jsonStr) => {
    try {
      const d = JSON.parse(jsonStr);
      console.log('[DesktopPrint] Imprimiendo comanda para:', d.customer_name || 'Cliente');

      const data = buildComanda(d, printerConfig);
      const targetIp = d.target_ip || null;
      const targetPort = d.target_port || null;

      const result = await sendToPrinter(data, targetIp, targetPort);
      console.log('[DesktopPrint] Comanda OK');
      return result;
    } catch (e) {
      console.error('[DesktopPrint] Error comanda:', e.message);
      return 'ERROR: ' + e.message;
    }
  },

  // Imprimir reporte / corte de caja
  printReport: async (jsonStr) => {
    try {
      const d = JSON.parse(jsonStr);
      console.log('[DesktopPrint] Imprimiendo reporte...');

      const data = buildReport(d, printerConfig);
      const result = await sendToPrinter(data);
      console.log('[DesktopPrint] Reporte OK');
      return result;
    } catch (e) {
      console.error('[DesktopPrint] Error reporte:', e.message);
      return 'ERROR: ' + e.message;
    }
  },

  // Prueba de impresion
  testPrint: async () => {
    try {
      console.log('[DesktopPrint] Enviando prueba...');
      const b = new EscPosBuilder(printerConfig.paper_width || 48);
      b.init().alignCenter().doubleSize(true).textLine('** MENU DIGITAL PRO **').normalSize().newline();
      b.textLine('Impresion integrada OK!').newline();
      b.textLine('IP: ' + printerConfig.printer_ip);
      b.textLine('Puerto: ' + printerConfig.printer_port);
      b.newline().textLine(new Date().toLocaleString()).newline();
      b.separator().textLine('Todo funciona correctamente').newline();
      if (printerConfig.beep_on_print) b.beep(1, 2);
      if (printerConfig.auto_cut) b.cut();
      const result = await sendToPrinter(b.build());
      console.log('[DesktopPrint] Test OK');
      return result;
    } catch (e) {
      console.error('[DesktopPrint] Error test:', e.message);
      return 'ERROR: ' + e.message;
    }
  },

  // Configurar IP y puerto de la impresora (se guarda en disco por PC)
  setConfig: (ip, port, paperWidth) => {
    if (ip) printerConfig.printer_ip = ip;
    if (port) printerConfig.printer_port = parseInt(port) || 9100;
    if (paperWidth) printerConfig.paper_width = parseInt(paperWidth) || 48;
    saveConfig();
    return JSON.stringify(printerConfig);
  },

  // Obtener config actual
  getConfig: () => {
    return JSON.stringify(printerConfig);
  },

  // Flag para que el frontend sepa que esta en modo desktop
  isDesktop: true
});

// Inyectar flag global para deteccion facil
contextBridge.exposeInMainWorld('__DESKTOP_APP__', true);

console.log('[DesktopPrint] Bridge inicializado. Impresora:', printerConfig.printer_ip + ':' + printerConfig.printer_port);
