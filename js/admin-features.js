// ===== CUPONES, CRÉDITOS, RECETAS, IMPORTAR, DIVIDIR CUENTA =====

// --- CUPONES ---
async function loadCoupons() {
  if (!businessId) return;
  try {
    const { data } = await supabaseClient.from('coupons').select('*').eq('business_id', businessId).order('created_at', { ascending: false });
    const container = document.getElementById('couponsList');
    if (!container) return;
    if (!data?.length) { container.innerHTML = '<p class="text-gray-400 text-center py-8">No hay cupones creados</p>'; return; }
    container.innerHTML = data.map(c => {
      const typeLabel = c.discount_type === 'percentage' ? c.discount_value + '%' : '$' + Number(c.discount_value).toLocaleString();
      const expired = c.valid_until && new Date(c.valid_until) < new Date();
      return `<div class="flex items-center justify-between p-4 ${expired ? 'bg-gray-100' : 'bg-green-50'} rounded-2xl border ${expired ? 'border-gray-200' : 'border-green-100'}">
        <div><p class="font-black text-lg">${c.code}</p>
          <p class="text-xs text-gray-500">Descuento: ${typeLabel} ${c.min_order > 0 ? '• Mín: $' + c.min_order : ''} • Usos: ${c.used_count}${c.max_uses ? '/' + c.max_uses : '/∞'}</p>
          ${c.valid_until ? '<p class="text-xs text-gray-400 mt-1">Vence: ' + new Date(c.valid_until).toLocaleDateString() + '</p>' : ''}
        </div>
        <div class="flex gap-2">
          <button onclick="toggleCoupon('${c.id}', ${!c.is_active})" class="px-3 py-2 rounded-xl text-xs font-bold ${c.is_active ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${c.is_active ? '❌ Desactivar' : '✅ Activar'}</button>
          <button onclick="deleteCoupon('${c.id}')" class="text-red-500 p-2">🗑️</button>
        </div></div>`;
    }).join('');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function createCoupon(event) {
  const code = document.getElementById('couponCode').value.trim();
  const type = document.getElementById('couponType').value;
  const value = parseFloat(document.getElementById('couponValue').value);
  const minOrder = parseFloat(document.getElementById('couponMinOrder').value) || 0;
  const maxUses = parseInt(document.getElementById('couponMaxUses').value) || null;
  const validUntil = document.getElementById('couponValidUntil').value || null;
  if (!code || !value) return showToast('⚠️ Completa código y valor', 'error');
  try {
    const { error } = await supabaseClient.from('coupons').insert([{ business_id: businessId, code, discount_type: type, discount_value: value, min_order: minOrder, max_uses: maxUses, valid_until: validUntil }]);
    if (error) throw error;
    showToast('✅ Cupón creado'); document.getElementById('couponCode').value = ''; loadCoupons();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function toggleCoupon(id, active) {
  try { await supabaseClient.from('coupons').update({ is_active: active }).eq('id', id); loadCoupons(); } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function deleteCoupon(id) {
  if (!confirm('¿Eliminar cupón?')) return;
  try { await supabaseClient.from('coupons').delete().eq('id', id); showToast('🗑️ Eliminado'); loadCoupons(); } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

// --- CRÉDITOS ---
async function loadCredits() {
  if (!businessId) return;
  try {
    const { data } = await supabaseClient.from('credit_accounts').select('*').eq('business_id', businessId).order('customer_name');
    const container = document.getElementById('creditsList');
    if (!container) return;
    if (!data?.length) { container.innerHTML = '<p class="text-gray-400 text-center py-8">No hay cuentas de crédito</p>'; return; }
    container.innerHTML = data.map(c => {
      const balColor = c.balance > 0 ? 'text-red-600' : 'text-green-600';
      return `<div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
        <div><p class="font-bold">${c.customer_name}</p>
          <p class="text-xs text-gray-500">📞 ${c.customer_phone} • Límite: $${Number(c.credit_limit).toLocaleString()}</p>
          <p class="text-lg font-black ${balColor} mt-1">Saldo: $${Number(c.balance).toLocaleString()}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="openCreditPayment('${c.id}','${c.customer_name}',${c.balance})" class="bg-green-100 text-green-700 px-3 py-2 rounded-xl text-xs font-bold">💵 Abonar</button>
          <button onclick="deleteCreditAccount('${c.id}')" class="text-red-500 p-2">🗑️</button>
        </div></div>`;
    }).join('');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function createCreditAccount(event) {
  const name = document.getElementById('creditName').value.trim();
  const phone = document.getElementById('creditPhone').value.trim();
  const limit = parseFloat(document.getElementById('creditLimit').value) || 0;
  if (!name || !phone) return showToast('⚠️ Nombre y teléfono requeridos', 'error');
  try {
    const { error } = await supabaseClient.from('credit_accounts').insert([{ business_id: businessId, customer_name: name, customer_phone: phone, credit_limit: limit }]);
    if (error) throw error;
    showToast('✅ Cuenta creada'); document.getElementById('creditName').value = ''; document.getElementById('creditPhone').value = ''; loadCredits();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

function openCreditPayment(id, name, balance) {
  document.getElementById('paymentCreditAccountId').value = id;
  document.getElementById('paymentCreditInfo').textContent = `${name} - Saldo pendiente: $${Number(balance).toLocaleString()}`;
  document.getElementById('paymentAmount').value = '';
  document.getElementById('creditPaymentModal').style.display = 'flex';
}

async function submitCreditPayment() {
  const id = document.getElementById('paymentCreditAccountId').value;
  const amount = parseFloat(document.getElementById('paymentAmount').value);
  const notes = document.getElementById('paymentNotes')?.value || '';
  if (!amount || amount <= 0) return showToast('⚠️ Monto inválido', 'error');
  try {
    const { data: acc } = await supabaseClient.from('credit_accounts').select('balance').eq('id', id).single();
    const newBalance = Number(acc.balance) - amount;
    await supabaseClient.from('credit_accounts').update({ balance: newBalance }).eq('id', id);
    await supabaseClient.from('credit_transactions').insert([{ credit_account_id: id, business_id: businessId, type: 'payment', amount, notes }]);
    showToast('✅ Abono registrado'); document.getElementById('creditPaymentModal').style.display = 'none'; loadCredits();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function deleteCreditAccount(id) {
  if (!confirm('¿Eliminar cuenta de crédito?')) return;
  try { await supabaseClient.from('credit_accounts').delete().eq('id', id); showToast('🗑️ Eliminada'); loadCredits(); } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

// --- RECETAS ---
function addIngredientRow() {
  const container = document.getElementById('recipeIngredientsForm');
  const row = document.createElement('div');
  row.className = 'flex gap-2';
  row.innerHTML = '<input type="text" class="input !mt-0 flex-1 ri-name" placeholder="Ingrediente"><input type="text" class="input !mt-0 w-20 ri-qty" placeholder="Cant."><input type="text" class="input !mt-0 w-20 ri-unit" placeholder="Unidad"><input type="number" class="input !mt-0 w-24 ri-cost" placeholder="Costo" min="0">';
  container.appendChild(row);
}

async function loadRecipes() {
  if (!businessId) return;
  // Populate product dropdown
  const select = document.getElementById('recipeProduct');
  if (select && allProducts?.length) {
    select.innerHTML = '<option value="">Vincular a producto (opcional)</option>' + allProducts.map(p => `<option value="${p.id}">${p.name} - $${Number(p.price).toLocaleString()}</option>`).join('');
  }
  try {
    const { data } = await supabaseClient.from('recipes').select('*').eq('business_id', businessId).order('name');
    const container = document.getElementById('recipesList');
    if (!container) return;
    if (!data?.length) { container.innerHTML = '<p class="text-gray-400 text-center py-8">No hay recetas guardadas</p>'; return; }
    container.innerHTML = data.map(r => {
      const ingredients = r.ingredients || [];
      const totalCost = ingredients.reduce((s, i) => s + Number(i.cost || 0), 0);
      const linkedProduct = allProducts?.find(p => String(p.id) === String(r.product_id));
      const margin = linkedProduct ? (Number(linkedProduct.price) - totalCost) : null;
      return `<div class="p-4 bg-gray-50 rounded-2xl border border-gray-100">
        <div class="flex justify-between items-start">
          <div><p class="font-black text-lg">${r.name}</p>
            ${linkedProduct ? `<p class="text-xs text-orange-600 font-bold">🔗 ${linkedProduct.name} - Precio: $${Number(linkedProduct.price).toLocaleString()}</p>` : ''}
            <p class="text-xs text-gray-500 mt-1">Costo estimado: <strong class="text-red-600">$${totalCost.toLocaleString()}</strong>${margin !== null ? ` • Margen: <strong class="${margin >= 0 ? 'text-green-600' : 'text-red-600'}">$${margin.toLocaleString()}</strong>` : ''}</p>
          </div>
          <button onclick="deleteRecipe('${r.id}')" class="text-red-500 p-2">🗑️</button>
        </div>
        ${ingredients.length ? '<div class="mt-3 grid grid-cols-2 gap-1">' + ingredients.map(i => `<span class="text-xs bg-white px-2 py-1 rounded-lg">${i.name}: ${i.quantity} ${i.unit} ($${Number(i.cost || 0).toLocaleString()})</span>`).join('') + '</div>' : ''}
        ${r.instructions ? '<p class="text-xs text-gray-500 mt-2 italic">' + r.instructions + '</p>' : ''}
      </div>`;
    }).join('');
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

async function saveRecipe(event) {
  const name = document.getElementById('recipeName').value.trim();
  const productId = document.getElementById('recipeProduct').value || null;
  const instructions = document.getElementById('recipeInstructions').value.trim();
  if (!name) return showToast('⚠️ Nombre requerido', 'error');
  const rows = document.querySelectorAll('#recipeIngredientsForm > div');
  const ingredients = [];
  rows.forEach(row => {
    const n = row.querySelector('.ri-name')?.value?.trim();
    if (n) ingredients.push({ name: n, quantity: row.querySelector('.ri-qty')?.value || '', unit: row.querySelector('.ri-unit')?.value || '', cost: parseFloat(row.querySelector('.ri-cost')?.value) || 0 });
  });
  const estimatedCost = ingredients.reduce((s, i) => s + i.cost, 0);
  try {
    const { error } = await supabaseClient.from('recipes').insert([{ business_id: businessId, product_id: productId, name, ingredients, instructions, estimated_cost: estimatedCost }]);
    if (error) throw error;
    showToast('✅ Receta guardada'); document.getElementById('recipeName').value = ''; document.getElementById('recipeInstructions').value = '';
    document.getElementById('recipeIngredientsForm').innerHTML = '<div class="flex gap-2"><input type="text" class="input !mt-0 flex-1 ri-name" placeholder="Ingrediente"><input type="text" class="input !mt-0 w-20 ri-qty" placeholder="Cant."><input type="text" class="input !mt-0 w-20 ri-unit" placeholder="Unidad"><input type="number" class="input !mt-0 w-24 ri-cost" placeholder="Costo" min="0"></div>';
    loadRecipes();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function deleteRecipe(id) {
  if (!confirm('¿Eliminar receta?')) return;
  try { await supabaseClient.from('recipes').delete().eq('id', id); showToast('🗑️ Eliminada'); loadRecipes(); } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

// --- DIVIDIR CUENTA ---
function openSplitBillModal() {
  const o = window.currentActiveDetailOrder;
  if (!o) return;
  document.getElementById('splitOrderId').value = o.id;
  document.getElementById('splitTotal').textContent = 'Total: $' + Number(o.total).toLocaleString();
  document.getElementById('splitResult').classList.add('hidden');
  document.getElementById('splitBillModal').style.display = 'flex';
}

function splitBill(parts) {
  if (!parts || parts < 2) return showToast('⚠️ Mínimo 2 personas', 'error');
  const o = window.currentActiveDetailOrder;
  if (!o) return;
  const perPerson = Math.ceil(Number(o.total) / parts);
  const result = document.getElementById('splitResult');
  result.classList.remove('hidden');
  result.innerHTML = `<p class="text-center"><span class="text-3xl font-black text-green-700">$${perPerson.toLocaleString()}</span><br><span class="text-sm text-gray-500">por persona (${parts} personas)</span></p>`;
}

// --- IMPORTAR CSV ---
let importType = null;
function openImportModal(type) {
  importType = type;
  document.getElementById('importFile').value = '';
  document.getElementById('importPreview').innerHTML = '';
  if (type === 'customers') {
    document.getElementById('importModalTitle').textContent = '📤 Importar Clientes';
    document.getElementById('importModalDesc').textContent = 'Formato CSV: nombre, teléfono, dirección, barrio';
  } else {
    document.getElementById('importModalTitle').textContent = '📤 Importar Productos';
    document.getElementById('importModalDesc').textContent = 'Soporta archivos CSV y JSON.\n\nFormato CSV: nombre, precio, categoría, descripción, imagen_url, acompañamientos, límite_acompañamientos\n\nFormato JSON: Soporta "extras" anidados.';
  }
  document.getElementById('importModal').style.display = 'flex';
}

async function confirmImport() {
  const file = document.getElementById('importFile').files[0];
  if (!file) return showToast('⚠️ Selecciona un archivo', 'error');
  const text = await file.text();
  const fileName = file.name.toLowerCase();
  const btn = document.getElementById('btnImportConfirm'); btn.disabled = true; btn.textContent = '⏳...';
  
  try {
    if (importType === 'customers') {
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) throw new Error('Archivo CSV vacío o sin datos');
      const rows = lines.slice(1).map(l => { const cols = l.split(','); return { business_id: businessId, name: (cols[0] || '').trim(), phone: (cols[1] || '').trim(), address: (cols[2] || '').trim(), neighborhood: (cols[3] || '').trim() }; }).filter(r => r.name && r.phone);
      const { error } = await supabaseClient.from('customers').upsert(rows, { onConflict: 'business_id,phone' });
      if (error) throw error;
      showToast(`✅ ${rows.length} clientes importados`); loadCustomers();
    } else {
      let parsedProducts = [];
      
      if (fileName.endsWith('.json')) {
        let jsonData = JSON.parse(text);
        if (!Array.isArray(jsonData)) jsonData = [jsonData];
        parsedProducts = jsonData;
      } else {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error('Archivo CSV vacío o sin datos');
        parsedProducts = lines.slice(1).map(l => { 
          const cols = l.split(','); 
          return { 
            name: (cols[0] || '').trim(), 
            price: parseFloat(cols[1]) || 0, 
            category: (cols[2] || 'General').trim(), 
            description: (cols[3] || '').trim(),
            image_url: (cols[4] || '').trim() || null,
            accompaniments: (cols[5] || '').trim() || null,
            accompaniments_limit: parseInt(cols[6]) || null
          }; 
        });
      }
      
      const rows = parsedProducts.filter(r => r.name).map(p => ({
        business_id: businessId,
        name: p.name,
        price: Number(p.price) || 0,
        category: p.category || 'General',
        description: p.description || null,
        image_url: p.image_url || null,
        accompaniments: p.accompaniments || null,
        accompaniments_limit: p.accompaniments_limit || null,
        _extras: p.extras || null // Temporary field for JSON processing
      }));
      
      // Skip existing products
      const { data: existingProducts } = await supabaseClient.from('products').select('name').eq('business_id', businessId);
      const existingNames = new Set(existingProducts?.map(p => p.name.toLowerCase()) || []);
      const newRows = rows.filter(r => !existingNames.has(r.name.toLowerCase()));
      
      if (newRows.length > 0) {
        // Prepare rows without _extras for insertion
        const rowsToInsert = newRows.map(r => {
          const { _extras, ...rest } = r;
          return rest;
        });
        
        const { data: insertedProducts, error } = await supabaseClient.from('products').insert(rowsToInsert).select('id, name');
        if (error) throw error;
        
        // Insert product extras if provided in JSON
        let extrasToInsert = [];
        insertedProducts.forEach(insertedProd => {
          const originalRow = newRows.find(r => r.name.toLowerCase() === insertedProd.name.toLowerCase());
          if (originalRow && originalRow._extras && Array.isArray(originalRow._extras)) {
            originalRow._extras.forEach(extra => {
              extrasToInsert.push({
                business_id: businessId,
                product_id: insertedProd.id,
                name: extra.name,
                price: Number(extra.price) || 0,
                image_url: extra.image_url || null
              });
            });
          }
        });
        
        if (extrasToInsert.length > 0) {
          const { error: extrasError } = await supabaseClient.from('product_extras').insert(extrasToInsert);
          if (extrasError) console.error('Error importing product extras:', extrasError);
        }
      }
      showToast(`✅ ${newRows.length} productos importados (${rows.length - newRows.length} omitidos)`); loadProducts();
    }
    document.getElementById('importModal').style.display = 'none';
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = '✅ Importar'; }
}

async function exportProductsToCSV(event) {
  if (event) event.stopPropagation();
  
  if (typeof businessId === 'undefined' || !businessId) {
    return showToast('Error: No hay sucursal seleccionada', 'error');
  }

  try {
    const btn = event ? event.currentTarget : null;
    if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
    
    // Fetch products
    const { data: products, error } = await supabaseClient
      .from('products')
      .select('*')
      .eq('business_id', businessId)
      .order('category', { ascending: true });
      
    if (error) throw error;
    if (!products || products.length === 0) {
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      return showToast('No hay productos para exportar', 'error');
    }

    // Fetch product_extras
    const { data: extrasData, error: extrasError } = await supabaseClient
      .from('product_extras')
      .select('*')
      .eq('business_id', businessId);
      
    if (extrasError) console.error("Error fetching extras:", extrasError);
    const allExtras = extrasData || [];

    // Assemble JSON
    const exportData = products.map(p => {
      const pExtras = allExtras.filter(e => e.product_id === p.id).map(e => ({
        name: e.name,
        price: Number(e.price) || 0,
        image_url: e.image_url || null
      }));
      
      return {
        name: p.name || '',
        price: Number(p.price) || 0,
        category: p.category || 'General',
        description: p.description || '',
        image_url: p.image_url || null,
        accompaniments: p.accompaniments || null,
        accompaniments_limit: p.accompaniments_limit || null,
        extras: pExtras.length > 0 ? pExtras : null
      };
    });

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `menu_export_${businessId.substring(0,6)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('✅ Menú exportado correctamente en formato JSON');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  } catch (err) {
    showToast('❌ Error al exportar: ' + err.message, 'error');
  }
}

// --- ASIGNAR REPARTIDOR ---
async function assignDriver() {
  const o = window.currentActiveDetailOrder;
  if (!o) return;
  try {
    const { data: drivers } = await supabaseClient.from('delivery_drivers').select('*').eq('business_id', businessId);
    if (!drivers?.length) {
      const name = prompt('No hay repartidores. Crea uno nuevo.\nNombre del repartidor:');
      if (!name) return;
      const phone = prompt('Teléfono (opcional):') || '';
      await supabaseClient.from('delivery_drivers').insert([{ business_id: businessId, name, phone }]);
      showToast('✅ Repartidor creado'); return;
    }
    const list = drivers.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
    const choice = prompt('Selecciona repartidor:\n' + list);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= drivers.length) return showToast('⚠️ Opción inválida', 'error');
    await supabaseClient.from('orders').update({ driver_id: drivers[idx].id }).eq('id', o.id);
    showToast('✅ Repartidor asignado: ' + drivers[idx].name);
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}
