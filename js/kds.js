// ===== KDS.JS - KITCHEN DISPLAY SYSTEM =====
let businessId = null;
let businessName = '';
let activeOrders = [];
let soundEnabled = true;
let kdsSubscription = null;

// Timer interval to update elapsed times
setInterval(updateTimes, 10000); // Every 10 seconds

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (type === 'error') {
    t.classList.add('border-red-500', 'text-red-400');
    t.classList.remove('border-[#4d576b]', 'text-white');
  } else {
    t.classList.add('border-[#4d576b]', 'text-white');
    t.classList.remove('border-red-500', 'text-red-400');
  }
  
  t.classList.remove('opacity-0', 'translate-y-5', 'pointer-events-none');
  setTimeout(() => {
    t.classList.add('opacity-0', 'translate-y-5', 'pointer-events-none');
  }, 3000);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('btnSound');
  if (soundEnabled) {
    btn.innerHTML = '🔊';
    btn.classList.remove('opacity-50');
    showToast('Sonido activado');
  } else {
    btn.innerHTML = '🔇';
    btn.classList.add('opacity-50');
    showToast('Sonido desactivado');
  }
}

function playAlertSound() {
  if (!soundEnabled) return;
  const audio = document.getElementById('kdsAlertSound');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio autoplay blocked', e));
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

async function initKDS() {
  const session = await getCurrentSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const biz = await getCurrentBusiness();
  if (!biz) {
    alert('No se encontró el negocio');
    await logout();
    return;
  }

  businessId = biz.id;
  businessName = biz.business_name;
  
  document.getElementById('businessName').textContent = businessName;

  await loadOrders();
  subscribeToOrders();
}

async function loadOrders() {
  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .in('status', ['Pendiente', 'En preparación'])
      .order('created_at', { ascending: true }); // Oldest first (First In, First Out)

    if (error) throw error;
    
    // Play sound if we have more orders than before (and it's not the initial load empty)
    if (activeOrders.length > 0 && data.length > activeOrders.length) {
      playAlertSound();
    }

    activeOrders = data || [];
    renderOrders();
  } catch (err) {
    console.error('Error loading orders:', err);
    showToast('Error de conexión', 'error');
  }
}

function renderOrders() {
  const container = document.getElementById('kdsGrid');
  document.getElementById('orderCount').textContent = activeOrders.length;

  if (activeOrders.length === 0) {
    container.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center text-[#4d576b] space-y-4">
        <span class="text-8xl">☕</span>
        <h2 class="text-3xl font-black tracking-widest uppercase">Cocina Limpia</h2>
        <p class="font-bold text-lg">No hay pedidos pendientes</p>
      </div>
    `;
    return;
  }

  let html = '';
  const now = new Date();

  activeOrders.forEach(o => {
    const orderDate = new Date(o.created_at);
    const diffMinutes = Math.floor((now - orderDate) / 60000);
    
    // Determine card style based on status and time
    let cardClass = 'bg-[#1f232b] border-[#2d333f]';
    let headerClass = 'bg-[#2d333f]';
    let timeTextClass = 'text-gray-400';
    let statusText = o.status;
    let btnAction = '';

    if (o.status === 'Pendiente') {
      cardClass += ' card-pendiente';
      timeTextClass = diffMinutes > 15 ? 'text-red-500 font-black' : 'text-orange-400';
      if (diffMinutes > 15) cardClass += ' card-retrasada';
      btnAction = `<button onclick="updateOrderStatus('${o.id}', 'En preparación')" class="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all text-lg tracking-widest uppercase">🔪 Preparar</button>`;
    } else if (o.status === 'En preparación') {
      cardClass += ' card-preparacion';
      headerClass = 'bg-[#1e3a8a]/20'; // light blue tint
      timeTextClass = 'text-blue-400';
      btnAction = `<button onclick="updateOrderStatus('${o.id}', 'Entregado')" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all text-lg tracking-widest uppercase">✅ Listo</button>`;
    }

    // Delivery method badge
    let deliveryBadge = '';
    if (o.delivery_method === 'Domicilio') deliveryBadge = '🛵 Domicilio';
    else if (o.delivery_method === 'Para Llevar') deliveryBadge = '🛍️ Llevar';
    else deliveryBadge = '🪑 Mesa';

    // Items HTML
    let itemsHtml = '';
    const items = o.items || [];
    items.forEach(item => {
      // Bold item name, indent extras
      itemsHtml += `
        <div class="border-b border-[#2d333f] py-3 last:border-0">
          <div class="flex justify-between items-start">
            <span class="font-black text-white text-xl leading-tight w-4/5">${item.qty}x ${item.name}</span>
          </div>
        </div>
      `;
    });

    html += `
      <div class="w-full flex flex-col rounded-2xl shadow-xl overflow-hidden ${cardClass} h-fit max-h-[70vh]">
        <!-- Header -->
        <div class="px-5 py-4 ${headerClass} flex justify-between items-center border-b border-[#2d333f]">
          <div>
            <h3 class="text-2xl font-black text-white">#${o.id}</h3>
            <p class="text-xs font-bold ${timeTextClass} mt-1 uppercase tracking-wider elapsed-time" data-time="${o.created_at}">${diffMinutes} min</p>
          </div>
          <div class="text-right">
            <span class="inline-block bg-[#15181e] px-3 py-1.5 rounded-lg text-xs font-bold text-white mb-1 shadow-inner border border-[#3d4554]">${deliveryBadge}</span>
            <p class="text-sm font-bold text-gray-300 truncate max-w-[120px]">${o.address || ''}</p>
          </div>
        </div>

        <!-- Body / Items -->
        <div class="p-5 flex-1 overflow-y-auto custom-scroll bg-[#15181e]/50">
          ${itemsHtml}
          ${o.notes ? `
            <div class="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <p class="text-xs font-black text-yellow-500 uppercase tracking-widest mb-1">Nota del Cliente</p>
              <p class="text-sm text-yellow-100 font-medium italic">${o.notes}</p>
            </div>
          ` : ''}
        </div>

        <!-- Footer / Action -->
        <div class="p-4 bg-[#1f232b] border-t border-[#2d333f]">
          ${btnAction}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function updateTimes() {
  const timeEls = document.querySelectorAll('.elapsed-time');
  const now = new Date();
  timeEls.forEach(el => {
    const orderDate = new Date(el.getAttribute('data-time'));
    const diffMinutes = Math.floor((now - orderDate) / 60000);
    el.textContent = `${diffMinutes} min`;
    
    // If it's a pending order, pulse if > 15
    const card = el.closest('.card-pendiente');
    if (card) {
      if (diffMinutes > 15) {
        card.classList.add('card-retrasada');
        el.classList.add('text-red-500', 'font-black');
        el.classList.remove('text-orange-400');
      }
    }
  });
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const { error } = await supabaseClient
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) throw error;
    // We don't need to manually reload, realtime should catch it.
    // But for UI responsiveness, we optimistically update:
    const orderIndex = activeOrders.findIndex(o => String(o.id) === String(orderId));
    if (orderIndex > -1) {
      if (newStatus === 'Entregado') {
        activeOrders.splice(orderIndex, 1);
      } else {
        activeOrders[orderIndex].status = newStatus;
      }
      renderOrders();
    }
    showToast(`Orden #${orderId} actualizada a ${newStatus}`);
  } catch (err) {
    showToast('Error al actualizar: ' + err.message, 'error');
  }
}

// REALTIME SUBSCRIPTION
function subscribeToOrders() {
  if (kdsSubscription) {
    supabaseClient.removeChannel(kdsSubscription);
  }

  kdsSubscription = supabaseClient
    .channel('kds-orders-channel')
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      },
      (payload) => {
        // Only care if status is relevant
        const newRecord = payload.new;
        if (payload.eventType === 'INSERT') {
          if (newRecord.status === 'Pendiente' || newRecord.status === 'En preparación') {
            activeOrders.push(newRecord);
            playAlertSound();
            renderOrders();
          }
        } else if (payload.eventType === 'UPDATE') {
          const idx = activeOrders.findIndex(o => o.id === newRecord.id);
          if (newRecord.status === 'Pendiente' || newRecord.status === 'En preparación') {
            if (idx > -1) {
              activeOrders[idx] = newRecord; // Update
            } else {
              activeOrders.push(newRecord); // Newly moved into these states?
              playAlertSound();
            }
          } else {
            // It was completed or cancelled
            if (idx > -1) {
              activeOrders.splice(idx, 1);
            }
          }
          // Sort by date again to ensure order
          activeOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          renderOrders();
        } else if (payload.eventType === 'DELETE') {
          const oldRecord = payload.old;
          const idx = activeOrders.findIndex(o => o.id === oldRecord.id);
          if (idx > -1) {
            activeOrders.splice(idx, 1);
            renderOrders();
          }
        }
      }
    )
    .subscribe();
}

// Init
document.addEventListener('DOMContentLoaded', initKDS);
