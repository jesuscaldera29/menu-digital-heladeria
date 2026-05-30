// ===== POS.JS - PUNTO DE VENTA CAJEROS =====
let products = [];
let categories = [];
let activeCategory = 'Todos';
let posCart = {};
let businessId = localStorage.getItem('staff_business_id');
let staffId = localStorage.getItem('staff_id');
let staffName = localStorage.getItem('staff_name');
let currency = 'COP';

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
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  
  if (!businessId || !staffId) {
    // Attempt to verify owner or reload staff
    const { data: staffMember } = await supabaseClient.from('staff').select('*').eq('user_id', session.user.id).single();
    if (staffMember) {
      businessId = staffMember.business_id;
      staffId = staffMember.id;
      staffName = staffMember.name;
    } else {
      const { data: biz } = await supabaseClient.from('businesses').select('id, name').eq('owner_id', session.user.id).single();
      if (biz) {
        businessId = biz.id;
        staffName = "Administrador";
      } else {
        window.location.href = 'login.html';
        return;
      }
    }
  }

  document.getElementById('cashierName').textContent = '👤 ' + (staffName || 'Cajero').toUpperCase();

  await loadSettings();
  await loadProducts();
}

async function loadSettings() {
  if (!businessId) return;
  const { data } = await supabaseClient.from('settings').select('*').eq('business_id', businessId).single();
  if (data) {
    currency = data.currency || 'COP';
    document.getElementById('headerBizName').textContent = (data.business_name || 'POS').toUpperCase();
    
    // Inject brand color dynamically to POS too
    if (data.brand_color) {
      const style = document.createElement('style');
      style.innerHTML = `
        .text-orange-500 { color: ${data.brand_color} !important; }
        .bg-orange-500 { background-color: ${data.brand_color} !important; }
        .from-orange-500 { --tw-gradient-from: ${data.brand_color} !important; }
        .shadow-orange-500\\/20 { box-shadow: 0 4px 14px 0 ${data.brand_color}33 !important; }
        .shadow-orange-500\\/25 { box-shadow: 0 10px 15px -3px ${data.brand_color}40 !important; }
        .border-orange-500 { border-color: ${data.brand_color} !important; }
        .category-tab.active { background-color: ${data.brand_color} !important; border-color: ${data.brand_color} !important; color: white !important; }
      `;
      document.head.appendChild(style);
    }
  }
}

async function loadProducts() {
  const { data, error } = await supabaseClient.from('products').select('*').eq('business_id', businessId).order('category').order('name');
  if (error) {
    showToast('Error cargando productos', 'error');
    return;
  }
  products = data || [];
  
  categories = ['Todos', ...new Set(products.map(p => p.category).filter(c => c && c !== 'Acompañantes' && c !== 'Acompañantes del dia'))];
  renderCategories();
  renderProducts();
}

// === RENDERING ===
function renderCategories() {
  const container = document.getElementById('categoriesList');
  container.innerHTML = categories.map(c => `
    <button class="category-tab px-4 py-2 rounded-xl text-sm font-bold border border-[#333] text-gray-400 hover:bg-[#222] ${c === activeCategory ? 'active' : ''}" onclick="setCategory('${c}')">${c}</button>
  `).join('');
}

function setCategory(cat) {
  activeCategory = cat;
  renderCategories();
  renderProducts();
}

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

  container.innerHTML = filtered.map(p => `
    <div class="bg-[#111] border border-[#222] rounded-xl overflow-hidden cursor-pointer hover:border-gray-600 transition-all active:scale-95 select-none flex flex-col h-full" onclick="addToCart('${p.id}')">
      <div class="h-24 bg-[#1a1a1a] flex items-center justify-center overflow-hidden shrink-0">
        ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-cover">` : `<span class="text-3xl">🍽️</span>`}
      </div>
      <div class="p-3 flex flex-col flex-1">
        <h3 class="text-sm font-bold leading-tight mb-1 line-clamp-2">${p.name}</h3>
        <p class="text-orange-500 font-black mt-auto">$${Number(p.price).toLocaleString()}</p>
      </div>
    </div>
  `).join('');
}

// === CART LOGIC ===
function addToCart(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;

  // Si tiene acompañamientos, para un POS rápido los ignoramos o se podría abrir un modal. 
  // Para agilidad, agregamos directo al carrito sin acompañamientos.
  
  if (posCart[id]) {
    posCart[id].qty++;
  } else {
    posCart[id] = { id, qty: 1, price: p.price, name: p.name };
  }
  
  updateCartUI();
}

function removeFromCart(id) {
  if (!posCart[id]) return;
  if (posCart[id].qty > 1) {
    posCart[id].qty--;
  } else {
    delete posCart[id];
  }
  updateCartUI();
}

function clearCart() {
  posCart = {};
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById('cartList');
  const btnCheckout = document.getElementById('btnCheckout');
  
  const keys = Object.keys(posCart);
  if (!keys.length) {
    container.innerHTML = '<div class="text-center text-gray-500 mt-10 text-sm font-bold">Carrito vacío<br>Selecciona productos a la izquierda</div>';
    document.getElementById('cartSubtotal').textContent = '$0';
    document.getElementById('cartTotal').textContent = '$0';
    document.getElementById('modalTotal').textContent = '$0';
    btnCheckout.disabled = true;
    btnCheckout.classList.add('opacity-50', 'cursor-not-allowed');
    return;
  }

  let total = 0;
  let html = '';
  keys.forEach(k => {
    const item = posCart[k];
    const sub = item.price * item.qty;
    total += sub;
    html += `
      <div class="bg-[#1a1a1a] rounded-xl p-3 border border-[#333] flex flex-col gap-2">
        <div class="flex justify-between items-start">
          <span class="font-bold text-sm leading-tight pr-2">${item.name}</span>
          <span class="font-black text-orange-500 shrink-0">$${sub.toLocaleString()}</span>
        </div>
        <div class="flex items-center justify-between mt-1">
          <span class="text-xs text-gray-500">$${item.price.toLocaleString()} c/u</span>
          <div class="flex items-center gap-3 bg-[#0a0a0a] rounded-lg p-1 border border-[#222]">
            <button class="w-6 h-6 rounded flex items-center justify-center font-bold bg-[#222] text-gray-300 hover:text-white" onclick="removeFromCart('${k}')">−</button>
            <span class="font-bold text-sm min-w-[1.2rem] text-center">${item.qty}</span>
            <button class="w-6 h-6 rounded flex items-center justify-center font-bold bg-[#222] text-gray-300 hover:text-white" onclick="addToCart('${k}')">+</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  document.getElementById('cartSubtotal').textContent = '$' + total.toLocaleString();
  document.getElementById('cartTotal').textContent = '$' + total.toLocaleString();
  document.getElementById('modalTotal').textContent = '$' + total.toLocaleString();
  
  btnCheckout.disabled = false;
  btnCheckout.classList.remove('opacity-50', 'cursor-not-allowed');
}

// === CHECKOUT MODAL ===
function openCheckoutModal() {
  if (!Object.keys(posCart).length) return;
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.add('hidden');
}

function selectPayment(method, el) {
  document.getElementById('paymentMethod').value = method;
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-orange-500', 'text-white', 'border-orange-500');
    btn.classList.add('bg-[#222]', 'text-gray-300', 'border-[#333]');
  });
  el.classList.remove('bg-[#222]', 'text-gray-300', 'border-[#333]');
  el.classList.add('active', 'bg-orange-500', 'text-white', 'border-orange-500');
}

async function confirmSale() {
  const keys = Object.keys(posCart);
  if (!keys.length) return;
  
  const paymentMethod = document.getElementById('paymentMethod').value;
  const customerName = document.getElementById('customerName').value.trim() || 'Mostrador';
  
  const btn = document.getElementById('btnConfirmSale');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Procesando...';
  btn.disabled = true;

  try {
    let total = 0;
    const items = [];
    keys.forEach(k => {
      total += posCart[k].price * posCart[k].qty;
      items.push({
        id: posCart[k].id,
        name: posCart[k].name,
        price: posCart[k].price,
        quantity: posCart[k].qty,
        accompaniments: [] // No accompaniments in fast POS
      });
    });

    const { error } = await supabaseClient.from('orders').insert([{
      business_id: businessId,
      customer_name: customerName,
      customer_phone: 'N/A',
      customer_address: 'Local (POS)',
      delivery_method: 'A la mesa', // Or local
      payment_method: paymentMethod,
      items: items,
      total_amount: total,
      status: 'Entregado' // Automatically mark as completed for POS
    }]);

    if (error) throw error;
    
    showToast('✅ Venta registrada exitosamente');
    closeCheckoutModal();
    clearCart();
    
  } catch (error) {
    console.error(error);
    showToast('❌ Error procesando venta', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.clear();
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', initPOS);
