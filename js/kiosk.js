// ===== KIOSK.JS - SELF SERVICE KIOSK =====
let products = [];
let cart = {};
let categories = [];
let activeCategory = 'Todos';
let currency = 'COP';
let currentBusinessId = null;
let currentBusinessSlug = null;
let currentCoupon = null;
let businessName = '';
let kioskDeliveryFeeAmount = 0;
let kioskDeliveryMethodSelected = 'A la mesa';

// Inactivity timer variables
let inactivityTimer = null;
let inactivityCountdown = 60;
const INACTIVITY_TIMEOUT = 60; // 60 seconds of inactivity to reset

// Modal state variables
let currentSelectedProductId = null;
let tempSelectedAccompaniments = [];
let tempSelectedVisualExtras = [];

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'fixed top-10 left-1/2 -translate-x-1/2 bg-black/95 text-white font-bold py-4 px-8 rounded-2xl shadow-2xl z-[999] opacity-100 transition-all duration-300 transform translate-y-0 text-lg';
  if (type === 'error') {
    t.classList.add('bg-red-600');
  } else {
    t.classList.remove('bg-red-600');
  }
  setTimeout(() => {
    t.className = 'fixed top-10 left-1/2 -translate-x-1/2 bg-black/95 text-white font-bold py-4 px-8 rounded-2xl shadow-2xl z-[999] opacity-0 pointer-events-none transition-all duration-300 transform -translate-y-5 text-lg';
  }, 3000);
}

// Reset inactivity timer on any user activity
function resetInactivityTimer() {
  // Only activate if we are not on the welcome screen
  const welcomeScreen = document.getElementById('kioskWelcome');
  if (welcomeScreen && welcomeScreen.style.display === 'none') {
    clearInterval(inactivityTimer);
    inactivityCountdown = INACTIVITY_TIMEOUT;
    
    const indicator = document.getElementById('inactivityIndicator');
    const timerEl = document.getElementById('inactivityTimer');
    
    // Hide initially until countdown <= 15
    if (indicator) indicator.classList.add('hidden');
    if (timerEl) timerEl.textContent = inactivityCountdown;

    inactivityTimer = setInterval(() => {
      inactivityCountdown--;
      if (timerEl) timerEl.textContent = inactivityCountdown;

      if (inactivityCountdown <= 15) {
        if (indicator) indicator.classList.remove('hidden');
      }

      if (inactivityCountdown <= 0) {
        clearInterval(inactivityTimer);
        resetKiosk();
        showToast('🕒 Pedido cancelado por inactividad');
      }
    }, 1000);
  }
}

// Listen to user interactions to reset timer
window.addEventListener('click', resetInactivityTimer);
window.addEventListener('touchstart', resetInactivityTimer);

// Resolve business
async function initKioskBusiness() {
  // 1. Check URL Parameter ?slug=xxx
  const urlParams = new URLSearchParams(window.location.search);
  let slug = urlParams.get('slug');

  // 2. Check path slug (e.g. /slug/kiosk.html)
  if (!slug) {
    const pathParts = window.location.pathname.split('/');
    // Check if any path part matches a business slug (exclude known static page names)
    const exclude = ['', 'index', 'index.html', 'admin', 'admin.html', 'kiosk', 'kiosk.html', 'order-status', 'order-status.html', 'login', 'login.html', 'register', 'register.html', 'kds', 'kds.html', 'driver', 'driver.html', 'client', 'client.html', 'superadmin', 'superadmin.html'];
    for (let part of pathParts) {
      if (part && !exclude.includes(part) && !part.includes('.')) {
        slug = part;
        break;
      }
    }
  }

  // 3. Fallback: Check if there's a logged-in business owner
  if (!slug) {
    const biz = await getCurrentBusiness();
    if (biz) {
      slug = biz.slug;
    }
  }

  if (!slug) {
    document.body.innerHTML = `
      <div class="flex flex-col items-center justify-center h-screen bg-gray-900 text-white font-bold p-8 text-center">
        <span class="text-6xl mb-4">⚠️</span>
        <h1 class="text-3xl mb-2">Error de Configuración</h1>
        <p class="text-gray-400 max-w-md">No se pudo identificar el negocio para este kiosko. Por favor añade el slug del negocio en la URL:</p>
        <code class="bg-gray-800 text-yellow-400 px-4 py-2 rounded-xl mt-4 text-lg">kiosk.html?slug=nombre-del-negocio</code>
      </div>
    `;
    return false;
  }

  const business = await getBusinessBySlug(slug);
  if (!business || !business.is_active) {
    document.body.innerHTML = `
      <div class="flex flex-col items-center justify-center h-screen bg-gray-900 text-white font-bold p-8 text-center">
        <span class="text-6xl mb-4">⚠️</span>
        <h1 class="text-3xl mb-2">Negocio No Encontrado</h1>
        <p class="text-gray-400">El negocio especificado no existe o está desactivado.</p>
      </div>
    `;
    return false;
  }

  currentBusinessId = business.id;
  currentBusinessSlug = business.slug;
  businessName = business.business_name;
  return true;
}

// Load Kiosk settings
async function loadKioskSettings() {
  if (!currentBusinessId) return;
  try {
    const { data } = await supabaseClient
      .from('settings')
      .select('*')
      .eq('business_id', currentBusinessId)
      .single();

    if (data) {
      window.kioskSettings = data;
      currency = data.currency || 'COP';
      kioskDeliveryFeeAmount = Number(data.delivery_fee) || 0;
      
      // Update names and logos on interface
      const welcomeName = document.getElementById('kioskWelcomeName');
      const headerName = document.getElementById('kioskHeaderName');
      if (welcomeName) welcomeName.textContent = data.business_name || businessName;
      if (headerName) headerName.textContent = data.business_name || businessName;

      if (data.logo_url) {
        const welcomeIcon = document.getElementById('kioskWelcomeIcon');
        const headerIcon = document.getElementById('kioskHeaderIcon');
        if (welcomeIcon) welcomeIcon.outerHTML = `<img src="${data.logo_url}" alt="Logo" class="w-full h-full object-contain p-2">`;
        if (headerIcon) headerIcon.outerHTML = `<img src="${data.logo_url}" alt="Logo" class="w-12 h-12 object-contain bg-white rounded-full">`;

        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = data.logo_url;
      }

      // Populate table dropdown
      const tableSelect = document.getElementById('kCustomerTable');
      if (tableSelect && data.table_count) {
        tableSelect.innerHTML = '<option value="">Cargando mesas...</option>';
        try {
          const { data: activeOrders } = await supabaseClient
            .from('orders')
            .select('id, address')
            .eq('business_id', currentBusinessId)
            .eq('delivery_method', 'A la mesa')
            .in('status', ['Pendiente', 'En preparación']);
          
          let options = '<option value="">Selecciona tu Mesa</option>';
          for (let i = 1; i <= data.table_count; i++) {
            const order = (activeOrders || []).find(o => String(o.address) === `Mesa ${i}`);
            if (order) {
              options += `<option value="${i}" data-order-id="${order.id}">Mesa ${i} (Ocupada)</option>`;
            } else {
              options += `<option value="${i}">Mesa ${i} (Libre)</option>`;
            }
          }
          tableSelect.innerHTML = options;
        } catch (e) {
          console.error(e);
          let options = '<option value="">Selecciona tu Mesa</option>';
          for (let i = 1; i <= data.table_count; i++) {
            options += `<option value="${i}">Mesa ${i}</option>`;
          }
          tableSelect.innerHTML = options;
        }
      }
    }
  } catch (err) {
    console.error('Error loading kiosk settings:', err);
  }
}

// Load Kiosk products
async function loadKioskProducts() {
  if (!currentBusinessId) return;
  try {
    const { data } = await supabaseClient
      .from('products')
      .select('*')
      .eq('business_id', currentBusinessId)
      .eq('available', true)
      .order('category');

    // Filter out products marked as POS-only (not for kiosk)
    products = (data || []).filter(p => !p.pos_only);

    // Load visual extras
    try {
      const { data: extrasData } = await supabaseClient
        .from('product_extras')
        .select('*')
        .eq('business_id', currentBusinessId);
      window.allVisualExtras = extrasData || [];
    } catch (e) {
      window.allVisualExtras = [];
    }

    categories = ['Todos', ...new Set(products.map(p => p.category))].filter(c => c !== 'Acompañantes' && c !== 'Acompañantes del dia');
    renderKioskCategories();
    renderKioskProducts();
  } catch (err) {
    console.error('Error loading kiosk products:', err);
  }
}

// Render categories
function renderKioskCategories() {
  const container = document.getElementById('categoriesContainer');
  if (!container) return;
  container.innerHTML = categories.map(c => {
    const emoji = { 'Desayunos': '🍳', 'Almuerzos': '🍲', 'Comidas Rápidas': '🍔', 'Bebidas': '🥤', 'Postres': '🍰' }[c] || '📂';
    return `<button class="category-tab shrink-0 px-6 py-4 rounded-2xl font-black text-base shadow-sm transition-all flex items-center gap-2 ${c === activeCategory ? 'active' : 'text-gray-600'}" onclick="setKioskCategory('${c}')">
      <span>${emoji}</span> ${c.toUpperCase()}
    </button>`;
  }).join('');
}

function setKioskCategory(cat) {
  activeCategory = cat;
  renderKioskCategories();
  renderKioskProducts();
}

// Render products grid
function renderKioskProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  let filtered = products.filter(p => p.category !== 'Acompañantes' && p.category !== 'Acompañantes del dia' && (activeCategory === 'Todos' || p.category === activeCategory));
  
  // Sort featured products first
  filtered.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));

  if (!filtered.length) {
    container.innerHTML = '<div class="col-span-full py-20 text-center text-gray-400 font-bold">No hay productos en esta categoría</div>';
    return;
  }

  container.innerHTML = filtered.map((p, index) => {
    const hasExtras = (window.allVisualExtras || []).some(e => String(e.product_id) === String(p.id));
    const hasAcc = p.accompaniments && p.accompaniments.trim().length > 0;
    
    return `
    <div class="kiosk-product-card relative flex flex-col h-full bg-white border border-gray-100 rounded-2xl overflow-hidden cursor-pointer active:scale-95 transition-all opacity-0 animate-fade-in-up ${p.is_featured ? 'border-2 border-orange-500/30 shadow-[0_8px_30px_rgba(234,88,12,0.08)]' : ''}" style="animation-delay: ${index * 0.05}s" onclick="handleProductTap('${p.id}')">
      
      <div class="h-28 md:h-36 w-full bg-white relative overflow-hidden flex items-center justify-center shrink-0">
        ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" class="w-full h-full object-contain p-2" loading="lazy" decoding="async">` : '<span class="text-4xl">🍽️</span>'}
        ${p.is_featured ? `<span class="absolute top-2 left-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md shadow-sm z-10">🔥 REC</span>` : ''}
        ${(hasExtras || hasAcc) ? '<span class="absolute bottom-2 right-2 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md z-10">+Extras</span>' : ''}
      </div>
      
      <div class="p-3 md:p-4 flex flex-col flex-1 border-t border-gray-50">
        <h4 class="text-xs md:text-sm font-black text-gray-900 leading-tight mb-1 line-clamp-2">${p.name}</h4>
        ${p.description ? `<p class="text-[10px] md:text-xs text-gray-500 leading-snug line-clamp-2 mb-2">${p.description}</p>` : ''}
        
        <div class="mt-auto pt-2 flex items-center justify-between">
          <span class="text-sm md:text-base font-black text-orange-600">$${Number(p.price).toLocaleString()}</span>
          <div class="bg-gray-100 text-gray-800 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center font-black text-sm md:text-lg shrink-0">＋</div>
        </div>
      </div>
    </div>
  `}).join('');
}

// Select Order Type
function selectKioskOrderType(type) {
  kioskDeliveryMethodSelected = type;
  document.getElementById('kDeliveryMethod').value = type;
  document.getElementById('kDeliveryLabel').textContent = type;
  
  const addrContainer = document.getElementById('kAddressContainer');
  const tableContainer = document.getElementById('kTableContainer');
  const phoneInput = document.getElementById('kCustomerPhone');
  
  if (phoneInput) {
    phoneInput.classList.remove('hidden');
  }
  
  if (type === 'A la mesa') {
    tableContainer.classList.remove('hidden');
    addrContainer.classList.add('hidden');
  } else if (type === 'Domicilio') {
    tableContainer.classList.add('hidden');
    addrContainer.classList.remove('hidden');
  } else {
    tableContainer.classList.add('hidden');
    addrContainer.classList.add('hidden');
  }
  
  document.getElementById('kioskOrderType').style.display = 'none';
  document.getElementById('kioskOrderType').classList.add('hidden');
  document.getElementById('kioskMain').style.display = 'flex';
  document.getElementById('kioskMain').classList.remove('hidden');
  
  updateKioskCartUI();
  resetInactivityTimer();
}

// Start Order Flow
function startOrder() {
  const welcome = document.getElementById('kioskWelcome');
  const orderType = document.getElementById('kioskOrderType');
  const main = document.getElementById('kioskMain');
  
  if (welcome) welcome.style.display = 'none';
  if (orderType) {
    orderType.style.display = 'flex';
    orderType.classList.remove('hidden');
  }
  if (main) main.classList.add('hidden');
  
  cart = {};
  currentCoupon = null;
  currentSelectedProductId = null;
  
  document.getElementById('kCustomerName').value = '';
  document.getElementById('kCustomerTable').value = '';
  document.getElementById('kCouponInput').value = '';
  const phoneEl = document.getElementById('kCustomerPhone');
  if (phoneEl) phoneEl.value = '';
  const cRes = document.getElementById('kCouponResult');
  if (cRes) cRes.classList.add('hidden');

  updateKioskCartUI();
  resetInactivityTimer();
}

// Reset Kiosk Flow
function resetKiosk() {
  clearInterval(inactivityTimer);
  const welcome = document.getElementById('kioskWelcome');
  const orderType = document.getElementById('kioskOrderType');
  const main = document.getElementById('kioskMain');
  const indicator = document.getElementById('inactivityIndicator');
  
  if (welcome) welcome.style.display = 'flex';
  if (orderType) { orderType.style.display = 'none'; orderType.classList.add('hidden'); }
  if (main) { main.style.display = 'none'; main.classList.add('hidden'); }
  if (indicator) indicator.classList.add('hidden');
  
  const panel = document.getElementById('kioskCartPanel');
  if (panel) {
    panel.classList.add('translate-y-full');
    panel.classList.remove('translate-y-0');
  }
  
  // Hide all modals
  document.getElementById('accompanimentsModal').classList.add('hidden');
  document.getElementById('kTicketModal').classList.add('hidden');
}

// Handle Product selection (check for accompaniments)
function handleProductTap(prodId) {
  const p = products.find(x => String(x.id) === String(prodId));
  if (!p) return;

  const hasAcc = p.accompaniments && p.accompaniments.trim() !== '';
  const extras = (window.allVisualExtras || []).filter(e => String(e.product_id) === String(p.id));
  const hasExtras = extras.length > 0;

  if (hasAcc || hasExtras) {
    openAccompanimentsModal(p, extras);
  } else {
    addToCart(p.id);
  }
}

// Open Accompaniments Touch Modal
window.kioskCurrentLimit = 999;

function openAccompanimentsModal(product, visualExtras) {
  currentSelectedProductId = product.id;
  tempSelectedAccompaniments = [];
  tempSelectedVisualExtras = [];
  window.kioskCurrentLimit = product.accompaniments_limit || 999;

  document.getElementById('accModalTitle').textContent = product.name;
  
  const limitLabel = document.getElementById('accModalLimit');
  if (limitLabel) {
    if (product.accompaniments_limit) {
      limitLabel.textContent = `Elige hasta ${window.kioskCurrentLimit} opciones`;
    } else {
      limitLabel.textContent = 'Elige tus acompañamientos';
    }
  }

  const container = document.getElementById('accModalContent');
  container.innerHTML = '';

  let html = '';

  // 1. Text accompaniments
  if (product.accompaniments) {
    const accList = product.accompaniments.split(',').map(x => x.trim()).filter(Boolean);
    if (accList.length) {
      html += `
      <div>
        <h4 class="font-black text-gray-800 text-sm uppercase tracking-widest mb-3">Acompañamientos (Máx. ${window.kioskCurrentLimit})</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${accList.map((acc, index) => `
            <div id="kioskAccCard_${index}" class="flex items-center justify-between gap-3 bg-white border-2 border-gray-50 shadow-sm hover:shadow-md hover:border-orange-100 rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all duration-300 animate-fade-in-up" style="animation-delay: ${index * 0.04}s" onclick="updateKioskAccCount('acc_${index}', 1)">
              <div class="min-w-0 flex-1 pointer-events-none">
                <span class="text-sm md:text-base font-black text-gray-800 block whitespace-normal leading-tight">${acc}</span>
                <span class="text-[10px] text-red-600 font-black tracking-widest uppercase mt-1 inline-block bg-red-50 px-2 py-0.5 rounded-md">Gratis</span>
              </div>
              <div class="flex items-center gap-2 md:gap-3 shrink-0" onclick="event.stopPropagation()">
                <button type="button" class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-lg hover:bg-gray-200 hover:text-gray-900 active:scale-90 transition-all shadow-sm" onclick="updateKioskAccCount('acc_${index}', -1)">−</button>
                <span id="kioskCount_acc_${index}" class="font-black text-gray-800 text-base md:text-lg w-5 text-center">0</span>
                <button type="button" class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-lg hover:bg-orange-100 hover:text-orange-700 active:scale-90 transition-all shadow-sm" onclick="updateKioskAccCount('acc_${index}', 1)">+</button>
              </div>
              <input type="hidden" class="kiosk-acc-input" id="kioskInput_acc_${index}" value="${acc}" data-count="0">
            </div>
          `).join('')}
        </div>
      </div>`;
    }
  }

  // 2. Visual Extras
  if (visualExtras && visualExtras.length) {
    html += `
    <div class="border-t border-gray-100 pt-6 mt-6">
      <h4 class="font-black text-gray-800 text-sm uppercase tracking-widest mb-3">Adicionales / Opciones</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${visualExtras.map((extra, index) => `
          <div id="kioskVecCard_${index}" class="flex items-center justify-between gap-3 md:gap-4 bg-white border-2 border-gray-50 shadow-sm hover:shadow-md hover:border-orange-100 rounded-2xl p-3 md:p-4 cursor-pointer active:scale-[0.98] transition-all duration-300 animate-fade-in-up" style="animation-delay: ${index * 0.04}s" onclick="updateKioskAccCount('ve_${index}', 1)">
            ${extra.image_url ? `<div class="relative w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-xl overflow-hidden bg-gray-50 shadow-sm"><img src="${extra.image_url}" alt="${extra.name}" class="w-full h-full object-cover pointer-events-none scale-105 hover:scale-110 transition-transform duration-500"></div>` : '<div class="w-14 h-14 md:w-16 md:h-16 bg-gray-50 flex items-center justify-center text-2xl rounded-xl shrink-0 pointer-events-none shadow-sm">➕</div>'}
            <div class="min-w-0 flex-1 pointer-events-none flex flex-col justify-center">
              <span class="text-sm md:text-base font-black text-gray-800 block whitespace-normal leading-tight">${extra.name}</span>
              <div class="mt-1">
                <span class="text-[10px] md:text-xs text-red-600 font-black tracking-widest uppercase inline-block bg-red-50 px-2 py-0.5 rounded-md shadow-sm">${Number(extra.price) > 0 ? '+$' + Number(extra.price).toLocaleString() : 'Gratis'}</span>
              </div>
            </div>
            <div class="flex items-center gap-2 md:gap-3 shrink-0" onclick="event.stopPropagation()">
              <button type="button" class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-lg hover:bg-gray-200 hover:text-gray-900 active:scale-90 transition-all shadow-sm" onclick="updateKioskAccCount('ve_${index}', -1)">−</button>
              <span id="kioskCount_ve_${index}" class="font-black text-gray-800 text-base md:text-lg w-5 text-center">0</span>
              <button type="button" class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-lg hover:bg-orange-100 hover:text-orange-700 active:scale-90 transition-all shadow-sm" onclick="updateKioskAccCount('ve_${index}', 1)">+</button>
            </div>
            <input type="hidden" class="kiosk-ve-input" id="kioskInput_ve_${index}" value='${JSON.stringify(extra).replace(/'/g, "&#39;")}' data-count="0">
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  container.innerHTML = html;
  
  // Connect Confirm Button
  const confirmBtn = document.getElementById('btnConfirmAcc');
  confirmBtn.onclick = () => {
    // Collect from inputs instead of temp arrays
    const selectedAccs = [];
    document.querySelectorAll('.kiosk-acc-input').forEach(el => {
      const count = parseInt(el.getAttribute('data-count')) || 0;
      for(let i=0; i<count; i++) selectedAccs.push(el.value);
    });

    const selectedVEs = [];
    document.querySelectorAll('.kiosk-ve-input').forEach(el => {
      const count = parseInt(el.getAttribute('data-count')) || 0;
      if (count > 0) {
        const data = JSON.parse(el.value);
        for(let i=0; i<count; i++) selectedVEs.push({ id: data.id, name: data.name, price: Number(data.price || 0) });
      }
    });

    addToCart(product.id, selectedAccs, selectedVEs);
    closeAccompanimentsModal();
  };

  updateKioskModalTotal();
  document.getElementById('accompanimentsModal').classList.remove('hidden');
  document.getElementById('accompanimentsModal').classList.add('flex');
}

window.updateKioskAccCount = function(id, delta) {
  const inputEl = document.getElementById(`kioskInput_${id}`);
  const countSpan = document.getElementById(`kioskCount_${id}`);
  
  const isAcc = id.startsWith('acc_');
  const cardId = isAcc ? `kioskAccCard_${id.replace('acc_', '')}` : `kioskVecCard_${id.replace('ve_', '')}`;
  const card = document.getElementById(cardId);

  let current = parseInt(inputEl.getAttribute('data-count')) || 0;
  let newCount = current + delta;

  if (newCount < 0) newCount = 0;

  if (delta > 0) {
    let totalSelected = 0;
    document.querySelectorAll('.kiosk-acc-input, .kiosk-ve-input').forEach(el => {
      totalSelected += parseInt(el.getAttribute('data-count')) || 0;
    });

    if (totalSelected >= window.kioskCurrentLimit) {
      if (card) {
        card.classList.add('animate-[shake_0.4s_ease-in-out]');
        setTimeout(() => card.classList.remove('animate-[shake_0.4s_ease-in-out]'), 400);
      }
      return showToast(`⚠️ Solo puedes elegir hasta ${window.kioskCurrentLimit} opciones`, 'error');
    }
  }

  inputEl.setAttribute('data-count', newCount);
  countSpan.textContent = newCount;

  if (card) {
    if (newCount > 0) {
      card.classList.add('border-orange-500', 'bg-orange-50', 'shadow-md');
      card.classList.remove('border-gray-50', 'bg-white', 'shadow-sm');
    } else {
      card.classList.remove('border-orange-500', 'bg-orange-50', 'shadow-md');
      card.classList.add('border-gray-50', 'bg-white', 'shadow-sm');
    }
  }

  updateKioskModalTotal();
};

window.updateKioskModalTotal = function() {
  const p = products.find(x => String(x.id) === String(currentSelectedProductId));
  if (!p) return;
  let total = Number(p.price) || 0;
  
  document.querySelectorAll('.kiosk-ve-input').forEach(el => {
    const count = parseInt(el.getAttribute('data-count')) || 0;
    if (count > 0) {
      const data = JSON.parse(el.value);
      total += (Number(data.price || 0) * count);
    }
  });
  
  document.getElementById('accModalTotal').textContent = `$${total.toLocaleString()}`;
};

function closeAccompanimentsModal() {
  document.getElementById('accompanimentsModal').classList.add('hidden');
  document.getElementById('accompanimentsModal').classList.remove('flex');
}

// Add to Cart
function addToCart(id, accompaniments = [], visualExtras = []) {
  const accKey = accompaniments.length ? accompaniments.join(',') : '';
  const veKey = visualExtras.length ? visualExtras.map(v => v.id).sort().join(',') : '';
  const key = `${id}_${accKey}_${veKey}`;
  
  if (cart[key]) {
    cart[key].qty++;
  } else {
    cart[key] = { id, qty: 1, accompaniments, visualExtras };
  }
  
  updateKioskCartUI();
  showToast('✅ Agregado al carrito');
}

// Change Quantity in Cart
function updateQty(key, delta) {
  if (!cart[key]) return;
  cart[key].qty += delta;
  if (cart[key].qty <= 0) {
    delete cart[key];
  }
  updateKioskCartUI();
}

// Update Cart View
function updateKioskCartUI() {
  const container = document.getElementById('cartList');
  const badge = document.getElementById('cartCountBadge');
  const form = document.getElementById('kioskForm');
  
  if (!container) return;

  const cartKeys = Object.keys(cart);
  let totalQty = 0;
  let subtotal = 0;

  if (cartKeys.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-gray-400 font-bold py-10 md:py-20 text-center">
        <span class="text-6xl mb-4 opacity-50">🛒</span>
        <p class="text-lg">Tu carrito está vacío</p>
        <p class="text-xs font-normal text-gray-400 mt-1">Selecciona productos a la izquierda para agregarlos.</p>
      </div>`;
    if (badge) badge.textContent = '0 items';
    if (form) form.classList.add('hidden');
    
    document.getElementById('kCartSubtotal').textContent = '$0';
    document.getElementById('kCartTotal').textContent = '$0';
    document.getElementById('kDiscountRow').classList.add('hidden');
    
    const mobileBtn = document.getElementById('kioskMobileCartBtn');
    if (mobileBtn) {
      mobileBtn.classList.add('translate-y-32');
      setTimeout(() => mobileBtn.classList.add('hidden'), 300);
    }
    return;
  }

  if (form) form.classList.remove('hidden');

  let html = '';
  for (const key of cartKeys) {
    const item = cart[key];
    const p = products.find(x => String(x.id) === String(item.id));
    if (!p) continue;

    totalQty += item.qty;
    let extrasPrice = 0;
    item.visualExtras.forEach(ve => { extrasPrice += Number(ve.price || 0); });
    const itemPrice = p.price + extrasPrice;
    subtotal += itemPrice * item.qty;

    let allAcc = [...(item.accompaniments || [])];
    item.visualExtras.forEach(ve => allAcc.push(ve.price > 0 ? `${ve.name} (+$${Number(ve.price).toLocaleString()})` : ve.name));

    html += `
      <div class="flex items-start justify-between border-b border-gray-100 pb-4">
        <div class="flex-grow pr-4 text-left">
          <p class="font-black text-gray-800 leading-snug">${p.name}</p>
          ${allAcc.length ? `<p class="text-xs text-gray-400 mt-1 font-medium leading-relaxed">${allAcc.join(', ')}</p>` : ''}
          <p class="font-black text-sm text-red-600 mt-1">$${(itemPrice * item.qty).toLocaleString()}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <button onclick="updateQty('${key}', -1)" class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center active:scale-90 transition-all">-</button>
          <span class="font-black text-sm text-gray-800">${item.qty}</span>
          <button onclick="updateQty('${key}', 1)" class="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center active:scale-90 transition-all">+</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  if (badge) badge.textContent = `${totalQty} ${totalQty === 1 ? 'item' : 'items'}`;

  // Apply Coupon Discount if Valid
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
      const res = document.getElementById('kCouponResult');
      if (res) {
        res.textContent = `⚠️ Compra mínima de $${Number(minVal).toLocaleString()} requerida`;
        res.className = 'text-xs font-bold text-red-500 block px-2';
      }
    }
  }

  let appliedDeliveryFee = (kioskDeliveryMethodSelected === 'Domicilio') ? kioskDeliveryFeeAmount : 0;
  let total = subtotal - discount + appliedDeliveryFee;
  if (total < 0) total = 0;

  document.getElementById('kCartSubtotal').textContent = `$${subtotal.toLocaleString()}`;
  document.getElementById('kCartTotal').textContent = `$${total.toLocaleString()}`;

  const mobileBtn = document.getElementById('kioskMobileCartBtn');
  if (mobileBtn && totalQty > 0) {
    mobileBtn.classList.remove('hidden');
    setTimeout(() => mobileBtn.classList.remove('translate-y-32'), 10);
    document.getElementById('mobileCartItemCount').textContent = totalQty;
    document.getElementById('mobileCartTotal').textContent = `$${total.toLocaleString()}`;
  }

  const discRow = document.getElementById('kDiscountRow');
  if (discount > 0) {
    discRow.classList.remove('hidden');
    document.getElementById('kCartDiscount').textContent = `-$${discount.toLocaleString()}`;
  } else {
    discRow.classList.add('hidden');
  }

  // Handle visual delivery fee
  let feeRow = document.getElementById('kDeliveryFeeRow');
  if (!feeRow && appliedDeliveryFee > 0) {
    const parent = discRow.parentNode;
    feeRow = document.createElement('div');
    feeRow.id = 'kDeliveryFeeRow';
    feeRow.className = 'border-t border-gray-200 pt-2 flex justify-between text-sm font-bold text-gray-500';
    feeRow.innerHTML = `<span>Domicilio:</span> <span id="kCartDeliveryFee" class="text-orange-600">+$0</span>`;
    parent.insertBefore(feeRow, parent.lastElementChild);
  } else if (feeRow) {
    if (appliedDeliveryFee > 0) {
      feeRow.classList.remove('hidden');
      document.getElementById('kCartDeliveryFee').textContent = `+$${appliedDeliveryFee.toLocaleString()}`;
    } else {
      feeRow.classList.add('hidden');
    }
  }
}

// Removed setDelivery since it's replaced by selectKioskOrderType

// Coupon validation
async function kApplyCoupon() {
  const input = document.getElementById('kCouponInput');
  const result = document.getElementById('kCouponResult');
  if (!input || !result) return;

  const code = input.value.trim().toUpperCase();
  if (!code) {
    result.classList.add('hidden');
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
      result.textContent = '❌ Cupón no válido o vencido';
      result.className = 'text-xs font-bold text-red-500 block px-2';
      result.classList.remove('hidden');
      updateKioskCartUI();
      return;
    }

    // Date validations
    const now = new Date();
    if (data.valid_from && new Date(data.valid_from) > now) {
      currentCoupon = null;
      result.textContent = '❌ Cupón inactivo';
      result.className = 'text-xs font-bold text-red-500 block px-2';
      result.classList.remove('hidden');
      updateKioskCartUI();
      return;
    }
    if (data.valid_until && new Date(data.valid_until) < now) {
      currentCoupon = null;
      result.textContent = '❌ Cupón vencido';
      result.className = 'text-xs font-bold text-red-500 block px-2';
      result.classList.remove('hidden');
      updateKioskCartUI();
      return;
    }

    // Limit validations
    if (data.max_uses && data.used_count >= data.max_uses) {
      currentCoupon = null;
      result.textContent = '❌ Cupón agotado';
      result.className = 'text-xs font-bold text-red-500 block px-2';
      result.classList.remove('hidden');
      updateKioskCartUI();
      return;
    }

    // Calculate subtotal to validate min order
    let subtotal = 0;
    for (const key of Object.keys(cart)) {
      const item = cart[key];
      const p = products.find(x => String(x.id) === String(item.id));
      if (p) {
        let ext = 0;
        item.visualExtras.forEach(e => { ext += Number(e.price || 0); });
        subtotal += (p.price + ext) * item.qty;
      }
    }

    if (subtotal < (data.min_order || 0)) {
      currentCoupon = null;
      result.textContent = `⚠️ Compra mínima: $${Number(data.min_order).toLocaleString()}`;
      result.className = 'text-xs font-bold text-orange-500 block px-2';
      result.classList.remove('hidden');
      updateKioskCartUI();
      return;
    }

    currentCoupon = data;
    result.textContent = `✅ Cupón: -${data.discount_type === 'percentage' ? data.discount_value + '%' : '$' + Number(data.discount_value).toLocaleString()}`;
    result.className = 'text-xs font-bold text-green-600 block px-2';
    result.classList.remove('hidden');
    updateKioskCartUI();
    showToast('🎟&nbsp;Cupón aplicado');
  } catch (err) {
    console.error(err);
    currentCoupon = null;
    result.textContent = '❌ Error al aplicar cupón';
    result.className = 'text-xs font-bold text-red-500 block px-2';
    result.classList.remove('hidden');
    updateKioskCartUI();
  }
}

// Process checkout in Kiosk
async function kProcessOrder() {
  const keys = Object.keys(cart);
  if (!keys.length) return showToast('Agrega productos al carrito', 'error');

  let name = document.getElementById('kCustomerName').value.trim();
  const phoneEl = document.getElementById('kCustomerPhone');
  let phone = phoneEl ? phoneEl.value.trim() : '';
  
  if (name !== 'VENTA RAPIDA' && !phone) {
    if (phoneEl) {
      phoneEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      phoneEl.focus();
    }
    return showToast('⚠️ Ingresa tu WhatsApp para seguimiento', 'error');
  }
  
  if (!phone) phone = 'N/A';
  const delivery = kioskDeliveryMethodSelected;
  let finalAddress = '';
  let mesaSelectValue = '';
  let existingOrderIdToAppend = null;

  if (delivery === 'A la mesa') {
    const tableSelect = document.getElementById('kCustomerTable');
    mesaSelectValue = tableSelect.value;
    if (!mesaSelectValue) return showToast('⚠️ Selecciona tu mesa', 'error');
    finalAddress = 'Mesa ' + mesaSelectValue;
    
    // Check if table is occupied to append
    if (tableSelect.selectedOptions && tableSelect.selectedOptions.length > 0) {
      existingOrderIdToAppend = tableSelect.selectedOptions[0].getAttribute('data-order-id');
    }
  } else if (delivery === 'Domicilio') {
    finalAddress = document.getElementById('kCustomerAddress').value.trim();
    if (!finalAddress) return showToast('⚠️ Ingresa la dirección de entrega', 'error');
  } else {
    finalAddress = 'Llevar / Kiosko';
  }

  if (!name) name = 'Venta Rápida';

  const btn = document.getElementById('btnKProcess');
  const origText = btn.innerHTML;
  btn.innerHTML = '⏳ ENVIANDO...';
  btn.disabled = true;

  try {
    let subtotal = 0;
    const orderItems = [];

    for (const key of keys) {
      const item = cart[key];
      const p = products.find(x => String(x.id) === String(item.id));
      if (!p) continue;

      let extrasPrice = 0;
      let allAcc = [...(item.accompaniments || [])];
      item.visualExtras.forEach(ve => {
        extrasPrice += Number(ve.price || 0);
        allAcc.push(ve.price > 0 ? `${ve.name} (+$${Number(ve.price).toLocaleString()})` : ve.name);
      });

      const itemPrice = p.price + extrasPrice;
      subtotal += itemPrice * item.qty;

      const displayName = allAcc.length 
        ? `${p.name} (Acompañamientos: ${allAcc.join(', ')})`
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

    let appliedDeliveryFee = (delivery === 'Domicilio') ? kioskDeliveryFeeAmount : 0;
    let total = subtotal - discount + appliedDeliveryFee;
    if (total < 0) total = 0;

    let orderToPrint = null;

    if (existingOrderIdToAppend) {
      // Append to existing order
      const { data: exData } = await supabaseClient.from('orders').select('items, total, discount').eq('id', existingOrderIdToAppend).single();
      if (exData) {
        orderItems.unshift(...(exData.items || []));
        total += Number(exData.total || 0);
        discount += Number(exData.discount || 0);
      }
      
      const { data: order, error } = await supabaseClient
        .from('orders')
        .update({
          items: orderItems,
          total,
          discount,
          coupon_code: currentCoupon ? currentCoupon.code : ''
        })
        .eq('id', existingOrderIdToAppend)
        .select()
        .single();
      
      if (error) throw error;
      orderToPrint = order;
    } else {
      // Insert new order in DB (payment defaults to 'Pendiente' since kiosk users pay at register)
      const { data: order, error } = await supabaseClient
        .from('orders')
        .insert([{
          customer_name: name,
          customer_phone: phone,
          items: orderItems,
          total,
          delivery_fee: appliedDeliveryFee,
          delivery_method: delivery,
          payment_method: 'Pendiente', // Not Paid yet
          address: finalAddress,
          notes: '[ORIGIN:KIOSKO] Pedido realizado desde Kiosko Auto-Servicio',
          business_id: currentBusinessId,
          discount,
          coupon_code: currentCoupon ? currentCoupon.code : '',
          status: 'Pendiente' // Ensure it's pending so kitchen sees it
        }])
        .select()
        .single();

      if (error) throw error;
      orderToPrint = order;
    }

    // Imprimir ticket de cliente en Kiosko
    printKioskTicket(orderToPrint);

    // Increment coupon uses
    if (currentCoupon) {
      try {
        await supabaseClient
          .from('coupons')
          .update({ used_count: (currentCoupon.used_count || 0) + 1 })
          .eq('id', currentCoupon.id);
      } catch (e) {
        console.warn(e);
      }
    }

    // Stop inactivity timer while showing success ticket
    clearInterval(inactivityTimer);

    // Render Ticket modal
    document.getElementById('kTModalOrderId').textContent = `#${String(orderToPrint.id).padStart(4, '0')}`;
    document.getElementById('kTRecName').textContent = orderToPrint.customer_name;
    
    const tableRow = document.getElementById('kTRecTableSelect');
    if (delivery === 'A la mesa') {
      tableRow.classList.remove('hidden');
      document.getElementById('kTRecTable').textContent = mesaSelectValue;
    } else {
      tableRow.classList.add('hidden');
    }

    document.getElementById('kTRecTotal').textContent = `$${Number(orderToPrint.total).toLocaleString()}`;
    
    // Set QR code image src for tracking
    const trackingUrl = window.location.origin + '/order-status.html?id=' + orderToPrint.id;
    const qrImg = document.getElementById('kKioskQrImage');
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(trackingUrl)}`;
    }

    // Show ticket modal
    document.getElementById('kTicketModal').classList.remove('hidden');
    document.getElementById('kTicketModal').classList.add('flex');

    // 15 seconds countdown before auto-restart
    let countdown = 15;
    const cdEl = document.getElementById('kTCountdown');
    if (cdEl) cdEl.textContent = countdown;
    
    const cdTimer = setInterval(() => {
      countdown--;
      if (cdEl) cdEl.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(cdTimer);
        resetKiosk();
      }
    }, 1000);

    // Save timer reference on window so it can be cleared if clicked manually
    window.kioskSuccessTimer = cdTimer;

  } catch (err) {
    console.error(err);
    showToast('❌ Error al procesar tu pedido', 'error');
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

// Send WhatsApp message to customer from Kiosk
function sendKioskWhatsApp(order) {
  if (!order || !order.customer_phone || order.customer_phone === 'N/A' || order.customer_phone === 'VENTA RAPIDA' || order.customer_name === 'VENTA RAPIDA') return;
  
  let msg = `🍦 *¡Gracias por tu compra en Goloso!* ✨\n`;
  msg += `Hemos recibido tu pedido con éxito. Aquí tienes el detalle:\n\n`;
  msg += `🛒 *PEDIDO #${String(order.id).padStart(4, '0')}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  
  for (const item of order.items || []) {
    msg += `▪️ ${item.name} x${item.qty}\n`;
  }
  
  const discount = Number(order.discount || 0);
  const total = Number(order.total || 0);
  const subtotal = total + discount - (order.delivery_fee || 0);
  
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Subtotal: $${subtotal.toLocaleString()}\n`;
  if (discount > 0) msg += `Descuento: -$${discount.toLocaleString()}\n`;
  if (order.delivery_fee > 0) msg += `Domicilio: +$${Number(order.delivery_fee).toLocaleString()}\n`;
  msg += `💰 *TOTAL A PAGAR: $${total.toLocaleString()}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `👤 *Cliente:* ${order.customer_name}\n`;
  msg += `📦 *Método:* ${order.delivery_method}\n`;
  if (order.address && order.address !== 'Llevar / Kiosko') {
    msg += `📍 *Ubicación/Mesa:* ${order.address}\n`;
  }
  
  const trackingUrl = window.location.origin + '/order-status.html?id=' + order.id;
  msg += `\n🔗 *Sigue el estado de tu pedido aquí:*\n${trackingUrl}\n`;
  
  const cleanPhone = order.customer_phone.replace(/\D/g, '');
  const finalPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
  
  window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Override resetKiosk to clear the success timer if clicked manually
const originalResetKiosk = resetKiosk;
resetKiosk = function() {
  if (window.kioskSuccessTimer) {
    clearInterval(window.kioskSuccessTimer);
    window.kioskSuccessTimer = null;
  }
  originalResetKiosk();
};

async function printKioskTicket(o) {
  // Try PrintBridge first (silent network print - works from Android!)
  if (typeof bridgePrintTicket === 'function') {
    const ok = await bridgePrintTicket(o, window.kioskSettings || {});
    if (ok) { console.log('[Kiosk] Ticket impreso via PrintBridge'); return; }
  }
  // Fallback: browser iframe print -> DISABLED per request to avoid print dialog popup
  console.log('[Kiosk] Browser print fallback skipped per request. Ticket is printed from POS/Kitchen.');
}

// Initialize Kiosk
(async function init() {
  // Verify active session - redirect to login if not authenticated
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const ok = await initKioskBusiness();
  if (!ok) return;

  await loadKioskSettings();
  await loadKioskProducts();

  const loading = document.getElementById('loadingBizScreen');
  if (loading) {
    loading.style.opacity = '0';
    setTimeout(() => loading.style.display = 'none', 300);
  }
})();

// Toggle mobile cart modal
window.toggleKioskMobileCart = function() {
  const panel = document.getElementById('kioskCartPanel');
  if (panel.classList.contains('translate-y-full')) {
    panel.classList.remove('translate-y-full');
    panel.classList.add('translate-y-0');
  } else {
    panel.classList.add('translate-y-full');
    panel.classList.remove('translate-y-0');
  }
};

window.kSetVentaRapida = function() {
  const nameEl = document.getElementById('kCustomerName');
  const phoneEl = document.getElementById('kCustomerPhone');
  if (nameEl) nameEl.value = 'VENTA RAPIDA';
  // Clear phone or leave blank so validation skips it, wait we need to let validation skip it.
  // We added `name !== 'VENTA RAPIDA'` to the validation, so it will skip.
};

let logoClicks = 0;
window.handleLogoClick = function() {
  logoClicks++;
  if (logoClicks >= 5) {
    logoClicks = 0;
    const currentIP = localStorage.getItem('printbridge_url') || 'http://192.168.1.100:9101';
    const newIP = prompt("⚙️ Configuración del Servidor de Impresión (PrintBridge):\nIngrese la dirección IP y puerto del servidor del PC (ej. http://192.168.1.100:9101):", currentIP);
    if (newIP !== null) {
      localStorage.setItem('printbridge_url', newIP);
      if (typeof PRINTBRIDGE_URL !== 'undefined') {
        PRINTBRIDGE_URL = newIP;
      }
      alert("✅ Servidor de impresión configurado en:\n" + newIP);
      // Try to detect/connect
      if (typeof detectPrintBridge === 'function') {
        detectPrintBridge();
      }
    }
  }
};
