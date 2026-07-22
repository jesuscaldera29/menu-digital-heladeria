// ===== PRINTBRIDGE CLIENT — Modulo de impresion directa por red =====
// Este archivo se incluye en pos.html y kiosk.html
//
// PRIORIDAD DE IMPRESION:
//   1. window.DesktopPrint  (Electron .exe con TCP integrado)
//   2. window.AndroidPrint  (APK Android con TCP integrado)
//   3. HTTP PrintBridge     (Servidor externo para navegadores)
//   4. Fallback navegador   (window.print() dialog)

// Default: tries localhost first, then falls back to configured IP
let PRINTBRIDGE_URL = localStorage.getItem('printbridge_url') || '';

// ===== DESKTOP PRINT (Electron Native TCP) =====
// Si estamos dentro del .exe de Electron, window.DesktopPrint existe
// y podemos imprimir directamente sin servidor externo
function isDesktopApp() {
  return typeof window.DesktopPrint !== 'undefined';
}

// Auto-detect PrintBridge on common addresses (solo para navegadores, no para Desktop/Android)
async function detectPrintBridge() {
  // Si estamos en Electron o Android, no necesitamos buscar PrintBridge HTTP
  if (isDesktopApp() || window.AndroidPrint) {
    console.log('[PrintBridge] Modo nativo detectado (' + (isDesktopApp() ? 'Desktop' : 'Android') + '). No se necesita servidor HTTP.');
    return true;
  }

  const candidates = [
    PRINTBRIDGE_URL,
    'http://localhost:9100',
    'http://localhost:9101',
    'http://127.0.0.1:9100',
    'http://127.0.0.1:9101',
    // Try common LAN IPs
    'http://192.168.1.1:9100',
    'http://192.168.0.1:9100',
    'http://192.168.20.10:9100',
    'http://192.168.20.10:9101'
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const resp = await fetch(url + '/status', { signal: AbortSignal.timeout(1500) });
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'online') {
          PRINTBRIDGE_URL = url;
          localStorage.setItem('printbridge_url', url);
          console.log('[PrintBridge] Conectado a:', url);
          return true;
        }
      }
    } catch (e) {
      // Try next
    }
  }
  console.log('[PrintBridge] No detectado. Se usara impresion del navegador.');
  return false;
}

// Check if PrintBridge is available
async function isPrintBridgeOnline() {
  if (isDesktopApp()) return true; // Desktop siempre tiene impresion disponible
  if (window.AndroidPrint) return true; // Android PrintBridge siempre disponible
  if (!PRINTBRIDGE_URL) return false;
  try {
    const resp = await fetch(PRINTBRIDGE_URL + '/status', { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      return data.status === 'online';
    }
  } catch (e) {
    return false;
  }
  return false;
}

// Send print job to PrintBridge HTTP (solo para navegadores)
async function printViaBridge(endpoint, data) {
  if (!PRINTBRIDGE_URL) {
    const found = await detectPrintBridge();
    if (!found) return false;
  }

  try {
    const resp = await fetch(PRINTBRIDGE_URL + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000)
    });

    if (resp.ok) {
      try {
        const text = await resp.text();
        console.log('[PrintBridge] Respuesta:', text);
      } catch (err) {
        console.log('[PrintBridge] Impreso (respuesta no legible)');
      }
      return true;
    } else {
      console.error('[PrintBridge] Error HTTP:', resp.status);
      return false;
    }
  } catch (e) {
    console.error('[PrintBridge] Fetch fail:', e.message);
    // Do not reset URL on a single failure, it might be a CORS or timeout issue but printed successfully
    return false;
  }
}

// === HIGH-LEVEL PRINT FUNCTIONS ===

// Build the standard ticket data payload (shared between Desktop and HTTP modes)
function _buildTicketPayload(order, settings) {
  let validPrinters = [];
  
  if (settings && settings.printers && Array.isArray(settings.printers)) {
    validPrinters = settings.printers.filter(p => p.printReceipts === true || p.printReceipts === 'true');
  }

  const payload = {
    logo_url: settings?.logo_url || null,
    business_name: settings?.business_name || 'MI NEGOCIO',
    ticket_id: String(order.id).includes('MESA-') ? String(order.id).toUpperCase() : String(order.id).split('-')[0],
    ticket_data: settings?.ticket_data || null,
    date: new Date().toLocaleString(),
    customer_name: order.customer_name || 'Mostrador',
    customer_phone: order.customer_phone || 'N/A',
    address: order.address || 'N/A',
    delivery_method: ((order.delivery_method || order.delivery_type || 'Local') + (order.address && (order.delivery_method === 'A la mesa' || order.delivery_type === 'A la mesa') ? ' ' + String(order.address).replace('Mesa ', '#') : '') + ' - ' + (order.customer_name && order.customer_name !== 'VENTA RAPIDA' ? order.customer_name : 'Mostrador')).toUpperCase(),
    payment_method: order.payment_method || 'Efectivo',
    items: order.items || [],
    total: order.total || 0,
    discount: order.discount || 0,
    delivery_fee: order.delivery_fee || 0,
    tip: order.tip || 0,
    cash_received: order.split_payments?.cash_received || 0,
    footer: localStorage.getItem('receipt_cash_footer') || 'Gracias por su compra!'
  };

  return { payload, validPrinters };
}

// Build the standard comanda data payload
function _buildComandaPayload(order, settings) {
  let validPrinters = [];
  
  if (settings && settings.printers && Array.isArray(settings.printers)) {
    validPrinters = settings.printers.filter(p => p.printOrders === true || p.printOrders === 'true');
  }

  const payload = {
    ticket_id: String(order.id).includes('MESA-') ? String(order.id).toUpperCase() : String(order.id).split('-')[0].toUpperCase(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    customer_name: order.customer_name || 'Mostrador',
    customer_phone: order.customer_phone || 'N/A',
    delivery_method: ((order.delivery_method || order.delivery_type || 'Local') + (order.address && (order.delivery_method === 'A la mesa' || order.delivery_type === 'A la mesa') ? ' ' + String(order.address).replace('Mesa ', '#') : '') + ' - ' + (order.customer_name && order.customer_name !== 'VENTA RAPIDA' ? order.customer_name : 'Mostrador')).toUpperCase(),
    address: order.address || '',
    items: order.items || [],
    delivery_fee: order.delivery_fee || 0
  };

  return { payload, validPrinters };
}

// Print a ticket/receipt
async function bridgePrintTicket(order, settings) {
  const { payload, validPrinters } = _buildTicketPayload(order, settings);
  
  // Create an array with at least one null target if no printers are set (fallback to local config)
  const targets = validPrinters.length > 0 ? validPrinters : [{ ip: null, port: null }];
  
  let printedCount = 0;

  for (const printer of targets) {
    payload.target_ip = printer.ip;
    payload.target_port = parseInt(printer.port) || 9100;

    // 1. Electron Desktop (TCP nativo integrado)
    if (isDesktopApp()) {
      try {
        const result = await window.DesktopPrint.printTicket(JSON.stringify(payload));
        if (result === 'OK' || result === true || (result && result.success)) printedCount++;
        else console.warn('[DesktopPrint] Error con IP:', printer.ip, result);
      } catch (e) {
        console.error('[DesktopPrint] Excepción:', e);
      }
    } else if (window.AndroidPrint) {
      // 1.5. Android APK PrintBridge
      try {
        const androidPayload = { ...payload };
        delete androidPayload.tip;
        delete androidPayload.cash_received;
        delete androidPayload.target_ip;
        delete androidPayload.target_port;
        
        const result = window.AndroidPrint.printTicket(JSON.stringify(androidPayload));
        console.log('[AndroidPrint] Ticket Result:', result);
        // Siempre consideramos éxito en Android para evitar que salte el diálogo del navegador
        printedCount++;
      } catch (e) {
        console.error('[AndroidPrint] Excepción:', e);
        // Aún con excepción, incrementamos para evitar el diálogo del navegador
        printedCount++;
      }
    } else {
      // 2. HTTP PrintBridge (navegadores)
      const success = await printViaBridge('/print/ticket', payload);
      if (success) printedCount++;
      else console.warn('[PrintBridge] Error con IP:', printer.ip);
    }
  }
  
  return printedCount > 0;
}

// Print a comanda (kitchen order)
async function bridgePrintComanda(order, settings) {
  const { payload, validPrinters } = _buildComandaPayload(order, settings);

  const targets = validPrinters.length > 0 ? validPrinters : [{ ip: null, port: null }];
  
  let printedCount = 0;

  for (const printer of targets) {
    payload.target_ip = printer.ip;
    payload.target_port = parseInt(printer.port) || 9100;

    // 1. Electron Desktop (TCP nativo integrado)
    if (isDesktopApp()) {
      try {
        const result = await window.DesktopPrint.printComanda(JSON.stringify(payload));
        if (result === 'OK' || result === true || (result && result.success)) printedCount++;
        else console.warn('[DesktopPrint] Error con IP:', printer.ip, result);
      } catch (e) {
        console.error('[DesktopPrint] Excepción:', e);
      }
    } else if (window.AndroidPrint) {
      // 1.5. Android APK PrintBridge
      try {
        const androidPayload = { ...payload };
        delete androidPayload.target_ip;
        delete androidPayload.target_port;
        const result = window.AndroidPrint.printComanda(JSON.stringify(androidPayload));
        console.log('[AndroidPrint] Comanda Result:', result);
        // Siempre consideramos éxito en Android para evitar que salte el diálogo del navegador
        printedCount++;
      } catch (e) {
        console.error('[AndroidPrint] Excepción:', e);
        printedCount++;
      }
    } else {
      // 2. HTTP PrintBridge (navegadores)
      const success = await printViaBridge('/print/comanda', payload);
      if (success) printedCount++;
      else console.warn('[PrintBridge] Error con IP:', printer.ip);
    }
  }

  return printedCount > 0;
}

// Print a report via PrintBridge
async function bridgePrintReport(reportData, settings) {
  const data = {
    business_name: settings?.business_name || settings?.name || 'MI NEGOCIO',
    date: new Date().toLocaleString(),
    ...reportData
  };

  // 1. Electron Desktop
  if (isDesktopApp()) {
    try {
      const result = await window.DesktopPrint.printReport(JSON.stringify(data));
      return result === 'OK' || result === true || (result && result.success);
    } catch (e) {
      console.error('[DesktopPrint] Error reporte:', e);
      return false;
    }
  }

  // 1.5 Android APK
  if (window.AndroidPrint) {
    if (window.AndroidPrint.printReport) {
      try {
        const result = window.AndroidPrint.printReport(JSON.stringify(data));
        console.log('[AndroidPrint] Report Result:', result);
        return true; // Siempre evitar fallback a navegador
      } catch (e) {
        console.error('[AndroidPrint] Error reporte:', e);
        return true;
      }
    } else {
      // La app de Android vieja NO TIENE printReport. Retornamos true para EVITAR el diálogo molesto del navegador
      // El reporte simplemente no se imprimirá en Android hasta que se actualice el APK.
      console.warn('[AndroidPrint] printReport no existe en esta version de la app. Actualiza el APK.');
      return true; 
    }
  }

  // 2. HTTP PrintBridge
  return await printViaBridge('/print/report', data);
}

// Test print
async function bridgeTestPrint() {
  // 1. Electron Desktop
  if (isDesktopApp()) {
    try {
      const result = await window.DesktopPrint.testPrint();
      return result === 'OK' || result === true || (result && result.success);
    } catch (e) {
      console.error('[DesktopPrint] Error test:', e);
      return false;
    }
  }

  // 1.5 Android APK
  if (window.AndroidPrint) {
    try {
      const result = window.AndroidPrint.testPrint();
      return result === 'OK' || result === true || (result && result.success);
    } catch (e) {
      console.error('[AndroidPrint] Error test:', e);
      return false;
    }
  }

  // 2. HTTP PrintBridge
  return await printViaBridge('/print/test', {});
}

// Configure PrintBridge URL manually (only for HTTP mode)
function setPrintBridgeURL(url) {
  PRINTBRIDGE_URL = url;
  localStorage.setItem('printbridge_url', url);
}

// ===== DESKTOP PRINTER CONFIG (via prompt, similar to Android 5-clicks) =====
// Esta funcion se llama desde el menu de configuracion (5 clicks en logo)
function configureDesktopPrinter() {
  if (!isDesktopApp()) return false;
  
  try {
    const current = JSON.parse(window.DesktopPrint.getConfig());
    const option = prompt(
      "⚙️ Configuración de Impresora (Desktop):\n" +
      "1 = Cambiar IP impresora (actual: " + current.printer_ip + ":" + current.printer_port + ")\n" +
      "2 = Prueba de impresión\n" +
      "3 = Cancelar",
      "1"
    );

    if (option === '1') {
      const newIP = prompt("IP de la impresora térmica:", current.printer_ip);
      if (newIP) {
        const newPort = prompt("Puerto (normalmente 9100):", String(current.printer_port));
        window.DesktopPrint.setConfig(newIP, parseInt(newPort) || 9100);
        alert("✅ Impresora configurada: " + newIP + ":" + (newPort || 9100) + "\n\nEsta configuración se guarda en este PC.\nOtro PC con el mismo programa puede tener otra IP.");
        // Auto test print
        window.DesktopPrint.testPrint().then(result => {
          alert(result === 'OK' ? '✅ Impresión de prueba exitosa!' : '❌ Error: ' + result);
        });
      }
    } else if (option === '2') {
      window.DesktopPrint.testPrint().then(result => {
        alert(result === 'OK' ? '✅ Impresión de prueba exitosa!' : '❌ Error: ' + result);
      });
    }
    return true;
  } catch (e) {
    alert('Error: ' + e.message);
    return false;
  }
}

// Auto-detect on page load
detectPrintBridge();
