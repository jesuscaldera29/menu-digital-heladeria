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
    // Guard against duplicate active sessions
    const { data: activeExisting } = await supabaseClient
      .from('cash_closings')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_open', true)
      .limit(1);

    if (activeExisting && activeExisting.length > 0) {
      showToast('⚠️ Ya existe una sesión de caja abierta en este negocio', 'error');
      document.getElementById('cashOpeningModal').style.display = 'none';
      loadCashClosings();
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const staffName = localStorage.getItem('staff_name') || 'Admin';
    const { data, error } = await supabaseClient.from('cash_closings').insert([{
      business_id: businessId,
      date: today,
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
      total_orders: 0,
      notes: `Apertura por: ${staffName}`
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

function formatTurnoDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

async function loadCajaHistorialCards() {
  if (!businessId) return;
  try {
    const filter = document.getElementById('historialDateFilter')?.value || 'all';
    let query = supabaseClient
      .from('cash_closings')
      .select('*')
      .eq('business_id', businessId)
      .order('opened_at', { ascending: false });

    if (filter === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      query = query.gte('opened_at', d.toISOString());
    } else if (filter === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      query = query.gte('opened_at', d.toISOString());
    }

    const { data } = await query.limit(50);
    activeCashSession = data?.find(c => c.is_open === true) || null;
    updateCajaMainButtons();

    const container = document.getElementById('cajaHistorialList');
    if (!container) return;
    if (!data?.length) {
      container.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">Sin sesiones de caja registradas</p>';
      return;
    }

    // Group by date
    const grouped = {};
    data.forEach(c => {
      const d = c.opened_at ? new Date(c.opened_at) : new Date();
      const key = d.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });

    container.innerHTML = Object.entries(grouped).map(([dateLabel, items]) => `
      <div class="space-y-3">
        <h3 class="font-black text-gray-800 text-sm capitalize flex items-center gap-2 mt-4">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span> ${dateLabel}
        </h3>
        <div class="space-y-3">
          ${items.map(c => {
            const staffName = c.staff_name || (c.notes && c.notes.includes('Apertura por:') ? c.notes.split('Apertura por:')[1].trim() : (localStorage.getItem('staff_name') || 'Admin'));
            const turnShortId = String(c.id).slice(-6).toUpperCase();
            const totalSales = Number((c.cash_sales || 0) + (c.transfer_sales || 0) + (c.card_sales || 0));
            const diff = Number(c.difference || 0);

            return `
              <div class="bg-white border border-gray-200 hover:border-emerald-400/60 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all space-y-3">
                <!-- Header Card -->
                <div class="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <div class="flex items-center gap-2.5">
                    <span class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center text-xs">👤</span>
                    <div>
                      <h4 class="font-black text-gray-900 text-sm leading-tight">${staffName}</h4>
                      <span class="text-[10px] text-gray-400 font-mono font-bold">Turno #${turnShortId}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    ${c.is_open 
                      ? '<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2.5 py-1 rounded-full font-black animate-pulse flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ABIERTA</span>' 
                      : '<span class="bg-gray-100 text-gray-700 text-[10px] px-2.5 py-1 rounded-full font-black">CERRADA</span>'
                    }
                  </div>
                </div>

                <!-- Timestamps Grid -->
                <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50/90 p-2.5 rounded-xl">
                  <div>
                    <span class="text-[9px] text-gray-400 font-bold block uppercase tracking-wider">Apertura</span>
                    <span class="font-bold text-gray-800 text-xs">${formatTurnoDateTime(c.opened_at)}</span>
                  </div>
                  <div>
                    <span class="text-[9px] text-gray-400 font-bold block uppercase tracking-wider">Cierre</span>
                    <span class="font-bold text-gray-800 text-xs">${c.is_open ? '<span class="text-emerald-600 font-bold">● En curso</span>' : formatTurnoDateTime(c.date || c.created_at)}</span>
                  </div>
                </div>

                <!-- Metrics Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div class="bg-gray-50 p-2 rounded-xl text-center border border-gray-100">
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Base Inicial</span>
                    <span class="font-black text-xs text-gray-800">$${Number(c.opening_amount || 0).toLocaleString()}</span>
                  </div>
                  <div class="bg-gray-50 p-2 rounded-xl text-center border border-gray-100">
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Ventas</span>
                    <span class="font-black text-xs text-emerald-600">$${totalSales.toLocaleString()}</span>
                  </div>
                  <div class="bg-gray-50 p-2 rounded-xl text-center border border-gray-100">
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Declarado</span>
                    <span class="font-black text-xs text-gray-800">${c.is_open ? '<span class="text-gray-400">-</span>' : '$' + Number(c.declared_total || 0).toLocaleString()}</span>
                  </div>
                  <div class="bg-gray-50 p-2 rounded-xl text-center border border-gray-100">
                    <span class="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Diferencia</span>
                    <span class="font-black text-xs ${c.is_open ? 'text-gray-400' : (diff >= 0 ? 'text-emerald-600' : 'text-rose-600')}">
                      ${c.is_open ? '-' : (diff >= 0 ? (diff === 0 ? 'Exacta ($0)' : '+$' + diff.toLocaleString()) : '-$' + Math.abs(diff).toLocaleString())}
                    </span>
                  </div>
                </div>

                <!-- Actions Bar -->
                <div class="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div class="flex items-center gap-2">
                    <button onclick="openTurnoDetailAdmin('${c.id}')" class="bg-gray-900 hover:bg-black active:scale-95 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm">
                      <span>👁️</span> <span>Auditoría Detallada</span>
                    </button>
                    <button onclick="reprintTurnoZAdmin('${c.id}', event)" class="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm">
                      <span>🖨️</span> <span>Ticket Z</span>
                    </button>
                  </div>
                  <button onclick="event.stopPropagation(); deleteCashClosing('${c.id}')" class="text-gray-400 hover:text-red-600 font-bold text-sm p-1.5 rounded-lg hover:bg-red-50 transition-all" title="Eliminar sesión de caja">
                    🗑️
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  } catch (err) { console.error('Error cargando historial:', err); }
}

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
// POS REPORTS (CORTE DE CAJA Z & DASHBOARD FINANCIERO CON TURNOS Y CAJEROS)
// ==========================================
window.chartOriginInstanceAdmin = null;
window.chartPaymentInstanceAdmin = null;
window.currentPOSReportAdmin = null;
window.currentPOSReportRawOrders = [];
window.currentPOSReportRawClosings = [];
window.currentPOSReportRawMovements = [];
window.currentPOSReportActiveTab = 'overview';
window.currentPOSReportCashierFilter = 'all';
window.currentPOSReportTurnoFilter = 'all';

// Helper to extract staff name reliably
function extractStaffName(item) {
  if (!item) return 'Admin';
  if (item.staff_name && typeof item.staff_name === 'string' && item.staff_name.trim()) {
    return item.staff_name.trim();
  }
  if (item.notes && typeof item.notes === 'string') {
    if (item.notes.includes('Apertura por:')) {
      const parts = item.notes.split('Apertura por:');
      if (parts[1]) return parts[1].split('\n')[0].split('•')[0].trim();
    }
    if (item.notes.includes('[STAFF:')) {
      const match = item.notes.match(/\[STAFF:([^\]]+)\]/);
      if (match && match[1]) return match[1].trim();
    }
  }
  if (item.cashier_name) return String(item.cashier_name).trim();
  return 'Admin';
}

// Switch between Financial Overview and Turnos/Cajeros Tabs
window.switchPOSReportTab = function(tab) {
  window.currentPOSReportActiveTab = tab;
  const overviewContent = document.getElementById('posReportOverviewTabContent');
  const turnosContent = document.getElementById('posReportTurnosTabContent');
  const btnOverview = document.getElementById('posTabBtnOverview');
  const btnTurnos = document.getElementById('posTabBtnTurnos');

  if (tab === 'overview') {
    if (overviewContent) overviewContent.classList.remove('hidden');
    if (turnosContent) turnosContent.classList.add('hidden');
    if (btnOverview) btnOverview.className = 'px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm flex items-center gap-1.5';
    if (btnTurnos) btnTurnos.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white hover:bg-[#1c2030] flex items-center gap-1.5';
  } else {
    if (overviewContent) overviewContent.classList.add('hidden');
    if (turnosContent) turnosContent.classList.remove('hidden');
    if (btnTurnos) btnTurnos.className = 'px-3 py-1.5 rounded-lg text-xs font-black transition-all bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm flex items-center gap-1.5';
    if (btnOverview) btnOverview.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white hover:bg-[#1c2030] flex items-center gap-1.5';
  }
};

window.setPOSReportPeriod = function(period) {
  const filterInput = document.getElementById('posReportDateFilterAdmin');
  if (filterInput) filterInput.value = period;

  // Reset shift & cashier filters on period change
  window.currentPOSReportCashierFilter = 'all';
  window.currentPOSReportTurnoFilter = 'all';

  // Update pills styling
  document.querySelectorAll('.pos-period-btn').forEach(btn => {
    if (btn.getAttribute('data-period') === period) {
      btn.className = 'pos-period-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-orange-500 text-white shadow-sm';
    } else {
      btn.className = 'pos-period-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white hover:bg-[#1c2030]';
    }
  });

  const customContainer = document.getElementById('posCustomDatesContainer');
  if (customContainer) {
    customContainer.classList.add('hidden');
    customContainer.classList.remove('flex');
  }

  openPOSReportAdmin();
};

window.togglePOSCustomDates = function() {
  const container = document.getElementById('posCustomDatesContainer');
  if (!container) return;
  
  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    container.classList.add('flex');

    const startInput = document.getElementById('posCustomStartDateAdmin');
    const endInput = document.getElementById('posCustomEndDateAdmin');
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);

    if (startInput && !startInput.value) startInput.value = weekAgo.toISOString().split('T')[0];
    if (endInput && !endInput.value) endInput.value = now.toISOString().split('T')[0];

    document.querySelectorAll('.pos-period-btn').forEach(btn => {
      btn.className = 'pos-period-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white hover:bg-[#1c2030]';
    });
    const customBtn = document.getElementById('btnCustomDatesToggle');
    if (customBtn) customBtn.className = 'pos-period-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-orange-500 text-white shadow-sm';
  } else {
    container.classList.add('hidden');
    container.classList.remove('flex');
  }
};

window.applyPOSCustomDates = function() {
  const startVal = document.getElementById('posCustomStartDateAdmin')?.value;
  const endVal = document.getElementById('posCustomEndDateAdmin')?.value;
  if (!startVal || !endVal) {
    if (typeof showToast === 'function') showToast('Selecciona ambas fechas', 'warning');
    return;
  }
  const filterInput = document.getElementById('posReportDateFilterAdmin');
  if (filterInput) filterInput.value = 'custom';
  window.currentPOSReportCashierFilter = 'all';
  window.currentPOSReportTurnoFilter = 'all';
  openPOSReportAdmin();
};

// Filter change events
window.onPOSReportCashierFilterChanged = function() {
  const select = document.getElementById('posReportCashierFilterAdmin');
  window.currentPOSReportCashierFilter = select ? select.value : 'all';
  recalculateAndRenderPOSReport();
};

window.onPOSReportTurnoFilterChanged = function() {
  const select = document.getElementById('posReportTurnoFilterAdmin');
  window.currentPOSReportTurnoFilter = select ? select.value : 'all';
  recalculateAndRenderPOSReport();
};

window.filterPOSReportByCashier = function(cashierName) {
  const select = document.getElementById('posReportCashierFilterAdmin');
  if (select) select.value = cashierName;
  window.currentPOSReportCashierFilter = cashierName;
  window.switchPOSReportTab('overview');
  recalculateAndRenderPOSReport();
};

window.filterPOSReportByTurno = function(turnoId) {
  const select = document.getElementById('posReportTurnoFilterAdmin');
  if (select) select.value = turnoId;
  window.currentPOSReportTurnoFilter = turnoId;
  window.switchPOSReportTab('overview');
  recalculateAndRenderPOSReport();
};

// Main Data Fetcher
window.openPOSReportAdmin = async function() {
  const modal = document.getElementById('posReportModalAdmin');
  if (!modal) return;
  modal.classList.remove('hidden');

  const kpisContainer = document.getElementById('posReportKPIsAdmin');
  const chartsContainer = document.getElementById('posReportChartsAdmin');
  const historyContainer = document.getElementById('posReportHistoryContainerAdmin');
  const btnPrint = document.getElementById('btnPrintPOSReportAdmin');
  const subheader = document.getElementById('posReportSubheaderAdmin');

  if (kpisContainer) {
    kpisContainer.innerHTML = `
      <div class="col-span-full text-center py-16 text-slate-400 animate-pulse font-bold text-sm flex flex-col items-center justify-center gap-3">
        <div class="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Calculando métricas financieras consolidadas...</span>
      </div>
    `;
  }
  if (chartsContainer) chartsContainer.classList.add('hidden');
  if (historyContainer) historyContainer.classList.add('hidden');
  if (btnPrint) btnPrint.disabled = true;

  try {
    const filter = document.getElementById('posReportDateFilterAdmin')?.value || 'today';
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    let periodLabel = 'Hoy';

    if (filter === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = `Hoy (${now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })})`;
    } else if (filter === 'yesterday') {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = `Ayer (${startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })})`;
    } else if (filter === 'this_week') {
      const day = now.getDay() || 7; 
      startDate.setDate(now.getDate() - day + 1);
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
      periodLabel = `Esta Semana (${startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })})`;
    } else if (filter === 'this_month') {
      startDate.setDate(1);
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
      periodLabel = `Este Mes (${now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })})`;
    } else if (filter === 'custom') {
      const startVal = document.getElementById('posCustomStartDateAdmin')?.value;
      const endVal = document.getElementById('posCustomEndDateAdmin')?.value;
      if (startVal) {
        startDate = new Date(startVal + 'T00:00:00');
      }
      if (endVal) {
        endDate = new Date(endVal + 'T23:59:59.999');
      }
      periodLabel = `Personalizado (${startDate.toLocaleDateString('es-ES', { day:'numeric', month:'short' })} - ${endDate.toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' })})`;
    }

    if (subheader) {
      subheader.textContent = `Periodo: ${periodLabel} • Auditoría financiera consolidada`;
    }

    // 1. Query orders in date range
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('id, total, payment_method, split_payments, created_at, status, customer_name, notes, items')
      .eq('business_id', businessId)
      .in('status', ['Pagado', 'Completado', 'En preparación', 'Listo', 'En camino', 'Entregado', 'Aceptado'])
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 2. Query cash closings / turnos in date range
    const { data: closings } = await supabaseClient
      .from('cash_closings')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    // 3. Query cash movements in date range
    const { data: movements } = await supabaseClient
      .from('cash_movements')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    window.currentPOSReportRawOrders = orders || [];
    window.currentPOSReportRawClosings = closings || [];
    window.currentPOSReportRawMovements = movements || [];

    // Populate Dynamic Filter Dropdowns (Cashier and Turnos)
    populateFilterDropdowns(window.currentPOSReportRawClosings, window.currentPOSReportRawOrders);

    // Update Turnos Tab Badge
    const turnosBadge = document.getElementById('posTabTurnosBadge');
    if (turnosBadge) {
      turnosBadge.textContent = window.currentPOSReportRawClosings.length;
    }

    // Calculate & Render All Tabs
    recalculateAndRenderPOSReport();

  } catch (err) {
    console.error('Error loading report:', err);
    if (kpisContainer) {
      kpisContainer.innerHTML = '<div class="col-span-full text-center text-red-500 font-bold text-sm py-8">Error cargando métricas del reporte. Revisa la consola o conexión.</div>';
    }
  }
};

// Dynamically populate cashier and shift dropdowns
function populateFilterDropdowns(closings, orders) {
  const cashierSelect = document.getElementById('posReportCashierFilterAdmin');
  const turnoSelect = document.getElementById('posReportTurnoFilterAdmin');

  // Extract unique cashiers
  const cashiersSet = new Set();
  closings.forEach(c => cashiersSet.add(extractStaffName(c)));
  orders.forEach(o => {
    const staff = extractStaffName(o);
    if (staff && staff !== 'Admin') cashiersSet.add(staff);
  });

  const currentCashier = window.currentPOSReportCashierFilter || 'all';
  if (cashierSelect) {
    let cashierOpts = `<option value="all" class="bg-[#10121a] text-white">👤 Todos los Cajeros (${cashiersSet.size})</option>`;
    Array.from(cashiersSet).sort().forEach(cName => {
      cashierOpts += `<option value="${cName}" class="bg-[#10121a] text-white" ${currentCashier === cName ? 'selected' : ''}>👤 ${cName}</option>`;
    });
    cashierSelect.innerHTML = cashierOpts;
  }

  // Populate shifts
  const currentTurno = window.currentPOSReportTurnoFilter || 'all';
  if (turnoSelect) {
    let turnoOpts = `<option value="all" class="bg-[#10121a] text-white">📋 Todos los Turnos (${closings.length})</option>`;
    closings.forEach(c => {
      const shortId = String(c.id).slice(-6).toUpperCase();
      const staff = extractStaffName(c);
      const statusStr = c.is_open ? '🟢 Abierta' : '⚪ Cerrada';
      turnoOpts += `<option value="${c.id}" class="bg-[#10121a] text-white" ${currentTurno === c.id ? 'selected' : ''}>Turno #${shortId} • ${staff} (${statusStr})</option>`;
    });
    turnoSelect.innerHTML = turnoOpts;
  }
}

// Master calculation and rendering function
window.recalculateAndRenderPOSReport = function() {
  const allOrders = window.currentPOSReportRawOrders || [];
  const allClosings = window.currentPOSReportRawClosings || [];
  const allMovements = window.currentPOSReportRawMovements || [];

  const selectedCashier = window.currentPOSReportCashierFilter || 'all';
  const selectedTurnoId = window.currentPOSReportTurnoFilter || 'all';

  let filteredOrders = [...allOrders];
  let filteredClosings = [...allClosings];
  let filteredMovements = [...allMovements];
  let openingCash = 0;
  let activeShiftObject = null;

  // 1. Shift specific filtering
  if (selectedTurnoId !== 'all') {
    activeShiftObject = allClosings.find(c => String(c.id) === String(selectedTurnoId));
    if (activeShiftObject) {
      const shiftOpenedAt = activeShiftObject.opened_at || new Date(0).toISOString();
      const shiftClosedAt = activeShiftObject.is_open ? new Date().toISOString() : (activeShiftObject.closed_at || activeShiftObject.date || activeShiftObject.created_at);
      
      filteredOrders = allOrders.filter(o => {
        const orderTime = o.created_at;
        return orderTime >= shiftOpenedAt && orderTime <= shiftClosedAt;
      });

      filteredMovements = allMovements.filter(m => {
        const mTime = m.created_at;
        return mTime >= shiftOpenedAt && mTime <= shiftClosedAt;
      });

      filteredClosings = [activeShiftObject];
      openingCash = Number(activeShiftObject.opening_amount) || 0;
    }
  } else if (selectedCashier !== 'all') {
    // 2. Cashier specific filtering
    const cashierShifts = allClosings.filter(c => extractStaffName(c) === selectedCashier);
    filteredClosings = cashierShifts;

    if (cashierShifts.length > 0) {
      openingCash = cashierShifts.reduce((sum, c) => sum + (Number(c.opening_amount) || 0), 0);
      
      // Order belongs to cashier if within any of their shifts or matching note
      filteredOrders = allOrders.filter(o => {
        const oStaff = extractStaffName(o);
        if (oStaff === selectedCashier) return true;
        return cashierShifts.some(s => {
          const sOpen = s.opened_at || new Date(0).toISOString();
          const sClose = s.is_open ? new Date().toISOString() : (s.closed_at || s.date || s.created_at);
          return o.created_at >= sOpen && o.created_at <= sClose;
        });
      });
    } else {
      filteredOrders = allOrders.filter(o => extractStaffName(o) === selectedCashier);
    }
  } else {
    // General period
    if (allClosings.length > 0) {
      openingCash = Number(allClosings[allClosings.length - 1]?.opening_amount) || 0;
    }
  }

  // Calculate Cash Movements
  let cashIn = 0, cashOut = 0;
  filteredMovements.forEach(m => {
    const amt = Number(m.amount) || 0;
    if (m.type === 'deposit' || m.type === 'in') cashIn += amt;
    else if (m.type === 'withdrawal' || m.type === 'out') cashOut += amt;
  });

  // Calculate Financial Aggregates
  let totalCashSales = 0, totalCardSales = 0, totalTransferSales = 0, totalSplitSales = 0, totalSales = 0;
  let countCash = 0, countCard = 0, countTransfer = 0, countSplit = 0;
  let originKiosko = 0, originPOS = 0, originMenu = 0, originDelivery = 0;
  let productsSold = {};
  let totalItemsCount = 0;

  filteredOrders.forEach(o => {
    const total = Number(o.total) || 0;
    totalSales += total;

    const pMethod = (o.payment_method || 'Efectivo').toLowerCase();
    if (pMethod.includes('dividid') && o.split_payments) {
      totalSplitSales += total;
      countSplit++;
      totalCashSales += Number(o.split_payments.cash || 0);
      totalCardSales += Number(o.split_payments.card || 0);
      totalTransferSales += Number(o.split_payments.transfer || 0);
    } else if (pMethod.includes('efectivo') || pMethod.includes('cash')) {
      totalCashSales += total;
      countCash++;
    } else if (pMethod.includes('nequi') || pMethod.includes('tarjeta') || pMethod.includes('card') || pMethod.includes('datafono')) {
      totalCardSales += total;
      countCard++;
    } else if (pMethod.includes('transferencia') || pMethod.includes('banco') || pMethod.includes('daviplata')) {
      totalTransferSales += total;
      countTransfer++;
    } else {
      totalCashSales += total;
      countCash++;
    }

    // Origin determination
    const notes = (o.notes || '');
    if (notes.includes('[ORIGIN:KIOSKO]') || notes.includes('Kiosko Auto-Servicio')) {
      originKiosko += total;
    } else if (notes.includes('[ORIGIN:MENU]') || notes.includes('Menú Digital QR')) {
      originMenu += total;
    } else if (notes.includes('[ORIGIN:DELIVERY]') || notes.includes('Domicilio')) {
      originDelivery += total;
    } else {
      originPOS += total;
    }

    // Products breakdown
    let orderItems = o.cart || o.items || [];
    if (typeof orderItems === 'string') {
      try { orderItems = JSON.parse(orderItems); } catch(e) { orderItems = []; }
    }
    if (Array.isArray(orderItems)) {
      orderItems.forEach(item => {
        const qty = Number(item.quantity || item.qty) || 1;
        const price = Number(item.price) || 0;
        let name = item.name || 'Producto';
        if (item.extrasLabel) name += ` (${item.extrasLabel})`;
        
        totalItemsCount += qty;
        if (!productsSold[name]) productsSold[name] = { qty: 0, total: 0, price };
        productsSold[name].qty += qty;
        productsSold[name].total += (qty * price);
      });
    }
  });

  const orderCount = filteredOrders.length;
  const ticketPromedio = orderCount > 0 ? (totalSales / orderCount) : 0;
  const avgItemsPerTicket = orderCount > 0 ? (totalItemsCount / orderCount).toFixed(1) : '0';
  const expectedCash = openingCash + totalCashSales + cashIn - cashOut;

  // Cache state
  window.currentPOSReportAdmin = {
    filter: document.getElementById('posReportDateFilterAdmin')?.value || 'today',
    selectedCashier,
    selectedTurnoId,
    activeShiftObject,
    orderCount,
    total: totalSales,
    cash: totalCashSales,
    card: totalCardSales,
    transfer: totalTransferSales,
    split: totalSplitSales,
    originKiosko,
    originPOS,
    originMenu,
    originDelivery,
    ticketPromedio,
    avgItemsPerTicket,
    openingCash,
    cashIn,
    cashOut,
    expectedCash,
    productsSold,
    filteredOrders,
    filteredClosings
  };

  // 1. RENDER TAB 1: FINANCIAL OVERVIEW
  renderFinancialOverviewTab(window.currentPOSReportAdmin);

  // 2. RENDER TAB 2: TURNOS Y CAJEROS
  renderTurnosAndCashiersTab(allClosings, allOrders, allMovements);

  const btnPrint = document.getElementById('btnPrintPOSReportAdmin');
  if (btnPrint) btnPrint.disabled = false;
};

// Render Tab 1 (Financial KPIs, Charts, Ranking, Table)
function renderFinancialOverviewTab(r) {
  const kpisContainer = document.getElementById('posReportKPIsAdmin');
  const chartsContainer = document.getElementById('posReportChartsAdmin');
  const historyContainer = document.getElementById('posReportHistoryContainerAdmin');

  if (kpisContainer) {
    let filterNotice = '';
    if (r.selectedTurnoId !== 'all') {
      filterNotice = `<div class="col-span-full bg-orange-500/10 border border-orange-500/30 text-orange-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-between">
        <span>🔍 Filtrando por Turno #${String(r.selectedTurnoId).slice(-6).toUpperCase()}</span>
        <button onclick="filterPOSReportByTurno('all')" class="underline hover:text-white">Ver todos los turnos</button>
      </div>`;
    } else if (r.selectedCashier !== 'all') {
      filterNotice = `<div class="col-span-full bg-blue-500/10 border border-blue-500/30 text-blue-400 p-2.5 rounded-xl text-xs font-bold flex items-center justify-between">
        <span>👤 Filtrando por Cajero: ${r.selectedCashier}</span>
        <button onclick="filterPOSReportByCashier('all')" class="underline hover:text-white">Ver todos los cajeros</button>
      </div>`;
    }

    kpisContainer.innerHTML = `
      ${filterNotice}
      <!-- Card 1: Ingresos Totales -->
      <div class="bg-gradient-to-br from-[#11131a] to-[#171b26] p-5 rounded-2xl border border-[#232738] relative overflow-hidden shadow-lg group hover:border-emerald-500/50 transition-all flex flex-col justify-between">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 ${r.orderCount > 0 ? 'animate-ping' : ''}"></span> Ingresos Totales
            </span>
            <span class="text-[10px] bg-emerald-500/15 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">Ventas</span>
          </div>
          <div class="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight my-1">$${r.total.toLocaleString()}</div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-[#232738]">
          <span>Nº Pedidos: <strong class="text-white">${r.orderCount}</strong></span>
          <span class="text-emerald-400 font-bold">100% Recaudado</span>
        </div>
      </div>

      <!-- Card 2: Total Pedidos -->
      <div class="bg-gradient-to-br from-[#11131a] to-[#171b26] p-5 rounded-2xl border border-[#232738] relative overflow-hidden shadow-lg group hover:border-blue-500/50 transition-all flex flex-col justify-between">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-black uppercase tracking-wider text-blue-400">Total Pedidos</span>
            <span class="text-[10px] bg-blue-500/15 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-500/30">Volumen</span>
          </div>
          <div class="text-3xl sm:text-4xl font-black text-white tracking-tight my-1">${r.orderCount}</div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-[#232738]">
          <span>Items prom./ticket: <strong class="text-white">${r.avgItemsPerTicket}</strong></span>
          <span class="text-blue-400 font-bold">Transacciones</span>
        </div>
      </div>

      <!-- Card 3: Ticket Promedio -->
      <div class="bg-gradient-to-br from-[#11131a] to-[#171b26] p-5 rounded-2xl border border-[#232738] relative overflow-hidden shadow-lg group hover:border-amber-500/50 transition-all flex flex-col justify-between">
        <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-black uppercase tracking-wider text-amber-400">Ticket Promedio</span>
            <span class="text-[10px] bg-amber-500/15 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">Consumo</span>
          </div>
          <div class="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight my-1">$${Math.round(r.ticketPromedio).toLocaleString()}</div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-[#232738]">
          <span>Por cliente</span>
          <span class="text-amber-400 font-bold">Eficiencia</span>
        </div>
      </div>

      <!-- Card 4: Arqueo / Flujo de Caja -->
      <div class="bg-gradient-to-br from-[#11131a] to-[#171b26] p-5 rounded-2xl border border-[#232738] relative overflow-hidden shadow-lg group hover:border-orange-500/50 transition-all flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-black uppercase tracking-wider text-orange-400">Esperado en Caja</span>
            <span class="text-[10px] bg-orange-500/15 text-orange-300 font-bold px-2 py-0.5 rounded-full border border-orange-500/30">Efectivo</span>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-white tracking-tight">$${r.expectedCash.toLocaleString()}</div>
        </div>
        <div class="grid grid-cols-2 gap-1 text-[10px] text-slate-400 mt-2 pt-2 border-t border-[#232738]">
          <div>Base: <strong class="text-orange-400">+$${r.openingCash.toLocaleString()}</strong></div>
          <div>Vtas Efec: <strong class="text-emerald-400">+$${r.cash.toLocaleString()}</strong></div>
          <div>Ingresos: <strong class="text-blue-400">+$${r.cashIn.toLocaleString()}</strong></div>
          <div>Gastos: <strong class="text-red-400">-$${r.cashOut.toLocaleString()}</strong></div>
        </div>
      </div>
    `;

    if (r.orderCount === 0) {
      kpisContainer.innerHTML += `
        <div class="col-span-full bg-[#121520]/80 border border-dashed border-[#2b3049] rounded-2xl p-6 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <span class="text-3xl">ℹ️</span>
          <p class="text-sm font-bold text-slate-300">No se encontraron ventas para este filtro o periodo</p>
          <p class="text-xs text-slate-500">Prueba cambiando el filtro de cajero, turno o periodo de tiempo.</p>
        </div>
      `;
    }
  }

  // Payment Breakdown
  const paymentListEl = document.getElementById('posReportPaymentListAdmin');
  const badgePaymentTotal = document.getElementById('badgePaymentTotal');
  if (badgePaymentTotal) badgePaymentTotal.textContent = `$${r.total.toLocaleString()}`;

  if (paymentListEl) {
    const calcPct = (amt) => r.total > 0 ? ((amt / r.total) * 100).toFixed(1) : '0';
    paymentListEl.innerHTML = `
      <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
          <span class="text-xs font-bold text-slate-300">Efectivo</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-black text-emerald-400">$${r.cash.toLocaleString()}</span>
          <span class="text-[10px] text-slate-500 ml-1.5 font-bold">(${calcPct(r.cash)}%)</span>
        </div>
      </div>

      <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-cyan-500"></span>
          <span class="text-xs font-bold text-slate-300">NEQUI / Tarjeta</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-black text-cyan-400">$${r.card.toLocaleString()}</span>
          <span class="text-[10px] text-slate-500 ml-1.5 font-bold">(${calcPct(r.card)}%)</span>
        </div>
      </div>

      <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-purple-500"></span>
          <span class="text-xs font-bold text-slate-300">Transferencia</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-black text-purple-400">$${r.transfer.toLocaleString()}</span>
          <span class="text-[10px] text-slate-500 ml-1.5 font-bold">(${calcPct(r.transfer)}%)</span>
        </div>
      </div>
    `;
  }

  // Origin Breakdown
  const originListEl = document.getElementById('posReportOriginListAdmin');
  const badgeOriginTotal = document.getElementById('badgeOriginTotal');
  if (badgeOriginTotal) badgeOriginTotal.textContent = `$${r.total.toLocaleString()}`;

  if (originListEl) {
    const calcPct = (amt) => r.total > 0 ? ((amt / r.total) * 100).toFixed(1) : '0';
    originListEl.innerHTML = `
      <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-orange-500"></span>
          <span class="text-xs font-bold text-slate-300">Caja (POS)</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-black text-orange-400">$${r.originPOS.toLocaleString()}</span>
          <span class="text-[10px] text-slate-500 ml-1.5 font-bold">(${calcPct(r.originPOS)}%)</span>
        </div>
      </div>

      <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-blue-500"></span>
          <span class="text-xs font-bold text-slate-300">Kiosko Auto</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-black text-blue-400">$${r.originKiosko.toLocaleString()}</span>
          <span class="text-[10px] text-slate-500 ml-1.5 font-bold">(${calcPct(r.originKiosko)}%)</span>
        </div>
      </div>

      <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
          <span class="text-xs font-bold text-slate-300">Menú QR Digital</span>
        </div>
        <div class="text-right">
          <span class="text-xs font-black text-emerald-400">$${r.originMenu.toLocaleString()}</span>
          <span class="text-[10px] text-slate-500 ml-1.5 font-bold">(${calcPct(r.originMenu)}%)</span>
        </div>
      </div>
    `;
  }

  // Top Products Ranking
  const topProductsEl = document.getElementById('posReportTopProductsAdmin');
  const badgeProductsCount = document.getElementById('badgeProductsCount');
  const productKeys = Object.keys(r.productsSold || {});
  if (badgeProductsCount) badgeProductsCount.textContent = `${productKeys.length} productos`;

  if (topProductsEl) {
    if (productKeys.length === 0) {
      topProductsEl.innerHTML = '<p class="text-xs text-slate-500 text-center py-10">No hay productos vendidos en este periodo</p>';
    } else {
      const sortedProducts = productKeys.sort((a,b) => (r.productsSold[b]?.qty || 0) - (r.productsSold[a]?.qty || 0));
      const maxQty = sortedProducts.length > 0 ? (r.productsSold[sortedProducts[0]]?.qty || 1) : 1;

      topProductsEl.innerHTML = sortedProducts.map((name, index) => {
        const p = r.productsSold[name];
        const pctWidth = Math.min(100, Math.round((p.qty / maxQty) * 100));
        let medal = `<span class="w-5 h-5 rounded-full bg-[#1c2030] text-slate-400 text-[10px] font-black flex items-center justify-center">${index + 1}</span>`;
        if (index === 0) medal = '<span class="text-sm">🥇</span>';
        else if (index === 1) medal = '<span class="text-sm">🥈</span>';
        else if (index === 2) medal = '<span class="text-sm">🥉</span>';

        return `
          <div class="bg-[#0b0c10] p-2.5 rounded-xl border border-[#1c2030] flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 truncate max-w-[180px]">
                ${medal}
                <span class="font-bold text-slate-200 truncate" title="${name}">${name}</span>
              </div>
              <div class="text-right shrink-0">
                <span class="font-black text-amber-400">$${p.total.toLocaleString()}</span>
                <span class="text-[10px] bg-[#1c2030] text-slate-300 font-bold px-1.5 py-0.5 rounded ml-1">${p.qty}x</span>
              </div>
            </div>
            <div class="w-full bg-[#161926] h-1.5 rounded-full overflow-hidden">
              <div class="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full" style="width: ${pctWidth}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Charts
  if (chartsContainer) chartsContainer.classList.remove('hidden');

  if (typeof Chart !== 'undefined') {
    if (window.chartOriginInstanceAdmin) window.chartOriginInstanceAdmin.destroy();
    const ctxOrigin = document.getElementById('chartOriginAdmin')?.getContext('2d');
    if (ctxOrigin) {
      window.chartOriginInstanceAdmin = new Chart(ctxOrigin, {
        type: 'doughnut',
        data: {
          labels: ['Caja (POS)', 'Kiosko', 'Menú QR'],
          datasets: [{
            data: [r.originPOS || 0.001, r.originKiosko, r.originMenu],
            backgroundColor: ['#f97316', '#3b82f6', '#10b981'],
            borderWidth: 2,
            borderColor: '#10121a'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } }
          },
          cutout: '68%'
        }
      });
    }

    if (window.chartPaymentInstanceAdmin) window.chartPaymentInstanceAdmin.destroy();
    const ctxPayment = document.getElementById('chartPaymentAdmin')?.getContext('2d');
    if (ctxPayment) {
      window.chartPaymentInstanceAdmin = new Chart(ctxPayment, {
        type: 'doughnut',
        data: {
          labels: ['Efectivo', 'NEQUI/Tarjeta', 'Transferencia'],
          datasets: [{
            data: [r.cash || 0.001, r.card, r.transfer],
            backgroundColor: ['#10b981', '#06b6d4', '#8b5cf6'],
            borderWidth: 2,
            borderColor: '#10121a'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } }
          },
          cutout: '68%'
        }
      });
    }
  }

  // Render Orders Table
  const orderCountLabel = document.getElementById('posReportOrderCountLabel');
  if (orderCountLabel) orderCountLabel.textContent = r.orderCount;

  if (historyContainer) historyContainer.classList.remove('hidden');
  renderPOSReportOrdersTable(r.filteredOrders || []);
}

// Render Tab 2: Turnos y Rendimiento de Cajeros
function renderTurnosAndCashiersTab(closings, orders, movements) {
  const turnosKPIs = document.getElementById('posReportTurnosKPIsAdmin');
  const cashiersList = document.getElementById('posReportCashiersListAdmin');
  const shiftsList = document.getElementById('posReportShiftsListAdmin');

  // Compute Turno Totals & Discrepancies
  const totalShifts = closings.length;
  const openShifts = closings.filter(c => c.is_open).length;
  const closedShifts = closings.filter(c => !c.is_open);
  
  let netDifference = 0;
  let totalDeclared = 0;
  let totalSessionSales = 0;

  closedShifts.forEach(c => {
    netDifference += Number(c.difference || 0);
    totalDeclared += Number(c.declared_total || 0);
  });

  closings.forEach(c => {
    totalSessionSales += Number((c.cash_sales || 0) + (c.transfer_sales || 0) + (c.card_sales || 0));
  });

  // Group performance by Cashier
  const cashiersMap = {};
  closings.forEach(c => {
    const sName = extractStaffName(c);
    if (!cashiersMap[sName]) {
      cashiersMap[sName] = {
        name: sName,
        shiftsCount: 0,
        hasActiveShift: false,
        totalSales: 0,
        declaredTotal: 0,
        netDifference: 0,
        orderCount: 0
      };
    }
    cashiersMap[sName].shiftsCount++;
    if (c.is_open) cashiersMap[sName].hasActiveShift = true;
    cashiersMap[sName].totalSales += Number((c.cash_sales || 0) + (c.transfer_sales || 0) + (c.card_sales || 0));
    if (!c.is_open) {
      cashiersMap[sName].declaredTotal += Number(c.declared_total || 0);
      cashiersMap[sName].netDifference += Number(c.difference || 0);
    }
  });

  // Count orders per cashier
  orders.forEach(o => {
    const sName = extractStaffName(o);
    if (cashiersMap[sName]) {
      cashiersMap[sName].orderCount++;
    }
  });

  const uniqueCashiersCount = Object.keys(cashiersMap).length;

  // 1. Turnos KPI Summary Strip
  if (turnosKPIs) {
    let diffBadgeColor = 'text-emerald-400';
    let diffLabel = 'Cuadre Exacto ($0)';
    if (netDifference > 0) {
      diffBadgeColor = 'text-emerald-400';
      diffLabel = `+$${netDifference.toLocaleString()} Sobrante`;
    } else if (netDifference < 0) {
      diffBadgeColor = 'text-rose-400';
      diffLabel = `-$${Math.abs(netDifference).toLocaleString()} Faltante`;
    }

    turnosKPIs.innerHTML = `
      <div class="bg-[#10121a] p-4 rounded-2xl border border-[#1c2030]">
        <div class="flex items-center justify-between text-xs text-slate-400 font-bold uppercase mb-1">
          <span>Turnos en Periodo</span>
          <span>📋</span>
        </div>
        <div class="text-2xl font-black text-white">${totalShifts}</div>
        <div class="text-[11px] text-slate-400 mt-1">
          <strong class="text-emerald-400">${openShifts} Abiertos</strong> • ${totalShifts - openShifts} Cerrados
        </div>
      </div>

      <div class="bg-[#10121a] p-4 rounded-2xl border border-[#1c2030]">
        <div class="flex items-center justify-between text-xs text-slate-400 font-bold uppercase mb-1">
          <span>Cajeros Activos</span>
          <span>👤</span>
        </div>
        <div class="text-2xl font-black text-white">${uniqueCashiersCount}</div>
        <div class="text-[11px] text-slate-400 mt-1">Personal en operación</div>
      </div>

      <div class="bg-[#10121a] p-4 rounded-2xl border border-[#1c2030]">
        <div class="flex items-center justify-between text-xs text-slate-400 font-bold uppercase mb-1">
          <span>Ventas en Sesiones</span>
          <span>💵</span>
        </div>
        <div class="text-2xl font-black text-emerald-400">$${totalSessionSales.toLocaleString()}</div>
        <div class="text-[11px] text-slate-400 mt-1">Suma en sesiones de caja</div>
      </div>

      <div class="bg-[#10121a] p-4 rounded-2xl border border-[#1c2030]">
        <div class="flex items-center justify-between text-xs text-slate-400 font-bold uppercase mb-1">
          <span>Balance Arqueo Neto</span>
          <span>⚖️</span>
        </div>
        <div class="text-2xl font-black ${diffBadgeColor}">${netDifference === 0 ? '$0' : (netDifference > 0 ? '+$' + netDifference.toLocaleString() : '-$' + Math.abs(netDifference).toLocaleString())}</div>
        <div class="text-[11px] text-slate-400 mt-1 font-bold ${diffBadgeColor}">${diffLabel}</div>
      </div>
    `;
  }

  // 2. Rendimiento por Cajero Cards
  if (cashiersList) {
    const cashiersArray = Object.values(cashiersMap);
    if (cashiersArray.length === 0) {
      cashiersList.innerHTML = '<div class="col-span-full text-center py-6 text-slate-500 font-bold text-xs">No hay cajeros registrados en este periodo</div>';
    } else {
      cashiersList.innerHTML = cashiersArray.map(c => {
        let diffColor = 'text-emerald-400';
        let diffText = 'Exacto ($0)';
        if (c.netDifference > 0) {
          diffColor = 'text-emerald-400';
          diffText = `+$${c.netDifference.toLocaleString()} Sobrante`;
        } else if (c.netDifference < 0) {
          diffColor = 'text-rose-400';
          diffText = `-$${Math.abs(c.netDifference).toLocaleString()} Faltante`;
        }

        return `
          <div class="bg-[#0b0c10] border border-[#1c2030] hover:border-orange-500/40 rounded-2xl p-4 transition-all flex flex-col justify-between space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white font-black flex items-center justify-center text-sm shadow-md">
                  ${c.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 class="font-black text-white text-sm">${c.name}</h4>
                  <span class="text-[10px] text-slate-400 font-bold">${c.shiftsCount} turno(s)</span>
                </div>
              </div>
              <div>
                ${c.hasActiveShift 
                  ? '<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">● EN TURNO</span>' 
                  : '<span class="bg-[#1c2030] text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-bold">Cerrado</span>'
                }
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 bg-[#131622] p-2.5 rounded-xl text-xs">
              <div>
                <span class="text-[9px] text-slate-400 font-bold uppercase block">Vendido</span>
                <span class="font-black text-emerald-400">$${c.totalSales.toLocaleString()}</span>
              </div>
              <div>
                <span class="text-[9px] text-slate-400 font-bold uppercase block">Discrepancia</span>
                <span class="font-black ${diffColor}">${diffText}</span>
              </div>
            </div>

            <button onclick="filterPOSReportByCashier('${c.name}')" class="w-full bg-[#181b26] hover:bg-orange-500 hover:text-white text-slate-200 border border-[#2b3049] hover:border-transparent font-bold text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5">
              <span>🔍</span> <span>Ver Ventas en Dashboard</span>
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Historial de Turnos de Caja (Shifts List)
  if (shiftsList) {
    if (closings.length === 0) {
      shiftsList.innerHTML = '<div class="text-center py-8 text-slate-500 font-bold text-xs">No hay turnos registrados en este periodo</div>';
    } else {
      shiftsList.innerHTML = closings.map(c => {
        const staffName = extractStaffName(c);
        const turnShortId = String(c.id).slice(-6).toUpperCase();
        const totalSales = Number((c.cash_sales || 0) + (c.transfer_sales || 0) + (c.card_sales || 0));
        const diff = Number(c.difference || 0);

        return `
          <div class="bg-[#0b0c10] border border-[#1c2030] hover:border-emerald-500/40 rounded-2xl p-4 sm:p-5 transition-all space-y-3">
            <div class="flex items-center justify-between border-b border-[#181b26] pb-3">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold">
                  👤
                </div>
                <div>
                  <h4 class="font-black text-white text-sm flex items-center gap-2">
                    <span>${staffName}</span>
                    <span class="text-[10px] text-slate-400 font-mono font-bold bg-[#161926] px-1.5 py-0.5 rounded">Turno #${turnShortId}</span>
                  </h4>
                  <span class="text-[10px] text-slate-500">
                    Apertura: ${formatTurnoDateTime(c.opened_at)} ${c.is_open ? '• <strong class="text-emerald-400 font-bold">● En curso</strong>' : '• Cierre: ' + formatTurnoDateTime(c.date || c.created_at)}
                  </span>
                </div>
              </div>
              <div>
                ${c.is_open 
                  ? '<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2.5 py-1 rounded-full font-black animate-pulse">● ABIERTA</span>' 
                  : '<span class="bg-[#1c2030] text-slate-400 text-[10px] px-2.5 py-1 rounded-full font-black">CERRADA</span>'
                }
              </div>
            </div>

            <!-- Metrics Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div class="bg-[#131622] p-2 rounded-xl text-center border border-[#1c2030]">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Base Inicial</span>
                <span class="font-black text-xs text-white">$${Number(c.opening_amount || 0).toLocaleString()}</span>
              </div>
              <div class="bg-[#131622] p-2 rounded-xl text-center border border-[#1c2030]">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Ventas</span>
                <span class="font-black text-xs text-emerald-400">$${totalSales.toLocaleString()}</span>
              </div>
              <div class="bg-[#131622] p-2 rounded-xl text-center border border-[#1c2030]">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Declarado</span>
                <span class="font-black text-xs text-white">${c.is_open ? '<span class="text-slate-500">-</span>' : '$' + Number(c.declared_total || 0).toLocaleString()}</span>
              </div>
              <div class="bg-[#131622] p-2 rounded-xl text-center border border-[#1c2030]">
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Diferencia</span>
                <span class="font-black text-xs ${c.is_open ? 'text-slate-500' : (diff >= 0 ? 'text-emerald-400' : 'text-rose-400')}">
                  ${c.is_open ? '-' : (diff >= 0 ? (diff === 0 ? 'Exacta ($0)' : '+$' + diff.toLocaleString()) : '-$' + Math.abs(diff).toLocaleString())}
                </span>
              </div>
            </div>

            <!-- Actions Bar -->
            <div class="flex items-center justify-between pt-2 border-t border-[#181b26] flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <button onclick="openTurnoDetailAdmin('${c.id}')" class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm">
                  <span>👁️</span> <span>Auditoría Detallada</span>
                </button>
                <button onclick="reprintTurnoZAdmin('${c.id}', event)" class="bg-[#1c2030] hover:bg-[#282d44] active:scale-95 text-slate-200 border border-[#2b3049] font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm">
                  <span>🖨️</span> <span>Ticket Z</span>
                </button>
              </div>
              <button onclick="filterPOSReportByTurno('${c.id}')" class="bg-[#181b26] hover:bg-orange-500 hover:text-white text-orange-400 border border-orange-500/30 hover:border-transparent font-bold text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1">
                <span>📊</span> <span>Filtrar Dashboard</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function renderPOSReportOrdersTable(orders) {
  const tbody = document.getElementById('posReportHistoryBodyAdmin');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-500 font-bold">No hay pedidos registrados en este filtro/periodo.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const total = Number(o.total) || 0;
    const dateStr = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fullDate = new Date(o.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' });

    // Determine channel badge
    const notes = o.notes || '';
    let originBadge = '<span class="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">POS</span>';
    if (notes.includes('[ORIGIN:KIOSKO]') || notes.includes('Kiosko Auto-Servicio')) {
      originBadge = '<span class="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">Kiosko</span>';
    } else if (notes.includes('[ORIGIN:MENU]') || notes.includes('Menú Digital QR')) {
      originBadge = '<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">Menú QR</span>';
    }

    // Determine items summary
    let orderItems = o.cart || o.items || [];
    if (typeof orderItems === 'string') {
      try { orderItems = JSON.parse(orderItems); } catch(e) { orderItems = []; }
    }
    let itemsSummary = 'Productos varios';
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      itemsSummary = orderItems.map(i => `${i.quantity || i.qty || 1}x ${i.name || 'Prod'}`).slice(0, 2).join(', ');
      if (orderItems.length > 2) itemsSummary += ` (+${orderItems.length - 2})`;
    }

    return `
      <tr class="hover:bg-[#131622] transition-colors border-b border-[#181b26]">
        <td class="px-4 py-3">
          <span class="block text-white font-bold tracking-wider">#${String(o.id).slice(-4)}</span>
          <span class="text-[10px] text-slate-500">${fullDate} • ${dateStr}</span>
        </td>
        <td class="px-4 py-3">
          <span class="text-white font-bold block truncate max-w-[120px]">${o.customer_name || 'Cliente'}</span>
          <span class="text-[10px] text-slate-400 bg-[#161926] px-1.5 py-0.5 rounded font-mono">${o.status || 'Completado'}</span>
        </td>
        <td class="px-4 py-3 text-center">${originBadge}</td>
        <td class="px-4 py-3 text-center">
          <span class="bg-[#161926] text-slate-300 border border-[#232738] px-2 py-0.5 rounded text-[10px] font-bold uppercase">${o.payment_method || 'Efectivo'}</span>
        </td>
        <td class="px-4 py-3 text-slate-300 truncate max-w-[180px]" title="${itemsSummary}">${itemsSummary}</td>
        <td class="px-4 py-3 text-right text-emerald-400 font-black text-sm">$${total.toLocaleString()}</td>
      </tr>
    `;
  }).join('');
}

window.filterPOSReportOrdersTable = function() {
  const query = (document.getElementById('posReportOrderSearchInput')?.value || '').toLowerCase().trim();
  const rawList = window.currentPOSReportAdmin?.filteredOrders || window.currentPOSReportRawOrders || [];
  if (!query) {
    renderPOSReportOrdersTable(rawList);
    return;
  }
  const filtered = rawList.filter(o => {
    const id = String(o.id || '').toLowerCase();
    const name = String(o.customer_name || '').toLowerCase();
    const method = String(o.payment_method || '').toLowerCase();
    const notes = String(o.notes || '').toLowerCase();
    return id.includes(query) || name.includes(query) || method.includes(query) || notes.includes(query);
  });
  renderPOSReportOrdersTable(filtered);
};

window.exportPOSReportCSV = function() {
  const r = window.currentPOSReportAdmin;
  const orders = r?.filteredOrders || window.currentPOSReportRawOrders || [];
  if (!orders.length) {
    if (typeof showToast === 'function') showToast('No hay datos para exportar en este periodo', 'warning');
    return;
  }

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += 'ID_PEDIDO,FECHA,HORA,CLIENTE,ESTADO,CANAL,METODO_PAGO,TOTAL\n';

  orders.forEach(o => {
    const d = new Date(o.created_at);
    const fecha = d.toLocaleDateString();
    const hora = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cliente = `"${(o.customer_name || 'Sin Nombre').replace(/"/g, '""')}"`;
    const estado = o.status || 'Completado';
    
    let canal = 'Caja POS';
    const notes = o.notes || '';
    if (notes.includes('[ORIGIN:KIOSKO]') || notes.includes('Kiosko Auto-Servicio')) canal = 'Kiosko';
    else if (notes.includes('[ORIGIN:MENU]') || notes.includes('Menú Digital QR')) canal = 'Menú QR';

    const metodo = o.payment_method || 'Efectivo';
    const total = Number(o.total) || 0;

    csvContent += `${o.id},${fecha},${hora},${cliente},${estado},${canal},${metodo},${total}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `corte_caja_z_${r?.filter || 'report'}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof showToast === 'function') showToast('📥 Archivo CSV descargado con éxito', 'success');
};

window.printPOSReportExecutive = function() {
  if (!window.currentPOSReportAdmin) return;
  const r = window.currentPOSReportAdmin;
  const bizName = currentBusinessName || localStorage.getItem('business_name') || 'MI NEGOCIO';
  const now = new Date().toLocaleString();

  let productsRows = '';
  const productKeys = Object.keys(r.productsSold || {});
  if (productKeys.length > 0) {
    productKeys.sort((a,b) => (r.productsSold[b]?.qty || 0) - (r.productsSold[a]?.qty || 0)).forEach(name => {
      const p = r.productsSold[name];
      productsRows += `
        <tr>
          <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">${name}</td>
          <td style="padding:6px 8px; text-align:center; border-bottom:1px solid #e2e8f0;">${p.qty}</td>
          <td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${p.total.toLocaleString()}</td>
        </tr>
      `;
    });
  } else {
    productsRows = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#94a3b8;">Sin productos registrados</td></tr>';
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Informe Financiero Z - ${bizName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 900; color: #0f172a; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center; }
          .kpi-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; }
          .kpi-val { font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 10px; color: #334155; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th { background: #f1f5f9; padding: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; }
          .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 0; } @page { margin: 15mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${bizName}</div>
            <div class="subtitle">Informe Financiero Consolidado (Corte Z)</div>
            <div class="subtitle">Periodo: <strong>${r.periodLabel || r.filter}</strong> ${r.selectedCashier !== 'all' ? '• Cajero: ' + r.selectedCashier : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b;">Generado el: ${now}</div>
            <div style="font-size:11px; font-weight:bold; color:#0f172a;">Sistema Menú Digital</div>
          </div>
        </div>

        <div class="grid">
          <div class="kpi-card">
            <div class="kpi-title">Ingresos Totales</div>
            <div class="kpi-val" style="color:#10b981;">$${r.total.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Nº Pedidos</div>
            <div class="kpi-val">${r.orderCount}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Ticket Promedio</div>
            <div class="kpi-val" style="color:#f59e0b;">$${Math.round(r.ticketPromedio).toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Esperado en Caja</div>
            <div class="kpi-val" style="color:#0f172a;">$${r.expectedCash.toLocaleString()}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:20px;">
          <div class="section">
            <div class="section-title">Desglose por Método de Pago</div>
            <table>
              <tr><th style="width:70%;">Método</th><th style="text-align:right;">Monto</th></tr>
              <tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">Efectivo</td><td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${r.cash.toLocaleString()}</td></tr>
              <tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">NEQUI / Tarjeta</td><td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${r.card.toLocaleString()}</td></tr>
              <tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">Transferencia Bancaria</td><td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${r.transfer.toLocaleString()}</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Desglose por Canal de Venta</div>
            <table>
              <tr><th style="width:70%;">Canal</th><th style="text-align:right;">Monto</th></tr>
              <tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">Caja POS</td><td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${r.originPOS.toLocaleString()}</td></tr>
              <tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">Kiosko Autoservicio</td><td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${r.originKiosko.toLocaleString()}</td></tr>
              <tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0;">Menú QR Digital</td><td style="padding:6px 8px; text-align:right; border-bottom:1px solid #e2e8f0; font-weight:bold;">$${r.originMenu.toLocaleString()}</td></tr>
            </table>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Top Productos Vendidos</div>
          <table>
            <thead>
              <tr><th>Producto</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Total Recaudado</th></tr>
            </thead>
            <tbody>
              ${productsRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          Documento para uso administrativo y contable interno • Impreso el ${now}
        </div>
        <script>
          window.onload = function() { setTimeout(() => { window.print(); }, 400); }
        </script>
      </body>
    </html>
  `;

  const printWin = window.open('', '_blank');
  if (printWin) {
    printWin.document.write(html);
    printWin.document.close();
  }
};

window.closePOSReportAdmin = function() {
  const modal = document.getElementById('posReportModalAdmin');
  if (modal) modal.classList.add('hidden');
};

window.printPOSReportAdmin = async function() {
  if (!window.currentPOSReportAdmin) return;
  const r = window.currentPOSReportAdmin;
  const settings = {
    business_name: currentBusinessName || localStorage.getItem('business_name') || 'MI NEGOCIO'
  };

  // 1. Intentar impresión térmica nativa vía PrintBridge
  if (typeof bridgePrintReport === 'function') {
    try {
      const zPayload = {
        filter: r.filter,
        orderCount: r.orderCount,
        total_orders: r.orderCount,
        total: r.total,
        cash: r.cash,
        card: r.card,
        transfer: r.transfer,
        originKiosko: r.originKiosko,
        originPOS: r.originPOS,
        originMenu: r.originMenu,
        ticketPromedio: r.ticketPromedio,
        openingCash: r.openingCash,
        cashIn: r.cashIn,
        cashOut: r.cashOut,
        expectedCash: r.expectedCash,
        productsSold: r.productsSold
      };
      const ok = await bridgePrintReport(zPayload, settings);
      if (ok) {
        if (typeof showToast === 'function') showToast('🖨️ Reporte Z enviado a la impresora térmica', 'success');
        return;
      }
    } catch(e) {
      console.warn('PrintBridge report printing fallback:', e);
    }
  }

  // 2. Fallback a ventana emergente térmica de navegador
  const customHeader = localStorage.getItem('receipt_cash_header') || '';
  const headerHtml = customHeader ? `<div class="text-center mb-2" style="font-size: 12px; white-space: pre-wrap;">${customHeader}</div>` : '';
  const now = new Date().toLocaleString();

  let productsHtml = '';
  const productKeys = Object.keys(r.productsSold || {});
  if (productKeys.length > 0) {
    productsHtml = `
      <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; margin:8px 0; padding:8px 0;">
        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:4px;">PRODUCTOS VENDIDOS</div>
        <table style="width:100%; font-size:14px; text-align:left; border-collapse:collapse;">
          <tr style="border-bottom:1px solid #000;"><th style="padding-bottom:4px;">Prod</th><th style="text-align:center;padding-bottom:4px;">Cant</th><th style="text-align:right;padding-bottom:4px;">Total</th></tr>`;
    
    productKeys.sort((a,b) => (r.productsSold[b]?.qty || 0) - (r.productsSold[a]?.qty || 0)).forEach(name => {
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
      <div class="text-center" style="font-size: 14px; margin-bottom: 8px;">Periodo: ${(r.periodLabel || r.filter || '').toUpperCase()}</div>
      
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
      if (ok) {
        if (typeof showToast === 'function') showToast('🖨️ Ticket Z enviado a imprimir');
      } else {
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

window.viewCashDetail = function(id) {
  openTurnoDetailAdmin(id);
};

// ==========================================
// AUDITORÍA Y DETALLE DE TURNO (PUNTO 2)
// ==========================================
window.currentAuditedTurno = null;

window.openTurnoDetailAdmin = async function(closingId) {
  const modal = document.getElementById('modalDetalleTurnoAdmin');
  if (!modal) return;
  modal.classList.remove('hidden');

  const titleEl = document.getElementById('turnoDetailTitle');
  const subEl = document.getElementById('turnoDetailSubtitle');
  const bodyEl = document.getElementById('turnoDetailBody');

  bodyEl.innerHTML = '<div class="text-center py-20 text-gray-400 font-bold animate-pulse text-sm">⏳ Cargando auditoría completa del turno...</div>';

  try {
    const { data: closing, error: closingErr } = await supabaseClient
      .from('cash_closings')
      .select('*')
      .eq('id', closingId)
      .single();

    if (closingErr || !closing) throw (closingErr || new Error('No se encontró el turno'));

    const openedAt = closing.opened_at || new Date(new Date().setHours(0,0,0,0)).toISOString();
    const closedAt = closing.is_open ? new Date().toISOString() : (closing.closed_at || closing.date || closing.created_at);

    // Get orders in this window
    const { data: rawOrders } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', openedAt)
      .lte('created_at', closedAt)
      .neq('status', 'Cancelado')
      .order('created_at', { ascending: false });

    const orders = rawOrders || [];

    // Get cash movements in this window
    const { data: rawMoves } = await supabaseClient
      .from('cash_movements')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', openedAt)
      .lte('created_at', closedAt)
      .order('created_at', { ascending: false });

    const movements = rawMoves || [];

    // Financial breakdown
    let totalCashSales = 0, totalTransferSales = 0, totalCardSales = 0, totalSales = 0;
    let originPOS = 0, originKiosko = 0, originMenu = 0;
    let productsSold = {};

    orders.forEach(o => {
      const tot = Number(o.total) || 0;
      totalSales += tot;

      if (o.payment_method === 'Dividido' && o.split_payments) {
        totalCashSales += Number(o.split_payments.cash || 0);
        totalTransferSales += Number(o.split_payments.transfer || 0);
        totalCardSales += Number(o.split_payments.card || 0);
      } else if (o.payment_method === 'Efectivo') {
        totalCashSales += tot;
      } else if (o.payment_method === 'NEQUI' || o.payment_method === 'Tarjeta' || o.payment_method === 'Datafono') {
        totalCardSales += tot;
      } else {
        totalTransferSales += tot;
      }

      // Origin
      const notes = o.notes || '';
      if (notes.includes('[ORIGIN:KIOSKO]') || notes.includes('Kiosko Auto-Servicio')) {
        originKiosko += tot;
      } else if (notes.includes('[ORIGIN:MENU]')) {
        originMenu += tot;
      } else {
        originPOS += tot;
      }

      // Products breakdown
      let items = o.cart || o.items || [];
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = []; }
      }
      if (Array.isArray(items)) {
        items.forEach(it => {
          const qty = Number(it.quantity || it.qty || 1);
          const price = Number(it.price || 0);
          let name = it.name || 'Producto';
          if (it.extrasLabel) name += ` (${it.extrasLabel})`;
          if (!productsSold[name]) {
            productsSold[name] = { qty: 0, total: 0, unitPrice: price };
          }
          productsSold[name].qty += qty;
          productsSold[name].total += (qty * price);
        });
      }
    });

    let cashIn = 0, cashOut = 0;
    movements.forEach(m => {
      const amt = Number(m.amount) || 0;
      if (m.type === 'deposit') cashIn += amt;
      else cashOut += amt;
    });

    const openingCash = Number(closing.opening_amount) || 0;
    const expectedCash = openingCash + totalCashSales + cashIn - cashOut;
    const declaredCash = closing.is_open ? 0 : Number(closing.declared_total || 0);
    const difference = closing.is_open ? 0 : (declaredCash - expectedCash);
    const staffName = closing.staff_name || (closing.notes && closing.notes.includes('Apertura por:') ? closing.notes.split('Apertura por:')[1].trim() : (localStorage.getItem('staff_name') || 'Admin'));
    const ticketPromedio = orders.length > 0 ? Math.round(totalSales / orders.length) : 0;

    // Save global state for reprint
    window.currentAuditedTurno = {
      closingId: closing.id,
      turnId: String(closing.id).slice(-6).toUpperCase(),
      isOpen: closing.is_open,
      staffName,
      openedAt,
      closedAt: closing.is_open ? null : closedAt,
      openingCash,
      totalSales,
      cashSales: totalCashSales,
      transferSales: totalTransferSales,
      cardSales: totalCardSales,
      originPOS,
      originKiosko,
      originMenu,
      cashIn,
      cashOut,
      expectedCash,
      declaredCash,
      difference,
      orderCount: orders.length,
      ticketPromedio,
      productsSold,
      orders,
      movements,
      notes: closing.notes || ''
    };

    titleEl.innerHTML = `<span>📋 Auditoría Turno #${window.currentAuditedTurno.turnId}</span>`;
    subEl.innerHTML = `Cajero: <strong class="text-white">${staffName}</strong> • ${formatTurnoDateTime(openedAt)} ${closing.is_open ? '<span class="text-emerald-400 font-bold ml-1">● En Curso</span>' : '→ ' + formatTurnoDateTime(closedAt)}`;

    // Build Products Sold Rows
    const prodEntries = Object.entries(productsSold).sort((a, b) => b[1].qty - a[1].qty);
    const totalUnitsSold = prodEntries.reduce((s, p) => s + p[1].qty, 0);

    let productsTableHtml = '';
    if (prodEntries.length === 0) {
      productsTableHtml = `<tr><td colspan="4" class="text-center py-6 text-gray-500 font-medium text-xs">No se registraron productos en este turno</td></tr>`;
    } else {
      productsTableHtml = prodEntries.map(([name, item], idx) => `
        <tr class="hover:bg-[#181818] transition-colors border-b border-[#222]">
          <td class="py-2.5 px-3 text-xs text-gray-300 font-medium">
            <span class="text-gray-500 font-mono mr-1.5">#${idx + 1}</span> ${name}
          </td>
          <td class="py-2.5 px-3 text-xs text-center font-bold text-white bg-[#151515] rounded">${item.qty}</td>
          <td class="py-2.5 px-3 text-xs text-right text-gray-400">$${Math.round(item.total / (item.qty || 1)).toLocaleString()}</td>
          <td class="py-2.5 px-3 text-xs text-right font-black text-emerald-400">$${item.total.toLocaleString()}</td>
        </tr>
      `).join('');
    }

    // Build Movements Rows
    let movementsHtml = '';
    if (movements.length === 0) {
      movementsHtml = `<p class="text-center py-4 text-gray-500 text-xs font-medium">Sin movimientos de caja extras</p>`;
    } else {
      movementsHtml = movements.map(m => {
        const isDep = m.type === 'deposit';
        return `
          <div class="flex items-center justify-between p-3 bg-[#151515] rounded-xl border border-[#222]">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg ${isDep ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'} flex items-center justify-center text-xs font-bold">${isDep ? '📥' : '📤'}</span>
              <div>
                <p class="text-xs font-bold text-gray-200">${m.reason || (isDep ? 'Ingreso extra' : 'Retiro / Gasto')}</p>
                <p class="text-[10px] text-gray-500">${formatTurnoDateTime(m.created_at)}</p>
              </div>
            </div>
            <span class="font-black text-xs ${isDep ? 'text-emerald-400' : 'text-rose-400'}">${isDep ? '+' : '-'}$${Number(m.amount).toLocaleString()}</span>
          </div>
        `;
      }).join('');
    }

    // Build Orders Rows
    let ordersTableHtml = '';
    if (orders.length === 0) {
      ordersTableHtml = `<tr><td colspan="5" class="text-center py-6 text-gray-500 font-medium text-xs">No hay pedidos registrados</td></tr>`;
    } else {
      ordersTableHtml = orders.map(o => {
        const tot = Number(o.total) || 0;
        const timeStr = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        let originBadge = 'POS';
        if (o.notes && (o.notes.includes('[ORIGIN:KIOSKO]') || o.notes.includes('Kiosko Auto-Servicio'))) originBadge = 'Kiosko';
        else if (o.notes && o.notes.includes('[ORIGIN:MENU]')) originBadge = 'Menú QR';

        return `
          <tr class="hover:bg-[#181818] transition-colors border-b border-[#222]">
            <td class="py-2.5 px-3 text-xs">
              <span class="font-mono font-bold text-white">#${String(o.id).slice(-4)}</span>
              <span class="block text-[10px] text-gray-500">${timeStr}</span>
            </td>
            <td class="py-2.5 px-3 text-xs text-gray-300 font-medium truncate max-w-[120px]">${o.customer_name || 'Cliente'}</td>
            <td class="py-2.5 px-3 text-xs text-center"><span class="bg-[#222] text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-full">${originBadge}</span></td>
            <td class="py-2.5 px-3 text-xs text-center text-gray-400 font-bold text-[10px] uppercase">${o.payment_method}</td>
            <td class="py-2.5 px-3 text-xs text-right font-black text-emerald-400">$${tot.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    }

    // Render Modal Body
    bodyEl.innerHTML = `
      <!-- 1. RESUMEN DE BALANCE Y DIFERENCIA (HERO) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex flex-col justify-between">
          <span class="text-[10px] font-black uppercase tracking-wider text-gray-400">Total Facturado</span>
          <div class="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">$${totalSales.toLocaleString()}</div>
          <span class="text-[11px] text-gray-500 font-medium mt-1">${orders.length} pedidos • Prom: $${ticketPromedio.toLocaleString()}</span>
        </div>

        <div class="bg-[#161616] border border-[#262626] rounded-2xl p-4 flex flex-col justify-between">
          <span class="text-[10px] font-black uppercase tracking-wider text-gray-400">Efectivo Esperado (Gaveta)</span>
          <div class="text-2xl sm:text-3xl font-black text-sky-400 mt-1">$${expectedCash.toLocaleString()}</div>
          <span class="text-[11px] text-gray-500 font-medium mt-1">Base + Ventas Efec + Ingresos - Egresos</span>
        </div>

        <div class="bg-[#161616] border ${closing.is_open ? 'border-[#262626]' : (difference >= 0 ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-rose-500/40 bg-rose-950/10')} rounded-2xl p-4 flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-wider ${closing.is_open ? 'text-gray-400' : (difference >= 0 ? 'text-emerald-400' : 'text-rose-400')}">
              ${closing.is_open ? 'Estado de Cuadre' : (difference >= 0 ? (difference === 0 ? '✅ Caja Cuadrada' : '🟢 Sobrante de Caja') : '🔴 Faltante de Caja')}
            </span>
            ${!closing.is_open ? `<span class="text-[10px] font-bold text-gray-400">Declarado: $${declaredCash.toLocaleString()}</span>` : ''}
          </div>
          <div class="text-2xl sm:text-3xl font-black mt-1 ${closing.is_open ? 'text-gray-400' : (difference >= 0 ? 'text-emerald-400' : 'text-rose-400')}">
            ${closing.is_open ? '<span class="text-base text-gray-400">Turno en curso</span>' : (difference >= 0 ? (difference === 0 ? '$0 (Exacto)' : '+$' + difference.toLocaleString()) : '-$' + Math.abs(difference).toLocaleString())}
          </div>
          <span class="text-[11px] text-gray-500 font-medium mt-1">
            ${closing.is_open ? 'El arqueo final se realiza al cerrar' : `Diferencia: Declarado ($${declaredCash.toLocaleString()}) - Esperado ($${expectedCash.toLocaleString()})`}
          </span>
        </div>
      </div>

      <!-- 2. DESGLOSE FINANCIERO DETALLADO -->
      <div class="bg-[#141414] border border-[#222] rounded-2xl p-4 sm:p-5 space-y-4">
        <h4 class="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
          <span>💵</span> Desglose de Dinero y Métodos de Pago
        </h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Base Apertura</span>
            <span class="text-sm font-black text-amber-400">$${openingCash.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Ventas Efectivo</span>
            <span class="text-sm font-black text-emerald-400">$${totalCashSales.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Transferencia / Nequi</span>
            <span class="text-sm font-black text-purple-400">$${totalTransferSales.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Tarjetas / Datafono</span>
            <span class="text-sm font-black text-blue-400">$${totalCardSales.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Ingresos Extra (+)</span>
            <span class="text-sm font-black text-sky-400">+$${cashIn.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Salidas / Gastos (-)</span>
            <span class="text-sm font-black text-rose-400">-$${cashOut.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Caja POS</span>
            <span class="text-sm font-black text-gray-200">$${originPOS.toLocaleString()}</span>
          </div>
          <div class="bg-[#1a1a1a] p-3 rounded-xl border border-[#282828]">
            <span class="text-[10px] text-gray-400 font-bold block uppercase">Kiosko / Menú QR</span>
            <span class="text-sm font-black text-gray-200">$${(originKiosko + originMenu).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <!-- 3. PRODUCTOS VENDIDOS -->
      <div class="bg-[#141414] border border-[#222] rounded-2xl p-4 sm:p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <span>📦</span> Productos Vendidos en el Turno (${prodEntries.length})
          </h4>
          <span class="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
            Total Unidades: ${totalUnitsSold}
          </span>
        </div>
        <div class="overflow-x-auto max-h-64 custom-scroll rounded-xl border border-[#222]">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#1b1b1b] text-[10px] uppercase tracking-wider text-gray-400 sticky top-0">
              <tr>
                <th class="py-2 px-3">Producto / Variante</th>
                <th class="py-2 px-3 text-center">Cant.</th>
                <th class="py-2 px-3 text-right">Precio Prom.</th>
                <th class="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${productsTableHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 4. GRID DE MOVIMIENTOS Y LISTA DE PEDIDOS -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Movimientos -->
        <div class="bg-[#141414] border border-[#222] rounded-2xl p-4 space-y-3">
          <h4 class="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <span>🔄</span> Movimientos de Caja (${movements.length})
          </h4>
          <div class="space-y-2 max-h-56 overflow-y-auto custom-scroll">
            ${movementsHtml}
          </div>
        </div>

        <!-- Pedidos -->
        <div class="bg-[#141414] border border-[#222] rounded-2xl p-4 space-y-3">
          <h4 class="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-2">
            <span>🛒</span> Pedidos del Turno (${orders.length})
          </h4>
          <div class="overflow-x-auto max-h-56 custom-scroll rounded-xl border border-[#222]">
            <table class="w-full text-left border-collapse">
              <thead class="bg-[#1b1b1b] text-[10px] uppercase tracking-wider text-gray-400 sticky top-0">
                <tr>
                  <th class="py-2 px-3">ID</th>
                  <th class="py-2 px-3">Cliente</th>
                  <th class="py-2 px-3 text-center">Canal</th>
                  <th class="py-2 px-3 text-center">Pago</th>
                  <th class="py-2 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${ordersTableHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

  } catch(err) {
    console.error('Error al abrir detalle del turno:', err);
    bodyEl.innerHTML = `<div class="p-8 text-center text-rose-400 font-bold text-sm">❌ Error al cargar la auditoría del turno: ${err.message}</div>`;
  }
};

window.closeTurnoDetailAdmin = function() {
  const modal = document.getElementById('modalDetalleTurnoAdmin');
  if (modal) modal.classList.add('hidden');
};

window.reprintCurrentTurnoModal = async function() {
  if (!window.currentAuditedTurno) {
    showToast('⚠️ No hay datos de turno cargados para imprimir', 'error');
    return;
  }
  await printTurnoZPayload(window.currentAuditedTurno);
};

window.reprintTurnoZAdmin = async function(closingId, event) {
  if (event) event.stopPropagation();
  showToast('⏳ Preparando Ticket Z del turno...', 'info');

  try {
    if (window.currentAuditedTurno && window.currentAuditedTurno.closingId === closingId) {
      await printTurnoZPayload(window.currentAuditedTurno);
      return;
    }

    const { data: closing } = await supabaseClient
      .from('cash_closings')
      .select('*')
      .eq('id', closingId)
      .single();

    if (!closing) throw new Error('No se encontró la sesión de caja');

    const openedAt = closing.opened_at || new Date(new Date().setHours(0,0,0,0)).toISOString();
    const closedAt = closing.is_open ? new Date().toISOString() : (closing.closed_at || closing.date || closing.created_at);

    const { data: orders } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', openedAt)
      .lte('created_at', closedAt)
      .neq('status', 'Cancelado');

    const { data: movements } = await supabaseClient
      .from('cash_movements')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', openedAt)
      .lte('created_at', closedAt);

    let totalCashSales = 0, totalTransferSales = 0, totalCardSales = 0, totalSales = 0;
    let originPOS = 0, originKiosko = 0, originMenu = 0;
    let productsSold = {};

    (orders || []).forEach(o => {
      const tot = Number(o.total) || 0;
      totalSales += tot;

      if (o.payment_method === 'Dividido' && o.split_payments) {
        totalCashSales += Number(o.split_payments.cash || 0);
        totalTransferSales += Number(o.split_payments.transfer || 0);
        totalCardSales += Number(o.split_payments.card || 0);
      } else if (o.payment_method === 'Efectivo') {
        totalCashSales += tot;
      } else if (o.payment_method === 'NEQUI' || o.payment_method === 'Tarjeta' || o.payment_method === 'Datafono') {
        totalCardSales += tot;
      } else {
        totalTransferSales += tot;
      }

      const notes = o.notes || '';
      if (notes.includes('[ORIGIN:KIOSKO]') || notes.includes('Kiosko Auto-Servicio')) originKiosko += tot;
      else if (notes.includes('[ORIGIN:MENU]')) originMenu += tot;
      else originPOS += tot;

      let items = o.cart || o.items || [];
      if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = []; }
      }
      if (Array.isArray(items)) {
        items.forEach(it => {
          const qty = Number(it.quantity || it.qty || 1);
          const price = Number(it.price || 0);
          let name = it.name || 'Producto';
          if (it.extrasLabel) name += ` (${it.extrasLabel})`;
          if (!productsSold[name]) productsSold[name] = { qty: 0, total: 0 };
          productsSold[name].qty += qty;
          productsSold[name].total += (qty * price);
        });
      }
    });

    let cashIn = 0, cashOut = 0;
    (movements || []).forEach(m => {
      const amt = Number(m.amount) || 0;
      if (m.type === 'deposit') cashIn += amt;
      else cashOut += amt;
    });

    const openingCash = Number(closing.opening_amount) || 0;
    const expectedCash = openingCash + totalCashSales + cashIn - cashOut;
    const declaredCash = closing.is_open ? 0 : Number(closing.declared_total || 0);
    const difference = closing.is_open ? 0 : (declaredCash - expectedCash);
    const staffName = closing.staff_name || (closing.notes && closing.notes.includes('Apertura por:') ? closing.notes.split('Apertura por:')[1].trim() : (localStorage.getItem('staff_name') || 'Admin'));
    const ticketPromedio = orders && orders.length > 0 ? Math.round(totalSales / orders.length) : 0;

    const payload = {
      closingId: closing.id,
      turnId: String(closing.id).slice(-6).toUpperCase(),
      isOpen: closing.is_open,
      staffName,
      openedAt,
      closedAt: closing.is_open ? null : closedAt,
      openingCash,
      totalSales,
      cashSales: totalCashSales,
      transferSales: totalTransferSales,
      cardSales: totalCardSales,
      originPOS,
      originKiosko,
      originMenu,
      cashIn,
      cashOut,
      expectedCash,
      declaredCash,
      difference,
      orderCount: (orders || []).length,
      ticketPromedio,
      productsSold
    };

    await printTurnoZPayload(payload);
  } catch(err) {
    console.error('Error al reimprimir turno Z:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
};

async function printTurnoZPayload(p) {
  const settings = {
    business_name: currentBusinessName || localStorage.getItem('business_name') || 'MI NEGOCIO'
  };

  const zPayload = {
    filter: 'turno',
    turn_id: p.turnId,
    staff_name: p.staffName,
    opened_at: p.openedAt,
    closed_at: p.closedAt,
    orderCount: p.orderCount,
    total_orders: p.orderCount,
    total: p.totalSales,
    cash: p.cashSales,
    card: p.cardSales,
    transfer: p.transferSales,
    originKiosko: p.originKiosko,
    originPOS: p.originPOS,
    originMenu: p.originMenu,
    ticketPromedio: p.ticketPromedio,
    openingCash: p.openingCash,
    cashIn: p.cashIn,
    cashOut: p.cashOut,
    expectedCash: p.expectedCash,
    declaredCash: p.declaredCash,
    difference: p.difference,
    productsSold: p.productsSold
  };

  // Try PrintBridge (Universal thermal printer)
  if (typeof bridgePrintReport === 'function') {
    try {
      const ok = await bridgePrintReport(zPayload, settings);
      if (ok) {
        showToast('🖨️ Ticket Z enviado a la impresora térmica', 'success');
        return;
      }
    } catch(e) {
      console.warn('Fallo bridgePrintReport, usando ventana térmica:', e);
    }
  }

  // Fallback to thermal formatted window
  const customHeader = localStorage.getItem('receipt_cash_header') || '';
  const headerHtml = customHeader ? `<div class="text-center mb-2" style="font-size: 12px; white-space: pre-wrap;">${customHeader}</div>` : '';
  const openStr = formatTurnoDateTime(p.openedAt);
  const closeStr = p.isOpen ? 'EN CURSO (ABIERTA)' : formatTurnoDateTime(p.closedAt);

  let productsHtml = '';
  const productKeys = Object.keys(p.productsSold || {});
  if (productKeys.length > 0) {
    productsHtml = `
      <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; margin:8px 0; padding:8px 0;">
        <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:4px;">PRODUCTOS VENDIDOS</div>
        <table style="width:100%; font-size:12px; text-align:left; border-collapse:collapse;">
          <tr style="border-bottom:1px solid #000;"><th style="padding-bottom:3px;">Prod</th><th style="text-align:center;padding-bottom:3px;">Cant</th><th style="text-align:right;padding-bottom:3px;">Total</th></tr>`;
    
    productKeys.sort((a,b) => (p.productsSold[b]?.qty || 0) - (p.productsSold[a]?.qty || 0)).forEach(name => {
      const prod = p.productsSold[name];
      productsHtml += `<tr><td style="padding:2px 0;">${name}</td><td style="text-align:center;padding:2px 0;">${prod.qty}</td><td style="text-align:right;padding:2px 0;">$${prod.total.toLocaleString()}</td></tr>`;
    });
    productsHtml += `</table></div>`;
  }

  const html = `
  <html>
    <head>
      <title>Ticket Z - Turno #${p.turnId}</title>
      <style>
        body { font-family: 'Courier New', monospace, sans-serif; font-size: 13px; font-weight: bold; margin: 0; padding: 10px; width: 78mm; color: #000; }
        .text-center { text-align: center; }
        .flex { display: flex; justify-content: space-between; margin-bottom: 3px; }
        @media print { body { width: 100%; margin:0; padding:0; } }
      </style>
    </head>
    <body>
      <div class="text-center" style="font-size: 16px; font-weight:900;">*** CORTE DE CAJA Z ***</div>
      <div class="text-center" style="font-size: 13px; margin: 2px 0;">TURNO #${p.turnId}</div>
      ${headerHtml}
      <div class="text-center" style="font-size: 11px; margin-bottom: 6px;">Cajero: ${p.staffName}</div>
      <div style="font-size: 11px; border-top:1px dashed #000; padding: 4px 0;">
        <div>Apertura: ${openStr}</div>
        <div>Cierre:   ${closeStr}</div>
      </div>
      
      <div style="border-top:1px dashed #000; padding-top:6px; margin-top:6px;">
        <div class="flex" style="font-size: 14px; font-weight:900;"><span>TOTAL VENTAS:</span><span>$${p.totalSales.toLocaleString()}</span></div>
        <div class="flex"><span>Ticket Promedio:</span><span>$${p.ticketPromedio.toLocaleString()}</span></div>
        <div class="flex"><span>Nº Pedidos:</span><span>${p.orderCount}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:6px; margin-top:6px;">
        <div style="text-align:center; font-size: 11px; margin-bottom: 3px; text-transform:uppercase;">Desglose por Pago</div>
        <div class="flex"><span>Efectivo:</span><span>$${p.cashSales.toLocaleString()}</span></div>
        <div class="flex"><span>Transferencia:</span><span>$${p.transferSales.toLocaleString()}</span></div>
        <div class="flex"><span>Tarjeta/Nequi:</span><span>$${p.cardSales.toLocaleString()}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:6px; margin-top:6px;">
        <div style="text-align:center; font-size: 11px; margin-bottom: 3px; text-transform:uppercase;">Desglose por Canal</div>
        <div class="flex"><span>Caja (POS):</span><span>$${p.originPOS.toLocaleString()}</span></div>
        <div class="flex"><span>Kiosko:</span><span>$${p.originKiosko.toLocaleString()}</span></div>
        <div class="flex"><span>Menú QR:</span><span>$${p.originMenu.toLocaleString()}</span></div>
      </div>

      <div style="border-top:1px dashed #000; padding-top:6px; margin-top:6px;">
        <div style="text-align:center; font-size: 11px; margin-bottom: 3px; text-transform:uppercase;">Flujo de Caja</div>
        <div class="flex"><span>Base Inicial:</span><span>+$${p.openingCash.toLocaleString()}</span></div>
        <div class="flex"><span>Ventas Efectivo:</span><span>+$${p.cashSales.toLocaleString()}</span></div>
        <div class="flex"><span>Ingresos Extras:</span><span>+$${p.cashIn.toLocaleString()}</span></div>
        <div class="flex"><span>Salidas/Gastos:</span><span>-$${p.cashOut.toLocaleString()}</span></div>
        <div class="flex" style="margin-top:6px; padding-top:4px; border-top:1px solid #000; font-size:14px; font-weight:900;">
          <span>EFECTIVO ESPERADO:</span><span>$${p.expectedCash.toLocaleString()}</span>
        </div>
        ${!p.isOpen ? `
        <div class="flex" style="font-size:13px;">
          <span>EFECTIVO DECLARADO:</span><span>$${p.declaredCash.toLocaleString()}</span>
        </div>
        <div class="flex" style="font-size:14px; font-weight:900; margin-top:3px;">
          <span>DIFERENCIA:</span><span>${p.difference >= 0 ? '+' : ''}$${p.difference.toLocaleString()}</span>
        </div>
        ` : ''}
      </div>
      
      ${productsHtml}

      <div style="text-align:center; margin-top:16px; font-size:11px;">-- FIN DEL CORTE Z --</div>
      <script>
        window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 300); }
      </script>
    </body>
  </html>`;

  if (typeof bridgePrintRawHtml === 'function') {
    bridgePrintRawHtml(html).then(ok => {
      if (ok) showToast('🖨️ Ticket Z enviado a la impresora');
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
}

