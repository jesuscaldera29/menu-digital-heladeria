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
    const tl = l.length > mx ? l.substring(0, mx) : l;
    const sp = Math.max(this.w - tl.length - r.length, 1);
    return this.textLine(tl + ' '.repeat(sp) + r);
  }
  beep(n = 1, d = 3) { return this._p(ESC, 0x42, n, d); }
  cut() { this.newline(3); return this._p(GS, 0x56, 0); }
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

function buildTicket(d, cfg) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  b.init().alignCenter().doubleSize(true).textLine(san(d.business_name || 'MI NEGOCIO')).normalSize().newline();
  if (d.ticket_data) {
    const td = typeof d.ticket_data === 'string' ? JSON.parse(d.ticket_data) : d.ticket_data;
    if (td.nit) b.textLine('NIT: ' + td.nit);
    if (td.sede) b.textLine('Sede: ' + td.sede);
    if (td.direccion) b.textLine(td.direccion);
    if (td.telefono) b.textLine('Tel: ' + td.telefono);
    if (td.email) b.textLine(td.email);
  }
  b.newline().bold(true).textLine('TICKET DE VENTA').textLine('#' + san(d.ticket_id || '0000')).bold(false).doubleSep();
  b.alignLeft();
  b.textLine('Fecha: ' + (d.date || new Date().toLocaleString()));
  b.textLine('Cliente: ' + san(d.customer_name || 'Mostrador'));
  if (d.customer_phone && d.customer_phone !== 'N/A') b.textLine('Tel: ' + d.customer_phone);
  if (d.address && d.address !== 'N/A') b.textLine('Dir: ' + san(d.address));
  b.textLine('Tipo: ' + san(d.delivery_method || 'Local'));
  b.textLine('Pago: ' + san(d.payment_method || 'Efectivo'));
  b.separator();
  b.bold(true).leftRight('CANT DESCRIPCION', 'TOTAL').bold(false).separator();
  if (d.items && Array.isArray(d.items)) {
    d.items.forEach(item => {
      const q = item.qty || item.quantity || 1;
      b.leftRight(q + 'x ' + san(item.name), fmt(Number(item.price) * q));
    });
  }
  b.separator();
  if (d.discount > 0) b.leftRight('Descuento:', '-' + fmt(d.discount));
  if (d.delivery_fee > 0) b.leftRight('Domicilio:', '+' + fmt(d.delivery_fee));
  if (d.tip > 0) b.leftRight('Propina:', '+' + fmt(d.tip));
  if (d.cash_received > 0) {
    b.leftRight('Efectivo:', fmt(d.cash_received));
    const ch = Number(d.cash_received) - Number(d.total);
    if (ch > 0) b.leftRight('Cambio:', fmt(ch));
  }
  b.doubleSep().bold(true).doubleSize(true).alignCenter();
  b.textLine('TOTAL: ' + fmt(d.total)).normalSize().bold(false);
  b.newline().alignCenter().textLine(san(d.footer || 'Gracias por su compra!')).newline();
  if (cfg.beep_on_print) b.beep(2, 3);
  if (cfg.auto_cut) b.cut();
  return b.build();
}

function buildComanda(d, cfg) {
  const b = new EscPosBuilder(cfg.paper_width || 48);
  b.init().alignCenter().doubleSize(true).textLine('** COMANDA **').normalSize().newline();
  b.doubleSize(true).textLine('PEDIDO #' + san(d.ticket_id || '0000')).normalSize().newline();
  if (d.customer_phone && d.customer_phone !== 'N/A') { b.bold(true).textLine(d.customer_phone).bold(false); }
  b.bold(true).textLine(d.time || new Date().toLocaleTimeString('es-CO', {hour:'2-digit',minute:'2-digit'}));
  let dt = (d.delivery_method || 'LOCAL').toUpperCase();
  if (dt === 'A LA MESA') { const m = d.address ? d.address.replace(/Mesa\s*/i,'').trim() : ''; dt = m ? 'MESA #'+m : 'MESA'; }
  b.doubleSize(true).textLine(dt).normalSize();
  b.textLine('Cliente: ' + san(d.customer_name || 'Mostrador')).bold(false).doubleSep();
  b.alignLeft();
  if (d.items) {
    d.items.forEach(item => {
      const q = item.qty || item.quantity || 1;
      let mn = item.name, extras = [];
      const mt = item.name.match(/^(.*) \((.*)\)$/);
      if (mt) { mn = mt[1]; extras = mt[2].split(',').map(e => e.trim()); }
      b.bold(true).doubleHeight(true).textLine(q + 'x ' + san(mn).toUpperCase()).normalSize().bold(false);
      extras.forEach(e => b.textLine('   + ' + san(e)));
    });
  }
  b.doubleSep();
  if (d.delivery_fee > 0 && dt === 'DOMICILIO') { b.alignCenter().bold(true).textLine('+ DOMICILIO: ' + fmt(d.delivery_fee)).bold(false); }
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
