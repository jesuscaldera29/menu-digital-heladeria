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

async function startCashClosing() {
  document.getElementById('cashClosingModal').style.display = 'flex';
  document.getElementById('declaredCashAmount').value = '';
  document.getElementById('cashClosingNotes').value = '';
}

async function submitCashClosing() {
  const declared = parseFloat(document.getElementById('declaredCashAmount').value);
  if (!declared && declared !== 0) return showToast('⚠️ Ingresa el monto', 'error');
  const notes = document.getElementById('cashClosingNotes').value.trim();
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: todayOrders } = await supabaseClient.from('orders').select('*').eq('business_id', businessId).gte('created_at', today).neq('status', 'Cancelado');
    const orders = todayOrders || [];
    let cash = 0, transfer = 0, card = 0;
    orders.forEach(o => {
      const t = Number(o.total);
      if (o.payment_method === 'Efectivo') cash += t;
      else if (o.payment_method === 'Transferencia') transfer += t;
      else card += t;
    });
    const { data: todayExpenses } = await supabaseClient.from('expenses').select('amount').eq('business_id', businessId).eq('date', today);
    const totalExp = (todayExpenses || []).reduce((s, e) => s + Number(e.amount), 0);
    const expected = cash + transfer + card;
    const diff = declared - expected;
    const { error } = await supabaseClient.from('cash_closings').insert([{
      business_id: businessId, date: today, expected_total: expected, declared_total: declared,
      difference: diff, cash_sales: cash, transfer_sales: transfer, card_sales: card,
      total_expenses: totalExp, total_orders: orders.length, notes
    }]);
    if (error) throw error;
    document.getElementById('cashClosingModal').style.display = 'none';
    const color = diff >= 0 ? 'green' : 'red';
    const resultDiv = document.getElementById('cashClosingResult');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<div class="bg-${color}-50 border border-${color}-200 p-6 rounded-2xl">
      <h3 class="text-xl font-black mb-4">📊 Resultado del Cierre</h3>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div><span class="text-gray-500">Ventas Efectivo:</span> <strong>$${cash.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Transferencias:</span> <strong>$${transfer.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Tarjeta:</span> <strong>$${card.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Total Pedidos:</span> <strong>${orders.length}</strong></div>
        <div><span class="text-gray-500">Esperado:</span> <strong class="text-blue-600">$${expected.toLocaleString()}</strong></div>
        <div><span class="text-gray-500">Declarado:</span> <strong>$${declared.toLocaleString()}</strong></div>
        <div class="col-span-2 text-center mt-2"><span class="text-lg font-black ${diff >= 0 ? 'text-green-600' : 'text-red-600'}">Diferencia: ${diff >= 0 ? '+' : ''}$${diff.toLocaleString()}</span></div>
      </div></div>`;
    showToast('✅ Cierre de caja completado');
    loadCashClosings();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function loadCashClosings() {
  try {
    const { data } = await supabaseClient.from('cash_closings').select('*').eq('business_id', businessId).order('date', { ascending: false }).limit(20);
    const tbody = document.getElementById('cashClosingsList');
    if (!tbody) return;
    if (!data?.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-gray-400">Sin cierres</td></tr>'; return; }
    tbody.innerHTML = data.map(c => {
      const diffColor = c.difference >= 0 ? 'text-green-600' : 'text-red-600';
      return `<tr>
        <td class="text-sm">${new Date(c.date).toLocaleDateString()}</td>
        <td class="font-bold">$${Number(c.expected_total).toLocaleString()}</td>
        <td class="font-bold">$${Number(c.declared_total).toLocaleString()}</td>
        <td class="font-black ${diffColor}">${c.difference >= 0 ? '+' : ''}$${Number(c.difference).toLocaleString()}</td>
        <td class="text-sm">${c.total_orders} pedidos</td>
      </tr>`;
    }).join('');
  } catch (err) { console.error(err); }
}
