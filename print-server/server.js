// ===== PrintBridge Server — Impresion Directa por IP/LAN =====
const express = require('express');
const cors = require('cors');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Jimp = require('jimp');
const { buildTicket, buildComanda, buildReport } = require('./escpos-builder');
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load config
let config;
try {
  const cfgPath = path.join(path.dirname(process.execPath || __dirname), 'config.json');
  if (fs.existsSync(cfgPath)) {
    config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } else {
    const fallback = path.join(__dirname, 'config.json');
    config = JSON.parse(fs.readFileSync(fallback, 'utf8'));
  }
} catch (e) {
  config = { printer_ip: '192.168.20.30', printer_port: 9100, server_port: 9100, paper_width: 48, auto_cut: true, beep_on_print: true };
}

const app = express();
app.use(cors({
  origin: '*',
  methods: 'GET,POST,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization'
}));

// Chrome Private Network Access (PNA) bypass
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});

app.use(express.json({ limit: '1mb' }));

// ===== SEND RAW BYTES TO PRINTER VIA TCP =====
function sendToPrinter(data, targetIp = null, targetPort = null) {
  const ip = targetIp || config.printer_ip;
  const port = targetPort || config.printer_port;

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout: No se pudo conectar a la impresora en ' + ip));
    }, 5000);

    client.connect(port, ip, () => {
      clearTimeout(timeout);
      client.write(data, () => {
        client.end();
        resolve({ success: true, message: 'Impreso correctamente en ' + ip });
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error('Error de impresora (' + ip + '): ' + err.message));
    });
  });
}

// ===== GET LOCAL IPs =====
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

// ===== ROUTES =====

// Health check / Status
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    printer: config.printer_ip + ':' + config.printer_port,
    server_ips: getLocalIPs(),
    timestamp: new Date().toISOString()
  });
});

// Update config
app.post('/config', (req, res) => {
  try {
    const { printer_ip, printer_port, paper_width, auto_cut, beep_on_print } = req.body;
    if (printer_ip) config.printer_ip = printer_ip;
    if (printer_port) config.printer_port = printer_port;
    if (paper_width) config.paper_width = paper_width;
    if (auto_cut !== undefined) config.auto_cut = auto_cut;
    if (beep_on_print !== undefined) config.beep_on_print = beep_on_print;

    // Save to disk
    try {
      const cfgPath = path.join(path.dirname(process.execPath || __dirname), 'config.json');
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
    } catch (e) {
      // If we can't write (packaged exe), just keep in memory
    }

    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Print Ticket (receipt for customer)
app.post('/print/ticket', async (req, res) => {
  try {
    const targetIp = req.body.target_ip || null;
    const targetPort = req.body.target_port || null;
    const printerInfo = targetIp ? `(${targetIp})` : '(default)';
    console.log(`[TICKET] Imprimiendo ticket para:`, req.body.customer_name || 'Cliente', printerInfo);
    let logoImage = null;
    if (req.body.logo_url) {
      try {
        logoImage = await Jimp.read(req.body.logo_url);
        // Resize to max 384px width for 58mm or keep original if smaller. 384px is full width.
        logoImage.resize(384, Jimp.AUTO);
        // Process image to ensure sharp edges for thermal printing
        logoImage.greyscale().contrast(0.5);
      } catch (e) {
        console.error('[TICKET] No se pudo cargar el logo:', e.message);
      }
    }

    const data = buildTicket(req.body, config, logoImage);
    const result = await sendToPrinter(data, targetIp, targetPort);
    console.log('[TICKET] OK');
    res.json(result);
  } catch (err) {
    console.error('[TICKET] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Print Comanda (kitchen order - no prices)
app.post('/print/comanda', async (req, res) => {
  try {
    const targetIp = req.body.target_ip || null;
    const targetPort = req.body.target_port || null;
    const printerInfo = targetIp ? `(${targetIp})` : '(default)';
    console.log(`[COMANDA] Imprimiendo comanda para:`, req.body.customer_name || 'Cliente', printerInfo);
    const data = buildComanda(req.body, config);
    const result = await sendToPrinter(data, targetIp, targetPort);
    console.log('[COMANDA] OK');
    res.json(result);
  } catch (err) {
    console.error('[COMANDA] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Print Report (cash register Z report)
app.post('/print/report', async (req, res) => {
  try {
    const targetIp = req.body.target_ip || null;
    const targetPort = req.body.target_port || null;
    const printerInfo = targetIp ? `(${targetIp})` : '(default)';
    console.log('[REPORT] Imprimiendo corte de caja', printerInfo);
    const data = buildReport(req.body, config);
    const result = await sendToPrinter(data, targetIp, targetPort);
    console.log('[REPORT] OK');
    res.json(result);
  } catch (err) {
    console.error('[REPORT] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Test print
app.post('/print/test', async (req, res) => {
  try {
    console.log('[TEST] Enviando prueba a impresora...');
    const { EscPosBuilder } = require('./escpos-builder');
    const b = new EscPosBuilder(config.paper_width || 48);
    b.init().alignCenter().doubleSize(true).textLine('** PRINTBRIDGE **').normalSize().newline();
    b.textLine('Prueba de impresion exitosa!').newline();
    b.textLine('IP: ' + config.printer_ip).textLine('Puerto: ' + config.printer_port);
    b.newline().textLine(new Date().toLocaleString()).newline();
    b.separator().textLine('Todo funciona correctamente').newline();
    if (config.beep_on_print) b.beep(1, 2);
    if (config.auto_cut) b.cut();
    const result = await sendToPrinter(b.build());
    console.log('[TEST] OK');
    res.json(result);
  } catch (err) {
    console.error('[TEST] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== START SERVER =====
const PORT = config.server_port || 9100;
app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('');
  console.log('=============================================');
  console.log('  PrintBridge v1.0.0 - Servidor de Impresion');
  console.log('=============================================');
  console.log('');
  console.log('  Impresora: ' + config.printer_ip + ':' + config.printer_port);
  console.log('  Servidor escuchando en:');
  ips.forEach(ip => console.log('    -> http://' + ip.address + ':' + PORT));
  console.log('    -> http://localhost:' + PORT);
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /status        - Estado del servidor');
  console.log('    POST /print/ticket  - Imprimir ticket');
  console.log('    POST /print/comanda - Imprimir comanda');
  console.log('    POST /print/report  - Imprimir corte de caja');
  console.log('    POST /print/test    - Prueba de impresion');
  console.log('    POST /config        - Actualizar config');
  console.log('');
  console.log('  NO CIERRE ESTA VENTANA');
  console.log('=============================================');

  // Supabase Realtime listener
  if (config.supabase_url && config.supabase_key && config.auto_print_kiosk_orders) {
    const supabase = createClient(config.supabase_url, config.supabase_key);
    console.log('  [Supabase Realtime] Activado - Escuchando ordenes del Kiosko');
    console.log('=============================================');
    
    supabase
      .channel('kiosk-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        const order = payload.new;
        
        // Check if it's from Kiosk
        if (order && order.notes && order.notes.includes('[ORIGIN:KIOSKO]') && order.status === 'Pendiente') {
          console.log(`\n[Supabase Realtime] Nueva orden de Kiosko detectada: #${order.id}`);
          
          try {
            const { data: settings } = await supabase
              .from('settings')
              .select('*')
              .eq('business_id', order.business_id)
              .single();
              
            if (!settings) {
              console.error('[Supabase Realtime] No se encontraron settings para el negocio');
              return;
            }
            
            let targetIp = null;
            let targetPort = null;
            if (settings.printers && Array.isArray(settings.printers)) {
              const receiptPrinter = settings.printers.find(p => p.printReceipts === true || p.printReceipts === 'true');
              if (receiptPrinter) {
                targetIp = receiptPrinter.ip;
                targetPort = parseInt(receiptPrinter.port) || 9100;
              }
            }

            let logoImage = null;
            if (settings.logo_url) {
              try {
                logoImage = await Jimp.read(settings.logo_url);
                logoImage.resize(384, Jimp.AUTO).greyscale().contrast(0.5);
              } catch (e) {
                console.error('[Supabase Realtime] Error cargando logo:', e.message);
              }
            }
            
            const printPayload = {
               logo_url: settings.logo_url,
               business_name: settings.business_name || 'MI NEGOCIO',
               ticket_id: String(order.id).includes('MESA-') ? String(order.id).toUpperCase() : String(order.id).split('-')[0],
               ticket_data: settings.ticket_data || null,
               date: new Date(order.created_at).toLocaleString(),
               customer_name: order.customer_name || 'Mostrador',
               customer_phone: order.customer_phone || 'N/A',
               address: order.address || 'N/A',
               delivery_method: order.delivery_method || order.delivery_type || 'Local',
               payment_method: order.payment_method || 'Pendiente',
               items: order.items || [],
               total: order.total || 0,
               discount: order.discount || 0,
               delivery_fee: order.delivery_fee || 0,
               tip: order.tip || 0,
               cash_received: order.total || 0,
               footer: 'Gracias por su compra!'
            };
            
            const data = buildTicket(printPayload, config, logoImage);
            await sendToPrinter(data, targetIp, targetPort);
            console.log('[Supabase Realtime] Orden de Kiosko impresa correctamente!');
            
            // Also print comanda? Usually kiosk needs ticket. But wait, if they need comanda we could print it.
            // Let's print Comanda as well if configured!
            let comandaTargetIp = null;
            let comandaTargetPort = null;
            if (settings.printers && Array.isArray(settings.printers)) {
              const comandaPrinter = settings.printers.find(p => p.printOrders === true || p.printOrders === 'true');
              if (comandaPrinter) {
                comandaTargetIp = comandaPrinter.ip;
                comandaTargetPort = parseInt(comandaPrinter.port) || 9100;
              }
            }
            if (comandaTargetIp) {
              console.log(`[Supabase Realtime] Imprimiendo comanda de Kiosko a ${comandaTargetIp}...`);
              const comandaPayload = {
                ticket_id: printPayload.ticket_id,
                time: new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                customer_name: printPayload.customer_name,
                customer_phone: printPayload.customer_phone,
                delivery_method: printPayload.delivery_method,
                address: printPayload.address,
                items: printPayload.items,
                delivery_fee: printPayload.delivery_fee,
              };
              const comandaData = buildComanda(comandaPayload, config);
              await sendToPrinter(comandaData, comandaTargetIp, comandaTargetPort);
            }
          } catch (err) {
            console.error('[Supabase Realtime] Error imprimiendo orden de kiosko:', err.message);
          }
        }
      })
      .subscribe();
  }
});
