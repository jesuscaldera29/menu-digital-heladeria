// ===== POS.JS - PUNTO DE VENTA CAJEROS (v2 - COMPLETO) =====
let products = [];
let categories = [];
let activeCategory = 'Todos';
let posCart = {};
let businessId = localStorage.getItem('staff_business_id');
let staffId = localStorage.getItem('staff_id');
let staffName = localStorage.getItem('staff_name');
let currency = 'COP';
let allVisualExtras = [];
let currentExtrasProductId = null;
let selectedVisualExtras = [];
let selectedAccompaniments = [];
let posSettings = {};

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast hidden', 3000);
}

// === AUTHENTICATION & INIT ===
async function initPOS() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  if (!businessId || !staffId) {
    const { data: staffMember } = await supabaseClient.from('staff').select('*').eq('user_id', session.user.id).single();
    if (staffMember) {
      businessId = staffMember.business_id;
      staffId = staffMember.id;
      staffName = staffMember.name;
    } else {
      const { data: biz } = await supabaseClient.from('businesses').select('id, business_name').eq('owner_id', session.user.id).single();
      if (biz) { businessId = biz.id; staffName = "Administrador"; }
      else { window.location.href = 'login.html'; return; }
    }
  }

  document.getElementById('cashierName').textContent = '👤 ' + (staffName || 'Cajero').toUpperCase();
  await loadSettings();
  await loadProducts();
  await loadVisualExtras();

  // Init Auto-Print
  autoPrintEnabled = localStorage.getItem('pos_auto_print') === 'true';
  updateAutoPrintUI();
  subscribeToOnlineOrders();
}

let autoPrintEnabled = false;

function toggleAutoPrint() {
  autoPrintEnabled = !autoPrintEnabled;
  localStorage.setItem('pos_auto_print', autoPrintEnabled);
  updateAutoPrintUI();
  if (autoPrintEnabled) {
    showToast('🖨️ Auto-impresión activada. Recuerda configurar Chrome con --kiosk-printing.');
  }
}

function updateAutoPrintUI() {
  const btn = document.getElementById('btnAutoPrint');
  const txt = document.getElementById('autoPrintText');
  if (!btn || !txt) return;
  if (autoPrintEnabled) {
    btn.classList.replace('text-gray-400', 'text-green-400');
    btn.classList.replace('border-[#333]', 'border-green-500/50');
    btn.classList.add('bg-green-500/10');
    txt.textContent = 'Auto-Print: ON';
  } else {
    btn.classList.replace('text-green-400', 'text-gray-400');
    btn.classList.replace('border-green-500/50', 'border-[#333]');
    btn.classList.remove('bg-green-500/10');
    txt.textContent = 'Auto-Print: OFF';
  }
}

function subscribeToOnlineOrders() {
  supabaseClient
    .channel('pos-online-orders')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      },
      (payload) => {
        // Play notification sound
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log('Audio blocked', e));
        } catch(e) {}
        
        // Auto print if enabled
        if (autoPrintEnabled) {
          showToast('🖨️ Imprimiendo nuevo pedido online...');
          printPOSTicket(payload.new);
        } else {
          showToast('🛎️ Nuevo pedido online recibido');
        }
      }
    )
    .subscribe();
}

async function loadSettings() {
  if (!businessId) return;
  const { data } = await supabaseClient.from('settings').select('*').eq('business_id', businessId).single();
  if (data) {
    posSettings = data;
    currency = data.currency || 'COP';
    document.getElementById('headerBizName').textContent = (data.business_name || 'POS').toUpperCase();

    // Logo in header
    if (data.logo_url) {
      const logo = document.getElementById('headerLogo');
      if (logo) { logo.innerHTML = `<img src="${data.logo_url}" class="w-full h-full rounded-xl object-cover">`; }
    }

    // Populate table selector
    if (data.table_count) {
      const sel = document.getElementById('tableNumber');
      if (sel) {
        let opts = '<option value="">Seleccionar mesa</option>';
        for (let i = 1; i <= data.table_count; i++) opts += `<option value="${i}">Mesa ${i}</option>`;
        sel.innerHTML = opts;
      }
    }

    if (data.brand_color) {
      const style = document.createElement('style');
      style.innerHTML = `
        .text-orange-500 { color: ${data.brand_color} !important; }
        .bg-orange-500 { background-color: ${data.brand_color} !important; }
        .from-orange-500 { --tw-gradient-from: ${data.brand_color} !important; }
        .border-orange-500 { border-color: ${data.brand_color} !important; }
        .category-tab.active { background-color: ${data.brand_color} !important; border-color: ${data.brand_color} !important; color: white !important; }
        .order-type-btn.active { background-color: ${data.brand_color} !important; border-color: ${data.brand_color} !important; color: white !important; }
        .payment-btn.active { background-color: ${data.brand_color} !important; border-color: ${data.brand_color} !important; color: white !important; }
      `;
      document.head.appendChild(style);
    }
  }
}

async function loadProducts() {
  const { data, error } = await supabaseClient.from('products').select('*').eq('business_id', businessId).eq('available', true).order('category').order('name');
  if (error) { showToast('Error cargando productos', 'error'); return; }
  products = data || [];
  categories = ['Todos', ...new Set(products.map(p => p.category).filter(c => c && c !== 'Acompañantes' && c !== 'Acompañantes del dia'))];
  renderCategories();
  renderProducts();
}

async function loadVisualExtras() {
  try {
    const { data } = await supabaseClient.from('product_extras').select('*').eq('business_id', businessId);
    allVisualExtras = data || [];
  } catch (e) { allVisualExtras = []; }
}

// === RENDERING ===
function renderCategories() {
  const container = document.getElementById('categoriesList');
  container.innerHTML = categories.map(c => `
    <button class="category-tab px-3 py-2 rounded-xl text-xs md:text-sm font-bold border border-[#333] text-gray-400 hover:bg-[#222] ${c === activeCategory ? 'active' : ''}" onclick="setCategory('${c}')">${c}</button>
  `).join('');
}

function setCategory(cat) { activeCategory = cat; renderCategories(); renderProducts(); }

function renderProducts() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const container = document.getElementById('productsGrid');
  let filtered = products.filter(p => p.category !== 'Acompañantes' && p.category !== 'Acompañantes del dia');
  if (activeCategory !== 'Todos') filtered = filtered.filter(p => p.category === activeCategory);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));

  if (!filtered.length) {
    container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-10 font-bold">No hay productos</div>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    const hasExtras = allVisualExtras.some(e => String(e.product_id) === String(p.id));
    const hasAcc = p.accompaniments && p.accompaniments.trim().length > 0;
    return `
    <div class="bg-[#111] border border-[#222] rounded-xl overflow-hidden cursor-pointer hover:border-gray-600 transition-all active:scale-95 select-none flex flex-col h-full" onclick="handleProductClick('${p.id}')">
      <div class="h-20 md:h-24 bg-[#1a1a1a] flex items-center justify-center overflow-hidden shrink-0 relative">
        ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-3xl">🍽️</span>`}
        ${(hasExtras || hasAcc) ? '<span class="absolute top-1 right-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-lg">+Extras</span>' : ''}
      </div>
      <div class="p-2 md:p-3 flex flex-col flex-1">
        <h3 class="text-xs md:text-sm font-bold leading-tight mb-1 line-clamp-2">${p.name}</h3>
        <p class="text-orange-500 font-black text-sm mt-auto">$${Number(p.price).toLocaleString()}</p>
      </div>
    </div>`;
  }).join('');
}

// === PRODUCT CLICK: Open extras modal or add directly ===
function handleProductClick(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;

  const extras = allVisualExtras.filter(e => String(e.product_id) === String(id));
  const accList = (p.accompaniments && p.accompaniments.trim()) ? p.accompaniments.split(',').map(a => a.trim()).filter(Boolean) : [];

  if (extras.length === 0 && accList.length === 0) {
    addToCartDirect(id);
    return;
  }
  openExtrasModal(id, extras, accList);
}

function openExtrasModal(productId, extras, accList) {
  currentExtrasProductId = productId;
  selectedVisualExtras = [];
  selectedAccompaniments = [];
  const p = products.find(x => String(x.id) === String(productId));
  if (!p) return;

  document.getElementById('extrasModalTitle').textContent = p.name;
  const limit = p.accompaniments_limit;
  document.getElementById('extrasModalLimit').textContent = limit ? `Máx. ${limit} selecciones` : '';

  let html = '';
  // Text-based accompaniments
  if (accList.length > 0) {
    html += '<p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Acompañamientos</p>';
    html += '<div class="grid grid-cols-2 gap-2">';
    accList.forEach((a, i) => {
      html += `<label class="flex items-center gap-2 bg-[#222] rounded-xl p-2.5 cursor-pointer border border-[#333] hover:border-orange-500 transition-colors">
        <input type="checkbox" class="acc-check w-4 h-4 accent-orange-500" value="${a}" onchange="updateExtrasTotal()">
        <span class="text-sm text-white font-bold truncate">${a}</span>
      </label>`;
    });
    html += '</div>';
  }

  // Visual extras
  if (extras.length > 0) {
    html += '<p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2 mt-4">Extras</p>';
    html += '<div class="grid grid-cols-2 gap-2">';
    extras.forEach(e => {
      html += `<label class="flex items-center gap-2 bg-[#222] rounded-xl p-2.5 cursor-pointer border border-[#333] hover:border-orange-500 transition-colors">
        <input type="checkbox" class="ve-check w-4 h-4 accent-orange-500" data-id="${e.id}" data-name="${e.name}" data-price="${e.price}" onchange="updateExtrasTotal()">
        ${e.image_url ? `<img src="${e.image_url}" class="w-8 h-8 rounded-full object-cover shrink-0">` : ''}
        <div class="min-w-0">
          <span class="text-xs text-white font-bold block truncate">${e.name}</span>
          <span class="text-[10px] text-orange-400 font-bold">${Number(e.price) > 0 ? '+$' + Number(e.price).toLocaleString() : 'GRATIS'}</span>
        </div>
      </label>`;
    });
    html += '</div>';
  }

  document.getElementById('extrasModalContent').innerHTML = html;
  updateExtrasTotal();
  document.getElementById('extrasModal').classList.remove('hidden');
}

function updateExtrasTotal() {
  const p = products.find(x => String(x.id) === String(currentExtrasProductId));
  if (!p) return;
  let total = Number(p.price);
  document.querySelectorAll('.ve-check:checked').forEach(el => { total += Number(el.dataset.price || 0); });
  document.getElementById('extrasModalTotal').textContent = '$' + total.toLocaleString();
}

function closeExtrasModal() {
  document.getElementById('extrasModal').classList.add('hidden');
  currentExtrasProductId = null;
}

function addToCartWithoutExtras() {
  if (!currentExtrasProductId) return;
  addToCartDirect(currentExtrasProductId);
  closeExtrasModal();
}

function confirmExtrasAndAdd() {
  if (!currentExtrasProductId) return;
  const p = products.find(x => String(x.id) === String(currentExtrasProductId));
  if (!p) return;

  const accChecked = [];
  document.querySelectorAll('.acc-check:checked').forEach(el => accChecked.push(el.value));

  const veChecked = [];
  document.querySelectorAll('.ve-check:checked').forEach(el => {
    veChecked.push({ id: el.dataset.id, name: el.dataset.name, price: Number(el.dataset.price || 0) });
  });

  // Validate limit
  const totalSelected = accChecked.length + veChecked.length;
  if (p.accompaniments_limit && totalSelected > p.accompaniments_limit) {
    showToast(`⚠️ Máximo ${p.accompaniments_limit} selecciones`, 'error');
    return;
  }

  let extrasTotal = veChecked.reduce((s, v) => s + v.price, 0);
  const itemPrice = Number(p.price) + extrasTotal;

  // Build unique key
  const accKey = accChecked.join(',');
  const veKey = veChecked.map(v => v.id).sort().join(',');
  const key = `${p.id}_${accKey}_${veKey}`;

  const extrasLabel = [...accChecked, ...veChecked.map(v => v.price > 0 ? `${v.name} (+$${v.price.toLocaleString()})` : v.name)];

  if (posCart[key]) {
    posCart[key].qty++;
  } else {
    posCart[key] = { id: p.id, qty: 1, price: itemPrice, name: p.name, extrasLabel: extrasLabel.length ? extrasLabel.join(', ') : '' };
  }

  updateCartUI();
  closeExtrasModal();
  showToast('✅ Agregado');
}

// === CART LOGIC ===
function addToCartDirect(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;
  const key = `${id}__`;
  if (posCart[key]) { posCart[key].qty++; }
  else { posCart[key] = { id, qty: 1, price: Number(p.price), name: p.name, extrasLabel: '' }; }
  updateCartUI();
  showToast('✅ Agregado');
}

function removeFromCart(key) {
  if (!posCart[key]) return;
  if (posCart[key].qty > 1) posCart[key].qty--;
  else delete posCart[key];
  updateCartUI();
}

function addOneMore(key) {
  if (posCart[key]) { posCart[key].qty++; updateCartUI(); }
}

function clearCart() { posCart = {}; updateCartUI(); }

function getCartTotal() {
  let total = 0;
  Object.values(posCart).forEach(item => { total += item.price * item.qty; });
  return total;
}

function updateCartUI() {
  const container = document.getElementById('cartList');
  const btnCheckout = document.getElementById('btnCheckout');
  const keys = Object.keys(posCart);
  const total = getCartTotal();
  const itemCount = Object.values(posCart).reduce((s, i) => s + i.qty, 0);

  // Badge
  const badge = document.getElementById('cartBadge');
  badge.textContent = itemCount;
  badge.classList.remove('animate-ping');
  void badge.offsetWidth; // trigger reflow
  badge.classList.add('animate-pulse');
  document.getElementById('cartTotalMini').textContent = '$' + total.toLocaleString();

  if (!keys.length) {
    container.innerHTML = '<div class="text-center text-gray-500 mt-6 text-sm font-bold">Carrito vacío<br>Selecciona productos</div>';
    document.getElementById('cartSubtotal').textContent = '$0';
    document.getElementById('cartTotal').textContent = '$0';
    btnCheckout.disabled = true;
    btnCheckout.classList.add('opacity-50', 'cursor-not-allowed');
    return;
  }

  let html = '';
  keys.forEach(k => {
    const item = posCart[k];
    const sub = item.price * item.qty;
    html += `
      <div class="bg-[#1a1a1a] rounded-xl p-2.5 border border-[#333]">
        <div class="flex justify-between items-start gap-2">
          <div class="min-w-0 flex-1">
            <span class="font-bold text-xs md:text-sm leading-tight block truncate">${item.name}</span>
            ${item.extrasLabel ? `<span class="text-[10px] text-gray-500 block truncate mt-0.5">${item.extrasLabel}</span>` : ''}
          </div>
          <span class="font-black text-orange-500 text-sm shrink-0">$${sub.toLocaleString()}</span>
        </div>
        <div class="flex items-center justify-between mt-1.5">
          <span class="text-[10px] text-gray-500">$${item.price.toLocaleString()} c/u</span>
          <div class="flex items-center gap-2 bg-[#0a0a0a] rounded-lg p-0.5 border border-[#222]">
            <button class="w-6 h-6 rounded flex items-center justify-center font-bold bg-[#222] text-gray-300 hover:text-white text-sm" onclick="removeFromCart('${k}')">−</button>
            <span class="font-bold text-xs min-w-[1rem] text-center">${item.qty}</span>
            <button class="w-6 h-6 rounded flex items-center justify-center font-bold bg-[#222] text-gray-300 hover:text-white text-sm" onclick="addOneMore('${k}')">+</button>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
  document.getElementById('cartSubtotal').textContent = '$' + total.toLocaleString();
  document.getElementById('cartTotal').textContent = '$' + total.toLocaleString();
  btnCheckout.disabled = false;
  btnCheckout.classList.remove('opacity-50', 'cursor-not-allowed');
}

// === MOBILE CART TOGGLE ===
function toggleMobileCart() {
  if (window.innerWidth >= 768) return;
  const panel = document.getElementById('cartPanel');
  const chevron = document.getElementById('cartChevron');
  panel.classList.toggle('collapsed');
  if (chevron) chevron.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
}

// === CHECKOUT MODAL ===
function openCheckoutModal() {
  if (!Object.keys(posCart).length) return;
  const total = getCartTotal();
  document.getElementById('modalTotal').textContent = '$' + total.toLocaleString();
  document.getElementById('cashReceived').value = '';
  document.getElementById('changeDisplay').classList.add('hidden');
  document.getElementById('insufficientDisplay').classList.add('hidden');
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() { document.getElementById('checkoutModal').classList.add('hidden'); }

function selectOrderType(type, el) {
  document.getElementById('orderType').value = type;
  document.querySelectorAll('.order-type-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-orange-500', 'text-white', 'border-orange-500');
    btn.classList.add('bg-[#222]', 'text-gray-300', 'border-[#333]');
  });
  el.classList.remove('bg-[#222]', 'text-gray-300', 'border-[#333]');
  el.classList.add('active', 'bg-orange-500', 'text-white', 'border-orange-500');

  document.getElementById('tableSelector').classList.toggle('hidden', type !== 'A la mesa');
  document.getElementById('addressField').classList.toggle('hidden', type !== 'Domicilio');
  document.getElementById('phoneField').classList.toggle('hidden', type !== 'Domicilio');
}

function selectPayment(method, el) {
  document.getElementById('paymentMethod').value = method;
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-orange-500', 'text-white', 'border-orange-500');
    btn.classList.add('bg-[#222]', 'text-gray-300', 'border-[#333]');
  });
  el.classList.remove('bg-[#222]', 'text-gray-300', 'border-[#333]');
  el.classList.add('active', 'bg-orange-500', 'text-white', 'border-orange-500');

  document.getElementById('cashAmountSection').classList.toggle('hidden', method !== 'Efectivo');
  
  const splitSection = document.getElementById('splitPaymentSection');
  if (splitSection) {
    splitSection.classList.toggle('hidden', method !== 'Dividido');
    if (method === 'Dividido') calculateSplitTotal();
  }
}

function calculateSplitTotal() {
  const total = getCartTotal();
  const c = parseFloat(document.getElementById('splitCash').value) || 0;
  const t = parseFloat(document.getElementById('splitCard').value) || 0;
  const f = parseFloat(document.getElementById('splitTransfer').value) || 0;
  const sum = c + t + f;
  
  const remainingEl = document.getElementById('splitRemaining');
  if (sum === total) {
    remainingEl.textContent = '¡Completo!';
    remainingEl.className = 'text-lg font-black text-green-500';
  } else if (sum > total) {
    remainingEl.textContent = 'Excedido en: $' + (sum - total).toLocaleString();
    remainingEl.className = 'text-lg font-black text-red-500';
  } else {
    remainingEl.textContent = '$' + (total - sum).toLocaleString();
    remainingEl.className = 'text-lg font-black text-red-500';
  }
}

function calculateChange() {
  const total = getCartTotal();
  const received = parseFloat(document.getElementById('cashReceived').value) || 0;
  const changeEl = document.getElementById('changeDisplay');
  const insuffEl = document.getElementById('insufficientDisplay');

  if (received <= 0) { changeEl.classList.add('hidden'); insuffEl.classList.add('hidden'); return; }

  if (received >= total) {
    const change = received - total;
    document.getElementById('changeAmount').textContent = '$' + change.toLocaleString();
    changeEl.classList.remove('hidden');
    insuffEl.classList.add('hidden');
  } else {
    changeEl.classList.add('hidden');
    insuffEl.classList.remove('hidden');
  }
}

async function confirmSale() {
  const keys = Object.keys(posCart);
  if (!keys.length) return;

  const paymentMethod = document.getElementById('paymentMethod').value;
  const orderType = document.getElementById('orderType').value;
  const customerName = document.getElementById('customerName').value.trim() || 'Mostrador';

  // Validate cash payment
  if (paymentMethod === 'Efectivo') {
    const received = parseFloat(document.getElementById('cashReceived').value) || 0;
    const total = getCartTotal();
    if (received > 0 && received < total) {
      showToast('⚠️ Monto insuficiente', 'error');
      return;
    }
  }

  let splitPaymentsJSON = {};
  if (paymentMethod === 'Dividido') {
    const c = parseFloat(document.getElementById('splitCash').value) || 0;
    const t = parseFloat(document.getElementById('splitCard').value) || 0;
    const f = parseFloat(document.getElementById('splitTransfer').value) || 0;
    const sum = c + t + f;
    const total = getCartTotal();
    
    if (sum !== total) {
      showToast('⚠️ La suma dividida debe ser exactamente igual al total ($' + total.toLocaleString() + ')', 'error');
      return;
    }
    splitPaymentsJSON = { cash: c, card: t, transfer: f };
  }

  // Build address
  let address = 'POS - Local';
  if (orderType === 'A la mesa') {
    const mesa = document.getElementById('tableNumber').value;
    address = mesa ? 'Mesa ' + mesa : 'Mesa (sin especificar)';
  } else if (orderType === 'Domicilio') {
    address = document.getElementById('deliveryAddress').value.trim() || 'Sin dirección';
  } else if (orderType === 'Para Llevar') {
    address = 'Para llevar';
  }

  const customerPhone = document.getElementById('customerPhone')?.value?.trim() || 'N/A';

  const btn = document.getElementById('btnConfirmSale');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Procesando...';
  btn.disabled = true;

  try {
    let total = 0;
    const items = [];
    keys.forEach(k => {
      const item = posCart[k];
      total += item.price * item.qty;
      items.push({ id: item.id, name: item.extrasLabel ? `${item.name} (${item.extrasLabel})` : item.name, price: item.price, qty: item.qty });
    });

    const { data: insertedOrder, error } = await supabaseClient.from('orders').insert([{
      business_id: businessId,
      customer_name: customerName,
      customer_phone: customerPhone,
      address: address,
      delivery_method: orderType,
      payment_method: paymentMethod,
      split_payments: Object.keys(splitPaymentsJSON).length ? splitPaymentsJSON : null,
      items: items,
      total: total,
      status: 'Entregado'
    }]).select();

    if (error) throw error;

    showToast('✅ Venta registrada');
    
    if (insertedOrder && insertedOrder.length > 0) {
      printPOSTicket(insertedOrder[0]);
    }

    closeCheckoutModal();
    clearCart();
  } catch (error) {
    console.error(error);
    showToast('❌ Error: ' + error.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function logout() {
  if (!confirm('¿Seguro que deseas cerrar tu turno?')) return;

  // Record shift end time
  const sessionId = localStorage.getItem('staff_session_id');
  if (sessionId) {
    try {
      await supabaseClient.from('staff_sessions').update({
        logout_at: new Date().toISOString()
      }).eq('id', sessionId);
    } catch(e) { console.warn('Could not update staff session'); }
  }

  await supabaseClient.auth.signOut();
  localStorage.clear();
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', initPOS);

function printPOSTicket(o) {
  const itemsHtml = o.items.map(item => \
      <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #ccc;padding:4px 0;">\ +
          \<span>\x \</span>\ +
          \<span>$\</span>\ +
      \</div>\
  ).join('');

  const logoUrl = posSettings.logo_url ? \<img src="\" style="max-width: 60mm; max-height: 40mm; object-fit: contain; margin-bottom: 10px;">\ : '';

  const html = \
  <html>
    <head>
      <title>Ticket #\</title>
      <style>
        body { font-family: 'Courier New', Courier, monospace; font-size: 14px; margin: 0; padding: 10px; width: 80mm; color: #000; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .mb-2 { margin-bottom: 8px; }
        .border-b { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .border-t { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
        .flex { display: flex; justify-content: space-between; }
        @media print { body { width: 100%; margin:0; padding:0; } }
      </style>
    </head>
    <body>
      <div class="text-center mb-2">\</div>
      <div class="text-center border-b font-bold text-lg">
        TICKET DE VENTA<br>#\
      </div>
      <div class="mb-2" style="margin-top:10px;">
        <strong>Fecha:</strong> \<br>
        <strong>Cliente:</strong> \<br>
        <strong>Tipo:</strong> \<br>
        <strong>Pago:</strong> \
      </div>
      <div class="border-t border-b mb-2" style="margin-top:10px;">
        \
      </div>
      <div class="flex border-t font-bold text-lg" style="margin-top:10px; padding-top:10px;">
        <span>TOTAL:</span>
        <span>$\</span>
      </div>
      <div class="text-center border-t text-sm" style="margin-top:20px; padding-top:10px;">
        �Gracias por su compra!
      </div>
      <script>
        setTimeout(() => { window.print(); window.close(); }, 500);
      </script>
    </body>
  </html>\;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
}

// TABLES MODAL LOGIC
window.openTablesModal = async function() {
  document.getElementById('tablesModal').classList.remove('hidden');
  
  const container = document.getElementById('tablesGrid');
  container.innerHTML = '<div class="col-span-full py-10 text-center text-gray-500">Cargando estado de mesas...</div>';
  
  if (!posSettings || !posSettings.table_count) {
    container.innerHTML = '<div class="col-span-full py-10 text-center text-gray-500">No hay mesas configuradas en el administrador.</div>';
    return;
  }
  
  try {
    const { data: activeOrders, error } = await supabaseClient
      .from('orders')
      .select('id, address, status, total, created_at')
      .eq('business_id', businessId)
      .eq('delivery_method', 'A la mesa')
      .in('status', ['Pendiente', 'En preparación']);
      
    if (error) throw error;
    
    let html = '';
    for (let i = 1; i <= posSettings.table_count; i++) {
      // Look for an order matching "Mesa X"
      const order = activeOrders?.find(o => String(o.address) === `Mesa ${i}`);
      
      if (order) {
        // Ocupada
        const timeDiff = Math.floor((new Date() - new Date(order.created_at)) / 60000);
        html += `
          <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-red-500/20 transition-all text-center">
            <span class="text-3xl mb-2">🔴</span>
            <span class="font-black text-white text-lg whitespace-nowrap">Mesa ${i}</span>
            <span class="text-[10px] font-bold text-red-400 mt-1 uppercase tracking-widest">Ocupada</span>
            <span class="text-[10px] text-gray-400 mt-1">Pedido #${order.id}</span>
            <span class="text-[10px] text-gray-400">${timeDiff} min</span>
          </div>
        `;
      } else {
        // Libre
        html += `
          <div onclick="startTableOrder(${i})" class="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-green-500/20 transition-all text-center">
            <span class="text-3xl mb-2">🟢</span>
            <span class="font-black text-white text-lg whitespace-nowrap">Mesa ${i}</span>
            <span class="text-[10px] font-bold text-green-400 mt-1 uppercase tracking-widest">Libre</span>
            <span class="text-[10px] text-gray-400 mt-1 opacity-0">-</span>
            <span class="text-[10px] text-gray-400 opacity-0">-</span>
          </div>
        `;
      }
    }
    
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div class="col-span-full py-10 text-center text-red-500">Error cargando mesas.</div>';
    console.error(err);
  }
};

window.closeTablesModal = function() {
  document.getElementById('tablesModal').classList.add('hidden');
};

window.startTableOrder = function(tableNum) {
  closeTablesModal();
  document.getElementById('orderType').value = 'A la mesa';
  toggleDeliveryFields();
  const sel = document.getElementById('tableNumber');
  if (sel) sel.value = tableNum;
  showToast(`✅ Iniciando pedido para Mesa ${tableNum}`);
};

