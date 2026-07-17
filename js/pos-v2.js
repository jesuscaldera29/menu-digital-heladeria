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
let currentOpenOrderId = null;
let posCustomers = [];
let activeCashClosingId = null;

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
      const { data: bizList } = await supabaseClient.from('businesses').select('id, business_name').eq('owner_id', session.user.id).limit(1);
      if (bizList && bizList.length > 0) { businessId = localStorage.getItem('business_id') || bizList[0].id; staffName = "Administrador"; }
      else { window.location.href = 'login.html'; return; }
    }
  }

  document.getElementById('cashierName').textContent = '👤 ' + (staffName || 'Cajero').toUpperCase();
  await loadSettings();
  await loadCustomers();
  await loadDrivers();
  await reloadAllDataAndRender();

  // Init Auto-Print
  autoPrintEnabled = localStorage.getItem('pos_auto_print') === 'true';
  updateAutoPrintUI();
  subscribeToOnlineOrders();

  // Load initial notifications badge count
  loadInitialNotifBadge();
  startOrderPolling();

  const loading = document.getElementById('loadingBizScreen');
  if (loading) {
    loading.style.opacity = '0';
    setTimeout(() => loading.style.display = 'none', 300);
  }

  const staffRole = localStorage.getItem('staff_role');
  if (staffRole === 'Mesero') {
    const btnCashMgmt = document.getElementById('btnCashMgmt');
    if (btnCashMgmt) btnCashMgmt.classList.add('hidden');
    
    // Hide 'Gestión de Caja', 'Corte de Caja' in the more menu
    const menuButtons = document.querySelectorAll('#posMoreMenu button');
    menuButtons.forEach(btn => {
      if (btn.innerText.includes('Gestión de Caja') || btn.innerText.includes('Corte de Caja')) {
        btn.classList.add('hidden');
      }
    });
  } else {
    await checkActiveCashRegister();
  }
}

async function checkActiveCashRegister() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: activeClosing } = await supabaseClient
      .from('cash_closings')
      .select('id, opened_at')
      .eq('business_id', businessId)
      .eq('is_open', true)
      .gte('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const btnCash = document.getElementById('btnCashMgmt');
    if (activeClosing) {
      activeCashClosingId = activeClosing.id;
      if (btnCash) {
        btnCash.innerHTML = '<span>💵</span> <span class="hidden sm:inline">Caja (Abierta)</span>';
        btnCash.classList.remove('text-red-500', 'bg-red-500/10', 'border-red-500/20');
        btnCash.classList.add('text-green-500', 'bg-green-500/10', 'border-green-500/20');
      }
    } else {
      activeCashClosingId = null;
      if (btnCash) {
        btnCash.innerHTML = '<span>🛑</span> <span class="hidden sm:inline">Abrir Caja</span>';
        btnCash.classList.remove('text-green-500', 'bg-green-500/10', 'border-green-500/20');
        btnCash.classList.add('text-red-500', 'bg-red-500/10', 'border-red-500/20');
      }
      // Force cash opening
      setTimeout(openCashModal, 1000);
    }
  } catch(e) {
    console.error('Error checking cash register:', e);
  }
}

async function loadInitialNotifBadge() {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const { data } = await supabaseClient
      .from('orders')
      .select('id, notes, status')
      .eq('business_id', businessId)
      .gte('created_at', startOfDay.toISOString())
      .in('status', ['Pendiente', 'En preparación']);

    const pending = (data || []).filter(o => {
      const n = o.notes || '';
      return n.includes('[ORIGIN:KIOSKO]') || n.includes('[ORIGIN:MENU]') || (!n.includes('[ORIGIN:POS]') && true);
    });
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.textContent = pending.length;
      badge.classList.toggle('hidden', pending.length === 0);
    }
  } catch(e) { console.error('Badge load error', e); }
}

let posOrderPollingInterval = null;

function startOrderPolling() {
  if (posOrderPollingInterval) clearInterval(posOrderPollingInterval);
  
  posOrderPollingInterval = setInterval(async () => {
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const { data } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('business_id', businessId)
        .gte('created_at', startOfDay.toISOString())
        .in('status', ['Pendiente', 'En preparación'])
        .order('created_at', { ascending: false });
        
      if (!data) return;
      
      let newOrdersFound = false;
      
      data.forEach(order => {
        const n = order.notes || '';
        if (n.includes('[ORIGIN:KIOSKO]') || n.includes('[ORIGIN:MENU]') || (!n.includes('[ORIGIN:POS]') && true)) {
          const exists = window.notifOrders.find(o => String(o.id) === String(order.id));
          if (!exists) {
            window.notifOrders.unshift(order);
            newOrdersFound = true;
          }
        }
      });
      
      if (newOrdersFound) {
        renderNotifications();
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2190/2190-preview.mp3');
          audio.volume = 1.0;
          audio.play().catch(e => console.log('Audio blocked', e));
        } catch (e) { }
        
        const badge = document.getElementById('notifBadge');
        if (badge) {
          badge.classList.remove('animate-pulse');
          badge.classList.add('animate-bounce');
          setTimeout(() => badge.classList.remove('animate-bounce'), 3000);
        }
      }
    } catch(err) {
      console.log('Polling error silently ignored', err);
    }
  }, 10000);
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
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          // Play notification sound
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2190/2190-preview.mp3');
            audio.volume = 1.0;
            audio.play().catch(e => console.log('Audio blocked', e));
          } catch (e) { }

          // Push to notifications panel and animate badge
          if (typeof pushToNotifications === 'function') {
            pushToNotifications(payload.new);
            
            const badge = document.getElementById('notifBadge');
            if (badge) {
              badge.classList.remove('animate-pulse');
              badge.classList.add('animate-bounce');
              setTimeout(() => { badge.classList.remove('animate-bounce'); }, 3000);
            }
          }

          // Auto print if enabled
          if (typeof autoPrintEnabled !== 'undefined' && autoPrintEnabled) {
            if (payload.new.notes && payload.new.notes.includes('[ORIGIN:KIOSKO]')) {
              showToast('🖨️ Imprimiendo nuevo pedido de Kiosko...');
              if (typeof printPOSTicket === 'function') printPOSTicket(payload.new);
              
              if (typeof bridgePrintComanda === 'function') {
                 bridgePrintComanda(payload.new, posSettings);
              }
            } else {
              showToast('🖨️ Imprimiendo nuevo pedido online...');
              if (typeof printPOSTicket === 'function') printPOSTicket(payload.new);
            }
          } else {
            showToast('🛎️ Nuevo pedido online recibido');
          }
        } else if (payload.eventType === 'UPDATE') {
          if (typeof updateNotificationStatus === 'function') {
            updateNotificationStatus(payload.new);
          }
        }
      }
    )
    .on(
      'broadcast',
      { event: 'new_kiosk_order' },
      async (payload) => {
        console.log('Broadcast Kiosko recibido:', payload);
        if (payload.payload && payload.payload.order_id) {
          // Play notification sound
          try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2190/2190-preview.mp3');
            audio.volume = 1.0;
            audio.play().catch(e => console.log('Audio blocked', e));
          } catch (e) { }

          const { data: newOrder } = await supabaseClient.from('orders').select('*').eq('id', payload.payload.order_id).single();
          if (newOrder && autoPrintEnabled) {
            showToast('🖨️ Imprimiendo pedido de Kiosko (Broadcast)...');
            printPOSTicket(newOrder);
            if (typeof bridgePrintComanda === 'function') {
               bridgePrintComanda(newOrder, posSettings);
            }
          }
          // Recargar la tabla de ordenes para que la cajera lo vea
          if (typeof loadOrders === 'function') loadOrders();
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
    if (!posSettings.printers) posSettings.printers = JSON.parse(localStorage.getItem('printers_list') || '[]');
    currency = data.currency || 'COP';
    document.getElementById('headerBizName').textContent = (data.business_name || 'POS').toUpperCase();

    // Logo in header
    if (data.logo_url) {
      const logo = document.getElementById('headerLogo');
      if (logo) { logo.innerHTML = `<img src="${data.logo_url}" class="w-full h-full rounded-xl object-cover">`; }

      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = data.logo_url;
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

    const bankInfoDisplay = document.getElementById('posBankInfoDisplay');
    if (bankInfoDisplay && (data.bank_info || data.nequi_info)) {
      try {
        let accounts = [];
        if (data.bank_info && data.bank_info.trim().startsWith('[')) {
            accounts = JSON.parse(data.bank_info);
        } else if (data.bank_info) {
            accounts = [{ bank_name: 'Banco', account_type: 'Transferencia', account_number: data.bank_info }];
        }
        if (data.nequi_info) {
            accounts.push({ bank_name: 'Nequi', account_type: 'Billetera Digital', account_number: data.nequi_info });
        }
        if (accounts.length > 0) {
            bankInfoDisplay.innerHTML = '<label class="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Cuentas Disponibles</label><div class="space-y-2">' + accounts.map(acc => `
              <div class="bg-[#1a1a1a] border border-[#333] rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p class="font-bold text-sm text-white">🏦 ${acc.bank_name} <span class="text-xs text-gray-400 font-normal">(${acc.account_type})</span></p>
                  <p class="text-lg font-black text-orange-500 mt-1 select-all">${acc.account_number}</p>
                </div>
                <button type="button" onclick="copyToClipboardPOS('${acc.account_number}', this)" class="bg-[#333] text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-[#444] transition-colors flex items-center gap-1 active:scale-95">
                  📋
                </button>
              </div>
            `).join('') + '</div>';
        }
      } catch(e) {}
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

async function loadCustomers() {
  try {
    const { data, error } = await supabaseClient.from('customers').select('*').eq('business_id', businessId).order('name');
    if (error) throw error;
    posCustomers = data || [];
    
    const datalist = document.getElementById('customersDataList');
    if (datalist) {
      datalist.innerHTML = posCustomers.map(c => `<option value="${c.name}"></option>`).join('');
    }
  } catch (err) {
    console.error('Error loading customers for POS:', err);
  }
}

function handleCustomerSelection() {
  const inputVal = document.getElementById('customerName').value.trim();
  const customer = posCustomers.find(c => c.name.toLowerCase() === inputVal.toLowerCase());
  
  if (customer) {
    if (document.getElementById('customerPhone')) {
      document.getElementById('customerPhone').value = customer.phone || '';
    }
    if (document.getElementById('deliveryAddress')) {
      document.getElementById('deliveryAddress').value = customer.address || '';
    }
    if (document.getElementById('deliveryNeighborhood')) {
      document.getElementById('deliveryNeighborhood').value = customer.neighborhood || '';
    }
  }
}

async function loadProducts() {
  const { data, error } = await supabaseClient.from('products').select('*').eq('business_id', businessId).eq('available', true).order('category').order('name');
  if (error) { showToast('Error cargando productos', 'error'); return; }
  products = data || [];
  categories = ['Todos', ...new Set(products.map(p => p.category).filter(c => c && c !== 'Acompañantes' && c !== 'Acompañantes del dia'))];
}

async function loadVisualExtras() {
  try {
    let allData = [];
    let from = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await supabaseClient
        .from('product_extras')
        .select('*')
        .eq('business_id', businessId)
        .range(from, from + limit - 1);
        
      if (error) break;
      if (data) allData = allData.concat(data);
      if (!data || data.length < limit) break;
      from += limit;
    }
    allVisualExtras = allData;
  } catch (e) { allVisualExtras = []; }
}

async function reloadAllDataAndRender() {
  if (!businessId) return;
  await Promise.all([loadProducts(), loadVisualExtras()]);
  renderCategories();
  renderProducts();
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
      <div class="h-32 md:h-40 bg-white flex items-center justify-center overflow-hidden shrink-0 relative">
        ${p.image_url ? `<img src="${p.image_url}" class="w-full h-full object-contain p-1" loading="lazy" decoding="async">` : `<span class="text-3xl">🍽️</span>`}
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
  const limitEl = document.getElementById('extrasModalLimit');
  if (limit) {
    limitEl.textContent = `Máx. ${limit} selecciones`;
    limitEl.classList.remove('hidden');
  } else {
    limitEl.classList.add('hidden');
  }

  let html = '';
  // Text-based accompaniments
  if (accList.length > 0) {
    html += '<p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3">Acompañamientos</p>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">';
    accList.forEach((a, i) => {
      html += `
      <div id="posAccCard_${i}" class="pos-extra-label flex items-center justify-between gap-2.5 bg-[#222] rounded-xl p-2.5 border-2 border-transparent transition-all duration-200 select-none cursor-pointer" onclick="updatePosAccCount('acc_${i}', 1)">
        <div class="min-w-0 flex-1 pointer-events-none">
          <span class="text-[13px] leading-tight text-white font-bold block line-clamp-2">${a}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0" onclick="event.stopPropagation()">
          <button type="button" class="w-7 h-7 rounded-full bg-[#333] text-white flex items-center justify-center font-bold text-lg hover:bg-[#444] active:scale-95 transition-all" onclick="updatePosAccCount('acc_${i}', -1)">−</button>
          <span id="posCount_acc_${i}" class="font-bold text-white w-4 text-center text-sm">0</span>
          <button type="button" class="w-7 h-7 rounded-full bg-[#333] hover:bg-green-500/20 text-white hover:text-green-500 flex items-center justify-center font-bold text-lg active:scale-95 transition-all" onclick="updatePosAccCount('acc_${i}', 1)">+</button>
        </div>
        <input type="hidden" class="acc-input" id="posInput_acc_${i}" value="${a}" data-count="0">
      </div>`;
    });
    html += '</div>';
  }

  // Visual extras
  if (extras.length > 0) {
    html += '<p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3 mt-5">Extras</p>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">';
    extras.forEach((e, i) => {
      html += `
      <div id="posVECard_${i}" class="pos-extra-label flex items-center justify-between gap-2.5 bg-[#222] rounded-xl p-2.5 border-2 border-transparent transition-all duration-200 select-none cursor-pointer" onclick="updatePosAccCount('ve_${i}', 1)">
        ${e.image_url ? `<img src="${e.image_url}" class="w-10 h-10 rounded-full object-cover shrink-0 pointer-events-none">` : ''}
        <div class="min-w-0 flex-1 pointer-events-none">
          <span class="text-[13px] leading-tight text-white font-bold block line-clamp-2">${e.name}</span>
          ${Number(e.price) > 0 ? `<span class="text-[9px] text-green-500 font-black tracking-widest uppercase mt-0.5 block">+$${Number(e.price).toLocaleString()}</span>` : ''}
        </div>
        <div class="flex items-center gap-2 shrink-0" onclick="event.stopPropagation()">
          <button type="button" class="w-7 h-7 rounded-full bg-[#333] text-white flex items-center justify-center font-bold text-lg hover:bg-[#444] active:scale-95 transition-all" onclick="updatePosAccCount('ve_${i}', -1)">−</button>
          <span id="posCount_ve_${i}" class="font-bold text-white w-4 text-center text-sm">0</span>
          <button type="button" class="w-7 h-7 rounded-full bg-[#333] hover:bg-green-500/20 text-white hover:text-green-500 flex items-center justify-center font-bold text-lg active:scale-95 transition-all" onclick="updatePosAccCount('ve_${i}', 1)">+</button>
        </div>
        <input type="hidden" class="ve-input" id="posInput_ve_${i}" value='${JSON.stringify(e).replace(/'/g, "&#39;")}' data-count="0">
      </div>`;
    });
    html += '</div>';
  }

  document.getElementById('extrasModalContent').innerHTML = html;
  updateExtrasTotal();
  document.getElementById('extrasModal').classList.remove('hidden');
}

window.updatePosAccCount = function(idSuffix, delta) {
  const p = products.find(x => String(x.id) === String(currentExtrasProductId));
  if (!p) return;
  const limit = p.accompaniments_limit;

  const input = document.getElementById('posInput_' + idSuffix);
  const display = document.getElementById('posCount_' + idSuffix);
  if (!input || !display) return;

  let current = parseInt(input.getAttribute('data-count')) || 0;

  if (delta > 0 && limit) {
    let totalSelected = 0;
    document.querySelectorAll('.acc-input, .ve-input').forEach(inp => {
      totalSelected += parseInt(inp.getAttribute('data-count')) || 0;
    });

    if (totalSelected >= limit) {
      showToast(`⚠️ Máximo ${limit} opciones permitidas`, 'error');
      
      const isAcc = idSuffix.startsWith('acc_');
      const cardId = isAcc ? 'posAccCard_' + idSuffix.replace('acc_', '') : 'posVECard_' + idSuffix.replace('ve_', '');
      const card = document.getElementById(cardId);
      if (card) {
        card.classList.add('animate-shake', 'border-red-500');
        setTimeout(() => card.classList.remove('animate-shake', 'border-red-500'), 400);
      }
      return;
    }
  }

  current += delta;
  if (current < 0) current = 0;

  input.setAttribute('data-count', current);
  display.innerText = current;

  // Visual state
  const isAcc = idSuffix.startsWith('acc_');
  const cardId = isAcc ? 'posAccCard_' + idSuffix.replace('acc_', '') : 'posVECard_' + idSuffix.replace('ve_', '');
  const card = document.getElementById(cardId);
  
  if (card) {
    if (current > 0) {
      card.classList.add('border-green-500', 'bg-[#1f1f1f]');
      card.classList.remove('border-transparent', 'bg-[#222]');
    } else {
      card.classList.remove('border-green-500', 'bg-[#1f1f1f]');
      card.classList.add('border-transparent', 'bg-[#222]');
    }
  }

  updateExtrasTotal();
};

function updateExtrasTotal() {
  const p = products.find(x => String(x.id) === String(currentExtrasProductId));
  if (!p) return;

  let total = Number(p.price);
  document.querySelectorAll('.ve-input').forEach(el => { 
    const count = parseInt(el.getAttribute('data-count')) || 0;
    if (count > 0) {
      const data = JSON.parse(el.value);
      total += (Number(data.price || 0) * count);
    }
  });
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
  document.querySelectorAll('.acc-input').forEach(el => {
    const count = parseInt(el.getAttribute('data-count')) || 0;
    for(let i=0; i<count; i++) accChecked.push(el.value);
  });

  const veChecked = [];
  document.querySelectorAll('.ve-input').forEach(el => {
    const count = parseInt(el.getAttribute('data-count')) || 0;
    if (count > 0) {
      const data = JSON.parse(el.value);
      for(let i=0; i<count; i++) veChecked.push({ id: data.id, name: data.name, price: Number(data.price || 0) });
    }
  });

  const totalSelected = accChecked.length + veChecked.length;
  if (totalSelected === 0 && (document.querySelectorAll('.acc-input').length > 0 || document.querySelectorAll('.ve-input').length > 0)) {
     showToast("⚠️ Por favor, selecciona al menos 1 extra.", "error");
     return;
  }

  // Validate limit
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

function clearCart() { posCart = {}; currentOpenOrderId = null; window.currentOpenOrderNotes = ''; updateCartUI(); }

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
window.setVentaRapida = function() {
  const cn = document.getElementById('customerName');
  if(cn) cn.value = 'Venta Rápida';
  const cp = document.getElementById('customerPhone');
  if(cp) cp.value = '';
};

async function openCheckoutModal() {
  if (!Object.keys(posCart).length) return;
  document.getElementById('cashReceived').value = '';
  document.getElementById('changeDisplay').classList.add('hidden');
  document.getElementById('insufficientDisplay').classList.add('hidden');
  
  // 1. Force a synchronous update of the checkout total so it doesn't display $0 during loading
  updateCheckoutTotal();
  
  document.getElementById('checkoutModal').classList.remove('hidden');
  
  // Update table dropdown with active states
  const tableSelector = document.getElementById('tableNumber');
  if (tableSelector && posSettings && posSettings.table_count) {
    const prevValue = tableSelector.value;
    tableSelector.innerHTML = '<option value="">Cargando mesas...</option>';
    try {
      const { data: activeOrders } = await supabaseClient
        .from('orders')
        .select('id, address, status, items, created_at, customer_name, customer_phone')
        .eq('business_id', businessId)
        .eq('delivery_method', 'A la mesa')
        .in('status', ['Pendiente', 'En preparación']);
      
      window.currentActiveOrders = activeOrders || [];
      
      let opts = '<option value="">Seleccionar mesa</option>';
      for (let i = 1; i <= posSettings.table_count; i++) {
        const order = window.currentActiveOrders.find(o => String(o.address) === `Mesa ${i}`);
        if (order) {
          opts += `<option value="${i}" data-order-id="${order.id}">Mesa ${i} (Ocupada)</option>`;
        } else {
          opts += `<option value="${i}">Mesa ${i} (Libre)</option>`;
        }
      }
      tableSelector.innerHTML = opts;
      if (prevValue) { tableSelector.value = prevValue; window.handleTableSelection(); }
    } catch (e) {
      console.error(e);
      let opts = '<option value="">Seleccionar mesa</option>';
      for (let i = 1; i <= posSettings.table_count; i++) opts += `<option value="${i}">Mesa ${i}</option>`;
      tableSelector.innerHTML = opts;
      if (prevValue) tableSelector.value = prevValue;
    }
  }

  const orderType = document.getElementById('orderType').value;
  const activeBtn = Array.from(document.querySelectorAll('.order-type-btn')).find(b => b.classList.contains('active'));
  if (activeBtn) {
    selectOrderType(orderType, activeBtn);
  } else {
    updateCheckoutTotal();
  }
}

window.handleTableSelection = function() {
  const tableSelect = document.getElementById('tableNumber');
  if (!tableSelect) return;
  const selectedOption = tableSelect.options[tableSelect.selectedIndex];
  if (!selectedOption) return;
  
  const orderId = selectedOption.getAttribute('data-order-id');
  if (orderId && window.currentActiveOrders) {
    const order = window.currentActiveOrders.find(o => String(o.id) === String(orderId));
    if (order) {
      currentOpenOrderId = order.id;
      const cn = document.getElementById('customerName');
      if (cn) cn.value = order.customer_name === 'Venta Rápida' ? '' : (order.customer_name || '');
      
      const cp = document.getElementById('customerPhone');
      if (cp) cp.value = (order.customer_phone === 'N/A' || !order.customer_phone) ? '' : order.customer_phone;
      return;
    }
  }
  
  // If not occupied or no order found
  currentOpenOrderId = null;
  // Clear fields if it was previously occupied
  const cn = document.getElementById('customerName');
  if (cn && !cn.value.includes('Venta Rápida')) cn.value = '';
  const cp = document.getElementById('customerPhone');
  if (cp) cp.value = '';
};

function updateCheckoutTotal() {
  let total = getCartTotal();
  const orderType = document.getElementById('orderType').value;
  
  const deliveryFeeDisplay = document.getElementById('deliveryFeeDisplay');
  
  if (orderType === 'Domicilio' && posSettings.delivery_fee) {
      total += Number(posSettings.delivery_fee);
      if (deliveryFeeDisplay) {
          deliveryFeeDisplay.textContent = '+$' + Number(posSettings.delivery_fee).toLocaleString() + ' (Domicilio)';
          deliveryFeeDisplay.classList.remove('hidden');
      }
  } else {
      if (deliveryFeeDisplay) {
          deliveryFeeDisplay.classList.add('hidden');
      }
  }
  
  document.getElementById('modalTotal').textContent = '$' + total.toLocaleString();
  
  const paymentMethod = document.getElementById('paymentMethod').value;
  if (paymentMethod === 'Dividido') calculateSplitTotal();
  if (paymentMethod === 'Efectivo') calculateChange();
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
  const addressField = document.getElementById('addressField');
  if (addressField) addressField.classList.toggle('hidden', type !== 'Domicilio');
  
  const neighborhoodField = document.getElementById('neighborhoodField');
  if (neighborhoodField) neighborhoodField.classList.toggle('hidden', type !== 'Domicilio');
  
  const phoneField = document.getElementById('phoneField');
  if (phoneField) phoneField.classList.toggle('hidden', type !== 'Domicilio');
  
  const driverField = document.getElementById('driverField');
  if (driverField) driverField.classList.toggle('hidden', type !== 'Domicilio');
  const btnSave = document.getElementById('btnSaveTable');
  if (btnSave) btnSave.classList.remove('hidden');

  // Show/hide Contra Entrega payment option (only for Domicilio)
  const btnCE = document.getElementById('btnContraEntrega');
  if (btnCE) {
    btnCE.classList.toggle('hidden', type !== 'Domicilio');
    // If switching away from Domicilio and Contra Entrega was selected, reset to Efectivo
    if (type !== 'Domicilio' && document.getElementById('paymentMethod').value === 'Contra Entrega') {
      const efectivoBtn = document.querySelector('.payment-btn');
      if (efectivoBtn) selectPayment('Efectivo', efectivoBtn);
    }
  }
  
  updateCheckoutTotal();
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
  
  // Show bank info for Transferencia AND Contra Entrega
  const bankInfoDisplay = document.getElementById('posBankInfoDisplay');
  if (bankInfoDisplay) bankInfoDisplay.classList.toggle('hidden', method !== 'Transferencia' && method !== 'Contra Entrega');

  const splitSection = document.getElementById('splitPaymentSection');
  if (splitSection) {
    splitSection.classList.toggle('hidden', method !== 'Dividido');
    if (method === 'Dividido') calculateSplitTotal();
  }
}

function getCheckoutTotal() {
  let total = getCartTotal();
  const orderType = document.getElementById('orderType')?.value;
  if (orderType === 'Domicilio' && posSettings.delivery_fee) {
      total += Number(posSettings.delivery_fee);
  }
  return total;
}

function calculateSplitTotal() {
  const total = getCheckoutTotal();
  const c = parseFloat(document.getElementById('splitCash').value) || 0;
  const f = parseFloat(document.getElementById('splitTransfer').value) || 0;
  const sum = c + f;

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

window.setCashAmount = function(amount) {
  const input = document.getElementById('cashReceived');
  if (input) {
    const current = parseFloat(input.value) || 0;
    input.value = current + amount;
    calculateChange();
  }
};

window.setExactCash = function() {
  const input = document.getElementById('cashReceived');
  if (input) {
    input.value = getCheckoutTotal();
    calculateChange();
  }
};

function calculateChange() {
  const total = getCheckoutTotal();
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
  const staffRole = localStorage.getItem('staff_role');
  if (!activeCashClosingId && staffRole !== 'Mesero') {
    showToast('⚠️ Debes abrir la caja antes de procesar ventas', 'error');
    openCashModal();
    return;
  }

  const keys = Object.keys(posCart);
  if (!keys.length) return;

  const paymentMethod = document.getElementById('paymentMethod').value;
  const orderType = document.getElementById('orderType').value;
  let customerName = document.getElementById('customerName').value.trim();
  if (!customerName) {
    customerName = 'Venta Rápida';
  }

  // Validate cash payment
  if (paymentMethod === 'Efectivo') {
    const received = parseFloat(document.getElementById('cashReceived').value) || 0;
    const total = getCheckoutTotal();
    if (received > 0 && received < total) {
      showToast('⚠️ Monto insuficiente', 'error');
      return;
    }
  }

  let splitPaymentsJSON = {};
  if (paymentMethod === 'Dividido') {
    const c = parseFloat(document.getElementById('splitCash').value) || 0;
    const f = parseFloat(document.getElementById('splitTransfer').value) || 0;
    const sum = c + f;
    const total = getCheckoutTotal();

    if (sum !== total) {
      showToast('⚠️ La suma dividida debe ser exactamente igual al total ($' + total.toLocaleString() + ')', 'error');
      return;
    }
    splitPaymentsJSON = { cash: c, card: 0, transfer: f };
  } else if (paymentMethod === 'Efectivo') {
    const received = parseFloat(document.getElementById('cashReceived').value) || 0;
    const total = getCheckoutTotal();
    if (received >= total) {
      splitPaymentsJSON = { cash_received: received, change: received - total };
    }
  }

  // Build address and validate
  let address = 'POS - Local';
  let deliveryDriver = '';
  
  if (orderType === 'A la mesa') {
    const mesa = document.getElementById('tableNumber').value;
    if (!mesa) {
      showToast('⚠️ Debes seleccionar una mesa', 'error');
      return;
    }
    address = mesa ? 'Mesa ' + mesa : 'Mesa (sin especificar)';
  } else if (orderType === 'Domicilio') {
    const addrVal = document.getElementById('deliveryAddress').value.trim();
    if (!addrVal) {
      showToast('⚠️ La dirección de entrega es obligatoria', 'error');
      return;
    }
    const phoneVal = document.getElementById('customerPhone')?.value?.trim();
    if (!phoneVal && customerName !== 'Venta Rápida') {
      showToast('⚠️ El teléfono del cliente es obligatorio para domicilio', 'error');
      return;
    }
    
    const nbVal = document.getElementById('deliveryNeighborhood')?.value.trim();
    address = addrVal + (nbVal ? ` (Barrio: ${nbVal})` : '');
    
    deliveryDriver = document.getElementById('deliveryDriver')?.value?.trim() || '';
    if (deliveryDriver) {
      address += ` | Repartidor: ${deliveryDriver}`;
    }
  } else if (orderType === 'Para Llevar') {
    address = 'Para llevar';
  }

  const phoneEl = document.getElementById('customerPhone');
  let customerPhone = phoneEl?.value?.trim() || '';

  if (customerName !== 'Venta Rápida' && !customerPhone) {
    phoneEl?.focus();
    showToast('⚠️ El número de WhatsApp es obligatorio para seguimiento', 'error');
    return;
  }
  
  if (!customerPhone) customerPhone = 'N/A';

  const btn = document.getElementById('btnConfirmSale');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Procesando...';
  btn.disabled = true;

  try {
    let items = [];
    keys.forEach(k => {
      const item = posCart[k];
      items.push({ id: item.id, name: item.extrasLabel ? `${item.name} (${item.extrasLabel})` : item.name, price: item.price, qty: item.qty });
    });
    
    let total = getCheckoutTotal();
    let appliedDeliveryFee = 0;
    if (orderType === 'Domicilio' && posSettings.delivery_fee) {
        appliedDeliveryFee = Number(posSettings.delivery_fee);
    }

    // --- CUENTA ÚNICA: merge items from existing table order ---
    if (orderType === 'A la mesa' && !currentOpenOrderId) {
      const mesaSelect = document.getElementById('tableNumber');
      if (mesaSelect && mesaSelect.selectedOptions && mesaSelect.selectedOptions.length > 0) {
        const oId = mesaSelect.selectedOptions[0].getAttribute('data-order-id');
        if (oId) {
          const { data: exData } = await supabaseClient.from('orders').select('items, total').eq('id', oId).single();
          if (exData) {
            currentOpenOrderId = oId;
          }
        }
      }
    }

    // If we have an open order, separate new items from existing ones
    if (currentOpenOrderId) {
      // Get new items only (those NOT loaded from DB)
      const newItems = [];
      keys.forEach(k => {
        const item = posCart[k];
        if (!item.fromDB) {
          newItems.push({ id: item.id, name: item.extrasLabel ? `${item.name} (${item.extrasLabel})` : item.name, price: item.price, qty: item.qty });
        }
      });

      // Fetch current DB items to build full list
      const { data: exData } = await supabaseClient.from('orders').select('items, total').eq('id', currentOpenOrderId).single();
      if (exData) {
        items = [...(exData.items || []), ...newItems];
        total = items.reduce((sum, it) => sum + (Number(it.price) * (it.qty || it.quantity || 1)), 0);
        if (orderType === 'Domicilio' && posSettings.delivery_fee) {
          total += Number(posSettings.delivery_fee);
        }
      }
    }

    if (currentOpenOrderId) {
      const { data: updatedOrder, error } = await supabaseClient.from('orders').update({
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method: paymentMethod,
        split_payments: Object.keys(splitPaymentsJSON).length ? splitPaymentsJSON : null,
        items: items,
        total: total,
        delivery_fee: appliedDeliveryFee,
        status: 'Entregado',
        notes: (window.currentOpenOrderNotes && window.currentOpenOrderNotes.includes('[ORIGIN:')) ? window.currentOpenOrderNotes : '[ORIGIN:POS]'
      }).eq('id', currentOpenOrderId).select();
      if (error) throw error;
      showToast('✅ Venta cobrada (Mesa cerrada)');
      if (updatedOrder && updatedOrder.length > 0) printPOSTicket(updatedOrder[0]);
    } else {
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
        delivery_fee: appliedDeliveryFee,
        status: 'Entregado',
        notes: '[ORIGIN:POS]'
      }]).select();
      if (error) throw error;
      showToast('✅ Venta registrada');
      if (insertedOrder && insertedOrder.length > 0) {
        executePrintComanda(insertedOrder[0]);
        printPOSTicket(insertedOrder[0]);
      }
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

async function saveTableOrder() {
  const keys = Object.keys(posCart);
  if (!keys.length) return;

  const orderType = document.getElementById('orderType').value;
  let address = 'POS - Local';
  
  if (orderType === 'A la mesa') {
    const mesa = document.getElementById('tableNumber').value;
    if (!mesa) {
      showToast('⚠️ Seleccione una mesa', 'error');
      return;
    }
    address = 'Mesa ' + mesa;
  } else if (orderType === 'Domicilio') {
    address = document.getElementById('deliveryAddress')?.value?.trim() || 'Domicilio';
  } else {
    address = 'Para llevar';
  }
  let customerName = document.getElementById('customerName').value.trim();
  if (!customerName) {
    customerName = 'Venta Rápida';
  }

  const btn = document.getElementById('btnSaveTable');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Guardando...';
  btn.disabled = true;

  try {
    let items = [];
    keys.forEach(k => {
      const item = posCart[k];
      items.push({ id: item.id, name: item.extrasLabel ? `${item.name} (${item.extrasLabel})` : item.name, price: item.price, qty: item.qty });
    });
    let total = getCheckoutTotal();

    const customerPhone = document.getElementById('customerPhone')?.value?.trim() || 'N/A';

    // --- CUENTA ÚNICA: detect existing table order ---
    if (!currentOpenOrderId) {
      const mesaSelect = document.getElementById('tableNumber');
      if (mesaSelect && mesaSelect.selectedOptions && mesaSelect.selectedOptions.length > 0) {
        const oId = mesaSelect.selectedOptions[0].getAttribute('data-order-id');
        if (oId) {
          const { data: exData } = await supabaseClient.from('orders').select('items, total').eq('id', oId).single();
          if (exData) {
            currentOpenOrderId = oId;
          }
        }
      }
    }

    // Separate new items from existing (fromDB) items
    const newItems = [];
    keys.forEach(k => {
      const item = posCart[k];
      if (!item.fromDB) {
        newItems.push({ id: item.id, name: item.extrasLabel ? `${item.name} (${item.extrasLabel})` : item.name, price: item.price, qty: item.qty });
      }
    });

    if (currentOpenOrderId) {
      // Fetch current DB items and append only the new ones
      const { data: exData } = await supabaseClient.from('orders').select('items, total').eq('id', currentOpenOrderId).single();
      if (exData) {
        items = [...(exData.items || []), ...newItems];
      } else {
        items = [...newItems];
      }
      total = items.reduce((sum, it) => sum + (Number(it.price) * (it.qty || it.quantity || 1)), 0);

      const { data: updatedOrder, error } = await supabaseClient.from('orders').update({
        customer_name: customerName,
        customer_phone: customerPhone,
        items: items,
        total: total,
        status: 'En preparación',
        notes: '[ORIGIN:POS]'
      }).eq('id', currentOpenOrderId).select();
      if (error) throw error;
      showToast('✅ Cuenta de mesa actualizada');
      if (updatedOrder && updatedOrder.length > 0) {
        // Print comanda with ONLY the NEW items for the kitchen
        if (newItems.length > 0) {
          const comandaOrder = { ...updatedOrder[0], items: newItems };
          executePrintComanda(comandaOrder);
        } else {
          showToast('ℹ️ No hay items nuevos para enviar a cocina');
        }
      }
    } else {
      // First order for this table — all items are new
      items = [...newItems];
      total = items.reduce((sum, it) => sum + (Number(it.price) * (it.qty || it.quantity || 1)), 0);

      const { data: insertedOrder, error } = await supabaseClient.from('orders').insert([{
        business_id: businessId,
        customer_name: customerName,
        customer_phone: customerPhone,
        address: address,
        delivery_method: orderType,
        payment_method: 'Pendiente',
        items: items,
        total: total,
        status: 'En preparación',
        notes: '[ORIGIN:POS]'
      }]).select();
      if (error) throw error;
      showToast('✅ Cuenta enviada a cocina');
      if (insertedOrder && insertedOrder.length > 0) {
        executePrintComanda(insertedOrder[0]);
      }
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
  if (!confirm('¿Seguro que deseas cerrar sesión?')) return;
  try {
    localStorage.clear();
    sessionStorage.clear();
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.warn('Error during sign out:', error);
  } finally {
    window.location.href = 'login.html';
  }
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  await initPOS();
});

// Reload data when tab gains focus to prevent stale data from admin changes
window.addEventListener('focus', () => {
  if (businessId) {
    reloadAllDataAndRender();
  }
});

function showTicketPreview(o) {
  const container = document.getElementById('ticketPreviewContent');
  if (!container) return;

  window._previewType = 'ticket';

  const itemsHtml = o.items.map(item => `
      <div style="display:flex;justify-content:space-between;padding:6px 0; border-bottom:1px dashed #ddd;">
          <span style="flex:1;font-size:13px;">${item.qty || item.quantity}x ${item.name}</span>
          <span style="font-weight:bold;font-size:13px;">$${Number((item.price) * (item.qty || item.quantity)).toLocaleString()}</span>
      </div>`
  ).join('');

  const useLogo = localStorage.getItem('receipt_cash_logo') !== 'false';
  const customHeader = localStorage.getItem('receipt_cash_header') || '';
  const customFooter = localStorage.getItem('receipt_cash_footer') || '¡Gracias por su compra!';
  
  const logoUrl = (useLogo && posSettings.logo_url) ? `<img src="${posSettings.logo_url}" style="display:block; margin:0 auto; max-width:55mm; max-height:35mm; object-fit:contain; margin-bottom:8px;">` : '';
  const headerHtml = customHeader ? `<div style="text-align:center;margin-bottom:6px;font-size:11px;white-space:pre-wrap;">${customHeader}</div>` : '';

  let ticketDataHtml = '';
  if (posSettings.ticket_data) {
      const td = typeof posSettings.ticket_data === 'string' ? JSON.parse(posSettings.ticket_data) : posSettings.ticket_data;
      if (td.nit) ticketDataHtml += `<div style="text-align:center; font-size:13px;">NIT: ${td.nit}</div>`;
      if (td.sede) ticketDataHtml += `<div style="text-align:center; font-size:13px;">Sede: ${td.sede}</div>`;
      if (td.direccion) ticketDataHtml += `<div style="text-align:center; font-size:13px;">${td.direccion}</div>`;
      if (td.telefono) ticketDataHtml += `<div style="text-align:center; font-size:13px;">Tel: ${td.telefono}</div>`;
      if (td.email) ticketDataHtml += `<div style="text-align:center; font-size:13px;">${td.email}</div>`;
      if (ticketDataHtml) ticketDataHtml = `<div style="margin-bottom:8px; line-height:1.2;">${ticketDataHtml}</div>`;
  }

  const ticketId = String(o.id).split('-')[0];
  const discount = Number(o.discount || 0);
  const tip = Number(o.tip || 0);
  const deliveryFee = Number(o.delivery_fee || 0);

  let extraRows = '';
  if (discount > 0) extraRows += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Descuento:</span><span>-$${discount.toLocaleString()}</span></div>`;
  if (deliveryFee > 0) extraRows += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Domicilio:</span><span>+$${deliveryFee.toLocaleString()}</span></div>`;
  if (tip > 0) extraRows += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Propina:</span><span>+$${tip.toLocaleString()}</span></div>`;
  
  let paymentDetailsHtml = '';
  if (o.payment_method === 'Efectivo' && o.split_payments && o.split_payments.cash_received) {
      paymentDetailsHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;margin-top:4px;"><span>Efectivo Recibido:</span><span>$${Number(o.split_payments.cash_received).toLocaleString()}</span></div>`;
      paymentDetailsHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>Cambio:</span><span>$${Number(o.split_payments.change).toLocaleString()}</span></div>`;
  }

  container.innerHTML = `
    <div id="ticketPrintArea" style="font-family:Arial, Helvetica, sans-serif;font-size:16px;padding:16px;width:80mm;margin:0 auto;color:#000;background:white;">
      <div style="text-align:center;margin-bottom:8px;">${logoUrl}</div>
      <div style="text-align:center;font-weight:bold;font-size:22px;margin-bottom:4px;">${posSettings.business_name || 'MI NEGOCIO'}</div>
      ${ticketDataHtml}
      ${headerHtml}
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;font-weight:bold;font-size:16px;">
        TICKET DE VENTA<br>#${ticketId}
      </div>
      <div style="margin-bottom:8px;font-size:11px;">
        <strong>Fecha:</strong> ${new Date().toLocaleString()}<br>
        <strong>Cliente:</strong> ${o.customer_name || 'Mostrador'}<br>
        <strong>Teléfono:</strong> ${o.customer_phone || 'N/A'}<br>
        <strong>Dirección:</strong> ${o.address || 'N/A'}<br>
        <strong>Tipo:</strong> ${o.delivery_method || o.delivery_type || 'N/A'}<br>
        <strong>Pago:</strong> ${o.payment_method || 'N/A'}
      </div>
      <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;margin-bottom:8px;padding:8px 0;">
        <div style="display:flex;justify-content:space-between;font-weight:bold;padding-bottom:4px;font-size:12px;"><span>CANT DESCRIPCIÓN</span><span>TOTAL</span></div>
        ${itemsHtml}
      </div>
      ${extraRows}
      <div style="display:flex;justify-content:space-between;border-top:1px dashed #000;font-weight:bold;font-size:20px;margin-top:8px;padding-top:8px;">
        <span>TOTAL:</span>
        <span>$${Number(o.total).toLocaleString()}</span>
      </div>
      ${paymentDetailsHtml}
      <div style="text-align:center;border-top:1px dashed #000;font-size:12px;margin-top:16px;padding-top:8px;white-space:pre-wrap;">
        ${customFooter}
      </div>
    </div>
  `;

  window._lastTicketOrder = o;
  document.getElementById('ticketPreviewModal').classList.remove('hidden');

  const shouldPrint = localStorage.getItem('printer_auto_print') === 'true' || localStorage.getItem('printer_auto_print') === null;
  if (shouldPrint) {
    setTimeout(() => { printTicketFromPreview(); }, 300);
  }
}

function closeTicketPreview() {
  document.getElementById('ticketPreviewModal').classList.add('hidden');
}

function printTicketFromPreview() {
  const o = window._lastTicketOrder;
  if (!o) return;
  if (window._previewType === 'comanda') {
    executePrintComanda(o);
  } else {
    printPOSTicket(o);
  }
}

function downloadTicketFromPreview() {
  const el = document.getElementById('ticketPrintArea');
  if (!el || typeof html2canvas === 'undefined') {
    showToast('⚠️ Error al descargar', 'error');
    return;
  }
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(canvas => {
    const link = document.createElement('a');
    const ticketId = window._lastTicketOrder ? String(window._lastTicketOrder.id).split('-')[0] : 'ticket';
    link.download = `ticket_${ticketId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('✅ Ticket descargado');
  }).catch(err => {
    console.error(err);
    showToast('❌ Error al descargar', 'error');
  });
}

async function printPOSTicket(o) {
  // Try PrintBridge first (silent network print)
  if (typeof bridgePrintTicket === 'function') {
    const ok = await bridgePrintTicket(o, posSettings);
    if (ok) { showToast('🖨️ Ticket impreso (PrintBridge)'); return; }
  }
  // Fallback: browser print
  const itemsHtml = o.items.map(item => `
      <div style="display:flex;justify-content:space-between;padding:4px 0; border-bottom:1px dashed #eee;">
          <span style="flex:1;">${item.qty || item.quantity}x ${item.name}</span>
          <span style="font-weight:bold;">$${Number((item.price) * (item.qty || item.quantity)).toLocaleString()}</span>
      </div>`
  ).join('');

  const useLogo = localStorage.getItem('receipt_cash_logo') !== 'false';
  const customHeader = localStorage.getItem('receipt_cash_header') || '';
  const customFooter = localStorage.getItem('receipt_cash_footer') || '¡Gracias por su compra!';
  
  const logoUrl = (useLogo && posSettings.logo_url) ? `<img src="${posSettings.logo_url}" style="display:block; margin:0 auto; max-width:60mm; max-height:40mm; object-fit:contain; margin-bottom:10px;">` : '';
  const headerHtml = customHeader ? `<div class="text-center mb-2" style="font-size: 12px; white-space: pre-wrap;">${customHeader}</div>` : '';

  let ticketDataHtml = '';
  if (posSettings.ticket_data) {
      const td = typeof posSettings.ticket_data === 'string' ? JSON.parse(posSettings.ticket_data) : posSettings.ticket_data;
      if (td.nit) ticketDataHtml += `<div class="text-center" style="font-size:14px;">NIT: ${td.nit}</div>`;
      if (td.sede) ticketDataHtml += `<div class="text-center" style="font-size:14px;">Sede: ${td.sede}</div>`;
      if (td.direccion) ticketDataHtml += `<div class="text-center" style="font-size:14px;">${td.direccion}</div>`;
      if (td.telefono) ticketDataHtml += `<div class="text-center" style="font-size:14px;">Tel: ${td.telefono}</div>`;
      if (td.email) ticketDataHtml += `<div class="text-center" style="font-size:14px;">${td.email}</div>`;
      if (ticketDataHtml) ticketDataHtml = `<div class="mb-2" style="line-height:1.2;">${ticketDataHtml}</div>`;
  }

  const ticketId = String(o.id).split('-')[0];
  const discount = Number(o.discount || 0);
  const tip = Number(o.tip || 0);
  const deliveryFee = Number(o.delivery_fee || 0);

  let extraRows = '';
  if (discount > 0) extraRows += `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Descuento:</span><span>-$${discount.toLocaleString()}</span></div>`;
  if (deliveryFee > 0) extraRows += `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Domicilio:</span><span>+$${deliveryFee.toLocaleString()}</span></div>`;
  if (tip > 0) extraRows += `<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Propina:</span><span>+$${tip.toLocaleString()}</span></div>`;

  let paymentDetailsHtml = '';
  if (o.payment_method === 'Efectivo' && o.split_payments && o.split_payments.cash_received) {
      paymentDetailsHtml += `<div class="flex" style="margin-top:4px;"><span>Efectivo Recibido:</span><span>$${Number(o.split_payments.cash_received).toLocaleString()}</span></div>`;
      paymentDetailsHtml += `<div class="flex"><span>Cambio:</span><span>$${Number(o.split_payments.change).toLocaleString()}</span></div>`;
  }

  const html = `
  <html>
    <head>
      <title>Ticket #${ticketId}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 500; margin: 0; padding: 10px; width: 80mm; color: #000; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .text-xl { font-size: 24px; }
        .text-2xl { font-size: 30px; }
        .mb-2 { margin-bottom: 8px; }
        .border-b { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
        .border-t { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
        .flex { display: flex; justify-content: space-between; }
        @media print { body { width: 100%; margin:0; padding:0; } }
      </style>
    </head>
    <body>
      <div class="text-center mb-2">${logoUrl}</div>
      <div class="text-center font-bold text-2xl mb-1">${posSettings.business_name || 'MI NEGOCIO'}</div>
      ${ticketDataHtml}
      ${headerHtml}
      <div class="text-center border-b font-bold mb-2" style="font-size: 20px;">
        TICKET DE VENTA<br>#${ticketId}
      </div>
      <div class="mb-2" style="font-size: 17px;">
        <strong>Fecha:</strong> ${new Date().toLocaleString()}<br>
        <strong>Cliente:</strong> ${o.customer_name || 'Mostrador'}<br>
        <strong>Teléfono:</strong> ${o.customer_phone || 'N/A'}<br>
        <strong>Dirección:</strong> ${o.address || 'N/A'}<br>
        <strong>Tipo:</strong> ${o.delivery_method || o.delivery_type || 'N/A'}<br>
        <strong>Pago:</strong> ${o.payment_method || 'N/A'}
      </div>
      <div class="border-t border-b mb-2" style="margin-top:10px;">
        <div class="flex font-bold" style="padding-bottom: 4px;"><span>CANT DESCRIPCIÓN</span><span>TOTAL</span></div>
        ${itemsHtml}
      </div>
      ${extraRows}
      <div class="flex border-t font-bold text-xl" style="margin-top:10px; padding-top:10px;">
        <span>TOTAL:</span>
        <span>$${Number(o.total).toLocaleString()}</span>
      </div>
      ${paymentDetailsHtml}
      <div class="text-center border-t text-sm" style="margin-top:20px; padding-top:10px; white-space: pre-wrap;">
        ${customFooter}
      </div>
      <script>
        let printed = false;
        function doPrint() {
          if(printed) return;
          printed = true;
          setTimeout(() => { window.print(); window.close(); }, 300);
        }
        window.onload = doPrint;
        setTimeout(doPrint, 2500); // fallback
      <\/script>
    </body>
  </html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
}

function showComandaPreview(o) {
  const container = document.getElementById('ticketPreviewContent');
  if (!container) return;

  window._previewType = 'comanda';

  const ticketId = String(o.id).includes('MESA-') ? String(o.id).toUpperCase() : String(o.id).split('-')[0].toUpperCase();
  const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  let deliveryType = (o.delivery_method || o.delivery_type || 'LOCAL').toUpperCase();
  if (deliveryType === 'A LA MESA') {
      const mesaNum = o.address ? o.address.replace(/Mesa\s*/i, '').trim() : '';
      deliveryType = mesaNum ? `MESA #${mesaNum}` : 'MESA';
  }
  const customerName = o.customer_name || 'Mostrador';
  const customerPhone = o.customer_phone && o.customer_phone !== 'N/A' ? `<div style="font-weight:bold; font-size:20px; text-align:center;">${o.customer_phone}</div>` : '';

  const itemsHtml = o.items.map(item => {
    let mainName = item.name;
    let extrasHtml = '';
    const match = item.name.match(/^(.*) \((.*)\)$/);
    if (match) {
       mainName = match[1];
       const extras = match[2].split(',').map(e => e.trim());
       extrasHtml = extras.map(e => `<div style="padding-left:20px; font-size:18px;">+ ${e}</div>`).join('');
    }
    
    return `
      <div style="padding:6px 0;">
          <div style="font-weight:bold; font-size:22px;">${item.qty || item.quantity}x ${mainName.toUpperCase()}</div>
          ${extrasHtml}
      </div>`
  }).join('');

  const deliveryFee = Number(o.delivery_fee || 0);
  let deliveryFeeHtml = '';
  if (deliveryType === 'DOMICILIO' && deliveryFee > 0) {
    deliveryFeeHtml = `
      <div style="font-weight:bold; font-size:22px; text-align:center; margin-top:8px; border-top:1px dashed #000; padding-top:8px;">
        + TARIFA DOMICILIO: $${deliveryFee.toLocaleString()}
      </div>
    `;
  }

  container.innerHTML = `
    <div id="ticketPrintArea" style="font-family:Arial, Helvetica, sans-serif;font-size:20px;padding:16px;width:80mm;margin:0 auto;color:#000;background:white;">
      <div style="text-align:center; font-weight:bold; font-size:24px; margin-bottom:8px;">** IMPRESORA DE CAJA **</div>
      <div style="font-weight:bold; font-size:22px; text-align:center;">PEDIDO #${ticketId}</div>
      ${customerPhone}
      <div style="font-weight:bold; font-size:22px; text-align:center;">${timeStr}</div>
      <div style="font-weight:bold; font-size:22px; text-align:center;">${deliveryType}</div>
      <div style="font-weight:bold; font-size:22px; text-align:center; margin-bottom:8px;">Cliente: ${customerName}</div>
      <div style="border-top:2px dashed #000; border-bottom:2px dashed #000; padding:8px 0; margin:12px 0;">
        ${itemsHtml}
        ${deliveryFeeHtml}
      </div>
    </div>
  `;

  window._lastTicketOrder = o;
  document.getElementById('ticketPreviewModal').classList.remove('hidden');

  const shouldPrint = localStorage.getItem('printer_auto_print') === 'true' || localStorage.getItem('printer_auto_print') === null;
  if (shouldPrint) {
    setTimeout(() => { printTicketFromPreview(); }, 300);
  }
}

async function executePrintComanda(o) {
  // Try PrintBridge first (silent network print)
  if (typeof bridgePrintComanda === 'function') {
    const ok = await bridgePrintComanda(o, posSettings);
    if (ok) { showToast('🖨️ Comanda impresa (PrintBridge)'); return; }
  }
  // Fallback: browser print
  const ticketId = String(o.id).includes('MESA-') ? String(o.id).toUpperCase() : String(o.id).split('-')[0].toUpperCase();
  const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  let deliveryType = (o.delivery_method || o.delivery_type || 'LOCAL').toUpperCase();
  if (deliveryType === 'A LA MESA') {
      const mesaNum = o.address ? o.address.replace(/Mesa\s*/i, '').trim() : '';
      deliveryType = mesaNum ? `MESA #${mesaNum}` : 'MESA';
  }
  const customerName = o.customer_name || 'Mostrador';
  const customerPhone = o.customer_phone && o.customer_phone !== 'N/A' ? `<div style="font-weight:bold; font-size:20px; text-align:center;">${o.customer_phone}</div>` : '';

  const itemsHtml = o.items.map(item => {
    let mainName = item.name;
    let extrasHtml = '';
    const match = item.name.match(/^(.*) \((.*)\)$/);
    if (match) {
       mainName = match[1];
       const extras = match[2].split(',').map(e => e.trim());
       extrasHtml = extras.map(e => `<div style="padding-left:20px; font-size:18px;">+ ${e}</div>`).join('');
    }
    
    return `
      <div style="padding:6px 0;">
          <div style="font-weight:bold; font-size:22px;">${item.qty || item.quantity}x ${mainName.toUpperCase()}</div>
          ${extrasHtml}
      </div>`
  }).join('');

  const deliveryFee = Number(o.delivery_fee || 0);
  let deliveryFeeHtml = '';
  if (deliveryType === 'DOMICILIO' && deliveryFee > 0) {
    deliveryFeeHtml = `
      <div style="font-weight:bold; font-size:22px; text-align:center; margin-top:8px; border-top:1px dashed #000; padding-top:8px;">
        + TARIFA DOMICILIO: $${deliveryFee.toLocaleString()}
      </div>
    `;
  }

  const html = `
  <html>
    <head>
      <title>Comanda #${ticketId}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: bold; margin: 0; padding: 10px; width: 80mm; color: #000; }
        @media print { body { width: 100%; margin:0; padding:0; } }
      </style>
    </head>
    <body>
      <div style="text-align:center; font-weight:bold; font-size:24px; margin-bottom:8px;">COMANDA</div>
      <div style="font-weight:bold; font-size:22px; text-align:center;">PEDIDO #${ticketId}</div>
      ${customerPhone}
      <div style="font-weight:bold; font-size:22px; text-align:center;">${timeStr}</div>
      <div style="font-weight:bold; font-size:22px; text-align:center;">${deliveryType}</div>
      <div style="font-weight:bold; font-size:22px; text-align:center; margin-bottom:8px;">Cliente: ${customerName}</div>
      <div style="border-top:2px dashed #000; border-bottom:2px dashed #000; padding:8px 0; margin:12px 0;">
        ${itemsHtml}
        ${deliveryFeeHtml}
      </div>
      <script>
        let printed = false;
        function doPrint() {
          if(printed) return;
          printed = true;
          setTimeout(() => { window.print(); window.close(); }, 300);
        }
        window.onload = doPrint;
        setTimeout(doPrint, 2500); // fallback
      </script>
    </body>
  </html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
}

// MANUAL COMANDA LOGIC
window.manualPrintComanda = async function() {
  if (!activeCashClosingId) {
    showToast('⚠️ Debes abrir la caja antes de enviar comandas', 'error');
    openCashModal();
    return;
  }

  const keys = Object.keys(posCart);
  if (!keys.length) {
    showToast('⚠️ Agrega productos primero', 'error');
    return;
  }
  
  if (currentOpenOrderId) {
    const { data, error } = await supabaseClient.from('orders').select('*').eq('id', currentOpenOrderId).single();
    if (!error && data) {
      executePrintComanda(data);
      showToast('🖨️ Comanda generada');
    }
  } else {
    const items = keys.map(k => {
      const item = posCart[k];
      return { id: item.id, name: item.extrasLabel ? `${item.name} (${item.extrasLabel})` : item.name, price: item.price, qty: item.qty };
    });
    const orderType = document.getElementById('orderType').value;
    const customerName = document.getElementById('customerName').value.trim();
    if (!customerName) {
      showToast('⚠️ Ingresa el nombre del cliente o deja Anónimo', 'error');
      return;
    }
    
    let fakeId = 'PENDIENTE';
    let mesa = '';
    if (orderType === 'A la mesa') {
      mesa = document.getElementById('tableNumber').value;
      fakeId = mesa ? 'MESA-' + mesa : 'MESA';
    }

    const fakeOrder = {
      id: fakeId,
      created_at: new Date().toISOString(),
      delivery_method: orderType,
      customer_name: customerName,
      customer_phone: document.getElementById('customerPhone')?.value?.trim() || 'N/A',
      address: (orderType === 'A la mesa' && mesa) ? 'Mesa ' + mesa : '',
      items: items,
      delivery_fee: (orderType === 'Domicilio' && posSettings.delivery_fee) ? Number(posSettings.delivery_fee) : 0
    };
    
    executePrintComanda(fakeOrder);
    showToast('🖨️ Comanda generada');
  }
};

window.reprintTableComanda = function(e, orderId) {
  e.stopPropagation(); // Prevent opening the table
  const order = window.currentActiveOrders?.find(o => String(o.id) === String(orderId));
  if (!order) return;
  executePrintComanda(order);
  showToast('🖨️ Comanda generada');
};

// TABLES MODAL LOGIC
window.openTablesModal = async function () {
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
      .select('id, address, status, total, created_at, items')
      .eq('business_id', businessId)
      .eq('delivery_method', 'A la mesa')
      .in('status', ['Pendiente', 'En preparación']);

    if (error) throw error;
    
    window.currentActiveOrders = activeOrders;

    let html = '';
    for (let i = 1; i <= posSettings.table_count; i++) {
      // Look for an order matching "Mesa X"
      const order = activeOrders?.find(o => String(o.address) === `Mesa ${i}`);

      if (order) {
        // Ocupada
        const timeDiff = Math.floor((new Date() - new Date(order.created_at)) / 60000);
        html += `
          <div onclick="openTableOrder('${order.id}')" class="relative bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-red-500/20 transition-all text-center group">
            <button onclick="reprintTableComanda(event, '${order.id}')" class="absolute top-2 right-2 bg-[#222] border border-[#333] hover:bg-white hover:text-black w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-lg text-sm" title="Reimprimir Comanda">
              🖨️
            </button>
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

window.closeTablesModal = function () {
  document.getElementById('tablesModal').classList.add('hidden');
};

window.openTableOrder = function(orderId) {
  const order = window.currentActiveOrders?.find(o => String(o.id) === String(orderId));
  if (!order) return;
  
  closeTablesModal();
  clearCart();
  
  currentOpenOrderId = order.id;
  
  // Load existing items into the cart, marked as fromDB so they won't be re-sent
  // to the kitchen or duplicated when saving
  order.items.forEach((item, index) => {
    const key = `existing_${index}`;
    posCart[key] = {
      id: item.id || `custom_${index}`,
      qty: item.qty || item.quantity || 1,
      price: item.price,
      name: item.name,
      extrasLabel: '',
      fromDB: true  // Mark as already-saved item
    };
  });
  
  updateCartUI();
  
  const btnMesa = document.querySelector('.order-type-btn[onclick*="A la mesa"]');
  if (btnMesa) selectOrderType('A la mesa', btnMesa);
  
  const tableNumStr = order.address.replace('Mesa ', '');
  const sel = document.getElementById('tableNumber');
  if (sel) sel.value = tableNumStr;
  
  showToast(`✅ Mesa ${tableNumStr} reabierta`);
};

window.startTableOrder = function (tableNum) {
  closeTablesModal();
  clearCart();
  const btnMesa = document.querySelector('.order-type-btn[onclick*="A la mesa"]');
  if (btnMesa) selectOrderType('A la mesa', btnMesa);
  const sel = document.getElementById('tableNumber');
  if (sel) sel.value = tableNum;
  showToast(`✅ Iniciando pedido para Mesa ${tableNum}`);
};

// ==========================================
// POS REPORTS (CORTE DE CAJA)
// ==========================================
window.chartOriginInstance = null;
window.chartPaymentInstance = null;
window.currentPOSReport = null;

window.openPOSReport = async function() {
  document.getElementById('posReportModal').classList.remove('hidden');
  document.getElementById('posReportKPIs').innerHTML = '<div class="col-span-full text-center text-gray-500 animate-pulse font-bold text-sm py-10">Cargando métricas...</div>';
  document.getElementById('posReportCharts').classList.add('hidden');
  document.getElementById('posReportHistoryContainer').classList.add('hidden');
  document.getElementById('btnPrintPOSReport').disabled = true;

  try {
    const filter = document.getElementById('posReportDateFilter').value;
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
      const day = now.getDay() || 7; // Get current day number, converting Sun. to 7
      startDate.setDate(now.getDate() - day + 1); // Monday
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    } else if (filter === 'this_month') {
      startDate.setDate(1);
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    }

    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('id, total, payment_method, split_payments, created_at, status, customer_name, notes')
      .eq('business_id', businessId)
      .in('status', ['Pagado', 'Completado', 'En preparación', 'Listo', 'En camino', 'Entregado'])
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch opening cash
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

    // Fetch cash movements
    const { data: movements, error: movementsErr } = await supabaseClient
      .from('cash_movements')
      .select('type, amount')
      .eq('business_id', businessId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
      
    let cashIn = 0;
    let cashOut = 0;
    if (!movementsErr && movements) {
      movements.forEach(m => {
        const amt = Number(m.amount) || 0;
        if (m.type === 'deposit') cashIn += amt;
        else if (m.type === 'withdrawal') cashOut += amt;
      });
    }

    let totalEfectivo = 0;
    let totalTarjeta = 0;
    let totalTransferencia = 0;
    let totalVendido = 0;

    let originKiosko = 0;
    let originPOS = 0;
    let originMenu = 0;

    let historyHtml = '';

    orders.forEach(o => {
      const total = Number(o.total) || 0;
      totalVendido += total;

      // Payments
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

      // Origins
      let originStr = 'Desconocido';
      if (o.notes && o.notes.includes('[ORIGIN:KIOSKO]')) { originKiosko += total; originStr = 'Kiosko'; }
      else if (o.notes && o.notes.includes('[ORIGIN:MENU]')) { originMenu += total; originStr = 'Menú QR'; }
      else if (o.notes && o.notes.includes('[ORIGIN:POS]')) { originPOS += total; originStr = 'Caja (POS)'; }
      else if (o.notes && o.notes.includes('Kiosko Auto-Servicio')) { originKiosko += total; originStr = 'Kiosko'; }
      else { originPOS += total; originStr = 'Caja (POS)'; } // default to POS for older orders

      // Table Row
      const dateStr = new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      historyHtml += `
        <tr class="hover:bg-[#222] transition-colors">
          <td class="px-4 py-3"><span class="block text-white font-bold">#${String(o.id).slice(-4)}</span><span class="text-[10px]">${dateStr}</span></td>
          <td class="px-4 py-3 text-white font-bold truncate max-w-[100px]">${o.customer_name || 'Sin Nombre'}</td>
          <td class="px-4 py-3 text-center"><span class="bg-[#333] text-gray-300 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest">${originStr}</span></td>
          <td class="px-4 py-3 text-center text-[10px] uppercase font-bold text-gray-400">${o.payment_method}</td>
          <td class="px-4 py-3 text-right text-green-500 font-black">$${total.toLocaleString()}</td>
          <td class="px-4 py-3 text-center">
            <button onclick="printSpecificTicket('${o.id}')" class="bg-[#222] hover:bg-white text-gray-400 hover:text-black w-8 h-8 rounded-full transition-all text-sm shadow-lg border border-[#333]">🖨️</button>
          </td>
        </tr>
      `;
    });

    const ticketPromedio = orders.length > 0 ? (totalVendido / orders.length) : 0;
    const expectedCash = openingCash + totalEfectivo + cashIn - cashOut;

    window.currentPOSReport = {
      filter,
      orderCount: orders.length,
      total: totalVendido,
      cash: totalEfectivo,
      card: totalTarjeta,
      transfer: totalTransferencia,
      originKiosko, originPOS, originMenu,
      ticketPromedio,
      openingCash,
      cashIn,
      cashOut,
      expectedCash
    };

    // Render KPIs
    document.getElementById('posReportKPIs').innerHTML = `
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
      
      <!-- Seccion Flujo de Efectivo -->
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
    
    // Render History
    if (orders.length > 0) {
      document.getElementById('posReportHistoryBody').innerHTML = historyHtml;
      document.getElementById('posReportHistoryContainer').classList.remove('hidden');
    } else {
      document.getElementById('posReportHistoryBody').innerHTML = `<tr><td colspan="6" class="text-center py-6 text-gray-500 font-bold">No hay pedidos en este periodo.</td></tr>`;
      document.getElementById('posReportHistoryContainer').classList.remove('hidden');
    }

    // Render Charts
    document.getElementById('posReportCharts').classList.remove('hidden');
    
    if (window.chartOriginInstance) window.chartOriginInstance.destroy();
    const ctxOrigin = document.getElementById('chartOrigin').getContext('2d');
    window.chartOriginInstance = new Chart(ctxOrigin, {
      type: 'doughnut',
      data: {
        labels: ['Caja (POS)', 'Kiosko', 'Menú QR'],
        datasets: [{
          data: [originPOS, originKiosko, originMenu],
          backgroundColor: ['#f97316', '#3b82f6', '#10b981'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10, weight: 'bold' } } } }, cutout: '70%' }
    });

    if (window.chartPaymentInstance) window.chartPaymentInstance.destroy();
    const ctxPayment = document.getElementById('chartPayment').getContext('2d');
    window.chartPaymentInstance = new Chart(ctxPayment, {
      type: 'doughnut',
      data: {
        labels: ['Efectivo', 'NEQUI', 'Transf.'],
        datasets: [{
          data: [totalEfectivo, totalTarjeta, totalTransferencia],
          backgroundColor: ['#22c55e', '#3b82f6', '#a855f7'],
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10, weight: 'bold' } } } }, cutout: '70%' }
    });

    document.getElementById('btnPrintPOSReport').disabled = false;

  } catch (err) {
    console.error('Error loading report:', err);
    document.getElementById('posReportKPIs').innerHTML = '<div class="col-span-full text-center text-red-500 font-bold text-sm py-4">Error cargando el reporte.</div>';
  }
};

window.printSpecificTicket = async function(orderId) {
  try {
    showToast('Obteniendo detalles del pedido...');
    const { data: orderData, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (error) throw error;
    if (!orderData) throw new Error("Pedido no encontrado");
    
    printPOSTicket(orderData);
  } catch (err) {
    console.error('Error fetching order for print:', err);
    showToast('❌ Error al imprimir el ticket', 'error');
  }
};

window.closePOSReport = function() {
  document.getElementById('posReportModal').classList.add('hidden');
};

window.printPOSReport = async function() {
  if (!window.currentPOSReport) return;
  
  // Try PrintBridge first
  if (typeof bridgePrintReport === 'function') {
    const ok = await bridgePrintReport(window.currentPOSReport, posSettings);
    if (ok) { showToast('🖨️ Reporte impreso (PrintBridge)'); return; }
  }
  // Fallback: browser print
  const r = window.currentPOSReport;
  const logoUrl = posSettings?.logo_url ? `<img src="${posSettings.logo_url}" style="width:50px;height:50px;border-radius:25px;margin-bottom:10px;">` : '';
  const businessName = posSettings?.name || 'Mi Negocio';

  const html = `
  <html>
    <head>
      <title>Corte de Caja</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 500; margin: 0; padding: 10px; width: 80mm; color: #000; }
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
      <div class="text-center mb-2">${logoUrl}</div>
      <div class="text-center font-bold text-lg mb-2">
        ${businessName}<br>
        CORTE DE CAJA Z
      </div>
      <div class="text-center border-b mb-2" style="font-size:12px;">
        <strong>Fecha:</strong> ${new Date().toLocaleString()}
      </div>
      
      <div class="flex" style="margin-top:15px;">
        <span>Periodo:</span>
        <span class="font-bold">${r.filter === 'today' ? 'Hoy' : r.filter === 'yesterday' ? 'Ayer' : r.filter === 'this_week' ? 'Esta Semana' : 'Este Mes'}</span>
      </div>
      <div class="flex">
        <span>Pedidos Totales:</span>
        <span class="font-bold">${r.orderCount}</span>
      </div>
      <div class="flex">
        <span>Ticket Promedio:</span>
        <span class="font-bold">$${Math.round(r.ticketPromedio).toLocaleString()}</span>
      </div>
      
      <div class="border-t mb-2 mt-2" style="padding-top:10px;">
        <div class="font-bold text-center mb-2">ORIGEN DE VENTAS</div>
        <div class="flex"><span>Caja (POS):</span> <span>$${r.originPOS.toLocaleString()}</span></div>
        <div class="flex"><span>Kiosko:</span> <span>$${r.originKiosko.toLocaleString()}</span></div>
        <div class="flex"><span>Menú QR:</span> <span>$${r.originMenu.toLocaleString()}</span></div>
      </div>

      <div class="border-t mb-2 mt-2" style="padding-top:10px;">
        <div class="font-bold text-center mb-2">DESGLOSE DE PAGOS</div>
        <div class="flex"><span>Efectivo:</span> <span>$${r.cash.toLocaleString()}</span></div>
        <div class="flex"><span>NEQUI:</span> <span>$${r.card.toLocaleString()}</span></div>
        <div class="flex"><span>Transferencia:</span> <span>$${r.transfer.toLocaleString()}</span></div>
      </div>
      
      <div class="flex border-t font-bold text-lg" style="margin-top:15px; padding-top:10px;">
        <span>TOTAL VENTAS:</span>
        <span>$${r.total.toLocaleString()}</span>
      </div>

      <div class="border-t mb-2 mt-2" style="padding-top:10px;">
        <div class="font-bold text-center mb-2">FLUJO DE EFECTIVO</div>
        <div class="flex"><span>Fondo Apertura:</span> <span>+$${(r.openingCash||0).toLocaleString()}</span></div>
        <div class="flex"><span>Ventas Efectivo:</span> <span>+$${(r.cash||0).toLocaleString()}</span></div>
        <div class="flex"><span>Entradas Extra:</span> <span>+$${(r.cashIn||0).toLocaleString()}</span></div>
        <div class="flex"><span>Gastos/Retiros:</span> <span>-$${(r.cashOut||0).toLocaleString()}</span></div>
      </div>
      
      <div class="flex border-t font-bold text-lg" style="margin-top:15px; padding-top:10px;">
        <span>EFECTIVO ESPERADO:</span>
        <span>$${(r.expectedCash||0).toLocaleString()}</span>
      </div>
      
      <div class="text-center border-t text-sm" style="margin-top:20px; padding-top:10px;">
        FIN DEL REPORTE
      </div>
      <script>
        setTimeout(() => { window.print(); window.close(); }, 500);
      </script>
    </body>
  </html>
  `;

  const printWindow = window.open('', '_blank', 'width=400,height=600');
  printWindow.document.write(html);
  printWindow.document.close();
};

window.copyToClipboardPOS = function(text, btn) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
        });
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
        } catch (err) {}
        document.body.removeChild(textArea);
    }
};

// ==========================================
// NOTIFICATIONS SYSTEM (Pedidos Entrantes)
// ==========================================
window.notifOrders = [];
window.notifFilter = 'all';

window.openNotificationsModal = async function() {
  document.getElementById('notificationsModal').classList.remove('hidden');
  await refreshNotifications();
};

window.closeNotificationsModal = function() {
  document.getElementById('notificationsModal').classList.add('hidden');
};

window.refreshNotifications = async function() {
  const container = document.getElementById('notificationsList');
  container.innerHTML = '<div class="text-center text-gray-500 py-10 font-bold animate-pulse">Cargando pedidos...</div>';

  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter to only non-POS origin orders (kiosk, menu, etc.)
    window.notifOrders = (data || []).filter(o => {
      const notes = o.notes || '';
      return notes.includes('[ORIGIN:KIOSKO]') || notes.includes('[ORIGIN:MENU]') || (!notes.includes('[ORIGIN:POS]') && o.payment_method === 'Pendiente');
    });

    renderNotifications();
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="text-center text-red-500 py-10 font-bold">Error cargando pedidos</div>';
  }
};

window.filterNotifications = function(filter) {
  window.notifFilter = filter;
  document.querySelectorAll('.notif-filter-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-orange-500', 'text-white', 'border-orange-500');
    btn.classList.add('bg-[#222]', 'text-gray-300', 'border-[#333]');
  });
  event.target.classList.remove('bg-[#222]', 'text-gray-300', 'border-[#333]');
  event.target.classList.add('active', 'bg-orange-500', 'text-white', 'border-orange-500');
  renderNotifications();
};

function renderNotifications() {
  const container = document.getElementById('notificationsList');
  let orders = window.notifOrders;

  if (window.notifFilter === 'kiosko') {
    orders = orders.filter(o => (o.notes || '').includes('[ORIGIN:KIOSKO]'));
  } else if (window.notifFilter === 'menu') {
    orders = orders.filter(o => (o.notes || '').includes('[ORIGIN:MENU]'));
  } else if (window.notifFilter === 'pendiente') {
    orders = orders.filter(o => o.status === 'Pendiente' || o.status === 'En preparación');
  }

  const pendingCount = window.notifOrders.filter(o => o.status === 'Pendiente' || o.status === 'En preparación').length;
  const badge = document.getElementById('notifBadge');
  const modalCount = document.getElementById('notifModalCount');
  if (badge) {
    badge.textContent = pendingCount;
    badge.classList.toggle('hidden', pendingCount === 0);
  }
  if (modalCount) modalCount.textContent = pendingCount;

  if (!orders.length) {
    container.innerHTML = '<div class="text-center text-gray-500 py-10 font-bold">No hay pedidos en esta categoría</div>';
    return;
  }

  container.innerHTML = orders.map(o => {
    const notes = o.notes || '';
    let originLabel = 'Desconocido';
    let originColor = 'gray';
    if (notes.includes('[ORIGIN:KIOSKO]')) { originLabel = '🖥️ Kiosko'; originColor = 'blue'; }
    else if (notes.includes('[ORIGIN:MENU]')) { originLabel = '📱 Menú QR'; originColor = 'green'; }

    let statusColor = 'yellow';
    if (o.status === 'Entregado' || o.status === 'Completado') statusColor = 'green';
    else if (o.status === 'Pendiente') statusColor = 'red';

    const timeStr = new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const ticketId = String(o.id).split('-')[0];

    const itemsHtml = (o.items || []).map(it =>
      `<div class="flex justify-between text-xs py-1 border-b border-[#222]">
        <span class="text-gray-300">${it.qty || it.quantity || 1}x ${it.name}</span>
        <span class="text-white font-bold">$${Number(it.price * (it.qty || it.quantity || 1)).toLocaleString()}</span>
      </div>`
    ).join('');

    return `
      <div class="bg-[#111] border border-[#222] rounded-2xl overflow-hidden hover:border-[#444] transition-all">
        <div class="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#222] bg-[#1a1a1a]">
          <div class="flex items-center gap-3">
            <span class="bg-${originColor}-500/20 text-${originColor}-400 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest">${originLabel}</span>
            <span class="font-black text-white text-sm">#${ticketId}</span>
            <span class="text-gray-500 text-xs">${timeStr}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="bg-${statusColor}-500/20 text-${statusColor}-400 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest">${o.status}</span>
          </div>
        </div>
        <div class="p-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Cliente</p>
              <p class="text-sm font-bold text-white">${escapeHTML(o.customer_name) || 'Sin nombre'}</p>
              <p class="text-xs text-gray-400">${escapeHTML(o.customer_phone) || 'N/A'}</p>
              <p class="text-xs text-gray-400 mt-1">${o.delivery_method || 'N/A'} — ${escapeHTML(o.address) || 'N/A'}</p>
            </div>
            <div>
              <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Productos</p>
              <div class="max-h-32 overflow-y-auto custom-scroll">${itemsHtml}</div>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-[#222]">
            <div>
              <span class="text-2xl font-black text-orange-500">$${Number(o.total).toLocaleString()}</span>
              <span class="text-xs text-gray-500 ml-2">${o.payment_method || 'Pendiente'}</span>
            </div>
            <div class="flex gap-2">
              ${(o.payment_method === 'Pendiente' || !o.payment_method) ? `
                <button onclick="notifRegisterPayment('${o.id}')" class="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm">💵 Cobrar</button>
              ` : ''}
              <button onclick="notifPrintComanda('${o.id}')" class="bg-[#222] hover:bg-[#333] border border-[#333] text-white px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95">🖨️ Comanda</button>
              <button onclick="notifPrintTicket('${o.id}')" class="bg-[#222] hover:bg-[#333] border border-[#333] text-white px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95">🧾 Ticket</button>
              <button onclick="notifMarkReady('${o.id}')" class="bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95">✅ Listo</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

window.notifPrintComanda = async function(orderId) {
  let order = window.notifOrders.find(o => String(o.id) === String(orderId));
  if (!order) {
    const { data } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
    if (data) order = data;
  }
  if (order) executePrintComanda(order);
};

window.notifPrintTicket = async function(orderId) {
  let order = window.notifOrders.find(o => String(o.id) === String(orderId));
  if (!order) {
    const { data } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
    if (data) order = data;
  }
  if (order) printPOSTicket(order);
};

window.notifMarkReady = async function(orderId) {
  try {
    await supabaseClient.from('orders').update({ status: 'Entregado' }).eq('id', orderId);
    showToast('✅ Pedido marcado como entregado');
    await refreshNotifications();
  } catch (e) {
    showToast('❌ Error actualizando pedido', 'error');
  }
};

window.notifRegisterPayment = async function(orderId) {
  const order = window.notifOrders.find(o => String(o.id) === String(orderId));
  if (!order) {
    try {
      const { data } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
      if (!data) return showToast('❌ Pedido no encontrado', 'error');
      openCheckoutForOrder(data);
    } catch(err) {
      showToast('❌ Error al cargar pedido', 'error');
    }
  } else {
    openCheckoutForOrder(order);
  }
};

window.openCheckoutForOrder = async function(order) {
  // Close notifications modal instantly
  closeNotificationsModal();
  
  clearCart();
  currentOpenOrderId = order.id;

  // Preserve original notes to not overwrite origin (like Kiosk or Menu QR)
  window.currentOpenOrderNotes = order.notes || '';

  // Load items into posCart so they show in checkout visually
  (order.items || []).forEach((item, index) => {
    const key = `db_${item.id || index}_${Date.now()}_${index}`;
    posCart[key] = {
      id: item.id || `custom_${index}`,
      qty: item.qty || item.quantity || 1,
      price: item.price,
      name: item.name,
      extrasLabel: '',
      fromDB: true
    };
  });

  updateCartUI();

  // Open the real checkout modal and wait for it to initialize (like fetching tables)
  await openCheckoutModal();

  // Select order type based on what was chosen in Kiosk
  let oType = 'A la mesa';
  if (order.delivery_method === 'Domicilio' || (order.notes && order.notes.includes('Domicilio'))) oType = 'Domicilio';
  else if (order.delivery_method === 'Para Llevar' || (order.notes && order.notes.includes('Llevar'))) oType = 'Para Llevar';
  
  const typeBtns = document.querySelectorAll('.order-type-btn');
  let foundBtn = null;
  typeBtns.forEach(b => { if(b.getAttribute('onclick') && b.getAttribute('onclick').includes(oType)) foundBtn = b; });
  if (foundBtn) {
    selectOrderType(oType, foundBtn);
  } else {
    document.getElementById('orderType').value = oType;
  }

  // Populate customer info
  const cn = document.getElementById('customerName');
  if(cn) cn.value = order.customer_name || '';
  
  const cp = document.getElementById('customerPhone');
  if(cp) cp.value = order.customer_phone || '';

  // Populate table or address AFTER a tiny delay to ensure select options are built
  if (oType === 'A la mesa' && order.address) {
    const tableNum = String(order.address).replace(/\D/g, ''); 
    const tableSelect = document.getElementById('tableNumber');
    if (tableSelect && tableNum) {
       setTimeout(() => { 
         tableSelect.value = tableNum; 
         // Do NOT call handleTableSelection() here because it would overwrite the name/phone 
         // with whatever is currently in the DB for this table, ruining the Kiosk data.
       }, 300);
    }
  } else if (oType === 'Domicilio') {
    const addr = document.getElementById('deliveryAddress');
    if (addr) addr.value = order.address || '';
  }
};

// Push incoming realtime orders into notifications
function pushToNotifications(orderPayload) {
  const notes = orderPayload.notes || '';
  if (notes.includes('[ORIGIN:KIOSKO]') || notes.includes('[ORIGIN:MENU]')) {
    window.notifOrders.unshift(orderPayload);
    renderNotifications();
  }
}

// === CASH REGISTER / SHIFTS (CAJA) ===

window.openCashModal = function() {
  document.getElementById('cashRegisterModal').classList.remove('hidden');
  const title = document.getElementById('cashModalTitle');
  
  if (activeCashClosingId) {
    title.textContent = 'Movimientos de Caja';
    document.getElementById('cashOpenSection').classList.add('hidden');
    document.getElementById('cashMovementSection').classList.remove('hidden');
  } else {
    title.textContent = 'Apertura de Caja';
    document.getElementById('cashMovementSection').classList.add('hidden');
    document.getElementById('cashOpenSection').classList.remove('hidden');
  }
};

window.closeCashModal = function() {
  document.getElementById('cashRegisterModal').classList.add('hidden');
};

window.submitOpenCash = async function() {
  const amount = parseFloat(document.getElementById('cashOpenAmount').value) || 0;
  
  try {
    const { data, error } = await supabaseClient
      .from('cash_closings')
      .insert([{
        business_id: businessId,
        is_open: true,
        opening_amount: amount
      }])
      .select('id')
      .single();

    if (error) throw error;
    
    activeCashClosingId = data.id;
    showToast('💵 Caja abierta exitosamente', 'success');
    closeCashModal();
    
    const btnCash = document.getElementById('btnCashMgmt');
    if (btnCash) {
      btnCash.innerHTML = '<span>💵</span> <span class="hidden sm:inline">Caja (Abierta)</span>';
      btnCash.classList.remove('text-red-500', 'bg-red-500/10', 'border-red-500/20');
      btnCash.classList.add('text-green-500', 'bg-green-500/10', 'border-green-500/20');
    }
  } catch (err) {
    showToast('❌ Error abriendo caja', 'error');
    console.error(err);
  }
};

window.selectCashMovement = function(type) {
  document.getElementById('cashMoveType').value = type;
  
  // Reset buttons
  const btns = ['btnMoveWithdrawal', 'btnMoveDeposit', 'btnMoveExpense', 'btnMovePurchase'];
  btns.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.className = 'bg-[#222] border border-[#333] text-gray-400 font-bold py-2 rounded-lg transition-all text-xs';
  });

  const catContainer = document.getElementById('cashMoveExpenseCatContainer');
  const reasonLabel = document.getElementById('cashMoveReasonLabel');
  const reasonInput = document.getElementById('cashMoveReason');
  
  if (catContainer) catContainer.classList.add('hidden');
  if (reasonLabel) reasonLabel.textContent = 'Concepto / Motivo';
  if (reasonInput) reasonInput.placeholder = 'Ej: Pago de hielo';

  if (type === 'withdrawal') {
    document.getElementById('btnMoveWithdrawal').className = 'bg-red-500/20 border border-red-500 text-red-500 font-bold py-2 rounded-lg transition-all text-xs';
  } else if (type === 'deposit') {
    document.getElementById('btnMoveDeposit').className = 'bg-green-500/20 border border-green-500 text-green-500 font-bold py-2 rounded-lg transition-all text-xs';
  } else if (type === 'expense') {
    document.getElementById('btnMoveExpense').className = 'bg-orange-500/20 border border-orange-500 text-orange-500 font-bold py-2 rounded-lg transition-all text-xs';
    if (catContainer) catContainer.classList.remove('hidden');
    if (reasonLabel) reasonLabel.textContent = 'Descripción del Gasto';
  } else if (type === 'purchase') {
    document.getElementById('btnMovePurchase').className = 'bg-blue-500/20 border border-blue-500 text-blue-500 font-bold py-2 rounded-lg transition-all text-xs';
    if (reasonLabel) reasonLabel.textContent = 'Proveedor / Descripción de Compra';
    if (reasonInput) reasonInput.placeholder = 'Ej: Compra de insumos a Proveedor X';
  }
};

window.submitCashMovement = async function() {
  if (!activeCashClosingId) {
    showToast('⚠️ No hay caja abierta', 'error');
    return;
  }
  const type = document.getElementById('cashMoveType').value;
  const amount = parseFloat(document.getElementById('cashMoveAmount').value) || 0;
  const reason = document.getElementById('cashMoveReason').value.trim();
  const category = document.getElementById('cashMoveExpenseCat')?.value || 'Otro';

  if (amount <= 0 || !reason) {
    showToast('⚠️ Ingresa un monto y un concepto válido', 'error');
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Determine the actual cash movement type
    const cmType = (type === 'deposit') ? 'deposit' : 'withdrawal';
    const cmReason = (type === 'expense') ? `Gasto: ${reason}` : (type === 'purchase') ? `Compra: ${reason}` : reason;

    // 1. Insert into cash_movements
    const { error: cmError } = await supabaseClient
      .from('cash_movements')
      .insert([{
        business_id: businessId,
        type: cmType,
        amount: amount,
        reason: cmReason
      }]);

    if (cmError) throw cmError;

    // 2. If Expense, insert into expenses
    if (type === 'expense') {
      const { error: expError } = await supabaseClient
        .from('expenses')
        .insert([{
          business_id: businessId,
          category: category,
          description: reason,
          amount: amount,
          date: today
        }]);
      if (expError) console.error('Error guardando gasto en admin:', expError);
    }
    
    // 3. If Purchase, insert into purchases (simplified)
    if (type === 'purchase') {
      const { error: purError } = await supabaseClient
        .from('purchases')
        .insert([{
          business_id: businessId,
          supplier_name: 'Compra Rápida POS',
          total: amount,
          payment_method: 'Efectivo',
          notes: reason,
          items: [{ name: reason, qty: 1, cost: amount }]
        }]);
      if (purError) console.error('Error guardando compra en admin:', purError);
    }

    let msg = type === 'deposit' ? 'Ingreso' : type === 'withdrawal' ? 'Egreso' : type === 'expense' ? 'Gasto' : 'Compra';
    showToast(`✅ ${msg} registrado`);
    
    document.getElementById('cashMoveAmount').value = '';
    document.getElementById('cashMoveReason').value = '';
    closeCashModal();
  } catch (err) {
    showToast('❌ Error registrando movimiento', 'error');
    console.error(err);
  }
};

// === CIERRE CIEGO / LOGOUT ===

window.logout = function() {
  if (activeCashClosingId) {
    document.getElementById('blindCloseModal').classList.remove('hidden');
  } else {
    performLogout();
  }
};

window.cancelBlindClose = function() {
  document.getElementById('blindCloseModal').classList.add('hidden');
};

window.submitBlindClose = async function() {
  const declaredCash = parseFloat(document.getElementById('blindCashAmount').value) || 0;
  
  if (declaredCash < 0) {
    showToast('⚠️ Ingresa un monto válido', 'error');
    return;
  }
  
  const btn = document.getElementById('btnSubmitBlindClose');
  btn.textContent = 'CERRANDO...';
  btn.disabled = true;

  try {
    // We get the opening info
    const { data: closingInfo } = await supabaseClient
      .from('cash_closings')
      .select('*')
      .eq('id', activeCashClosingId)
      .single();

    // Sum all orders for this business today since opened_at
    const { data: orders } = await supabaseClient
      .from('orders')
      .select('total, payment_method, status')
      .eq('business_id', businessId)
      .gte('created_at', closingInfo.opened_at);

    let cashSales = 0, transferSales = 0, cardSales = 0;
    if (orders) {
      orders.forEach(o => {
        if (o.status !== 'Cancelado') {
          if (o.payment_method === 'Efectivo') cashSales += Number(o.total);
          else if (o.payment_method === 'NEQUI') cardSales += Number(o.total);
          else if (o.payment_method === 'Transferencia') transferSales += Number(o.total);
        }
      });
    }

    // Sum cash movements
    const { data: moves } = await supabaseClient
      .from('cash_movements')
      .select('amount, type')
      .eq('business_id', businessId)
      .gte('created_at', closingInfo.opened_at);

    let totalDeposits = 0, totalWithdrawals = 0;
    if (moves) {
      moves.forEach(m => {
        if (m.type === 'deposit') totalDeposits += Number(m.amount);
        else totalWithdrawals += Number(m.amount);
      });
    }

    const expectedCash = Number(closingInfo.opening_amount) + cashSales + totalDeposits - totalWithdrawals;
    const difference = declaredCash - expectedCash;

    // Update the cash_closing record
    await supabaseClient
      .from('cash_closings')
      .update({
        is_open: false,
        closed_at: new Date().toISOString(),
        expected_total: expectedCash,
        declared_total: declaredCash,
        difference: difference,
        cash_sales: cashSales,
        transfer_sales: transferSales,
        card_sales: cardSales,
        total_expenses: totalWithdrawals
      })
      .eq('id', activeCashClosingId);

    // TODO: Imprimir ticket de cierre o algo
    showToast('✅ Turno Cerrado. Sesión finalizada.', 'success');
    
    setTimeout(() => {
      performLogout();
    }, 1500);

  } catch (e) {
    showToast('❌ Error al cerrar caja', 'error');
    console.error(e);
    btn.textContent = 'CONFIRMAR CIERRE';
    btn.disabled = false;
  }
};

async function performLogout() {
  try {
    localStorage.clear();
    sessionStorage.clear();
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.warn('Error during sign out:', error);
  } finally {
    window.location.href = 'login.html';
  }
}

async function loadDrivers() {
  const select = document.getElementById('deliveryDriver');
  if (!select) return;
  try {
    const { data } = await supabaseClient
      .from('staff')
      .select('name')
      .eq('business_id', businessId)
      .eq('role', 'Repartidor');
    
    let html = '<option value="">Seleccionar Repartidor...</option>';
    if (data) {
      data.forEach(d => {
        html += `<option value="${d.name}">${d.name}</option>`;
      });
    }
    html += '<option value="OTRO">Otro repartidor...</option>';
    select.innerHTML = html;
    
    select.addEventListener('change', function() {
      if (this.value === 'OTRO') {
        const customName = prompt("Ingresa el nombre del repartidor:");
        if (customName && customName.trim() !== '') {
           const newOpt = document.createElement('option');
           newOpt.value = customName.trim();
           newOpt.text = customName.trim();
           this.add(newOpt, this.options[this.length - 1]);
           this.value = customName.trim();
        } else {
           this.value = '';
        }
      }
    });
  } catch (err) {
    console.error('Error loading drivers', err);
  }
}

let posLogoClicks = 0;
window.handlePosLogoClick = function() {
  posLogoClicks++;
  if (posLogoClicks >= 5) {
    posLogoClicks = 0;

    // Android APK config mode
    if (window.AndroidConfig) {
      try {
        const current = JSON.parse(window.AndroidConfig.getConfig());
        const option = prompt(
          "⚙️ Configuración POS Android:\n" +
          "1 = Cambiar IP impresora (actual: " + current.printer_ip + ")\n" +
          "2 = Cambiar URL de la app\n" +
          "3 = Prueba de impresión\n" +
          "4 = Recargar app\n" +
          "5 = Cerrar Sesión (Secreto)",
          "1"
        );
        if (option === '1') {
          const newIP = prompt("IP de la impresora térmica:", current.printer_ip);
          if (newIP) {
            const newPort = prompt("Puerto (normalmente 9100):", String(current.printer_port));
            window.AndroidConfig.setConfig(newIP, parseInt(newPort) || 9100);
            alert("✅ Impresora configurada: " + newIP + ":" + (newPort || 9100));
            const testResult = window.AndroidPrint.testPrint();
            alert(testResult === 'OK' ? '✅ Impresión de prueba exitosa!' : '❌ Error: ' + testResult);
          }
        } else if (option === '2') {
          const newUrl = prompt("URL de inicio:", current.kiosk_url);
          if (newUrl) {
            window.AndroidConfig.setKioskUrl(newUrl);
            alert("✅ URL actualizada. Recargando...");
            window.AndroidConfig.reloadApp();
          }
        } else if (option === '3') {
          const testResult = window.AndroidPrint.testPrint();
          alert(testResult === 'OK' ? '✅ Impresión de prueba exitosa!' : '❌ Error: ' + testResult);
        } else if (option === '4') {
          window.AndroidConfig.reloadApp();
        } else if (option === '5') {
          const pwd = prompt("Contraseña de seguridad:");
          if (pwd === "salir") {
            performLogout();
          } else if (pwd !== null) {
            alert("Contraseña incorrecta");
          }
        }
      } catch (e) {
        alert('Error: ' + e.message);
      }
      return;
    }

    // For non-Android web mode:
    const webAction = prompt("⚙️ Menú Oculto POS:\n1 = Configurar Impresora\n5 = Cerrar Sesión", "1");
    if (webAction === '5') {
      const pwd = prompt("Contraseña de seguridad:");
      if (pwd === "salir") {
        performLogout();
      } else if (pwd !== null) {
        alert("Contraseña incorrecta");
      }
      return;
    }
    
    if (webAction !== '1') return;

    // Electron Desktop config mode (impresion TCP integrada)
    if (window.DesktopPrint) {
      if (typeof configureDesktopPrinter === 'function') {
        configureDesktopPrinter();
      }
      return;
    }

    // PrintBridge HTTP config (navegadores sin Electron ni Android)
    const currentIP = localStorage.getItem('printbridge_url') || 'http://192.168.1.100:9101';
    const newIP = prompt("⚙️ Configuración del Servidor de Impresión (PrintBridge):\nIngrese la dirección IP y puerto del servidor del PC (ej. http://192.168.1.100:9101):", currentIP);
    if (newIP !== null) {
      localStorage.setItem('printbridge_url', newIP);
      if (typeof PRINTBRIDGE_URL !== 'undefined') {
        PRINTBRIDGE_URL = newIP;
      }
      alert("✅ Servidor de impresión configurado en:\n" + newIP);
      if (typeof detectPrintBridge === 'function') {
        detectPrintBridge();
      }
    }
  }
};
