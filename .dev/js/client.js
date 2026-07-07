// ============================================================
// LOGIC FOR CLIENT PORTAL - MULTI-TENANT LOYALTY & CREDIT
// ============================================================

let currentBusinessId = null;
let currentBusinessData = null;

// Custom Toast
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show';
  if (type === 'error') toast.classList.add('error');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initializer
document.addEventListener('DOMContentLoaded', async () => {
  // Resolve business slug from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const bizSlug = urlParams.get('biz') || getSlugFromUrl();

  if (!bizSlug) {
    // If no business context, show default loading text or search first business
    try {
      const { data: firstBiz } = await supabaseClient.from('businesses').select('*').limit(1).single();
      if (firstBiz) {
        setBusinessContext(firstBiz);
      } else {
        document.getElementById('businessName').textContent = 'Club de Puntos';
        document.getElementById('businessSlug').textContent = 'General';
      }
    } catch (e) {
      console.error(e);
    }
  } else {
    // Load business details
    const biz = await getBusinessBySlug(bizSlug);
    if (biz) {
      setBusinessContext(biz);
    } else {
      document.getElementById('businessName').textContent = 'Negocio no encontrado';
    }
  }

  // Restore session if phone is saved in localStorage
  const savedPhone = localStorage.getItem('client_dashboard_phone');
  if (savedPhone) {
    document.getElementById('clientPhone').value = savedPhone;
    await loadClientData(savedPhone);
  }
});

function setBusinessContext(biz) {
  currentBusinessId = biz.id;
  currentBusinessData = biz;
  document.getElementById('businessName').textContent = biz.business_name;
  document.getElementById('businessSlug').textContent = biz.slug;

  // Set business logo if available
  if (biz.logo_url) {
    document.getElementById('bizLogoContainer').innerHTML = `<img src="${biz.logo_url}" class="w-10 h-10 object-contain rounded-2xl">`;

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = biz.logo_url;
  }
}

// Client login
async function loginClient() {
  const phone = document.getElementById('clientPhone').value.trim();
  if (!phone) return showToast('⚠️ Ingresa tu número de WhatsApp', 'error');

  const btn = document.getElementById('btnLoginClient');
  btn.disabled = true;
  btn.innerText = '⏳ Cargando...';

  try {
    await loadClientData(phone);
    localStorage.setItem('client_dashboard_phone', phone);
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Ingresar a mi Perfil';
  }
}

// Load Client data
async function loadClientData(phone) {
  if (!currentBusinessId) {
    throw new Error('No se ha detectado el contexto de ningún negocio. Vuelve a escanear el código QR.');
  }

  // 1. Fetch loyalty points
  const { data: loyalty, error: loyaltyErr } = await supabaseClient
    .from('loyalty_points')
    .select('*')
    .eq('business_id', currentBusinessId)
    .eq('customer_phone', phone)
    .maybeSingle();

  if (loyaltyErr) throw loyaltyErr;

  // 2. Fetch credit account
  const { data: credit, error: creditErr } = await supabaseClient
    .from('credit_accounts')
    .select('*')
    .eq('business_id', currentBusinessId)
    .eq('customer_phone', phone)
    .maybeSingle();

  if (creditErr) throw creditErr;

  // 3. Fetch recent orders
  const { data: orders, error: ordersErr } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('business_id', currentBusinessId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false });

  if (ordersErr) throw ordersErr;

  // Switch views
  document.getElementById('phoneScreen').classList.add('hidden');
  document.getElementById('dashboardScreen').classList.remove('hidden');

  // Render Loyalty Points
  const pts = loyalty ? loyalty.points : 0;
  const ordersCount = loyalty ? loyalty.total_orders : (orders ? orders.length : 0);
  const totalSpent = loyalty ? loyalty.total_spent : orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const clientName = credit ? credit.customer_name : (orders.length > 0 ? orders[0].customer_name : 'Cliente Valioso');

  document.getElementById('dashName').textContent = clientName;
  document.getElementById('dashPhone').textContent = `📞 ${phone}`;
  document.getElementById('dashPoints').textContent = pts;
  document.getElementById('dashOrdersCount').textContent = ordersCount;
  document.getElementById('dashSpentSum').textContent = `$${Number(totalSpent).toLocaleString()}`;

  // Determine Tier Level
  let tier = 'Bronce 🥉';
  if (pts >= 300) tier = 'Oro 🥇';
  else if (pts >= 100) tier = 'Plata 🥈';
  document.getElementById('dashTier').textContent = tier;

  // Render Credit status
  const creditCard = document.getElementById('creditCard');
  if (credit && credit.is_active) {
    creditCard.classList.remove('hidden');
    const limit = Number(credit.credit_limit || 0);
    const balance = Number(credit.balance || 0);
    const available = Math.max(0, limit - balance);
    const ratio = limit > 0 ? (balance / limit) * 100 : 0;

    document.getElementById('creditAvailable').textContent = `$${available.toLocaleString()}`;
    document.getElementById('creditBalance').textContent = `$${balance.toLocaleString()}`;
    document.getElementById('creditBar').style.width = `${Math.min(100, ratio)}%`;
    document.getElementById('creditFooter').textContent = `Límite Total Autorizado: $${limit.toLocaleString()}`;
  } else {
    creditCard.classList.add('hidden');
  }

  // Render Orders
  renderOrdersHistory(orders || []);
}

// Render history
function renderOrdersHistory(orders) {
  const container = document.getElementById('clientOrdersList');
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6">Aún no has realizado pedidos en este local.</p>`;
    return;
  }

  container.innerHTML = orders.map(o => {
    const dateStr = new Date(o.created_at).toLocaleDateString([], {day: '2-digit', month: 'short', year: 'numeric'});
    const timeStr = new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    // Status color
    let statusClass = 'bg-slate-100 text-slate-600';
    if (o.status === 'Entregado') statusClass = 'bg-green-100 text-green-700';
    else if (o.status === 'En camino') statusClass = 'bg-orange-100 text-orange-700';
    else if (o.status === 'Preparando' || o.status === 'Confirmado') statusClass = 'bg-blue-100 text-blue-700';

    return `
      <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
        <div class="flex justify-between items-center">
          <div>
            <p class="font-bold text-sm text-slate-800">Pedido #${o.id}</p>
            <p class="text-[10px] text-slate-400 font-bold mt-0.5">${dateStr} • ${timeStr}</p>
          </div>
          <span class="text-[10px] ${statusClass} px-3 py-1 rounded-full font-black uppercase tracking-wider">
            ${o.status || 'Pendiente'}
          </span>
        </div>

        <div class="text-xs text-slate-500 line-clamp-2">
          ${(o.items || []).map(i => `${i.qty}x ${i.name}`).join(', ')}
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-slate-50">
          <span class="text-xs text-slate-400 font-bold">Total: <strong class="text-slate-800">$${Number(o.total || 0).toLocaleString()}</strong></span>
          <a href="order-status.html?id=${o.id}" class="text-xs text-orange-500 font-black hover:underline flex items-center gap-1">
            🔍 Rastrear Pedido →
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// Exit Profile
function exitDashboard() {
  localStorage.removeItem('client_dashboard_phone');
  document.getElementById('clientPhone').value = '';
  document.getElementById('phoneScreen').classList.remove('hidden');
  document.getElementById('dashboardScreen').classList.add('hidden');
}
