// ===== SUPER ADMIN LOGIC =====

// ⚠️ REEMPLAZA ESTO POR EL CORREO QUE USARÁS PARA SER SUPER ADMIN
const SUPER_ADMIN_EMAIL = 'jesuscaldera2000@gmail.com';

let allBusinesses = [];

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(() => t.className = 'toast', 3000);
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

async function initSuperAdmin() {
  const session = await getCurrentSession();

  // No session -> redirect to login
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  const userEmail = session.user.email;

  // Check if it's the super admin
  // To test easily, you can remove the specific email check and just let anyone view it, but in production it's bad.
  // For now, we compare ignoring case.
  if (userEmail.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    document.getElementById('accessDenied').classList.remove('hidden');
    document.getElementById('superAdminPanel').classList.add('hidden');
    
    // MOSTRAR EL ERROR EN PANTALLA
    const errP = document.createElement('p');
    errP.className = "text-yellow-400 mt-4 font-bold text-sm bg-black/50 p-4 rounded-xl";
    errP.innerHTML = `⚠️ Diagnóstico:<br>Iniciaste sesión con: <b>${userEmail}</b><br>El superadmin es: <b>${SUPER_ADMIN_EMAIL}</b>`;
    document.getElementById('accessDenied').appendChild(errP);
    
    console.warn('Acceso denegado: el correo no coincide con SUPER_ADMIN_EMAIL');
    return;
  }

  // Access granted
  document.getElementById('accessDenied').classList.add('hidden');
  document.getElementById('superAdminPanel').classList.remove('hidden');
  document.getElementById('adminEmailText').textContent = userEmail;

  await loadBusinesses();
  await loadLandingImages();
}

async function loadBusinesses() {
  const tbody = document.getElementById('businessesTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-500">Cargando...</td></tr>';

  try {
    const { data, error } = await supabaseClient
      .from('superadmin_businesses_view')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      if (error.code === '42P01') {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-400">⚠️ Error: No has ejecutado el script SQL 'update_superadmin.sql' en Supabase.</td></tr>`;
        return;
      }
      throw error;
    }

    allBusinesses = data || [];
    renderBusinesses();
    populateCloneDropdowns();
    updateStats();
  } catch (err) {
    showToast('❌ Error cargando restaurantes');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-500">Error: ${err.message}</td></tr>`;
  }
}

function updateStats() {
  const total = allBusinesses.length;
  const active = allBusinesses.filter(b => b.is_active).length;
  const inactive = total - active;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statInactive').textContent = inactive;
}

function renderBusinesses() {
  const tbody = document.getElementById('businessesTableBody');

  if (allBusinesses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-500">No hay restaurantes registrados aún.</td></tr>';
    return;
  }

  const basePath = window.location.origin;

  tbody.innerHTML = allBusinesses.map(b => {
    const date = new Date(b.created_at).toLocaleDateString();
    const url = `${basePath}/${b.slug}`;
    const statusHtml = b.is_active
      ? `<span class="status-badge status-active">🟢 Activo</span>`
      : `<span class="status-badge status-inactive">🔴 Suspendido</span>`;

    const actionBtn = b.is_active
      ? `<button onclick="toggleStatus('${b.id}', false)" class="btn-toggle btn-deactivate">Bloquear</button>`
      : `<button onclick="toggleStatus('${b.id}', true)" class="btn-toggle btn-activate">Activar</button>`;

    return `
      <tr>
        <td>
          <div class="font-bold text-white text-base">${b.business_name}</div>
          <div class="text-xs text-gray-500 mt-1">Registrado: ${date}</div>
        </td>
        <td>
          <a href="${url}" target="_blank" class="text-orange-400 hover:underline flex items-center gap-1">
            /${b.slug} <span class="text-xs">↗</span>
          </a>
        </td>
        <td>
          <div class="text-gray-300 text-sm mb-1">📱 Local: ${b.whatsapp || 'Sin registrar'}</div>
          <div class="text-gray-400 text-xs mt-1">📞 Admin: ${b.admin_phone || 'N/A'}</div>
          <div class="text-gray-400 text-xs">📧 ${b.admin_email || 'N/A'}</div>
          <div class="text-gray-400 text-xs">🔑 ${b.admin_password || 'N/A'}</div>
        </td>
        <td>
          <div class="flex gap-3 text-xs">
            <span class="bg-white/5 px-2 py-1 rounded">🍔 ${b.products_count || 0} prod</span>
            <span class="bg-white/5 px-2 py-1 rounded">🛒 ${b.orders_count || 0} ped</span>
          </div>
        </td>
        <td>${statusHtml}</td>
        <td>
          <div class="flex gap-2">
            ${actionBtn}
            <button onclick="openEditModal('${b.id}', '${b.business_name.replace(/'/g, "\\'")}', '${b.slug}')" class="px-3 py-1 bg-blue-900/50 text-blue-400 border border-blue-900 rounded-lg text-sm hover:bg-blue-600 hover:text-white transition-all">✏️ Editar</button>
            <button onclick="deleteBusiness('${b.id}', '${b.business_name.replace(/'/g, "\\'")}')" class="px-3 py-1 bg-red-900/50 text-red-400 border border-red-900 rounded-lg text-sm hover:bg-red-600 hover:text-white transition-all">🗑️ Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteBusiness(businessId, businessName) {
  const confirmMsg = `⚠️ ADVERTENCIA DE SEGURIDAD ⚠️\n\n¿Estás absolutamente seguro de que quieres ELIMINAR el restaurante "${businessName}"?\n\nEsta acción borrará TODOS sus productos, configuraciones, clientes y pedidos de forma IRREVERSIBLE.`;
  
  if (!confirm(confirmMsg)) return;

  const doubleCheck = prompt(`Para confirmar la eliminación, escribe el nombre del restaurante exacto: ${businessName}`);
  if (doubleCheck !== businessName) {
    showToast('❌ Eliminación cancelada. El nombre no coincide.');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('businesses')
      .delete()
      .eq('id', businessId);

    if (error) throw error;

    showToast('✅ Restaurante y todos sus datos eliminados.');
    await loadBusinesses(); // recargar
  } catch (err) {
    console.error(err);
    showToast('❌ Error al eliminar: ' + err.message);
  }
}

async function toggleStatus(businessId, newStatus) {
  const confirmMsg = newStatus
    ? "¿Estás seguro de reactivar este restaurante? Volverá a funcionar normal."
    : "⚠️ ¿Estás seguro de SUSPENDER este restaurante? Su menú público y su panel admin quedarán bloqueados.";

  if (!confirm(confirmMsg)) return;

  try {
    const { error } = await supabaseClient
      .from('businesses')
      .update({ is_active: newStatus })
      .eq('id', businessId);

    if (error) throw error;

    showToast(newStatus ? '✅ Restaurante reactivado' : '🛑 Restaurante suspendido');
    await loadBusinesses(); // recargar
  } catch (err) {
    console.error(err);
    showToast('❌ Error actualizando estado. Asegúrate de haber ejecutado el SQL del superadmin.');
  }
}

// ==========================================
// LÓGICA PARA CREAR NUEVO CLIENTE (MODAL)
// ==========================================

// Cliente secundario de Supabase que NO guarda sesión, para no cerrar la sesión del admin.
const supabaseAdminAuth = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

function openClientModal() {
  document.getElementById('clientModal').classList.remove('hidden');
}

function closeClientModal() {
  document.getElementById('clientModal').classList.add('hidden');
  document.getElementById('createClientForm').reset();
}

function generateNewClientSlug(name) {
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  document.getElementById('newBizSlug').value = slug;
}

async function handleCreateClient(e) {
  e.preventDefault();
  
  const bizName = document.getElementById('newBizName').value.trim();
  const slug = document.getElementById('newBizSlug').value.trim();
  const email = document.getElementById('newBizEmail').value.trim();
  const password = document.getElementById('newBizPassword').value;
  const phone = document.getElementById('newBizPhone').value.trim();
  const btn = document.getElementById('btnCreateClient');

  btn.disabled = true;
  btn.textContent = '⏳ Creando cliente...';

  try {
    // 1. Crear usuario en Auth de Supabase con el cliente secundario
    const { data: authData, error: authError } = await supabaseAdminAuth.auth.signUp({
      email,
      password
    });
    
    if (authError) throw authError;
    if (!authData || !authData.user) throw new Error('El correo ya existe o requiere confirmación');

    const userId = authData.user.id;

    // 2. Crear negocio usando la función RPC (usando la sesión principal del Superadmin)
    const { data: bizId, error: bizError } = await supabaseClient.rpc('create_business_with_settings', {
      p_owner_id: userId,
      p_slug: slug,
      p_business_name: bizName,
      p_admin_email: email,
      p_admin_password: password,
      p_admin_phone: phone
    });

    if (bizError) throw bizError;

    showToast('✅ ¡Cliente creado exitosamente!');
    closeClientModal();
    await loadBusinesses(); // Recargar la tabla

  } catch (err) {
    showToast('❌ Error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear y Guardar';
  }
}

// ==========================================
// LÓGICA PARA EDITAR CLIENTE (MODAL)
// ==========================================

function openEditModal(id, name, slug) {
  document.getElementById('editBizId').value = id;
  document.getElementById('editBizName').value = name;
  document.getElementById('editBizSlug').value = slug;
  document.getElementById('editClientModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editClientModal').classList.add('hidden');
  document.getElementById('editClientForm').reset();
}

async function handleEditClient(e) {
  e.preventDefault();
  
  const id = document.getElementById('editBizId').value;
  const name = document.getElementById('editBizName').value.trim();
  const slug = document.getElementById('editBizSlug').value.trim();
  const btn = document.getElementById('btnEditClient');

  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  try {
    const { error } = await supabaseClient
      .from('businesses')
      .update({ business_name: name, slug: slug })
      .eq('id', id);

    if (error) throw error;

    showToast('✅ Cambios guardados correctamente.');
    closeEditModal();
    await loadBusinesses(); // Recargar la tabla

  } catch (err) {
    showToast('❌ Error al editar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar Cambios';
  }
}

// ==========================================
// LÓGICA PARA PERSONALIZAR IMÁGENES DE LANDING
// ==========================================

function previewSelectedImage(event, previewId) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById(previewId).src = e.target.result;
    }
    reader.readAsDataURL(file);
  }
}

async function loadLandingImages() {
  try {
    const { data, error } = await supabaseClient
      .from('landing_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;
    if (data) {
      if (data.hero_image_url) document.getElementById('previewHero').src = data.hero_image_url;
      if (data.admin_image_url) document.getElementById('previewAdmin').src = data.admin_image_url;
      if (data.mobile_image_url) document.getElementById('previewMobile').src = data.mobile_image_url;
      if (data.qr_image_url) document.getElementById('previewQr').src = data.qr_image_url;
      if (data.developer_image_url) document.getElementById('previewDeveloper').src = data.developer_image_url;
      if (data.fb_pixel_id) document.getElementById('fbPixelInput').value = data.fb_pixel_id;
      if (data.fb_api_token) document.getElementById('fbApiTokenInput').value = data.fb_api_token;
      if (data.price_old) document.getElementById('priceOldInput').value = data.price_old;
      if (data.price_current) document.getElementById('priceCurrentInput').value = data.price_current;
      if (data.spots_left) document.getElementById('spotsLeftInput').value = data.spots_left;
      if (data.whatsapp_number) document.getElementById('whatsappSalesInput').value = data.whatsapp_number;
    }
  } catch (err) {
    console.warn('No se pudieron cargar las imágenes de la landing settings', err);
  }
}

async function uploadLandingImage(imageType, inputId, event) {
  const fileInput = document.getElementById(inputId);
  const file = fileInput.files[0];
  if (!file) return showToast('⚠️ Selecciona una imagen primero');

  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Subiendo...';
  btn.disabled = true;

  const ext = file.name.split('.').pop();
  const fileName = `landing_${imageType}_${Date.now()}.${ext}`;

  try {
    // 1. Subir al storage (bucket public 'images')
    const { error: uploadErr } = await supabaseClient.storage
      .from('images')
      .upload(fileName, file, { upsert: true });

    if (uploadErr) throw uploadErr;

    // 2. Obtener URL pública
    const { data: urlData } = supabaseClient.storage
      .from('images')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // 3. Mapear columna según tipo de imagen
    const columnMap = {
      hero: 'hero_image_url',
      admin: 'admin_image_url',
      mobile: 'mobile_image_url',
      qr: 'qr_image_url',
      developer: 'developer_image_url'
    };

    const updateCol = columnMap[imageType];
    const updateObj = {};
    updateObj[updateCol] = publicUrl;

    // 4. Actualizar la tabla landing_settings
    const { error: updateErr } = await supabaseClient
      .from('landing_settings')
      .update(updateObj)
      .eq('id', 1);

    if (updateErr) throw updateErr;

    showToast('✅ Imagen guardada correctamente');
  } catch (err) {
    showToast('❌ Error: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function saveFBConfig(event) {
  const pixelId = document.getElementById('fbPixelInput').value.trim();
  const apiToken = document.getElementById('fbApiTokenInput').value.trim();
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    const { error } = await supabaseClient
      .from('landing_settings')
      .update({ fb_pixel_id: pixelId, fb_api_token: apiToken })
      .eq('id', 1);

    // Si la columna fb_api_token no existe en Supabase, esto dará un error.
    if (error) throw error;
    showToast('✅ Configuración de Facebook guardada correctamente');
  } catch (err) {
    if (err.code === 'PGRST204') {
        showToast('❌ Error: Asegúrate de añadir la columna fb_api_token a landing_settings en Supabase');
    } else {
        showToast('❌ Error: ' + err.message);
    }
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function saveLandingPrices(event) {
  const priceOld = document.getElementById('priceOldInput').value.trim();
  const priceCurrent = document.getElementById('priceCurrentInput').value.trim();
  const spotsLeft = document.getElementById('spotsLeftInput').value.trim() || 3;
  const whatsappSales = document.getElementById('whatsappSalesInput').value.trim() || '573015027933';
  
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Guardando...';
  btn.disabled = true;

  try {
    const { error } = await supabaseClient
      .from('landing_settings')
      .update({ 
        price_old: priceOld, 
        price_current: priceCurrent,
        spots_left: spotsLeft,
        whatsapp_number: whatsappSales
      })
      .eq('id', 1);

    if (error) throw error;
    showToast('✅ Configuración de ventas guardada');
  } catch (err) {
    showToast('❌ Error: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ==========================================
// LÓGICA PARA CLONADOR DE MENÚS (NUEVO)
// ==========================================

function populateCloneDropdowns() {
  const sourceSelect = document.getElementById('cloneSourceSelect');
  const targetSelect = document.getElementById('cloneTargetSelect');
  
  // Guardar selecciones actuales si existen
  const currentSource = sourceSelect.value;
  const currentTarget = targetSelect.value;

  let optionsHtml = '<option value="">Selecciona restaurante...</option>';
  
  // Ordenar alfabéticamente
  const sortedBiz = [...allBusinesses].sort((a, b) => a.business_name.localeCompare(b.business_name));
  
  sortedBiz.forEach(b => {
    optionsHtml += `<option value="${b.id}">${b.business_name} (/${b.slug})</option>`;
  });

  sourceSelect.innerHTML = optionsHtml;
  targetSelect.innerHTML = optionsHtml;

  // Restaurar selecciones si es posible
  if (currentSource) sourceSelect.value = currentSource;
  if (currentTarget) targetSelect.value = currentTarget;
}

async function handleCloneMenu(event) {
  event.preventDefault();
  
  const sourceId = document.getElementById('cloneSourceSelect').value;
  const targetId = document.getElementById('cloneTargetSelect').value;
  const btn = document.getElementById('btnCloneMenu');

  if (!sourceId || !targetId) {
    return showToast('⚠️ Selecciona Origen y Destino primero');
  }

  if (sourceId === targetId) {
    return showToast('⚠️ El Origen y Destino no pueden ser el mismo');
  }

  const sourceName = document.getElementById('cloneSourceSelect').options[document.getElementById('cloneSourceSelect').selectedIndex].text;
  const targetName = document.getElementById('cloneTargetSelect').options[document.getElementById('cloneTargetSelect').selectedIndex].text;

  const confirmMsg = `¿Estás seguro de copiar TODOS los productos de:\n\nOrigen: ${sourceName}\nDestino: ${targetName}\n\nNota: Los productos no se borrarán del destino, sino que se agregarán a los existentes.`;
  if (!confirm(confirmMsg)) return;

  const originalText = btn.innerHTML;
  btn.innerHTML = '<span>⏳ Clonando...</span>';
  btn.disabled = true;

  try {
    // 1. Llamar a la función RPC que clona los productos de forma segura (Bypass RLS)
    const { error: cloneErr } = await supabaseClient.rpc('clone_menu', {
      p_source_business_id: sourceId,
      p_target_business_id: targetId
    });

    if (cloneErr) throw cloneErr;

    showToast(`✅ ¡Éxito! Menú clonado a ${targetName}.`);
    
    // Recargar para actualizar los contadores
    await loadBusinesses();

  } catch (err) {
    console.error(err);
    if (err.message.includes('No function matches')) {
      showToast('❌ Error: Falta ejecutar el script SQL en Supabase para habilitar esta función.');
    } else {
      showToast('❌ Error al clonar: ' + err.message);
    }
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Inicializar
document.addEventListener('DOMContentLoaded', initSuperAdmin);
