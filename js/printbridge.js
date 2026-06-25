// ===== PRINTBRIDGE CLIENT — Modulo de impresion directa por red =====
// Este archivo se incluye en pos.html y kiosk.html
// Conecta con el servidor PrintBridge corriendo en la PC del local

// Default: tries localhost first, then falls back to configured IP
let PRINTBRIDGE_URL = localStorage.getItem('printbridge_url') || '';

// Auto-detect PrintBridge on common addresses
async function detectPrintBridge() {
  const candidates = [
    PRINTBRIDGE_URL,
    'http://localhost:9101',
    'http://127.0.0.1:9101',
    // Try common LAN IPs
    'http://192.168.1.1:9101',
    'http://192.168.0.1:9101',
    'http://192.168.20.10:9101',
    'http://10.228.201.155:9101' // IP del cliente agregada
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

// Send print job to PrintBridge
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
      signal: AbortSignal.timeout(5000)
    });

    if (resp.ok) {
      const result = await resp.json();
      console.log('[PrintBridge] Impreso:', result.message);
      return true;
    } else {
      const err = await resp.json().catch(() => ({}));
      console.error('[PrintBridge] Error:', err.error || 'Unknown');
      return false;
    }
  } catch (e) {
    console.error('[PrintBridge] Sin conexion:', e.message);
    PRINTBRIDGE_URL = ''; // Reset so it re-detects next time
    return false;
  }
}

// === HIGH-LEVEL PRINT FUNCTIONS ===

// Print a ticket/receipt via PrintBridge
async function bridgePrintTicket(order, settings) {
  let target_ip = null;
  let target_port = null;
  
  if (settings && settings.printers && Array.isArray(settings.printers)) {
    const receiptPrinter = settings.printers.find(p => p.printReceipts === true || p.printReceipts === 'true');
    if (receiptPrinter) {
      target_ip = receiptPrinter.ip;
      target_port = parseInt(receiptPrinter.port) || 9100;
    }
  }

  const data = {
    logo_url: settings?.logo_url || null,
    business_name: settings?.business_name || 'MI NEGOCIO',
    ticket_id: String(order.id).includes('MESA-') ? String(order.id).toUpperCase() : String(order.id).split('-')[0],
    ticket_data: settings?.ticket_data || null,
    date: new Date().toLocaleString(),
    customer_name: order.customer_name || 'Mostrador',
    customer_phone: order.customer_phone || 'N/A',
    address: order.address || 'N/A',
    delivery_method: order.delivery_method || order.delivery_type || 'Local',
    payment_method: order.payment_method || 'Efectivo',
    items: order.items || [],
    total: order.total || 0,
    discount: order.discount || 0,
    delivery_fee: order.delivery_fee || 0,
    tip: order.tip || 0,
    cash_received: order.split_payments?.cash_received || 0,
    footer: localStorage.getItem('receipt_cash_footer') || 'Gracias por su compra!',
    target_ip: target_ip,
    target_port: target_port
  };
  return await printViaBridge('/print/ticket', data);
}

// Print a comanda (kitchen order) via PrintBridge
async function bridgePrintComanda(order, settings) {
  let target_ip = null;
  let target_port = null;
  
  if (settings && settings.printers && Array.isArray(settings.printers)) {
    const comandaPrinter = settings.printers.find(p => p.printOrders === true || p.printOrders === 'true');
    if (comandaPrinter) {
      target_ip = comandaPrinter.ip;
      target_port = parseInt(comandaPrinter.port) || 9100;
    }
  }

  const data = {
    ticket_id: String(order.id).includes('MESA-') ? String(order.id).toUpperCase() : String(order.id).split('-')[0].toUpperCase(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    customer_name: order.customer_name || 'Mostrador',
    customer_phone: order.customer_phone || 'N/A',
    delivery_method: order.delivery_method || order.delivery_type || 'Local',
    address: order.address || '',
    items: order.items || [],
    delivery_fee: order.delivery_fee || 0,
    target_ip: target_ip,
    target_port: target_port
  };
  return await printViaBridge('/print/comanda', data);
}

// Print a report via PrintBridge
async function bridgePrintReport(reportData, settings) {
  const data = {
    business_name: settings?.business_name || settings?.name || 'MI NEGOCIO',
    date: new Date().toLocaleString(),
    ...reportData
  };
  return await printViaBridge('/print/report', data);
}

// Test print
async function bridgeTestPrint() {
  return await printViaBridge('/print/test', {});
}

// Configure PrintBridge URL manually
function setPrintBridgeURL(url) {
  PRINTBRIDGE_URL = url;
  localStorage.setItem('printbridge_url', url);
}

// Auto-detect on page load
detectPrintBridge();
