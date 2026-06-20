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
  build() { return Buffer.from(this.buf); }
}

function san(t) {
  if (!t) return '';
  return String(t)
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u')
    .replace(/[ÁÀ]/g,'A').replace(/[ÉÈ]/g,'E').replace(/[ÍÌ]/g,'I').replace(/[ÓÒ]/g,'O').replace(/[ÚÙ]/g,'U')
    .replace(/ñ/g,'n').replace(/Ñ/g,'N').replace(/[^\x20-\x7E]/g,'');
}
function fmt(n) { return '$' + Number(n||0).toLocaleString('es-CO'); }

function buildTicket(d, cfg, logoImage = null) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  b.init().alignCenter();
  if (logoImage) b.image(logoImage);
  b.textLine(san(d.business_name || 'MI NEGOCIO'));
  if (d.ticket_data) {
    const td = typeof d.ticket_data === 'string' ? JSON.parse(d.ticket_data) : d.ticket_data;
    if (td.sede) b.textLine('Sede: ' + san(td.sede));
    if (td.direccion) b.textLine(san(td.direccion));
    if (td.telefono) b.textLine('Tel: ' + san(td.telefono));
    if (td.email) b.textLine(san(td.email));
  }
  b.separator('-');
  b.textLine(d.date || new Date().toLocaleString());
  b.textLine('No. ' + san(d.ticket_id || '0000'));
  
  let dt = (d.delivery_method || 'LOCAL').toUpperCase();
  if (dt === 'A LA MESA') { const m = d.address ? d.address.replace(/Mesa\s*/i,'').trim() : ''; dt = m ? 'MESA '+m : 'MESA'; }
  b.textLine(dt);
  b.separator('-');
  
  b.alignLeft();
  if (d.items && Array.isArray(d.items)) {
    d.items.forEach(item => {
      const q = item.qty || item.quantity || 1;
      let mn = item.name, extras = [];
      const mt = item.name.match(/^(.*) \((.*)\)$/);
      if (mt) { mn = mt[1]; extras = mt[2].split(',').map(e => e.trim()); }
      
      b.doubleHeight(true).leftRight(san(mn).toUpperCase() + ' x ' + q, fmt(Number(item.price) * q));
      extras.forEach(e => {
        b.leftRight('- ' + san(e) + ' x ' + q, fmt(0));
      });
      b.normalSize();
    });
  }
  
  b.newline();
  b.alignCenter();
  b.leftRight('              Subtotal', '');
  b.leftRight('              Total venta', fmt(d.total));
  b.leftRight('', fmt(d.total));
  b.separator('-');
  
  const paymentMethod = san(d.payment_method || 'Efectivo');
  b.leftRight('Tipo de pago   ' + paymentMethod + '   Valor', fmt(d.cash_received || d.total));
  const ch = Number(d.cash_received || 0) - Number(d.total);
  b.leftRight('                          Cambio', fmt(ch > 0 ? ch : 0));
  
  b.separator('-');
  b.newline().alignCenter().textLine(san(d.footer || 'Gracias por su compra!')).newline();
  if (cfg.beep_on_print) b.beep(2, 3);
  if (cfg.auto_cut) b.cut();
  return b.build();
}

function buildComanda(d, cfg) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  b.init().alignCenter().textLine('Comanda');
  if (d.ticket_id && d.ticket_id !== 'MESA') {
    b.textLine('Orden # ' + san(d.ticket_id));
  }
  let dt = (d.delivery_method || 'LOCAL').toUpperCase();
  if (dt === 'A LA MESA') { const m = d.address ? d.address.replace(/Mesa\s*/i,'').trim() : ''; dt = m ? 'MESA '+m : 'MESA'; }
  b.doubleSize(true).textLine(dt).normalSize();
  
  b.newline();
  b.alignLeft().textLine(d.time || d.date || new Date().toLocaleString());
  b.newline();
  
  if (d.items) {
    d.items.forEach(item => {
      const q = item.qty || item.quantity || 1;
      let mn = item.name, extras = [];
      const mt = item.name.match(/^(.*) \((.*)\)$/);
      if (mt) { mn = mt[1]; extras = mt[2].split(',').map(e => e.trim()); }
      
      b.doubleHeight(true).textLine('* ' + san(mn).toUpperCase() + ' x ' + q);
      extras.forEach(e => b.textLine('  ' + san(e).toUpperCase() + ' x ' + q));
      b.normalSize();
    });
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
  b.separator().alignCenter().bold(true).textLine('DESGLOSE DE PAGOS').bold(false).alignLeft();
  b.leftRight('Efectivo:', fmt(d.cash||0));
  b.leftRight('Tarjeta:', fmt(d.card||0));
  b.leftRight('Transferencia:', fmt(d.transfer||0));
  b.doubleSep().bold(true).doubleSize(true).alignCenter();
  b.textLine('TOTAL: ' + fmt(d.total||0)).normalSize().bold(false);
  b.newline().alignCenter().textLine('FIN DEL REPORTE').newline();
  if (cfg.auto_cut) b.cut();
  return b.build();
}

module.exports = { EscPosBuilder, buildTicket, buildComanda, buildReport };
