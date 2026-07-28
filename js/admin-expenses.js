// ===== GASTOS Y CIERRE DE CAJA =====
let allExpenses = [];
let cashClosingData = null;

async function loadExpenses() {
  if (!businessId) return;
  const filter = document.getElementById('expenseTimeFilter')?.value || 'month';
  let query = supabaseClient.from('expenses').select('*').eq('business_id', businessId).order('date', { ascending: false });
  const now = new Date();
  if (filter === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    query = query.gte('date', start);
  } else if (filter === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    query = query.gte('date', d.toISOString().split('T')[0]);
  }
  try {
    const { data, error } = await query;
    if (error) throw error;
    allExpenses = data || [];
    renderExpenses();
    if (typeof renderExpenseCards === 'function') renderExpenseCards();
    if (typeof loadCashMovements === 'function') loadCashMovements();
  } catch (err) { showToast('Error cargando gastos: ' + err.message, 'error'); }
}

function renderExpenses() {
  const tbody = document.getElementById('expensesList');
  if (!tbody) return;
  const monthTotal = allExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const el = document.getElementById('expensesMonthTotal');
  if (el) el.textContent = '$' + monthTotal.toLocaleString();
  if (!allExpenses.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-10 text-gray-400">No hay gastos registrados</td></tr>'; return; }
  tbody.innerHTML = allExpenses.map(e => `<tr>
    <td class="text-sm">${new Date(e.date).toLocaleDateString()}</td>
    <td><span class="bg-gray-100 px-2 py-1 rounded-full text-xs font-bold">${e.category}</span></td>
    <td class="text-sm">${e.description || '-'}</td>
    <td class="font-black text-red-600">$${Number(e.amount).toLocaleString()}</td>
    <td><button onclick="deleteExpense('${e.id}')" class="text-red-500 hover:text-red-700 font-bold text-sm">🗑️</button></td>
  </tr>`).join('');
}

async function addExpense(event) {
  const cat = document.getElementById('expenseCategory').value;
  const desc = document.getElementById('expenseDescription').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const date = document.getElementById('expenseDate').value || new Date().toISOString().split('T')[0];
  if (!amount || amount <= 0) return showToast('⚠️ Ingresa un monto válido', 'error');
  const btn = event.target; btn.disabled = true; btn.innerText = '⏳...';
  try {
    const { error } = await supabaseClient.from('expenses').insert([{ business_id: businessId, category: cat, description: desc, amount, date }]);
    if (error) throw error;
    
    // Si hay caja abierta, registrarlo como retiro (gasto) en la caja para que afecte el cuadre
    if (activeCashSession) {
      await supabaseClient.from('cash_movements').insert([{
        business_id: businessId,
        cash_closing_id: activeCashSession.id,
        type: 'withdrawal',
        amount: amount,
        reason: `Gasto Admin: ${cat} - ${desc}`,
        created_by_name: 'Admin'
      }]);
    }
    
    showToast('✅ Gasto registrado');
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expenseAmount').value = '';
    loadExpenses();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.innerText = '➕ Registrar Gasto'; }
}

async function deleteExpense(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  try {
    const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
    if (error) throw error;
    showToast('🗑️ Gasto eliminado'); loadExpenses();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

let activeCashSession = null;

async function startCashClosing() {
  document.getElementById('cashClosingModal').style.display = 'flex';
  document.getElementById('declaredCashAmount').value = '';
  document.getElementById('cashClosingNotes').value = '';
}

function openCashOpeningModal() {
  document.getElementById('cashOpeningModal').style.display = 'flex';
  document.getElementById('openingAmount').value = '0';
}

async function confirmCashOpening() {
  const openingAmount = parseFloat(document.getElementById('openingAmount').value) || 0;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabaseClient.from('cash_closings').insert([{
      business_id: businessId,
      date: today, // Can be updated on close
      opened_at: new Date().toISOString(),
      opening_amount: openingAmount,
      is_open: true,
      expected_total: 0,
      declared_total: 0,
      difference: 0,
      cash_sales: 0,
      transfer_sales: 0,
      card_sales: 0,
      total_expenses: 0,
      total_orders: 0
    }]).select().single();

    if (error) throw error;
    
    showToast('✅ Caja abierta correctamente con base de $' + openingAmount.toLocaleString());
    document.getElementById('cashOpeningModal').style.display = 'none';
    loadCashClosings();
  } catch (err) {
    showToast('❌ Error al abrir caja: ' + err.message, 'error');
  }
}

async function submitCashClosing() {
  if (!activeCashSession) return showToast('⚠️ No hay caja abierta', 'error');

  const declared = parseFloat(document.getElementById('declaredCashAmount').value);
  if (!declared && declared !== 0) return showToast('⚠️ Ingresa el monto', 'error');
  const notes = document.getElementById('cashClosingNotes').value.trim();
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch orders since opening
    const openedAt = activeCashSession.opened_at || new Date(new Date().setHours(0,0,0,0)).toISOString();
    
    const { data: sessionOrders } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', openedAt)
      .neq('status', 'Cancelado');
      
    const orders = sessionOrders || [];
    let cash = 0, transfer = 0, card = 0;
    orders.forEach(o => {
      const t = Number(o.total);
      if (o.payment_method === 'Dividido' && o.split_payments) {
        cash += Number(o.split_payments.cash || 0);
        transfer += Number(o.split_payments.transfer || 0);
        card += Number(o.split_payments.card || 0);
      } else if (o.payment_method === 'Efectivo') cash += t;
      else if (o.payment_method === 'Transferencia' || o.payment_method === 'Nequi') transfer += t;
      else card += t;
    });
    
    // Fetch expenses since opening (just for the record)
    const { data: sessionExpenses } = await supabaseClient
      .from('expenses')
      .select('amount')
      .eq('business_id', businessId)
      .gte('created_at', openedAt);
      
    const totalExp = (sessionExpenses || []).reduce((s, e) => s + Number(e.amount), 0);

    // Fetch cash movements
    const { data: moves } = await supabaseClient
      .from('cash_movements')
      .select('amount, type')
      .eq('business_id', businessId)
      .gte('created_at', openedAt);

    let totalDeposits = 0, totalWithdrawals = 0;
    if (moves) {
      moves.forEach(m => {
        if (m.type === 'deposit') totalDeposits += Number(m.amount);
        else totalWithdrawals += Number(m.amount);
      });
    }
    
    // Calculate expected (opening + cash sales + deposits - withdrawals)
    const expectedCash = Number(activeCashSession.opening_amount || 0) + cash + totalDeposits - totalWithdrawals;
    const diff = declared - expectedCash;
    
    const { data: updateData, error } = await supabaseClient.from('cash_closings')
      .update({
        date: today,
        expected_total: expectedCash,
        declared_total: declared,
        difference: diff,
        cash_sales: cash,
        transfer_sales: transfer,
        card_sales: card,
        total_expenses: totalWithdrawals,
        total_orders: orders.length,
        notes: notes,
        is_open: false
      })
      .eq('id', activeCashSession.id)
      .select();
      
    if (error) throw error;
    if (!updateData || updateData.length === 0) {
        alert('⚠️ ERROR DE PERMISOS (RLS) EN SUPABASE\n\nNo se pudo cerrar la caja porque falta la política de UPDATE en Supabase.\n\nVe a Supabase -> SQL Editor y ejecuta:\n\nCREATE POLICY "Enable update for users" ON "public"."cash_closings" FOR UPDATE USING (true);');
        throw new Error('Fallo al cerrar caja por falta de permisos RLS en Supabase.');
    }
    
    // Lanza limpieza de cajas fantasmas que hayan quedado abiertas por error en el pasado
    try {
      await supabaseClient.from('cash_closings')
        .update({ is_open: false })
        .eq('business_id', businessId)
        .eq('is_open', true);
    } catch (e) {
      console.warn('Error al limpiar cajas fantasma', e);
    }
    
    document.getElementById('cashClosingModal').style.display = 'none';
    const color = diff >= 0 ? 'green' : 'red';
    const resultDiv = document.getElementById('cashClosingResult');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<div class="bg-${color}-50 border border-${color}-200 p-6 rounded-2xl">
      <h3 class="text-xl font-black mb-4">📊 Resultado del Cierre</h3>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div><span class="text-gray-500">Base Apertura:</span> <strong>$${Number(activeCashSession.opening_amount || 0).toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Gastos/Retiros:</span> <strong class="text-red-500">-$${totalWithdrawals.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Ingresos Extras:</span> <strong class="text-green-500">+$${totalDeposits.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Ventas Efectivo:</span> <strong>$${cash.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Otras Ventas (Trans/Tarj):</span> <strong>$${(transfer + card).toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Esperado en Efectivo:</span> <strong class="text-blue-600">$${expectedCash.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Declarado:</span> <strong>$${declared.toLocaleString()}</strong></div>
        <div class="col-span-2 text-center mt-2"><span class="text-lg font-black ${diff >= 0 ? 'text-green-600' : 'text-red-600'}">Diferencia: ${diff >= 0 ? '+' : ''}$${diff.toLocaleString()}</span></div>
      </div></div>`;
      
    showToast('✅ Cierre de caja completado');
    activeCashSession = null;
    loadCashClosings();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function loadCashClosings() {
  try {
    const { data } = await supabaseClient
      .from('cash_closings')
      .select('*')
      .eq('business_id', businessId)
      .order('opened_at', { ascending: false })
      .limit(20);
      
    const tbody = document.getElementById('cashClosingsList');
    if (!tbody) return;
    
    // Determine active session
    activeCashSession = data?.find(c => c.is_open === true) || null;
    
    const btnOpenCash = document.getElementById('btnOpenCash');
    const btnCloseCash = document.getElementById('btnCloseCash');
    
    if (activeCashSession) {
      if(btnOpenCash) btnOpenCash.classList.add('hidden');
      if(btnCloseCash) btnCloseCash.classList.remove('hidden');
    } else {
      if(btnOpenCash) btnOpenCash.classList.remove('hidden');
      if(btnCloseCash) btnCloseCash.classList.add('hidden');
    }
    
    // Sync new UI buttons
    if (typeof updateCajaMainButtons === 'function') updateCajaMainButtons();
    
    if (!data?.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-gray-400">Sin sesiones de caja registradas</td></tr>'; return; }
    
    tbody.innerHTML = data.map(c => {
      const diffColor = c.difference >= 0 ? 'text-green-600' : 'text-red-600';
      const statusBadge = c.is_open 
        ? '<span class="bg-green-100 text-green-800 text-[10px] px-2 py-1 rounded-full font-bold">ABIERTA</span>'
        : '<span class="bg-gray-100 text-gray-800 text-[10px] px-2 py-1 rounded-full font-bold">CERRADA</span>';
        
      return `<tr>
        <td class="text-sm">${c.opened_at ? new Date(c.opened_at).toLocaleString() : '-'}</td>
        <td class="font-bold">$${Number(c.opening_amount || 0).toLocaleString()}</td>
        <td class="text-sm">${c.is_open ? '-' : new Date(c.date).toLocaleDateString()}</td>
        <td class="font-bold">${c.is_open ? '-' : '$' + Number(c.expected_total).toLocaleString()}</td>
        <td class="font-bold">${c.is_open ? '-' : '$' + Number(c.declared_total).toLocaleString()}</td>
        <td class="font-black ${diffColor}">${c.is_open ? '-' : (c.difference >= 0 ? '+' : '') + '$' + Number(c.difference).toLocaleString()}</td>
        <td class="text-center">${statusBadge}</td><td class="text-center"><button onclick="deleteCashClosing('${c.id}')" class="text-red-500 hover:text-red-700 font-bold text-lg p-1" title="Eliminar sesión de caja">🗑️</button></td>
      </tr>`;
    }).join('');
  } catch (err) { console.error(err); }
}

async function deleteCashClosing(id) {
  if (!confirm('¿Estás seguro de eliminar esta sesión de caja?')) return;
  
  try {
    const { data, error } = await supabaseClient.from('cash_closings').delete().eq('id', id).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      showToast('⚠️ Error de permisos. Ejecuta en Supabase SQL: CREATE POLICY "Enable delete for users" ON "public"."cash_closings" FOR DELETE USING (true);', 'error');
      return;
    }
    showToast('🗑️ Sesión de caja eliminada');
    loadCashClosings();
    if (typeof loadCajaHistorialCards === 'function') loadCajaHistorialCards();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

async function deleteAllZeroCash() {
  const code = prompt('Escribe ELIMINAR para borrar TODAS las cajas vacías (Base $0 y ABIERTAS):');
  if (code !== 'ELIMINAR') return;
  
  try {
    const { data, error } = await supabaseClient.from('cash_closings')
      .delete()
      .eq('business_id', businessId)
      .eq('opening_amount', 0)
      .eq('is_open', true)
      .select();
      
    if (error) throw error;
    if (!data || data.length === 0) {
      alert('⚠️ ERROR DE PERMISOS EN SUPABASE:\n\nSupabase bloqueó la acción porque falta la política (RLS) de DELETE para la tabla "cash_closings".\n\nVe a Supabase -> SQL Editor y ejecuta esto:\n\nCREATE POLICY "Enable delete for users" ON "public"."cash_closings" FOR DELETE USING (true);');
      return;
    }
    showToast('✅ Cajas vacías eliminadas (' + data.length + ')');
    loadCashClosings();
  } catch (err) {
    showToast('❌ Error: ' + err.message, 'error');
  }
}

// ==========================================
// MOVIMIENTOS DE CAJA (DEPÓSITOS / SALIDAS)
// ==========================================

function openCashMovementModal(type) {
  document.getElementById('cmType').value = type;
  const title = type === 'deposit' ? '📥 Ingreso de Efectivo' : '📤 Salida de Efectivo';
  const desc = type === 'deposit' 
    ? 'Registra un ingreso de dinero a la caja (ej: Base adicional, Cambio).'
    : 'Registra un retiro de dinero de la caja (ej: Retiro del dueño, Pago de proveedor).';
  document.getElementById('cmModalTitle').innerText = title;
  document.getElementById('cmModalDesc').innerText = desc;
  document.getElementById('cmAmount').value = '';
  document.getElementById('cmReason').value = '';
  document.getElementById('cashMovementModal').style.display = 'flex';
}

async function confirmCashMovement() {
  const type = document.getElementById('cmType').value;
  const amount = parseFloat(document.getElementById('cmAmount').value);
  const reason = document.getElementById('cmReason').value.trim();

  if (!amount || amount <= 0) return showToast('⚠️ Ingresa un monto válido', 'error');
  if (!reason) return showToast('⚠️ Ingresa el motivo del movimiento', 'error');

  const btn = document.getElementById('cmConfirmBtn');
  btn.disabled = true;
  btn.innerText = '⏳...';

  try {
    const { error } = await supabaseClient.from('cash_movements').insert([{
      business_id: businessId,
      type: type,
      amount: amount,
      reason: reason
    }]);

    if (error) throw error;
    
    showToast('✅ Movimiento registrado correctamente');
    document.getElementById('cashMovementModal').style.display = 'none';
    loadCashMovements();
    // Update dashboard since cash might have changed (although not reflected in dashboard directly, but good practice)
    if (typeof loadDashboard === 'function') loadDashboard();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = '✅ Confirmar';
  }
}

async function loadCashMovements() {
  if (!businessId) return;
  
  try {
    // Solo cargamos movimientos de hoy para mantener la caja limpia, o podemos traer los últimos 20
    const { data, error } = await supabaseClient
      .from('cash_movements')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    const tbody = document.getElementById('cashMovementsList');
    if (!tbody) return;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-gray-400">No hay movimientos recientes</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(m => {
      const isDeposit = m.type === 'deposit';
      const typeBadge = isDeposit
        ? '<span class="bg-green-100 text-green-800 text-[10px] px-2 py-1 rounded-full font-bold">INGRESO</span>'
        : '<span class="bg-orange-100 text-orange-800 text-[10px] px-2 py-1 rounded-full font-bold">SALIDA</span>';
      const amountColor = isDeposit ? 'text-green-600' : 'text-orange-600';
      const prefix = isDeposit ? '+' : '-';

      return `<tr>
        <td class="text-sm">${new Date(m.created_at).toLocaleString()}</td>
        <td>${typeBadge}</td>
        <td class="text-sm font-bold">${m.reason}</td>
        <td class="font-black ${amountColor}">${prefix}$${Number(m.amount).toLocaleString()}</td>
        <td><button onclick="deleteCashMovement('${m.id}')" class="text-red-500 hover:text-red-700 font-bold text-sm">🗑️</button></td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Error cargando movimientos de caja:', err);
  }
}

async function deleteCashMovement(id) {
  if (!confirm('¿Eliminar este movimiento de caja?')) return;
  try {
    const { error } = await supabaseClient.from('cash_movements').delete().eq('id', id);
    if (error) throw error;
    showToast('🗑️ Movimiento eliminado');
    loadCashMovements();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

// ==========================================
// NEW CAJA UI LOGIC
// ==========================================

window.showCajaView = function(view) {
  const views = ['cajaMainMenu','cajaViewResumen','cajaViewMovimientos','cajaViewHistorial','cajaViewGastos'];
  views.forEach(v => { const el = document.getElementById(v); if(el) el.classList.add('hidden'); });

  if (view === 'menu') {
    document.getElementById('cajaMainMenu')?.classList.remove('hidden');
    updateCajaMainButtons();
  } else if (view === 'resumen') {
    document.getElementById('cajaViewResumen')?.classList.remove('hidden');
    loadCajaResumen();
  } else if (view === 'movimientos') {
    document.getElementById('cajaViewMovimientos')?.classList.remove('hidden');
    loadCajaMovimientosCards();
  } else if (view === 'historial') {
    document.getElementById('cajaViewHistorial')?.classList.remove('hidden');
    loadCajaHistorialCards();
  } else if (view === 'gastos') {
    document.getElementById('cajaViewGastos')?.classList.remove('hidden');
    loadExpenses();
    renderExpenseCards();
  }
};

function updateCajaMainButtons() {
  const btnOpen = document.getElementById('cajaBtnOpen');
  const btnClose = document.getElementById('cajaBtnClose');
  if (activeCashSession) {
    if(btnOpen) btnOpen.classList.add('hidden');
    if(btnClose) { btnClose.classList.remove('hidden'); btnClose.style.display = 'flex'; }
  } else {
    if(btnOpen) { btnOpen.classList.remove('hidden'); btnOpen.style.display = 'flex'; }
    if(btnClose) btnClose.classList.add('hidden');
  }
}

window.switchResumenTab = function(tab) {
  document.querySelectorAll('.resumen-tab').forEach(t => {
    t.classList.remove('active');
    t.style.borderBottomColor = 'transparent';
    t.style.color = '#9ca3af';
  });
  document.querySelectorAll('.resumen-tab-content').forEach(c => c.classList.add('hidden'));

  const activeTab = document.querySelector(`.resumen-tab[data-tab="${tab}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.style.borderBottomColor = '#10b981';
    activeTab.style.color = '#111827';
  }

  if (tab === 'resumen') document.getElementById('resumenTabResumen')?.classList.remove('hidden');
  else if (tab === 'detallado') document.getElementById('resumenTabDetallado')?.classList.remove('hidden');
  else if (tab === 'movimientos') document.getElementById('resumenTabMovimientos')?.classList.remove('hidden');
};

window.loadCajaResumen = async function() {
  if (!businessId) return;
  try {
    // Get active session
    const { data: sessions } = await supabaseClient.from('cash_closings').select('*').eq('business_id', businessId).eq('is_open', true).limit(1);
    const session = sessions?.[0] || null;
    activeCashSession = session;
    updateCajaMainButtons();

    const openingAmount = Number(session?.opening_amount || 0);
    const openedAt = session?.opened_at || null;

    // Get orders since opening
    let cash = 0, transfer = 0, card = 0, nequi = 0, otros = 0, totalSales = 0;
    if (openedAt) {
      const { data: orders } = await supabaseClient.from('orders').select('*').eq('business_id', businessId).gte('created_at', openedAt).neq('status', 'Cancelado');
      (orders || []).forEach(o => {
        const t = Number(o.total);
        totalSales += t;
        if (o.payment_method === 'Dividido' && o.split_payments) {
          cash += Number(o.split_payments.cash || 0);
          transfer += Number(o.split_payments.transfer || 0);
          card += Number(o.split_payments.card || 0);
        } else if (o.payment_method === 'Efectivo') cash += t;
        else if (o.payment_method === 'Transferencia') transfer += t;
        else if (o.payment_method === 'Nequi') nequi += t;
        else if (o.payment_method === 'Tarjeta') card += t;
        else otros += t;
      });
    }

    // Get movements
    let depositsTotal = 0, withdrawalsTotal = 0;
    if (openedAt) {
      const { data: movs } = await supabaseClient.from('cash_movements').select('*').eq('business_id', businessId).gte('created_at', openedAt);
      (movs || []).forEach(m => {
        if (m.type === 'deposit') depositsTotal += Number(m.amount);
        else withdrawalsTotal += Number(m.amount);
      });
    }

    const expectedCash = openingAmount + cash + depositsTotal - withdrawalsTotal;

    // Update summary cards
    const cajaTotal = document.getElementById('resumenCajaTotal');
    const ingresosTotal = document.getElementById('resumenIngresosTotal');
    if (cajaTotal) cajaTotal.textContent = '$' + expectedCash.toLocaleString();
    if (ingresosTotal) ingresosTotal.textContent = '$' + totalSales.toLocaleString();

    // Update breakdown
    const breakdown = document.getElementById('resumenBreakdown');
    if (breakdown) {
      const rows = [
        { label: 'Efectivo', start: '$' + openingAmount.toLocaleString(), expected: '$' + (openingAmount + cash).toLocaleString(), expandable: false },
        { label: 'Transferencia bancaria', start: '$0', expected: '$' + transfer.toLocaleString(), expandable: true },
        { label: 'Tarjetas', start: '$0', expected: '$' + card.toLocaleString(), expandable: true },
        { label: 'Billetera virtual', start: '$0', expected: '$' + nequi.toLocaleString(), expandable: true },
        { label: 'Otros', start: '$0', expected: '$' + otros.toLocaleString(), expandable: true },
      ];
      const totalStart = '$' + openingAmount.toLocaleString();
      const totalExpected = '$' + (openingAmount + totalSales).toLocaleString();

      breakdown.innerHTML = rows.map(r => `
        <div class="flex items-center justify-between px-4 py-3">
          <span class="text-sm font-bold text-gray-800">${r.label}</span>
          <div class="flex items-center gap-6">
            <span class="text-sm text-gray-500 w-20 text-right">${r.start}</span>
            <span class="text-sm font-bold text-gray-800 w-20 text-right">${r.expected}</span>
            ${r.expandable ? '<span class="text-gray-400 text-xs">›</span>' : '<span class="w-3"></span>'}
          </div>
        </div>
      `).join('') + `
        <div class="flex items-center justify-between px-4 py-3 bg-gray-50 font-black">
          <span class="text-sm">Total</span>
          <div class="flex items-center gap-6">
            <span class="text-sm w-20 text-right">${totalStart}</span>
            <span class="text-sm w-20 text-right">${totalExpected}</span>
            <span class="w-3"></span>
          </div>
        </div>`;
    }

    // Update detallado tab
    const detallado = document.getElementById('resumenDetallado');
    if (detallado) {
      detallado.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Base apertura</span><span class="text-sm font-bold">$${openingAmount.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Ventas en efectivo</span><span class="text-sm font-bold text-emerald-600">+$${cash.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Transferencias</span><span class="text-sm font-bold">$${transfer.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Tarjetas</span><span class="text-sm font-bold">$${card.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Nequi/Billetera</span><span class="text-sm font-bold">$${nequi.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Depósitos extra</span><span class="text-sm font-bold text-emerald-600">+$${depositsTotal.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3"><span class="text-sm text-gray-600">Retiros</span><span class="text-sm font-bold text-red-600">-$${withdrawalsTotal.toLocaleString()}</span></div>
          <div class="flex justify-between px-4 py-3 bg-gray-50"><span class="text-sm font-black">Efectivo esperado</span><span class="text-sm font-black text-purple-700">$${expectedCash.toLocaleString()}</span></div>
        </div>`;
    }

    // Update movimientos tab
    const movsContainer = document.getElementById('resumenMovimientos');
    if (movsContainer && openedAt) {
      const { data: allMovs } = await supabaseClient.from('cash_movements').select('*').eq('business_id', businessId).gte('created_at', openedAt).order('created_at', { ascending: false });
      if (!allMovs?.length) {
        movsContainer.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Sin movimientos en este turno</p>';
      } else {
        movsContainer.innerHTML = allMovs.map(m => {
          const isD = m.type === 'deposit';
          return `<div class="bg-white border border-gray-100 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p class="text-sm font-bold">${m.reason}</p>
              <p class="text-[10px] text-gray-400">${new Date(m.created_at).toLocaleString()}</p>
            </div>
            <span class="font-black text-sm ${isD ? 'text-emerald-600' : 'text-orange-600'}">${isD ? '+' : '-'}$${Number(m.amount).toLocaleString()}</span>
          </div>`;
        }).join('');
      }
    }

    // Bottom bar
    const openedInfo = document.getElementById('resumenOpenedInfo');
    const cajero = document.getElementById('resumenCajero');
    const btnCerrar = document.getElementById('resumenBtnCerrar');
    if (session) {
      if(openedInfo) openedInfo.textContent = 'Apertura: ' + new Date(session.opened_at).toLocaleString();
      if(cajero) cajero.textContent = 'Cajero: ' + (localStorage.getItem('staff_name') || 'Admin');
      if(btnCerrar) btnCerrar.classList.remove('hidden');
    } else {
      if(openedInfo) openedInfo.textContent = 'Sin caja abierta';
      if(cajero) cajero.textContent = '';
      if(btnCerrar) btnCerrar.classList.add('hidden');
    }

    // Init active tab
    switchResumenTab('resumen');

  } catch (err) { console.error('Error loading caja resumen:', err); }
};

async function loadCajaMovimientosCards() {
  if (!businessId) return;
  try {
    const { data, error } = await supabaseClient.from('cash_movements').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    const container = document.getElementById('cajaMovimientosList');
    if (!container) return;
    if (!data?.length) { container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No hay movimientos recientes</p>'; return; }
    container.innerHTML = data.map(m => {
      const isD = m.type === 'deposit';
      return `<div class="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full ${isD ? 'bg-emerald-100' : 'bg-orange-100'} flex items-center justify-center text-sm">${isD ? '📥' : '📤'}</div>
          <div>
            <p class="text-sm font-bold text-gray-800">${m.reason}</p>
            <p class="text-[10px] text-gray-400">${new Date(m.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-black text-sm ${isD ? 'text-emerald-600' : 'text-orange-600'}">${isD ? '+' : '-'}$${Number(m.amount).toLocaleString()}</span>
          <button onclick="deleteCashMovement('${m.id}')" class="text-red-400 hover:text-red-600 text-xs p-1">🗑️</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) { console.error(err); }
}

async function loadCajaHistorialCards() {
  if (!businessId) return;
  try {
    const { data } = await supabaseClient.from('cash_closings').select('*').eq('business_id', businessId).order('opened_at', { ascending: false }).limit(50);
    activeCashSession = data?.find(c => c.is_open === true) || null;
    updateCajaMainButtons();

    const container = document.getElementById('cajaHistorialList');
    if (!container) return;
    if (!data?.length) { container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Sin sesiones de caja registradas</p>'; return; }

    // Group by date
    const grouped = {};
    data.forEach(c => {
      const d = c.opened_at ? new Date(c.opened_at) : new Date();
      const key = d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });

    container.innerHTML = Object.entries(grouped).map(([dateLabel, items]) => `
      <div>
        <h3 class="font-black text-gray-800 text-base mb-2 capitalize">${dateLabel}</h3>
        <div class="space-y-2">
          ${items.map(c => {
            const openDate = c.opened_at ? new Date(c.opened_at) : null;
            const openStr = openDate ? openDate.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';
            const closeStr = c.is_open ? 'Abierta aún' : (c.date ? 'Cierre: ' + new Date(c.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '-');
            const amount = c.is_open ? Number(c.opening_amount || 0) : Number(c.declared_total || 0);
            return `<div class="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm cursor-pointer hover:bg-gray-50 transition-all" onclick="viewCashDetail('${c.id}')">
              <div>
                <p class="text-sm font-bold text-gray-800">${localStorage.getItem('staff_name') || 'Admin'}</p>
                <p class="text-[10px] text-gray-500">Apertura: ${openStr}</p>
                <p class="text-[10px] text-gray-500">${closeStr}</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-black text-base">$${amount.toLocaleString()}</span>
                ${c.is_open ? '<span class="bg-emerald-100 text-emerald-700 text-[8px] px-2 py-0.5 rounded-full font-bold">ABIERTA</span>' : '<span class="bg-red-100 text-red-700 text-[8px] px-2 py-0.5 rounded-full font-bold">CERRADA</span>'}
                <button onclick="event.stopPropagation(); deleteCashClosing('${c.id}')" class="text-red-400 hover:text-red-600 text-xs p-1">🗑️</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

window.viewCashDetail = function(id) {
  // Navigate to resumen and load that specific session's data
  showCajaView('resumen');
};

function renderExpenseCards() {
  const container = document.getElementById('expensesListCards');
  if (!container) return;
  if (!allExpenses.length) { container.innerHTML = '<p class="text-sm text-gray-400 text-center py-6">No hay gastos registrados</p>'; return; }
  container.innerHTML = allExpenses.map(e => `
    <div class="bg-white border border-gray-100 rounded-xl p-3 flex items-center justify-between">
      <div>
        <span class="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">${e.category}</span>
        <p class="text-sm font-bold mt-1">${e.description || '-'}</p>
        <p class="text-[10px] text-gray-400">${new Date(e.date).toLocaleDateString()}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-black text-red-600">-$${Number(e.amount).toLocaleString()}</span>
        <button onclick="deleteExpense('${e.id}')" class="text-red-400 hover:text-red-600 text-xs p-1">🗑️</button>
      </div>
    </div>
  `).join('');
}

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
  const headerHtml = customHeader ? \`<div class="text-center mb-2" style="font-size: 12px; white-space: pre-wrap;">\${customHeader}</div>\` : '';
  const now = new Date().toLocaleString();

  let productsHtml = '';
  const productKeys = Object.keys(r.productsSold);
  if (productKeys.length > 0) {
    productsHtml = \`
      <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; margin:8px 0; padding:8px 0;">
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:4px;">PRODUCTOS VENDIDOS</div>
        <table style="width:100%; font-size:14px; text-align:left; border-collapse:collapse;">
          <tr style="border-bottom:1px solid #000;"><th style="padding-bottom:4px;">Prod</th><th style="text-align:center;padding-bottom:4px;">Cant</th><th style="text-align:right;padding-bottom:4px;">Total</th></tr>\`;
    
    productKeys.sort((a,b) => r.productsSold[b].qty - r.productsSold[a].qty).forEach(name => {
      const p = r.productsSold[name];
      productsHtml += \`<tr><td style="padding:2px 0;">\${name}</td><td style="text-align:center;padding:2px 0;">\${p.qty}</td><td style="text-align:right;padding:2px 0;">$\${p.total.toLocaleString()}</td></tr>\`;
    });
    productsHtml += \`</table></div>\`;
  }

  const html = \`
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
      \${headerHtml}
      <div class="text-center" style="font-size: 14px; margin-bottom: 8px;">Fecha: \${now}</div>
      <div class="text-center" style="font-size: 14px; margin-bottom: 8px;">Periodo: \${r.filter.toUpperCase()}</div>
      
      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div class="flex"><span>Ventas Totales:</span><span>$\${r.total.toLocaleString()}</span></div>
        <div class="flex"><span>Ticket Promedio:</span><span>$\${Math.round(r.ticketPromedio).toLocaleString()}</span></div>
        <div class="flex"><span>Nº Pedidos:</span><span>\${r.orderCount}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div style="text-align:center; font-size: 14px; margin-bottom: 4px;">DESGLOSE POR PAGO</div>
        <div class="flex"><span>Efectivo:</span><span>$\${r.cash.toLocaleString()}</span></div>
        <div class="flex"><span>Transferencia:</span><span>$\${r.transfer.toLocaleString()}</span></div>
        <div class="flex"><span>Tarjeta (Nequi):</span><span>$\${r.card.toLocaleString()}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div style="text-align:center; font-size: 14px; margin-bottom: 4px;">DESGLOSE POR ORIGEN</div>
        <div class="flex"><span>Caja (POS):</span><span>$\${r.originPOS.toLocaleString()}</span></div>
        <div class="flex"><span>Kiosko:</span><span>$\${r.originKiosko.toLocaleString()}</span></div>
        <div class="flex"><span>Menú QR:</span><span>$\${r.originMenu.toLocaleString()}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:8px; margin-top:8px;">
        <div style="text-align:center; font-size: 14px; margin-bottom: 4px;">FLUJO DE EFECTIVO</div>
        <div class="flex"><span>Fondo Inicial:</span><span>+$\${r.openingCash.toLocaleString()}</span></div>
        <div class="flex"><span>Ventas Efectivo:</span><span>+$\${r.cash.toLocaleString()}</span></div>
        <div class="flex"><span>Ingresos Extras:</span><span>+$\${r.cashIn.toLocaleString()}</span></div>
        <div class="flex"><span>Salidas/Gastos:</span><span>-$\${r.cashOut.toLocaleString()}</span></div>
        <div class="flex" style="margin-top:8px; padding-top:4px; border-top:1px solid #000; font-size:18px;">
          <span>EFECTIVO ESPERADO:</span><span>$\${r.expectedCash.toLocaleString()}</span>
        </div>
      </div>
      
      \${productsHtml}

      <div style="text-align:center; margin-top:20px; font-size:12px;">-- FIN DEL REPORTE --</div>
      <script>
        window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 300); }
      </script>
    </body>
  </html>\`;
  
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
