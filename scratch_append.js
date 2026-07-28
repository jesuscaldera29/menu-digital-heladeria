
// ==========================================
// POS REPORTS (CORTE DE CAJA Z) EN ADMIN
// ==========================================
window.chartOriginInstanceAdmin = null;
window.chartPaymentInstanceAdmin = null;
window.currentPOSReportAdmin = null;

window.openPOSReportAdmin = async function() {
  document.getElementById('posReportModalAdmin').classList.remove('hidden');
  document.getElementById('posReportKPIsAdmin').innerHTML = '<div class="col-span-full text-center text-gray-500 animate-pulse font-bold text-sm py-10">Cargando métricas...</div>';
  document.getElementById('posReportChartsAdmin').classList.add('hidden');
  document.getElementById('posReportHistoryContainerAdmin').classList.add('hidden');
  document.getElementById('btnPrintPOSReportAdmin').disabled = true;

  try {
    const filter = document.getElementById('posReportDateFilterAdmin').value;
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (filter === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'yesterday') {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (filter === 'this_week') {
      const day = now.getDay() || 7; 
      startDate.setDate(now.getDate() - day + 1);
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    } else if (filter === 'this_month') {
      startDate.setDate(1);
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    }

    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('id, total, payment_method, split_payments, created_at, status, customer_name, notes, items')
      .eq('business_id', businessId)
      .in('status', ['Pagado', 'Completado', 'En preparación', 'Listo', 'En camino', 'Entregado'])
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: closings, error: closingsErr } = await supabaseClient
      .from('cash_closings')
      .select('opening_amount')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(1);
    
    let openingCash = 0;
    if (!closingsErr && closings && closings.length > 0) {
      openingCash = Number(closings[0].opening_amount) || 0;
    }

    const { data: movements, error: movementsErr } = await supabaseClient
      .from('cash_movements')
      .select('type, amount')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
      
    let cashIn = 0, cashOut = 0;
    if (!movementsErr && movements) {
      movements.forEach(m => {
        const amt = Number(m.amount) || 0;
        if (m.type === 'deposit') cashIn += amt;
        else if (m.type === 'withdrawal') cashOut += amt;
      });
    }

    let totalEfectivo = 0, totalTarjeta = 0, totalTransferencia = 0, totalVendido = 0;
    let originKiosko = 0, originPOS = 0, originMenu = 0;
    let historyHtml = '';
    let productsSold = {};

    orders.forEach(o => {
      const total = Number(o.total) || 0;
      totalVendido += total;

      if (o.payment_method === 'Dividido' && o.split_payments) {
        totalEfectivo += Number(o.split_payments.cash || 0);
        totalTarjeta += Number(o.split_payments.card || 0);
        totalTransferencia += Number(o.split_payments.transfer || 0);
      } else if (o.payment_method === 'Efectivo') {
        totalEfectivo += total;
      } else if (o.payment_method === 'NEQUI') {
        totalTarjeta += total;
      } else if (o.payment_method === 'Transferencia' || o.payment_method === 'Nequi') {
        totalTransferencia += total;
      }

      let originStr = 'Desconocido';
      if (o.notes && o.notes.includes('[ORIGIN:KIOSKO]')) { originKiosko += total; originStr = 'Kiosko'; }
      else if (o.notes && o.notes.includes('[ORIGIN:MENU]')) { originMenu += total; originStr = 'Menú QR'; }
      else if (o.notes && o.notes.includes('[ORIGIN:POS]')) { originPOS += total; originStr = 'Caja (POS)'; }
      else if (o.notes && o.notes.includes('Kiosko Auto-Servicio')) { originKiosko += total; originStr = 'Kiosko'; }
      else { originPOS += total; originStr = 'Caja (POS)'; }

      let orderItems = o.cart || o.items || [];
      if (typeof orderItems === 'string') {
        try { orderItems = JSON.parse(orderItems); } catch(e) { orderItems = []; }
      }
      if (Array.isArray(orderItems)) {
        orderItems.forEach(item => {
          const qty = Number(item.quantity || item.qty) || 1;
          const price = Number(item.price) || 0;
          let name = item.name || 'Desconocido';
          if (item.extrasLabel) name += ` (${item.extrasLabel})`;
          
          if (!productsSold[name]) productsSold[name] = { qty: 0, total: 0 };
          productsSold[name].qty += qty;
          productsSold[name].total += (qty * price);
        });
      }

      const dateStr = new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      historyHtml += `
        <tr class="hover:bg-[#222] transition-colors">
          <td class="px-4 py-3"><span class="block text-white font-bold">#${String(o.id).slice(-4)}</span><span class="text-[10px]">${dateStr}</span></td>
          <td class="px-4 py-3 text-white font-bold truncate max-w-[100px]">${o.customer_name || 'Sin Nombre'}</td>
          <td class="px-4 py-3 text-center"><span class="bg-[#333] text-gray-300 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">${originStr}</span></td>
          <td class="px-4 py-3 text-center text-[10px] uppercase font-bold text-gray-400">${o.payment_method}</td>
          <td class="px-4 py-3 text-right text-green-500 font-black">$${total.toLocaleString()}</td>
          <td class="px-4 py-3 text-center"></td>
        </tr>
      `;
    });

    const ticketPromedio = orders.length > 0 ? (totalVendido / orders.length) : 0;
    const expectedCash = openingCash + totalEfectivo + cashIn - cashOut;

    window.currentPOSReportAdmin = {
      filter, orderCount: orders.length, total: totalVendido, cash: totalEfectivo, card: totalTarjeta,
      transfer: totalTransferencia, originKiosko, originPOS, originMenu, ticketPromedio,
      openingCash, cashIn, cashOut, expectedCash, productsSold
    };

    document.getElementById('posReportKPIsAdmin').innerHTML = `
      <div class="col-span-1 sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-[#1a1a1a] p-5 rounded-2xl border border-[#222] flex flex-col justify-center">
          <div class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Ingresos Totales</div>
          <div class="text-3xl font-black text-green-500">$${totalVendido.toLocaleString()}</div>
        </div>
        <div class="bg-[#1a1a1a] p-5 rounded-2xl border border-[#222] flex flex-col justify-center">
          <div class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total Pedidos</div>
          <div class="text-3xl font-black text-white">${orders.length}</div>
        </div>
        <div class="bg-[#1a1a1a] p-5 rounded-2xl border border-[#222] flex flex-col justify-center">
          <div class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Ticket Promedio</div>
          <div class="text-3xl font-black text-orange-500">$${Math.round(ticketPromedio).toLocaleString()}</div>
        </div>
      </div>
      <div class="col-span-1 sm:col-span-2 lg:col-span-1 bg-[#1a1a1a] p-4 rounded-2xl border border-[#222] flex flex-col justify-between">
        <div class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3 border-b border-[#333] pb-2">Flujo de Efectivo</div>
        <div class="space-y-2 flex-1">
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-400">Apertura</span>
            <span class="font-bold text-orange-500">+$${openingCash.toLocaleString()}</span>
          </div>
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-400">Ventas (Efec)</span>
            <span class="font-bold text-green-500">+$${totalEfectivo.toLocaleString()}</span>
          </div>
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-400">Entradas</span>
            <span class="font-bold text-blue-500">+$${cashIn.toLocaleString()}</span>
          </div>
          <div class="flex justify-between items-center text-sm">
            <span class="text-gray-400">Salidas</span>
            <span class="font-bold text-red-500">-$${cashOut.toLocaleString()}</span>
          </div>
        </div>
        <div class="mt-3 pt-3 border-t border-[#333]">
          <div class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Esperado en Caja</div>
          <div class="text-2xl font-black text-white">$${expectedCash.toLocaleString()}</div>
        </div>
      </div>
    `;
    
    if (orders.length > 0) {
      document.getElementById('posReportHistoryBodyAdmin').innerHTML = historyHtml;
      document.getElementById('posReportHistoryContainerAdmin').classList.remove('hidden');
    } else {
      document.getElementById('posReportHistoryBodyAdmin').innerHTML = `<tr><td colspan="6" class="text-center py-6 text-gray-500 font-bold">No hay pedidos en este periodo.</td></tr>`;
      document.getElementById('posReportHistoryContainerAdmin').classList.remove('hidden');
    }

    document.getElementById('posReportChartsAdmin').classList.remove('hidden');
    
    if (window.chartOriginInstanceAdmin) window.chartOriginInstanceAdmin.destroy();
    const ctxOrigin = document.getElementById('chartOriginAdmin').getContext('2d');
    window.chartOriginInstanceAdmin = new Chart(ctxOrigin, {
      type: 'doughnut',
      data: {
        labels: ['Caja (POS)', 'Kiosko', 'Menú QR'],
        datasets: [{ data: [originPOS, originKiosko, originMenu], backgroundColor: ['#f97316', '#3b82f6', '#10b981'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10, weight: 'bold' } } } }, cutout: '70%' }
    });

    if (window.chartPaymentInstanceAdmin) window.chartPaymentInstanceAdmin.destroy();
    const ctxPayment = document.getElementById('chartPaymentAdmin').getContext('2d');
    window.chartPaymentInstanceAdmin = new Chart(ctxPayment, {
      type: 'doughnut',
      data: {
        labels: ['Efectivo', 'NEQUI', 'Transf.'],
        datasets: [{ data: [totalEfectivo, totalTarjeta, totalTransferencia], backgroundColor: ['#22c55e', '#3b82f6', '#a855f7'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10, weight: 'bold' } } } }, cutout: '70%' }
    });

    document.getElementById('btnPrintPOSReportAdmin').disabled = false;
  } catch (err) {
    console.error('Error loading report:', err);
    document.getElementById('posReportKPIsAdmin').innerHTML = '<div class="col-span-full text-center text-red-500 font-bold text-sm py-4">Error cargando el reporte.</div>';
  }
};

window.closePOSReportAdmin = function() {
  document.getElementById('posReportModalAdmin').classList.add('hidden');
};

window.printPOSReportAdmin = function() {
  if (!window.currentPOSReportAdmin) return;
  const r = window.currentPOSReportAdmin;
  const customHeader = localStorage.getItem('receipt_cash_header') || '';
  const headerHtml = customHeader ? `<div class="text-center mb-2" style="font-size: 12px; white-space: pre-wrap;">${customHeader}</div>` : '';
  const now = new Date().toLocaleString();

  let productsHtml = '';
  const productKeys = Object.keys(r.productsSold);
  if (productKeys.length > 0) {
    productsHtml = `
      <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; margin:8px 0; padding:8px 0;">
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:4px;">PRODUCTOS VENDIDOS</div>
        <table style="width:100%; font-size:14px; text-align:left; border-collapse:collapse;">
          <tr style="border-bottom:1px solid #000;"><th style="padding-bottom:4px;">Prod</th><th style="text-align:center;padding-bottom:4px;">Cant</th><th style="text-align:right;padding-bottom:4px;">Total</th></tr>`;
    
    productKeys.sort((a,b) => r.productsSold[b].qty - r.productsSold[a].qty).forEach(name => {
      const p = r.productsSold[name];
      productsHtml += `<tr><td style="padding:2px 0;">${name}</td><td style="text-align:center;padding:2px 0;">${p.qty}</td><td style="text-align:right;padding:2px 0;">$${p.total.toLocaleString()}</td></tr>`;
    });
    productsHtml += `</table></div>`;
  }

  const html = `
  <html>
    <head>
      <title>Corte de Caja Z</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; margin: 0; padding: 10px; width: 80mm; color: #000; }
        .text-center { text-align: center; }
        .flex { display: flex; justify-content: space-between; margin-bottom:4px; }
        @media print { body { width: 100%; margin:0; padding:0; } }
      </style>
    </head>
    <body>
      <div class="text-center" style="font-size: 20px;">** CORTE DE CAJA Z **</div>
      ${headerHtml}
      <div class="text-center" style="font-size: 14px; margin-bottom: 8px;">Fecha: ${now}</div>
      <div class="text-center" style="font-size: 14px; margin-bottom: 8px;">Periodo: ${r.filter.toUpperCase()}</div>
      
      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div class="flex"><span>Ventas Totales:</span><span>$${r.total.toLocaleString()}</span></div>
        <div class="flex"><span>Ticket Promedio:</span><span>$${Math.round(r.ticketPromedio).toLocaleString()}</span></div>
        <div class="flex"><span>Nº Pedidos:</span><span>${r.orderCount}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div style="text-align:center; font-size: 14px; margin-bottom: 4px;">DESGLOSE POR PAGO</div>
        <div class="flex"><span>Efectivo:</span><span>$${r.cash.toLocaleString()}</span></div>
        <div class="flex"><span>Transferencia:</span><span>$${r.transfer.toLocaleString()}</span></div>
        <div class="flex"><span>Tarjeta (Nequi):</span><span>$${r.card.toLocaleString()}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div style="text-align:center; font-size: 14px; margin-bottom: 4px;">DESGLOSE POR ORIGEN</div>
        <div class="flex"><span>Caja (POS):</span><span>$${r.originPOS.toLocaleString()}</span></div>
        <div class="flex"><span>Kiosko:</span><span>$${r.originKiosko.toLocaleString()}</span></div>
        <div class="flex"><span>Menú QR:</span><span>$${r.originMenu.toLocaleString()}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div style="text-align:center; font-size: 14px; margin-bottom: 4px;">FLUJO DE EFECTIVO</div>
        <div class="flex"><span>Fondo Inicial:</span><span>+$${r.openingCash.toLocaleString()}</span></div>
        <div class="flex"><span>Ventas Efectivo:</span><span>+$${r.cash.toLocaleString()}</span></div>
        <div class="flex"><span>Ingresos Extras:</span><span>+$${r.cashIn.toLocaleString()}</span></div>
        <div class="flex"><span>Salidas/Gastos:</span><span>-$${r.cashOut.toLocaleString()}</span></div>
        <div class="flex" style="margin-top:8px; padding-top:4px; border-top:1px solid #000; font-size:18px;">
          <span>EFECTIVO ESPERADO:</span><span>$${r.expectedCash.toLocaleString()}</span>
        </div>
      </div>
      
      ${productsHtml}

      <div style="text-align:center; margin-top:20px; font-size:12px;">-- FIN DEL REPORTE --</div>
      <script>
        window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 300); }
      </script>
    </body>
  </html>`;
  
  if (typeof bridgePrintRawHtml === 'function') {
    bridgePrintRawHtml(html).then(ok => {
      if(ok) showToast('🖨️ Ticket Z enviado a imprimir');
      else {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
      }
    });
  } else {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
  }
};
