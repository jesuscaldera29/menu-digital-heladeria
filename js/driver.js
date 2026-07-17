// ============================================================
// LOGIC FOR DELIVERY DRIVER PORTAL - MULTI-TENANT
// ============================================================

let currentDriver = null;
let currentBusiness = null;
let activeDeliveries = [];
let completedDeliveries = [];

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
  // Check session
  const session = await getCurrentSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  // Get staff details
  const { data: staffList, error: staffError } = await supabaseClient
    .from('staff')
    .select('*')
    .eq('user_id', session.user.id);

  if (staffError || !staffList || staffList.length === 0) {
    showToast('⚠️ No tienes un usuario de personal configurado.', 'error');
    setTimeout(() => {
      logout();
    }, 2000);
    return;
  }

  currentDriver = staffList[0];
  
  // Verify role
  if (currentDriver.role !== 'Repartidor') {
    showToast('⚠️ Acceso restringido. Solo para Repartidores.', 'error');
    setTimeout(() => {
      window.location.href = 'admin.html';
    }, 2000);
    return;
  }

  // Fetch business info
  const { data: bizData } = await supabaseClient
    .from('businesses')
    .select('business_name')
    .eq('id', currentDriver.business_id)
    .single();

  currentBusiness = bizData;
  document.getElementById('driverName').textContent = currentDriver.name;
  document.getElementById('businessName').textContent = bizData ? bizData.business_name : 'MenuPro Local';

  // Load Driver Availability Status
  await updateAvailabilityUI();

  // Load Deliveries
  await loadDeliveries();

  // Polling active deliveries every 15 seconds
  setInterval(loadDeliveries, 15000);
});

// Load Driver availability state
async function updateAvailabilityUI() {
  if (!currentDriver || !currentDriver.driver_id) return;

  try {
    const { data: driverData, error } = await supabaseClient
      .from('delivery_drivers')
      .select('is_available')
      .eq('id', currentDriver.driver_id)
      .single();

    if (error) throw error;

    const available = driverData ? driverData.is_available : false;
    const pulse = document.getElementById('statusPulse');
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');

    if (available) {
      pulse.className = 'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-green-400';
      dot.className = 'relative inline-flex rounded-full h-3 w-3 bg-green-500';
      label.textContent = 'Disponible / Esperando pedidos';
      label.className = 'text-xs font-bold text-green-600';
    } else {
      pulse.className = 'hidden';
      dot.className = 'relative inline-flex rounded-full h-3 w-3 bg-slate-400';
      label.textContent = 'Fuera de Servicio / Ocupado';
      label.className = 'text-xs font-bold text-slate-500';
    }
  } catch (err) {
    console.error('Error fetching driver availability:', err);
  }
}

// Toggle Driver Availability
async function toggleAvailability() {
  if (!currentDriver || !currentDriver.driver_id) return;
  const btn = document.getElementById('btnToggleAvailability');
  btn.disabled = true;

  try {
    const { data: driverData } = await supabaseClient
      .from('delivery_drivers')
      .select('is_available')
      .eq('id', currentDriver.driver_id)
      .single();

    const currentStatus = driverData ? driverData.is_available : false;

    const { error } = await supabaseClient
      .from('delivery_drivers')
      .update({ is_available: !currentStatus })
      .eq('id', currentDriver.driver_id);

    if (error) throw error;

    showToast(!currentStatus ? '✅ Ahora estás Disponible' : '❌ Fuera de servicio');
    await updateAvailabilityUI();
  } catch (err) {
    showToast('Error cambiando estado: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// Load deliveries
async function loadDeliveries() {
  if (!currentDriver || !currentDriver.driver_id) return;

  try {
    // 1. Fetch active deliveries (Preparado, En camino, Pendiente)
    const { data: active, error: activeErr } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('driver_id', currentDriver.driver_id)
      .neq('status', 'Entregado')
      .order('created_at', { ascending: false });

    if (activeErr) throw activeErr;
    activeDeliveries = active || [];

    // 2. Fetch completed deliveries today
    const today = new Date().toISOString().split('T')[0];
    const { data: completed, error: completedErr } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('driver_id', currentDriver.driver_id)
      .eq('status', 'Entregado')
      .gte('created_at', today + 'T00:00:00')
      .order('created_at', { ascending: false });

    if (completedErr) throw completedErr;
    completedDeliveries = completed || [];

    // Render lists
    renderPendingList();
    renderCompletedList();
  } catch (err) {
    console.error('Error loading deliveries:', err);
  }
}

// Render active deliveries
function renderPendingList() {
  const container = document.getElementById('pendingDeliveries');
  const countBadge = document.getElementById('activeCount');
  if (!container) return;

  countBadge.textContent = activeDeliveries.length;

  if (activeDeliveries.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-3xl p-8 border border-slate-100 text-center shadow-sm">
        <span class="text-4xl">🎉</span>
        <h3 class="font-black text-slate-800 mt-3">¡Todo al día!</h3>
        <p class="text-xs text-slate-400 font-medium mt-1">No tienes despachos activos asignados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = activeDeliveries.map(o => {
    const isEnCamino = o.status === 'En camino';
    const cleanPhone = o.customer_phone ? o.customer_phone.replace(/\D/g, '') : '';
    const whatsappMsg = encodeURIComponent(`Hola ${o.customer_name}, soy el repartidor de ${currentBusiness ? currentBusiness.business_name : 'el local'}. Voy en camino con tu pedido.`);
    const navigationAddress = `${o.address || ''} ${o.neighborhood || ''}`.trim();
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(navigationAddress)}`;
    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(navigationAddress)}`;

    return `
      <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
        <!-- TOP INFO -->
        <div class="flex items-center justify-between">
          <span class="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">Pedido #${o.id}</span>
          <span class="text-xs ${isEnCamino ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'} px-3 py-1 rounded-full font-black uppercase">
            ${isEnCamino ? '🚚 En Camino' : '👨‍🍳 ' + (o.status || 'Pendiente')}
          </span>
        </div>

        <!-- CLIENT INFO -->
        <div class="space-y-1">
          <h4 class="font-black text-base text-slate-800">${o.customer_name}</h4>
          <p class="text-xs text-slate-500 font-semibold">📞 ${o.customer_phone}</p>
        </div>

        <!-- ADDRESS CARD -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
          <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Dirección de entrega</p>
          <p class="text-sm font-black text-slate-800">${o.address || 'N/A'}</p>
          ${o.neighborhood ? `<p class="text-xs font-bold text-orange-600">Barrio: ${o.neighborhood}</p>` : ''}
          ${o.notes ? `<p class="text-xs italic text-slate-500 mt-2">📝 "${escapeHTML(o.notes)}"</p>` : ''}
        </div>

        <!-- PAYMENTS -->
        <div class="flex justify-between items-center text-sm border-t border-b border-slate-100 py-3">
          <div>
            <p class="text-[10px] text-slate-400 font-bold uppercase">Forma de Pago</p>
            <p class="font-bold text-slate-700 mt-0.5">${o.payment_method || 'Efectivo'}</p>
          </div>
          <div class="text-right">
            <p class="text-[10px] text-slate-400 font-bold uppercase">Total a Cobrar</p>
            <p class="text-lg font-black text-red-600">$${Number(o.total || 0).toLocaleString()}</p>
          </div>
        </div>

        <!-- BUTTONS / NAVIGATION ACTIONS -->
        <div class="grid grid-cols-3 gap-2">
          <!-- WHATSAPP -->
          <a href="https://wa.me/${cleanPhone}?text=${whatsappMsg}" target="_blank" class="bg-[#25D366] hover:bg-[#20ba5a] text-white py-3 rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm active:scale-95 transition-all gap-1.5">
            📲 Chat
          </a>
          <!-- WAZE -->
          <a href="${wazeUrl}" target="_blank" class="bg-[#33ccff] hover:bg-[#1fa1cc] text-white py-3 rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm active:scale-95 transition-all gap-1.5">
            🚙 Waze
          </a>
          <!-- GMAPS -->
          <a href="${mapUrl}" target="_blank" class="bg-[#4285F4] hover:bg-[#357ae8] text-white py-3 rounded-2xl flex items-center justify-center font-bold text-xs shadow-sm active:scale-95 transition-all gap-1.5">
            📍 Maps
          </a>
        </div>

        <!-- ORDER MAIN STATUS TRIGGER -->
        <div>
          ${isEnCamino ? `
            <button onclick="updateOrderStatus(${o.id}, 'Entregado')" class="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black py-4 rounded-2xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-2">
              ✅ ENTREGAR PEDIDO
            </button>
          ` : `
            <button onclick="updateOrderStatus(${o.id}, 'En camino')" class="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-black py-4 rounded-2xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-2">
              🚚 INICIAR VIAJE (En Camino)
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Render completed list & calculate logs
function renderCompletedList() {
  const container = document.getElementById('completedDeliveries');
  const completedCount = document.getElementById('completedCount');
  const totalTips = document.getElementById('totalTips');
  
  if (!container) return;

  completedCount.textContent = completedDeliveries.length;
  
  // Calculate tips
  const tipsSum = completedDeliveries.reduce((sum, o) => sum + Number(o.tip || 0), 0);
  totalTips.textContent = `$${tipsSum.toLocaleString()}`;

  if (completedDeliveries.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic text-center py-6">No has entregado pedidos hoy todavía.</p>`;
    return;
  }

  container.innerHTML = completedDeliveries.map(o => `
    <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex justify-between items-center">
      <div>
        <p class="font-bold text-sm text-slate-800">${o.customer_name}</p>
        <p class="text-[10px] text-slate-400 font-bold mt-0.5">Pedido #${o.id} • ${new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
      </div>
      <div class="text-right">
        <p class="font-black text-green-600 text-sm">$${Number(o.total || 0).toLocaleString()}</p>
        ${o.tip > 0 ? `<p class="text-[9px] text-orange-500 font-bold">Propina: +$${Number(o.tip).toLocaleString()}</p>` : ''}
      </div>
    </div>
  `).join('');
}

// Update Order Status
async function updateOrderStatus(orderId, newStatus) {
  if (!confirm(`¿Cambiar estado del pedido #${orderId} a "${newStatus}"?`)) return;

  try {
    const { error } = await supabaseClient
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) throw error;

    showToast(`✅ Pedido #${orderId} actualizado a "${newStatus}"`);
    await loadDeliveries();
  } catch (err) {
    showToast('Error al actualizar pedido: ' + err.message, 'error');
  }
}

async function logout() {
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
