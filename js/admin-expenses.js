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
    
    // Fetch expenses since opening
    const { data: sessionExpenses } = await supabaseClient
      .from('expenses')
      .select('amount')
      .eq('business_id', businessId)
      .gte('created_at', openedAt);
      
    const totalExp = (sessionExpenses || []).reduce((s, e) => s + Number(e.amount), 0);
    
    // Calculate expected (opening + cash sales - expenses)
    const expectedCash = Number(activeCashSession.opening_amount || 0) + cash - totalExp;
    const diff = declared - expectedCash;
    
    const { error } = await supabaseClient.from('cash_closings')
      .update({
        date: today,
        expected_total: expectedCash,
        declared_total: declared,
        difference: diff,
        cash_sales: cash,
        transfer_sales: transfer,
        card_sales: card,
        total_expenses: totalExp,
        total_orders: orders.length,
        notes: notes,
        is_open: false
      })
      .eq('id', activeCashSession.id);
      
    if (error) throw error;
    
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
        <div><span class="text-gray-500">Gastos:</span> <strong class="text-red-500">-$${totalExp.toLocaleString()}</strong></div>
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
  const code = prompt('Escribe la palabra ELIMINAR en mayúsculas para confirmar la eliminación de esta sesión de caja:');
  if (code !== 'ELIMINAR') {
    if (code !== null) showToast('⚠️ Cancelado: La palabra no coincide', 'error');
    return;
  }
  
  try {
    const { data, error } = await supabaseClient.from('cash_closings').delete().eq('id', id).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      alert('⚠️ ERROR DE PERMISOS EN SUPABASE:\n\nSupabase bloqueó la acción porque falta la política (RLS) de DELETE para la tabla "cash_closings".\n\nVe a Supabase -> SQL Editor y ejecuta esto:\n\nCREATE POLICY "Enable delete for users" ON "public"."cash_closings" FOR DELETE USING (true);');
      return;
    }
    showToast('🗑️ Sesión de caja eliminada');
    loadCashClosings();
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
