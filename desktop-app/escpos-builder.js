// ===== ESC/POS Command Builder for Thermal Printers =====
const ESC = 0x1B, GS = 0x1D, LF = 0x0A;

class EscPosBuilder {
  constructor(w = 48) { this.w = w; this.buf = []; }
  _p(...b) { this.buf.push(...b); return this; }
  _t(s) { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); this.buf.push(c > 255 ? 63 : c); } return this; }
  init() { return this._p(ESC, 0x40); }
  alignLeft() { return this._p(ESC, 0x61, 0); }
  alignCenter() { return this._p(ESC, 0x61, 1); }
  bold(on) { return this._p(ESC, 0x45, on ? 1 : 0); }
  doubleSize(on) { return this._p(GS, 0x21, on ? 0x11 : 0); }
  doubleHeight(on) { return this._p(GS, 0x21, on ? 0x01 : 0); }
  normalSize() { return this._p(GS, 0x21, 0); }
  text(s) { return this._t(s); }
  textLine(s) { return this._t(s)._p(LF); }
  newline(n = 1) { for (let i = 0; i < n; i++) this._p(LF); return this; }
  separator(c = '-') { return this.textLine(c.repeat(this.w)); }
  doubleSep() { return this.textLine('='.repeat(this.w)); }
  leftRight(l, r) {
    const mx = this.w - r.length - 1;
    if (l.length > mx) {
      // Split into multiple lines if too long
      let remaining = l;
      while (remaining.length > mx) {
        this.textLine(remaining.substring(0, this.w));
        remaining = remaining.substring(this.w);
      }
      if (remaining.length > 0) {
        const sp = Math.max(this.w - remaining.length - r.length, 1);
        this.textLine(remaining + ' '.repeat(sp) + r);
      }
      return this;
    }
    const sp = Math.max(this.w - l.length - r.length, 1);
    return this.textLine(l + ' '.repeat(sp) + r);
  }
  beep(n = 1, d = 3) { return this._p(ESC, 0x42, n, d); }
  cut() { this.newline(3); return this._p(GS, 0x56, 0); }
  image(img) {
    if (!img || !img.bitmap) return this;
    const width = Math.ceil(img.bitmap.width / 8) * 8;
    const height = img.bitmap.height;
    const xL = (width / 8) & 0xFF;
    const xH = ((width / 8) >> 8) & 0xFF;
    const yL = height & 0xFF;
    const yH = (height >> 8) & 0xFF;

    this.alignCenter();
    this._p(GS, 0x76, 0x30, 0);
    this._p(xL, xH, yL, yH);

    const bytes = width / 8;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < bytes; x++) {
        let byte = 0;
        for (let b = 0; b < 8; b++) {
          const pixelX = x * 8 + b;
          if (pixelX < img.bitmap.width) {
            const idx = (img.bitmap.width * y + pixelX) << 2;
            const r = img.bitmap.data[idx + 0];
            const g = img.bitmap.data[idx + 1];
            const b_col = img.bitmap.data[idx + 2];
            const a = img.bitmap.data[idx + 3];
            const luma = (r * 0.299 + g * 0.587 + b_col * 0.114);
            if (luma < 128 && a > 128) {
              byte |= (1 << (7 - b));
            }
          }
        }
        this._p(byte);
      }
    }
    this.newline();
    return this;
  }
  qrCode(url) {
    if (!url) return this;
    const store_len = url.length + 3;
    const pL = store_len & 0xFF;
    const pH = (store_len >> 8) & 0xFF;
    
    this.alignCenter();
    // Model 2
    this._p(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Size (6)
    this._p(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);
    // Error correction (48 = L)
    this._p(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30);
    // Store data
    this._p(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    this._t(url);
    // Print
    this._p(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.newline(2);
    return this;
  }
  build() { return Buffer.from(this.buf); }
}

function san(t) {
  if (!t) return '';
  return String(t)
    .replace(/[├í├á]/g,'a').replace(/[├®├¿]/g,'e').replace(/[├¡├¼]/g,'i').replace(/[├│├▓]/g,'o').replace(/[├║├╣]/g,'u')
    .replace(/[├ü├Ç]/g,'A').replace(/[├ë├ê]/g,'E').replace(/[├ì├î]/g,'I').replace(/[├ô├Æ]/g,'O').replace(/[├Ü├Ö]/g,'U')
    .replace(/├▒/g,'n').replace(/├æ/g,'N').replace(/[^\x20-\x7E]/g,'');
}
function fmt(n) { return '$' + Number(n||0).toLocaleString('es-CO'); }

function buildTicket(d, cfg, logoImage = null) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  b.init().alignCenter();
  if (logoImage) b.image(logoImage);
  
  // Registered Business Name - Bold & Centered
  b.bold(true).doubleHeight(true).textLine(san(d.business_name || 'MI NEGOCIO').toUpperCase()).normalSize().bold(false);
  
  if (d.ticket_data) {
    const td = typeof d.ticket_data === 'string' ? JSON.parse(d.ticket_data) : d.ticket_data;
    if (td.sede) b.textLine('Sede: ' + san(td.sede));
    if (td.direccion) b.textLine(san(td.direccion));
    if (td.telefono) b.textLine('Tel: ' + san(td.telefono));
    if (td.email) b.textLine(san(td.email));
  }
  b.separator('-');
  
  // Date and Order Number (Bold & Clear)
  b.textLine(d.date || new Date().toLocaleString());
  b.bold(true).doubleHeight(true).textLine('ORDEN No. ' + san(d.ticket_id || '0000')).normalSize().bold(false);
  
  let dt = (d.delivery_method || 'LOCAL').toUpperCase();
  if (dt === 'A LA MESA') { const m = d.address ? d.address.replace(/Mesa\s*/i,'').trim() : ''; dt = m ? 'MESA '+m : 'MESA'; }
  b.bold(true).textLine(dt).bold(false);
  b.separator('-');
  
  // Items List
  b.alignLeft();
  if (d.items && Array.isArray(d.items)) {
    d.items.forEach(item => {
      const q = item.qty || item.quantity || 1;
      let mn = item.name, extras = [];
      const mt = item.name.match(/^(.*) \((.*)\)$/);
      if (mt) { mn = mt[1]; extras = mt[2].split(',').map(e => e.trim()); }
      
      b.bold(true).leftRight(san(mn).toUpperCase() + ' x ' + q, fmt(Number(item.price) * q)).bold(false);
      extras.forEach(e => {
        b.leftRight('  - ' + san(e) + ' x ' + q, fmt(0));
      });
    });
  }
  
  b.newline();
  b.alignCenter();
  b.separator('-');
  
  // Pricing breakdown
  b.leftRight('Subtotal', fmt(d.total - (d.delivery_fee || 0) + (d.discount || 0)));
  if (d.delivery_fee > 0) {
    b.leftRight('Domicilio/Envio', fmt(d.delivery_fee));
  }
  if (d.discount > 0) {
    b.leftRight('Descuento', '-' + fmt(d.discount));
  }
  b.bold(true).doubleHeight(true).leftRight('TOTAL A PAGAR', fmt(d.total)).normalSize().bold(false);
  b.separator('-');
  
  // Payment Breakdown
  const paymentMethod = san(d.payment_method || 'Pendiente').toUpperCase();
  b.leftRight('METODO DE PAGO:', paymentMethod);
  b.leftRight('VALOR RECIBIDO:', fmt(d.cash_received || d.total));
  const ch = Number(d.cash_received || 0) - Number(d.total);
  b.bold(true).leftRight('CAMBIO:', fmt(ch > 0 ? ch : 0)).bold(false);
  
  // Kiosk cashier warning
  if (paymentMethod === 'PENDIENTE') {
    b.newline();
    b.alignCenter().bold(true).textLine('*** FAVOR LLEVAR TICKET A CAJA ***').bold(false);
    b.alignCenter().bold(true).textLine('***     PARA PROCESAR PAGO     ***').bold(false);
    b.newline();
  }
  
  b.separator('-');
  b.newline().alignCenter().textLine(san(d.footer || 'Gracias por su compra!')).newline();
  
  if (cfg.beep_on_print) b.beep(2, 3);
  if (cfg.auto_cut) b.cut();
  return b.build();
}

function buildComanda(d, cfg) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  b.init().alignCenter().textLine('Comanda');
  
  if (d.ticket_id) {
    b.textLine('Orden # ' + san(d.ticket_id));
  }
  
  let dt = (d.delivery_method || 'LOCAL').toUpperCase();
  if (dt === 'A LA MESA') { const m = d.address ? d.address.replace(/Mesa\s*/i,'').trim() : ''; dt = m ? 'MESA '+m : 'MESA'; }
  
  b.newline();
  b.doubleSize(true).bold(true).alignCenter().textLine(dt).normalSize().bold(false);
  b.newline();
  
  b.newline();
  b.alignLeft().textLine(d.time || d.date || new Date().toLocaleString());
  
  if (d.items) {
    b.doubleHeight(true);
    d.items.forEach(item => {
      const q = item.qty || item.quantity || 1;
      let mn = item.name, extras = [];
      const mt = item.name.match(/^(.*) \((.*)\)$/);
      if (mt) { mn = mt[1]; extras = mt[2].split(',').map(e => e.trim()); }
      
      b.textLine('* ' + san(mn).toUpperCase() + ' x ' + q);
      extras.forEach(e => b.textLine('  ' + san(e).toUpperCase() + ' x ' + q));
    });
    b.normalSize();
  }
  
  b.newline(2);
  if (cfg.beep_on_print) b.beep(3, 5);
  if (cfg.auto_cut) b.cut();
  return b.build();
}

function buildReport(d, cfg) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  const pm = {today:'Hoy',yesterday:'Ayer',this_week:'Esta Semana',this_month:'Este Mes'};
  b.init().alignCenter().doubleSize(true).textLine(san(d.business_name||'MI NEGOCIO')).normalSize();
  b.bold(true).textLine('CORTE DE CAJA Z').bold(false).newline();
  b.textLine('Fecha: ' + (d.date || new Date().toLocaleString())).doubleSep();
  b.alignLeft();
  b.leftRight('Periodo:', pm[d.filter]||d.filter||'Hoy');
  b.leftRight('Total Pedidos:', String(d.orderCount||0));
  b.leftRight('Ticket Promedio:', fmt(Math.round(Number(d.ticketPromedio||0))));
  b.separator().alignCenter().bold(true).textLine('ORIGEN DE VENTAS').bold(false).alignLeft();
  b.leftRight('Caja (POS):', fmt(d.originPOS||0));
  b.leftRight('Kiosko:', fmt(d.originKiosko||0));
  b.leftRight('Menu QR:', fmt(d.originMenu||0));

  b.separator().alignCenter().bold(true).textLine('PRODUCTOS VENDIDOS').bold(false).alignLeft();
  if (d.productsSold && Object.keys(d.productsSold).length > 0) {
    Object.keys(d.productsSold).forEach(name => {
      const item = d.productsSold[name];
      let displayName = name.length > 20 ? name.substring(0, 20) + '...' : name;
      b.leftRight(item.qty + 'x ' + displayName.toUpperCase(), fmt(item.total));
    });
  } else {
    b.alignCenter().textLine('Sin productos').alignLeft();
  }
  
  b.separator().alignCenter().bold(true).textLine('DESGLOSE DE PAGOS').bold(false).alignLeft();
  b.leftRight('Efectivo:', fmt(d.cash||0));
  b.leftRight('Tarjeta:', fmt(d.card||0));
  b.leftRight('Transferencia:', fmt(d.transfer||0));
  
  b.separator().alignCenter().bold(true).textLine('FLUJO DE EFECTIVO').bold(false).alignLeft();
  b.leftRight('Fondo Apertura:', '+' + fmt(d.openingCash||0));
  b.leftRight('Ventas Efectivo:', '+' + fmt(d.cash||0));
  b.leftRight('Entradas:', '+' + fmt(d.cashIn||0));
  b.leftRight('Salidas:', '-' + fmt(d.cashOut||0));
  
  b.separator().alignCenter().bold(true).textLine('ESPERADO EN CAJA').bold(false).alignLeft();
  b.bold(true).leftRight('TOTAL EFECTIVO:', fmt(d.expectedCash||0)).bold(false);

  b.doubleSep().bold(true).doubleSize(true).alignCenter();
  b.textLine('TOTAL: ' + fmt(d.total||0)).normalSize().bold(false);
  b.newline().alignCenter().textLine('FIN DEL REPORTE').newline();
  if (cfg.auto_cut) b.cut();
  return b.build();
}

module.exports = { EscPosBuilder, buildTicket, buildComanda, buildReport };
