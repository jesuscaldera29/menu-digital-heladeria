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
        ${b.id === businessId ? `<span class="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Sucursal Actual</span>` : ''}
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
  // If the owner wants to switch to view another branch's data, we reload the page with a parameter or just change localStorage
  // Since we rely on getCurrentBusiness(), we can temporarily set a staff-like override for the owner.
  // Actually, modifying localStorage to override is easiest.
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
      // Rollback business creation
      await supabaseClient.from('businesses').delete().eq('id', newBusinessId);
      throw signUpError;
    }

    if (!signUpData.user) throw new Error('No se pudo crear el usuario en Supabase Auth.');
    const newStaffUserId = signUpData.user.id;

    // 4. Save to staff table
    const { error: staffError } = await supabaseClient.from('staff').insert([{
      business_id: newBusinessId,
      name: name + ' Admin',
      role: 'Administrador',
      phone: '',
      email: email,
      password: password,
      user_id: newStaffUserId,
      is_active: true
    }]);

    if (staffError) throw staffError;

    showToast('✅ Sucursal creada con éxito');
    
    document.getElementById('branchName').value = '';
    document.getElementById('branchSlug').value = '';
    document.getElementById('branchEmail').value = '';
    document.getElementById('branchPassword').value = '';
    
    loadBranches();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}
