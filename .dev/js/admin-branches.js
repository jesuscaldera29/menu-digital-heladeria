// ===== SUCURSALES (BRANCHES) =====
let allBranches = [];

async function loadBranches() {
  const session = await getCurrentSession();
  if (!session) return;
  
  try {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    allBranches = data || [];
    renderBranches();
  } catch (err) {
    showToast('Error cargando sucursales: ' + err.message, 'error');
  }
}

function renderBranches() {
  const container = document.getElementById('branchesList');
  if (!container) return;
  
  if (!allBranches.length) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No hay sucursales creadas</p>';
    return;
  }
  
  container.innerHTML = allBranches.map(b => {
    const baseUrl = window.location.origin;
    const menuLink = `${baseUrl}/${b.slug}`;
    const kioskLink = `${baseUrl}/kiosk.html?slug=${b.slug}`;
    const posLink = `${baseUrl}/pos.html?slug=${b.slug}`;
    
    return `
    <div class="p-6 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-4 relative">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-xl font-black text-orange-600">${b.business_name.charAt(0)}</div>
          <div>
            <h3 class="font-black text-lg">${b.business_name}</h3>
            <p class="text-xs text-gray-500 font-mono">/${b.slug}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openEditBranchModal('${b.id}')" class="text-blue-500 p-2 text-sm active:scale-95 transition-all" title="Editar">✏️</button>
          ${b.id === businessId 
            ? `<span class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Sucursal Actual</span>` 
            : `<button onclick="deleteBranch('${b.id}')" class="text-red-500 p-2 text-sm active:scale-95 transition-all" title="Eliminar Sucursal">🗑️</button>`
          }
        </div>
      </div>
      
      <div class="text-sm border-t border-gray-200 pt-3">
        <p class="font-bold mb-1">Credenciales (Gerente de Sucursal):</p>
        <p class="text-gray-600 text-xs font-mono">📧 ${b.admin_email || 'Sin correo configurado'}</p>
        <p class="text-gray-600 text-xs font-mono">🔑 ${b.admin_password || '******'}</p>
      </div>

      <div class="border-t border-gray-200 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button onclick="navigator.clipboard.writeText('${menuLink}'); showToast('Enlace copiado')" class="bg-white border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-sm">
          📱 Link Menú
        </button>
        <button onclick="navigator.clipboard.writeText('${posLink}'); showToast('Enlace copiado')" class="bg-white border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-sm">
          💻 Link POS
        </button>
        <button onclick="navigator.clipboard.writeText('${kioskLink}'); showToast('Enlace copiado')" class="bg-white border border-gray-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-sm">
          🍦 Link Kiosko
        </button>
      </div>
      
      ${b.id !== businessId ? `
      <div class="mt-2 text-right">
        <button onclick="switchBranch('${b.id}')" class="text-xs font-bold text-orange-600 hover:text-orange-800 underline">Cambiar a esta sucursal</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

async function switchBranch(newBusinessId) {
  localStorage.setItem('override_business_id', newBusinessId);
  window.location.reload();
}

window.openCreateBranchModal = function() {
  document.getElementById('createBranchModal').classList.remove('hidden');
};

async function createBranch(event) {
  const name = document.getElementById('branchName').value.trim();
  const slug = document.getElementById('branchSlug').value.trim().toLowerCase();
  const email = document.getElementById('branchEmail').value.trim();
  const password = document.getElementById('branchPassword').value;
  const copyProducts = document.getElementById('copyProductsCheckbox')?.checked;

  if (!name || !slug) return showToast('⚠️ Ingresa nombre y slug', 'error');
  if (!email || !password) return showToast('⚠️ Ingresa email y contraseña para el administrador de la sucursal', 'error');

  const btn = event.target;
  const originalText = btn.innerText;
  btn.innerText = '⏳ Creando...';
  btn.disabled = true;

  try {
    const session = await getCurrentSession();
    if (!session) throw new Error('No hay sesión activa.');

    // 1. Validate slug uniqueness
    const { data: existingSlug } = await supabaseClient.from('businesses').select('id').eq('slug', slug).single();
    if (existingSlug) throw new Error('El enlace (slug) ya está en uso. Elige otro.');

    // 2. Insert new business linked to the owner
    const { data: newBiz, error: bizError } = await supabaseClient.from('businesses').insert([{
      owner_id: session.user.id,
      business_name: name,
      slug: slug,
      admin_email: email,
      admin_password: password,
      is_active: true
    }]).select().single();

    if (bizError) throw bizError;
    const newBusinessId = newBiz.id;

    // 3. Create the Staff/Admin Auth user for the branch
    const tempClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });

    let staffUserId = null;
    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name + ' Admin',
          role: 'Administrador',
          business_id: newBusinessId
        }
      }
    });

    if (signUpError) {
      // Si el usuario ya existe en Auth, intentar reutilizar
      if (signUpError.message && (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered'))) {
        const tempLoginClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
        const { data: loginData, error: loginError } = await tempLoginClient.auth.signInWithPassword({ email, password });
        if (loginError || !loginData.user) {
          await supabaseClient.from('businesses').delete().eq('id', newBusinessId);
          throw new Error('El email ya existe. Debes ingresar la misma contraseña original para reutilizarlo, o usar un email distinto.');
        }
        staffUserId = loginData.user.id;
      } else {
        await supabaseClient.from('businesses').delete().eq('id', newBusinessId);
        throw signUpError;
      }
    } else {
      if (!signUpData.user) throw new Error('No se pudo crear el usuario en Supabase Auth.');
      staffUserId = signUpData.user.id;
    }

    // 4. Save to staff table
    const { error: staffError } = await supabaseClient.from('staff').insert([{
      business_id: newBusinessId,
      name: name + ' Admin',
      role: 'Administrador',
      phone: '',
      email: email,
      password: password,
      user_id: staffUserId,
      is_active: true
    }]);

    if (staffError) throw staffError;

    // 5. Create default settings for the new branch
    try {
      await supabaseClient.from('settings').insert([{
        business_id: newBusinessId,
        business_name: name
      }]);
    } catch (e) {
      console.warn('Settings insert warning:', e);
    }

    // 6. Copy products and categories if requested
    if (copyProducts && businessId) {
      try {
        // Fetch original products
        const { data: oldProds, error: fetchErr } = await supabaseClient.from('products').select('*').eq('business_id', businessId);
        if (fetchErr) throw fetchErr;

        if (oldProds && oldProds.length > 0) {
          const newProdsToInsert = oldProds.map(p => ({
            business_id: newBusinessId,
            category: p.category || 'General',
            name: p.name,
            description: p.description,
            price: p.price,
            image_url: p.image_url,
            available: p.available !== undefined ? p.available : true,
            is_featured: p.is_featured !== undefined ? p.is_featured : false
          }));
          
          const { error: prodError } = await supabaseClient.from('products').insert(newProdsToInsert);
          if (prodError) throw prodError;
        }
      } catch (errProd) {
        console.error('Failed to copy products:', errProd);
      }
    }

    showToast('✅ Sucursal creada con éxito');
    
    document.getElementById('branchName').value = '';
    document.getElementById('branchSlug').value = '';
    document.getElementById('branchEmail').value = '';
    document.getElementById('branchPassword').value = '';
    document.getElementById('createBranchModal')?.classList.add('hidden');
    
    loadBranches();
    
    // Si se actualizó la sucursal actual, actualizar UI global
    if (newBusinessId === businessId) {
      document.querySelector('header h1').textContent = '👨‍🍳 ' + name + (localStorage.getItem('staff_role') ? ` (${localStorage.getItem('staff_role')})` : ' (Admin)');
    }
  } catch (err) {
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteBranch(id) {
  if (!confirm('⚠️ ¿Estás seguro de que deseas ELIMINAR esta sucursal de forma permanente? Se perderán todos sus datos.')) return;
  
  const confirmText = prompt('Escribe "ELIMINAR" para confirmar la acción:');
  if (confirmText !== 'ELIMINAR') {
    showToast('❌ Eliminación cancelada');
    return;
  }

  try {
    const { error } = await supabaseClient.from('businesses').delete().eq('id', id);
    if (error) throw error;
    
    showToast('🗑️ Sucursal eliminada exitosamente');
    loadBranches();
  } catch (err) {
    showToast('❌ Error al eliminar la sucursal: ' + err.message, 'error');
  }
}

// ===== EDITAR SUCURSAL =====
function openEditBranchModal(branchId) {
  const branch = allBranches.find(b => b.id === branchId);
  if (!branch) return showToast('⚠️ Sucursal no encontrada', 'error');

  let modal = document.getElementById('editBranchModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editBranchModal';
    modal.className = 'fixed inset-0 bg-black/50 hidden items-center justify-center z-[100] backdrop-blur-sm p-4';
    modal.innerHTML = `
      <div class="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onclick="document.getElementById('editBranchModal').classList.add('hidden'); document.getElementById('editBranchModal').style.display='none'" class="absolute top-4 right-4 text-gray-400 hover:text-black">❌</button>
        <h3 class="text-xl font-black mb-4">✏️ Editar Sucursal</h3>
        <input type="hidden" id="editBranchId">
        <div class="space-y-3">
          <div>
            <label class="font-bold text-xs text-gray-500 uppercase">Nombre</label>
            <input type="text" id="editBranchName" class="input !mt-1" placeholder="Nombre de la sucursal">
          </div>
          <div class="p-3 bg-gray-50 rounded-xl">
            <p class="text-[10px] font-bold text-gray-400 uppercase">Slug (no editable)</p>
            <p id="editBranchSlugDisplay" class="text-sm font-mono text-gray-600 mt-1"></p>
          </div>
          <div>
            <label class="font-bold text-xs text-gray-500 uppercase">Email Admin</label>
            <input type="email" id="editBranchEmail" class="input !mt-1" placeholder="Email del administrador">
          </div>
          <div>
            <label class="font-bold text-xs text-gray-500 uppercase">Contraseña Admin</label>
            <input type="text" id="editBranchPassword" class="input !mt-1" placeholder="Contraseña">
          </div>
          <button class="btn btn-primary w-full mt-4" onclick="updateBranch()">💾 Guardar Cambios</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('editBranchId').value = branch.id;
  document.getElementById('editBranchName').value = branch.business_name || '';
  document.getElementById('editBranchSlugDisplay').textContent = '/' + (branch.slug || '');
  document.getElementById('editBranchEmail').value = branch.admin_email || '';
  document.getElementById('editBranchPassword').value = branch.admin_password || '';

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

async function updateBranch() {
  const id = document.getElementById('editBranchId').value;
  const name = document.getElementById('editBranchName').value.trim();
  const email = document.getElementById('editBranchEmail').value.trim();
  const password = document.getElementById('editBranchPassword').value;

  if (!name) return showToast('⚠️ El nombre es requerido', 'error');

  try {
    const updateData = { business_name: name };
    if (email) updateData.admin_email = email;
    if (password) updateData.admin_password = password;

    const { error } = await supabaseClient.from('businesses').update(updateData).eq('id', id);
    if (error) throw error;

    showToast('✅ Sucursal actualizada');
    document.getElementById('editBranchModal').classList.add('hidden');
    document.getElementById('editBranchModal').style.display = 'none';
    loadBranches();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

