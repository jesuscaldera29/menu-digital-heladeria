// ===== MENU.JS - MULTI-TENANT =====
let products = [];
let cart = {};
let categories = [];
let activeCategory = 'Todos';
let whatsappNumber = '';
let currency = 'COP';
let currentBusinessId = null;
let currentBusinessSlug = null;
let currentTipPercentage = 0;
let currentCoupon = null;

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3000);
}

// ===== MULTI-TENANT: Resolve business from URL slug =====
async function initBusiness() {
  const slug = getSlugFromUrl();

  if (!slug) {
    // No slug = redirect to landing
    window.location.href = '/';
    return false;
  }

  const business = await getBusinessBySlug(slug);
  if (!business) {
    // Show 404
    const loadingEl = document.getElementById('loadingBizScreen');
    const notFoundEl = document.getElementById('notFoundScreen');
    if (loadingEl) loadingEl.style.display = 'none';
    if (notFoundEl) notFoundEl.style.display = 'flex';
    return false;
  }

  if (business.is_active === false) {
    // Show suspended screen
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:white;font-family:sans-serif;text-align:center;padding:20px;">
        <div style="font-size:4rem;margin-bottom:1rem;">⚠️</div>
        <h1 style="font-size:2rem;margin-bottom:0.5rem;font-weight:bold;">Menú no disponible</h1>
        <p style="color:#9ca3af;">El servicio para este restaurante se encuentra temporalmente suspendido.</p>
      </div>
    `;
    return false;
  }

  currentBusinessId = business.id;
  currentBusinessSlug = business.slug;
  return true;
}

// Load settings filtered by business_id
async function loadSettings() {
  if (!currentBusinessId) return;
  try {
    const { data } = await supabaseClient
      .from('settings')
      .select('*')
      .eq('business_id', currentBusinessId)
      .single();

    if (data) {
      whatsappNumber = data.whatsapp || '';
      currency = data.currency || 'COP';

      // Update page title
      if (data.business_name) {
        document.title = data.business_name + ' | Menú Digital';
        const h1 = document.querySelector('header h1');
        if (h1) h1.textContent = 'MENÚ ' + data.business_name.toUpperCase();
        const subtitle = document.querySelector('header p');
        if (subtitle) subtitle.textContent = data.business_name;
      }

      // Inject dynamic brand color
      window.businessSettings = data;
      if (data.brand_color) {
        const style = document.createElement('style');
        style.innerHTML = `
          .bg-orange-500 { background-color: ${data.brand_color} !important; }
          .bg-orange-600 { background-color: ${data.brand_color} !important; filter: brightness(0.9); }
          .text-orange-500 { color: ${data.brand_color} !important; }
          .text-orange-600 { color: ${data.brand_color} !important; filter: brightness(0.9); }
          .border-orange-500 { border-color: ${data.brand_color} !important; }
          .from-orange-500 { --tw-gradient-from: ${data.brand_color} !important; }
          .to-red-500 { --tw-gradient-to: ${data.brand_color} !important; filter: brightness(0.8); }
          .from-red-500 { --tw-gradient-from: ${data.brand_color} !important; filter: brightness(0.8); }
          .to-orange-500 { --tw-gradient-to: ${data.brand_color} !important; }
          .bg-gradient-to-r { background-image: linear-gradient(to right, var(--tw-gradient-from), var(--tw-gradient-to)) !important; }
          .accent-orange-600 { accent-color: ${data.brand_color} !important; }
          .peer-checked\\:bg-orange-500:checked ~ * { background-color: ${data.brand_color} !important; }
          .peer-checked\\:border-orange-500:checked ~ * { border-color: ${data.brand_color} !important; }
          .peer-checked\\:text-orange-700:checked ~ * { color: ${data.brand_color} !important; filter: brightness(0.7); }
          .group-hover\\:border-orange-200:hover { border-color: ${data.brand_color} !important; opacity: 0.5; }
          .shadow-\\[0_8px_30px_rgba\\(234\\,88\\,12\\,0\\.08\\)\\] { box-shadow: 0 8px 30px ${data.brand_color}33 !important; }
          .btn-add { background: ${data.brand_color} !important; }
          .btn-add:hover { filter: brightness(0.9); }
          .m-price { color: ${data.brand_color} !important; }
          .category-tab.active { background: ${data.brand_color} !important; border-color: ${data.brand_color} !important; color: white !important; }
          .category-tab { border-color: ${data.brand_color} !important; color: ${data.brand_color} !important; }
          .cart-total .amount { color: ${data.brand_color} !important; }
        `;
        document.head.appendChild(style);
      }

      const logoImg = document.getElementById('logoImg');
      const logoPlaceholder = document.getElementById('logoPlaceholder');
      if (logoImg && data.logo_url) {
        logoImg.src = data.logo_url;
        logoImg.style.display = 'block';
        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
      }

      const bankInfoDisplay = document.getElementById('bankInfoDisplay');
      if (bankInfoDisplay) {
        try {
          let accounts = [];
          if (data.bank_info && data.bank_info.trim().startsWith('[')) {
              accounts = JSON.parse(data.bank_info);
          } else if (data.bank_info) {
              // legacy text support
              accounts = [{ bank_name: 'Banco', account_type: 'Transferencia', account_number: data.bank_info }];
          }
          if (data.nequi_info) {
              accounts.push({ bank_name: 'Nequi', account_type: 'Billetera Digital', account_number: data.nequi_info });
          }

          if (accounts.length > 0) {
              bankInfoDisplay.innerHTML = accounts.map((acc, idx) => `
                <label class="bg-white rounded-xl p-3 shadow-sm border border-pink-100 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <div class="flex items-center gap-3">
                    <input type="radio" name="specificBank" value="${acc.bank_name}" class="w-4 h-4 text-pink-600 focus:ring-pink-500 border-gray-300" onchange="document.getElementById('paymentMethod').value = this.value" ${idx === 0 ? 'checked' : ''}>
                    <div>
                      <p class="font-bold text-sm text-gray-800">🏦 ${acc.bank_name} <span class="text-xs text-gray-500 font-normal">(${acc.account_type})</span></p>
                      <p class="text-lg font-black text-pink-600 mt-1" style="user-select: all;">${acc.account_number}</p>
                    </div>
                  </div>
                  <button type="button" onclick="copyBankNumber('${acc.account_number}', this); event.preventDefault();" class="bg-pink-50 text-pink-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-pink-100 transition-colors flex items-center gap-1 active:scale-95">
                    <span>📋</span> Copiar
                  </button>
                </label>
              `).join('');
          } else {
              bankInfoDisplay.innerHTML = '<p class="text-sm text-gray-500 italic">No hay cuentas bancarias configuradas.</p>';
          }
        } catch(e) {
          bankInfoDisplay.innerHTML = '<p class="text-sm text-gray-500 italic">No hay datos bancarios.</p>';
        }
      }

      // Populate tables for en-el-local
      const tableSelect = document.getElementById('customerTable');
      if (tableSelect && data.table_count) {
        let options = '<option value="">Selecciona tu Mesa</option>';
        for (let i = 1; i <= data.table_count; i++) {
          options += `<option value="${i}">Mesa ${i}</option>`;
        }
        tableSelect.innerHTML = options;
      }

      // Check URL for ?mesa=X
      const urlParams = new URLSearchParams(window.location.search);
      const mesaQuery = urlParams.get('mesa');
      if (mesaQuery) {
        const pills = document.querySelectorAll('#customerForm .option-pill');
        const localPill = Array.from(pills).find(p => p.innerText.includes('LOCAL'));
        if (localPill) {
          selectDelivery('En el Local', localPill);
          if (tableSelect) tableSelect.value = mesaQuery;
        }
      }

      // === GENERAR PWA MANIFEST DINÁMICO ===
      try {
        const fallbackIcon = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.business_name || 'MP') + '&background=EA580C&color=fff&size=512';
        const iconUrl = data.logo_url || fallbackIcon;
        const bizName = data.business_name || 'Menú Digital';
        
        const manifestContent = {
          name: bizName,
          short_name: bizName,
          start_url: window.location.pathname + window.location.search,
          display: "standalone",
          background_color: "#F8F9FA",
          theme_color: "#EA580C",
          icons: [
            { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }
          ]
        };
        
        const blob = new Blob([JSON.stringify(manifestContent)], { type: 'application/json' });
        const manifestURL = URL.createObjectURL(blob);
        const manifestLink = document.getElementById('dynamic-manifest');
        if (manifestLink) manifestLink.setAttribute('href', manifestURL);
      } catch (e) {
        console.warn('No se pudo generar el manifest dinámico', e);
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Load products filtered by business_id
async function loadProducts() {
  if (!currentBusinessId) return;
  const { data } = await supabaseClient
    .from('products')
    .select('*')
    .eq('business_id', currentBusinessId)
    .eq('available', true)
    .order('category');

  products = data || [];
  
  try {
      const { data: extrasData } = await supabaseClient
        .from('product_extras')
        .select('*')
        .eq('business_id', currentBusinessId);
      window.allVisualExtras = extrasData || [];
  } catch (err) {
      window.allVisualExtras = [];
  }
  // Excluir Acompañantes y Acompañantes del dia de las categorías de la landing/tabs principales
  categories = ['Todos', ...new Set(products.map(p => p.category))].filter(c => c !== 'Acompañantes' && c !== 'Acompañantes del dia');
  renderCategories();
  renderMenu();
}

// Render category tabs
function renderCategories() {
  const container = document.getElementById('categoryTabs');
  if (!container) return;
  container.innerHTML = categories.map(c =>
    `<button class="category-tab ${c === activeCategory ? 'active' : ''}" onclick="setCategory('${c}')">${c}</button>`
  ).join('');
}

function setCategory(cat) {
  activeCategory = cat;
  renderCategories();
  renderMenu();
}

function filterProducts() {
  renderMenu();
}

function renderMenu() {
  const searchInput = document.getElementById('searchInput');
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  let filtered = products.filter(p => {
    // Excluir Acompañantes del renderizado del menú principal
    const notAccompaniment = p.category !== 'Acompañantes' && p.category !== 'Acompañantes del dia';
    const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(search);
    return notAccompaniment && matchCat && matchSearch;
  });

  const container = document.getElementById('menuGrid');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No se encontraron productos</div>';
    return;
  }

  container.innerHTML = filtered.map(p => `
    <div class="menu-product-card">
      ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : '<div style="height:140px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:2rem">🍽️</div>'}
      <div class="m-info">
        <h4>${p.name}</h4>
        <div class="m-price">${currency} $${Number(p.price).toLocaleString()}</div>
        <button class="btn-add" onclick="openAccompanimentsModal(${p.id})">Agregar</button>
      </div>
    </div>
  `).join('');
}

// Cart functions
function addToCart(id, accompaniments = [], visualExtras = []) {
  const accKey = accompaniments.length ? accompaniments.join(',') : '';
  const veKey = visualExtras.length ? visualExtras.map(v => v.id).sort().join(',') : '';
  const key = `${id}_${accKey}_${veKey}`;
  if (cart[key]) {
    cart[key].qty++;
  } else {
    cart[key] = { id, qty: 1, accompaniments, visualExtras };
  }
  updateCartUI();
  showToast('✅ Agregado al carrito');
}

function addToCartFromKey(key) {
  if (cart[key]) {
    cart[key].qty++;
    updateCartUI();
    showToast('✅ Agregado al carrito');
    
    const el = document.getElementById('orderDetails');
    if (el && el.style.display !== 'none') {
      el.style.display = 'none';
      toggleOrderDetails();
    }
  }
}

function removeFromCart(key) {
  if (cart[key]) {
    if (cart[key].qty > 1) cart[key].qty--;
    else delete cart[key];
    updateCartUI();
    
    const el = document.getElementById('orderDetails');
    if (el && el.style.display !== 'none') {
      if (Object.keys(cart).length === 0) {
        el.style.display = 'none';
        const form = document.getElementById('customerForm');
        if (form) form.style.display = 'none';
      } else {
        el.style.display = 'none';
        toggleOrderDetails();
      }
    }
  }
}

function updateCartUI() {
  let subtotal = 0;
  for (const [key, item] of Object.entries(cart)) {
    const p = products.find(x => String(x.id) === String(item.id));
    if (p) {
        let extrasTotal = 0;
        if (item.visualExtras && item.visualExtras.length) {
            item.visualExtras.forEach(ve => { extrasTotal += Number(ve.price || 0); });
        }
        subtotal += (p.price + extrasTotal) * item.qty;
    }
  }

  let discount = 0;
  if (currentCoupon) {
    if (subtotal >= (currentCoupon.min_order || 0)) {
      if (currentCoupon.discount_type === 'percentage') {
        discount = subtotal * (Number(currentCoupon.discount_value) / 100);
      } else {
        discount = Number(currentCoupon.discount_value);
      }
    } else {
      const minVal = currentCoupon.min_order;
      currentCoupon = null;
      const res = document.getElementById('couponResult');
      if (res) {
        res.textContent = `⚠️ Compra mínima de $${Number(minVal).toLocaleString()} requerida`;
        res.className = 'text-xs font-bold text-red-500 block px-2';
      }
    }
  }

  let tip = subtotal * (currentTipPercentage / 100);
  let total = subtotal - discount + tip;
  if (total < 0) total = 0;

  const cartTotal = document.getElementById('cartTotal');
  const cartTotalBottom = document.getElementById('cartTotalBottom');
  if (cartTotal) cartTotal.textContent = total.toLocaleString();
  if (cartTotalBottom) cartTotalBottom.textContent = total.toLocaleString();

  // Update Checkout Summary breakdown if visible
  const breakdown = document.getElementById('checkoutSummaryBreakdown');
  if (breakdown) {
    if (discount > 0 || tip > 0) {
      breakdown.classList.remove('hidden');
      document.getElementById('summarySubtotal').textContent = `$${subtotal.toLocaleString()}`;
      
      const discRow = document.getElementById('summaryDiscountRow');
      const discVal = document.getElementById('summaryDiscount');
      if (discount > 0) {
        discRow.classList.remove('hidden');
        discVal.textContent = `-$${discount.toLocaleString()}`;
      } else {
        discRow.classList.add('hidden');
      }

      const tipRow = document.getElementById('summaryTipRow');
      const tipVal = document.getElementById('summaryTip');
      if (tip > 0) {
        tipRow.classList.remove('hidden');
        tipVal.textContent = `+$${tip.toLocaleString()}`;
      } else {
        tipRow.classList.add('hidden');
      }

      document.getElementById('summaryTotal').textContent = `$${total.toLocaleString()}`;
    } else {
      breakdown.classList.add('hidden');
    }
  }
}

async function applyCoupon() {
  const codeInput = document.getElementById('couponCodeInput');
  const resultDiv = document.getElementById('couponResult');
  if (!codeInput || !resultDiv) return;

  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    resultDiv.classList.add('hidden');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('coupons')
      .select('*')
      .eq('business_id', currentBusinessId)
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      currentCoupon = null;
      resultDiv.textContent = '❌ Cupón no válido o vencido';
      resultDiv.className = 'text-xs font-bold text-red-500 block px-2';
      resultDiv.classList.remove('hidden');
      updateCartUI();
      return;
    }

    // Validate dates
    const now = new Date();
    if (data.valid_from && new Date(data.valid_from) > now) {
      currentCoupon = null;
      resultDiv.textContent = '❌ Cupón aún no está activo';
      resultDiv.className = 'text-xs font-bold text-red-500 block px-2';
      resultDiv.classList.remove('hidden');
      updateCartUI();
      return;
    }
    if (data.valid_until && new Date(data.valid_until) < now) {
      currentCoupon = null;
      resultDiv.textContent = '❌ Cupón vencido';
      resultDiv.className = 'text-xs font-bold text-red-500 block px-2';
      resultDiv.classList.remove('hidden');
      updateCartUI();
      return;
    }

    // Validate uses
    if (data.max_uses && data.used_count >= data.max_uses) {
      currentCoupon = null;
      resultDiv.textContent = '❌ Cupón agotado';
      resultDiv.className = 'text-xs font-bold text-red-500 block px-2';
      resultDiv.classList.remove('hidden');
      updateCartUI();
      return;
    }

    // Validate min order
    let subtotal = 0;
    for (const [key, item] of Object.entries(cart)) {
      const p = products.find(x => String(x.id) === String(item.id));
      if (p) {
        let extrasTotal = 0;
        if (item.visualExtras && item.visualExtras.length) {
          item.visualExtras.forEach(ve => { extrasTotal += Number(ve.price || 0); });
        }
        subtotal += (p.price + extrasTotal) * item.qty;
      }
    }

    if (subtotal < (data.min_order || 0)) {
      currentCoupon = null;
      resultDiv.textContent = `⚠️ Compra mínima requerida: $${Number(data.min_order).toLocaleString()}`;
      resultDiv.className = 'text-xs font-bold text-orange-500 block px-2';
      resultDiv.classList.remove('hidden');
      updateCartUI();
      return;
    }

    currentCoupon = data;
    resultDiv.textContent = `✅ Cupón aplicado: -${data.discount_type === 'percentage' ? data.discount_value + '%' : '$' + Number(data.discount_value).toLocaleString()}`;
    resultDiv.className = 'text-xs font-bold text-green-600 block px-2';
    resultDiv.classList.remove('hidden');
    updateCartUI();
    showToast('🎟️ Cupón aplicado exitosamente');
  } catch (err) {
    console.error(err);
    currentCoupon = null;
    resultDiv.textContent = '❌ Error al aplicar cupón';
    resultDiv.className = 'text-xs font-bold text-red-500 block px-2';
    resultDiv.classList.remove('hidden');
    updateCartUI();
  }
}

function setTip(percentage, el) {
  currentTipPercentage = percentage;
  document.querySelectorAll('.tip-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-black', 'text-white', 'border-black');
    btn.classList.add('bg-white', 'text-gray-600', 'border-gray-100');
  });
  el.classList.add('active', 'bg-black', 'text-white', 'border-black');
  el.classList.remove('bg-white', 'text-gray-600', 'border-gray-100');
  
  updateCartUI();
}

window.applyCoupon = applyCoupon;
window.setTip = setTip;

function toggleOrderDetails() {
  if (!Object.keys(cart).length) return showToast('Agrega productos al carrito primero', 'error');
  const el = document.getElementById('orderDetails');
  const form = document.getElementById('customerForm');
  if (!el) return;
  const isOpen = el.style.display !== 'none' && el.style.display !== '';

  if (!isOpen) {
    let html = '';
    for (const [key, item] of Object.entries(cart)) {
      const p = products.find(x => String(x.id) === String(item.id));
      if (!p) continue;
      
      let allAcc = [...(item.accompaniments || [])];
      if (item.visualExtras && item.visualExtras.length) {
          item.visualExtras.forEach(ve => allAcc.push(ve.price > 0 ? `${ve.name} (+$${Number(ve.price).toLocaleString()})` : ve.name));
      }
      
      const displayName = allAcc.length 
        ? `${p.name} <span class="text-xs text-gray-500 block">(Extras: ${allAcc.join(', ')})</span>`
        : p.name;
      html += `<div class="order-item">
        <span>${displayName}</span>
        <div class="qty-controls">
          <button onclick="removeFromCart('${key}')">−</button>
          <span class="qty">${item.qty}</span>
          <button onclick="addToCartFromKey('${key}')">+</button>
        </div>
      </div>`;
    }
    el.innerHTML = html;
    el.style.display = 'block';
    if (form) form.style.display = 'block';
  } else {
    el.style.display = 'none';
    if (form) form.style.display = 'none';
  }
}

async function processOrder() {
  if (!Object.keys(cart).length) return showToast('Agrega productos al carrito', 'error');
  if (!currentBusinessId) return showToast('Error: negocio no identificado', 'error');

  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const notes = document.getElementById('customerNotes').value.trim();
  const delivery = document.getElementById('deliveryMethod')?.value || 'Domicilio';
  const payment = document.getElementById('paymentMethod')?.value || 'Efectivo';

  let finalAddress = '';
  if (delivery === 'Domicilio') {
    const address = document.getElementById('customerAddress')?.value.trim();
    const neighborhood = document.getElementById('customerNeighborhood')?.value.trim();
    if (!address) return showToast('⚠️ Por favor ingresa tu dirección', 'error');
    finalAddress = address + (neighborhood ? ` (Barrio: ${neighborhood})` : '');
  } else if (delivery === 'A la mesa') {
    const table = document.getElementById('customerTable')?.value;
    if (!table) return showToast('⚠️ Por favor selecciona tu mesa', 'error');
    finalAddress = 'Mesa ' + table;
  } else {
    finalAddress = 'Recoge en local';
  }

  if (!name) return showToast('⚠️ Por favor ingresa tu nombre', 'error');
  if (!phone) return showToast('⚠️ Por favor ingresa tu teléfono', 'error');

  const btn = document.getElementById('btnProcessOrder');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Procesando...';
  btn.disabled = true;

  try {
    await supabaseClient.from('customers').upsert({
      phone, name,
      address: delivery === 'Domicilio' ? finalAddress : '',
      business_id: currentBusinessId
    }, { onConflict: 'phone' });

    let subtotal = 0;
    const orderItems = [];
    for (const [key, item] of Object.entries(cart)) {
      const p = products.find(x => String(x.id) === String(item.id));
      if (!p) continue;
      
      let extrasTotal = 0;
      let allAcc = [...(item.accompaniments || [])];
      if (item.visualExtras && item.visualExtras.length) {
          item.visualExtras.forEach(ve => {
              extrasTotal += Number(ve.price || 0);
              allAcc.push(ve.price > 0 ? `${ve.name} (+$${Number(ve.price).toLocaleString()})` : ve.name);
          });
      }
      
      let itemPrice = p.price + extrasTotal;
      subtotal += itemPrice * item.qty;
      
      const displayName = allAcc.length 
        ? `${p.name} (Extras: ${allAcc.join(', ')})`
        : p.name;
      orderItems.push({ id: p.id, name: displayName, qty: item.qty, price: itemPrice });
    }

    let discount = 0;
    if (currentCoupon && subtotal >= (currentCoupon.min_order || 0)) {
      if (currentCoupon.discount_type === 'percentage') {
        discount = subtotal * (Number(currentCoupon.discount_value) / 100);
      } else {
        discount = Number(currentCoupon.discount_value);
      }
    }
    
    let tip = subtotal * (currentTipPercentage / 100);
    let total = subtotal - discount + tip;
    if (total < 0) total = 0;

    const { data: order, error: orderErr } = await supabaseClient.from('orders').insert([{
      customer_phone: phone,
      customer_name: name,
      items: orderItems,
      total,
      delivery_method: delivery,
      payment_method: payment,
      address: finalAddress,
      notes,
      business_id: currentBusinessId,
      tip,
      coupon_code: currentCoupon ? currentCoupon.code : '',
      discount
    }]).select().single();

    if (orderErr) throw orderErr;

    // Attempt updating coupon count (ignore RLS error if any)
    if (currentCoupon) {
      try {
        await supabaseClient
          .from('coupons')
          .update({ used_count: (currentCoupon.used_count || 0) + 1 })
          .eq('id', currentCoupon.id);
      } catch (couponErr) {
        console.warn('Could not update coupon usage count:', couponErr);
      }
    }

    window.currentOrderData = { order, items: orderItems };
    showTicket(order, orderItems);
    
    // Auto-trigger WhatsApp (Disabled per user request)
    // sendTicketWhatsApp();
    
    showToast('✅ Pedido registrado con éxito');
  } catch (err) {
    console.error(err);
    showToast('❌ Error procesando pedido', 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Ticket functions
function showTicket(order, items) {
  const elId = document.getElementById('ticketOrderId');
  if (elId) elId.textContent = `#${String(order.id).padStart(4, '0')}`;
  document.getElementById('tName').textContent = order.customer_name;
  document.getElementById('tPhone').textContent = order.customer_phone;
  document.getElementById('tType').textContent = order.delivery_method;

  const addressRow = document.getElementById('tAddressRow');
  const addressEl = document.getElementById('tAddress');
  if (order.delivery_method === 'A la mesa') {
    addressRow.style.display = 'flex';
    addressRow.querySelector('span').textContent = 'Ubicación:';
    addressEl.textContent = order.address;
  } else if (order.delivery_method === 'Para Llevar') {
    addressRow.style.display = 'none';
  } else {
    addressRow.style.display = 'flex';
    addressRow.querySelector('span').textContent = 'Dirección:';
    addressEl.textContent = order.address || 'Sin dirección';
  }

  document.getElementById('tPayment').textContent = order.payment_method;
  const itemsContainer = document.getElementById('tItems');
  itemsContainer.innerHTML = items.map(item => `
    <div class="flex justify-between">
      <span>${item.qty}x ${item.name}</span>
      <span>$${(item.price * item.qty).toLocaleString()}</span>
    </div>
  `).join('');

  // Subtotal, Discount, Tip Breakdown in Ticket
  const discount = Number(order.discount || 0);
  const tip = Number(order.tip || 0);
  const total = Number(order.total || 0);
  const subtotal = total + discount - tip;

  document.getElementById('tSubtotal').textContent = `$${subtotal.toLocaleString()}`;

  const discRow = document.getElementById('tDiscountRow');
  const discVal = document.getElementById('tDiscount');
  if (discount > 0) {
    discRow.classList.remove('hidden');
    discVal.textContent = `-$${discount.toLocaleString()}`;
  } else {
    discRow.classList.add('hidden');
  }

  const tipRow = document.getElementById('tTipRow');
  const tipVal = document.getElementById('tTip');
  if (tip > 0) {
    tipRow.classList.remove('hidden');
    tipVal.textContent = `+$${tip.toLocaleString()}`;
  } else {
    tipRow.classList.add('hidden');
  }

  document.getElementById('tTotal').textContent = `$${total.toLocaleString()}`;

  // Tracking link uses slug-based path
  const basePath = window.location.origin;
  const trackingUrl = basePath + '/order-status.html?id=' + order.id;
  const tLinkContainer = document.getElementById('tLinkContainer');
  const tStatusLink = document.getElementById('tStatusLink');
  if (tStatusLink) { tStatusLink.href = trackingUrl; tStatusLink.textContent = trackingUrl; }
  if (tLinkContainer) tLinkContainer.style.display = 'block';
  document.getElementById('ticketModal').style.display = 'flex';
}

function sendTicketWhatsApp() {
  if (!window.currentOrderData) return;
  const { order, items } = window.currentOrderData;
  let msg = `🛒 *NUEVO PEDIDO #${String(order.id).padStart(4, '0')}*\n━━━━━━━━━━━━━━━━━━━\n\n`;
  for (const item of items) {
    msg += `▪️ ${item.name} x${item.qty} — $${(item.price * item.qty).toLocaleString()}\n`;
  }

  const discount = Number(order.discount || 0);
  const tip = Number(order.tip || 0);
  const total = Number(order.total || 0);
  const subtotal = total + discount - tip;

  msg += `\n━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Subtotal: $${subtotal.toLocaleString()}\n`;
  if (discount > 0) msg += `Descuento (${order.coupon_code || 'Cupón'}): -$${discount.toLocaleString()}\n`;
  if (tip > 0) msg += `Propina: +$${tip.toLocaleString()}\n`;
  msg += `💰 *TOTAL A PAGAR: $${total.toLocaleString()}*\n━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `👤 *CLIENTE:* ${order.customer_name}\n📞 *TELÉFONO:* ${order.customer_phone}\n📦 *TIPO:* ${order.delivery_method}\n💳 *PAGO:* ${order.payment_method}\n`;
  if (order.delivery_method === 'Domicilio') msg += `📍 *DIRECCIÓN:* ${order.address}\n`;
  else if (order.delivery_method === 'A la mesa') msg += `🪑 *UBICACIÓN:* ${order.address}\n`;
  else msg += `🛍️ *UBICACIÓN:* Recoge en local\n`;
  if (order.notes) msg += `📝 *NOTAS:* ${order.notes}\n`;

  const trackingUrl = window.location.origin + '/order-status.html?id=' + order.id;
  msg += `\n🔗 *Sigue tu pedido en vivo (1 hora):*\n${trackingUrl}\n`;

  const numero = whatsappNumber ? whatsappNumber.replace(/\D/g, '') : '573001234567';
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function downloadTicket() {
  const element = document.getElementById('ticketReceipt');
  try {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
    const image = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    const orderId = window.currentOrderData ? window.currentOrderData.order.id : '0000';
    link.download = `Ticket_Pedido_${orderId}.png`;
    link.href = image;
    link.click();
  } catch (err) {
    console.error(err);
    showToast('❌ Error al descargar ticket', 'error');
  }
}

function closeTicket() {
  const modal = document.getElementById('ticketModal');
  if (modal) modal.style.display = 'none';
  cart = {};
  updateCartUI();
  toggleOrderDetails();
  window.currentOrderData = null;
}

// ===== INIT =====
(async function init() {
  const ok = await initBusiness();
  if (!ok) return;

  // Hide loading screen
  const loadingEl = document.getElementById('loadingBizScreen');
  if (loadingEl) loadingEl.style.display = 'none';

  await loadSettings();
  await loadProducts();
})();

window.copyBankNumber = function(number, btn) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(number).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<span>✅</span> ¡Copiado!';
            btn.classList.add('bg-green-100', 'text-green-700');
            btn.classList.remove('bg-pink-50', 'text-pink-600');
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.classList.remove('bg-green-100', 'text-green-700');
                btn.classList.add('bg-pink-50', 'text-pink-600');
            }, 2000);
        }).catch(err => {
            console.error('Error copying text: ', err);
            alert('No se pudo copiar el número.');
        });
    } else {
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = number;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<span>✅</span> ¡Copiado!';
            btn.classList.add('bg-green-100', 'text-green-700');
            btn.classList.remove('bg-pink-50', 'text-pink-600');
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.classList.remove('bg-green-100', 'text-green-700');
                btn.classList.add('bg-pink-50', 'text-pink-600');
            }, 2000);
        } catch (err) {
            console.error('Fallback error: ', err);
        }
        document.body.removeChild(textArea);
    }
}
// ==========================================
// PWA INSTALL LOGIC (PUBLIC MENU)
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('btnInstallMenu');
  if(btn) {
    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('App instalada');
      }
      deferredPrompt = null;
      btn.classList.add('hidden');
    });
  }
});
