// ===== PERSONAL Y TURNOS =====
let allStaff = [];

async function loadStaff() {
  if (!businessId) return;
  try {
    const { data, error } = await supabaseClient.from('staff').select('*').eq('business_id', businessId).order('name');
    if (error) throw error;
    allStaff = data || [];
    renderStaff();
    loadShifts();
  } catch (err) { showToast('Error: ' + err.message, 'error'); }
}

function renderStaff() {
  const container = document.getElementById('staffList');
  if (!container) return;
  if (!allStaff.length) { container.innerHTML = '<p class="text-gray-400 text-center py-8">No hay empleados registrados</p>'; return; }
  container.innerHTML = allStaff.map(s => `
    <div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 flex-wrap gap-3">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-xl font-black text-orange-600">${s.name.charAt(0)}</div>
        <div>
          <p class="font-bold">${s.name}</p>
          <p class="text-xs text-gray-500">${s.role} ${s.phone ? '• ' + s.phone : ''}</p>
          ${s.email ? `<p class="text-[10px] text-gray-400 font-mono mt-0.5">📧 ${s.email} | 🔑 ${s.password || '******'}</p>` : ''}
          ${s.schedule_in ? `<p class="text-[10px] text-blue-500 font-bold mt-0.5">⏰ ${s.schedule_in} - ${s.schedule_out || '?'} | ${s.work_days || 'Lun-Sáb'}</p>` : ''}
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="openEditStaffModal('${s.id}')" class="text-blue-500 p-2 text-sm active:scale-95 transition-all" title="Editar">✏️</button>
        <button onclick="deleteStaff('${s.id}')" class="text-red-500 p-2 text-sm active:scale-95 transition-all" title="Eliminar">🗑️</button>
      </div>
    </div>`).join('');

  // Populate the attendance dropdown
  const select = document.getElementById('shiftStaffSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Seleccionar Empleado --</option>' + 
      allStaff.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('');
  }

  // Populate Switch Role List
  const switchRoleList = document.getElementById('switchRoleList');
  if (switchRoleList) {
    // Keep the default Admin button, then append staff
    const adminButtonHtml = `
      <button onclick="switchStaffRole('Administrador', 'Administrador Principal')" class="w-full text-left bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 p-4 rounded-2xl transition-all flex items-center justify-between group">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-lg">👨‍🍳</div>
          <div>
            <div class="font-bold text-gray-800 group-hover:text-orange-700">Administrador Principal</div>
            <div class="text-[10px] uppercase tracking-widest text-gray-400 group-hover:text-orange-400 font-bold">Default</div>
          </div>
        </div>
        <span class="text-gray-300 group-hover:text-orange-500">›</span>
      </button>`;

    const staffButtonsHtml = allStaff.map(s => {
      let icon = '👤';
      if(s.role === 'Mesero') icon = '📝';
      else if(s.role === 'Cajero') icon = '💵';
      else if(s.role === 'Cocina') icon = '🍳';
      else if(s.role === 'Repartidor') icon = '🛵';
      else if(s.role === 'Kiosko') icon = '📱';

      return `
        <button onclick="switchStaffRole('${s.role}', '${s.name}')" class="w-full text-left bg-white hover:bg-blue-50 border border-gray-100 hover:border-blue-200 p-4 rounded-2xl transition-all flex items-center justify-between group mt-2">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-lg">${icon}</div>
            <div>
              <div class="font-bold text-gray-800 group-hover:text-blue-700">${s.name}</div>
              <div class="text-[10px] uppercase tracking-widest text-gray-400 group-hover:text-blue-400 font-bold">${s.role}</div>
            </div>
          </div>
          <span class="text-gray-300 group-hover:text-blue-500">›</span>
        </button>
      `;
    }).join('');

    switchRoleList.innerHTML = adminButtonHtml + staffButtonsHtml;
  }
}

async function addStaff(event) {
  const name = document.getElementById('staffName').value.trim();
  const role = document.getElementById('staffRole').value.trim() || 'Empleado';
  const phone = document.getElementById('staffPhone').value.trim();
  const email = document.getElementById('staffEmail').value.trim();
  const password = document.getElementById('staffPassword').value;
  const scheduleIn = document.getElementById('staffScheduleIn')?.value || '';
  const scheduleOut = document.getElementById('staffScheduleOut')?.value || '';
  const workDays = document.getElementById('staffWorkDays')?.value || 'Lun-Sáb';

  if (!name) return showToast('⚠️ Ingresa el nombre', 'error');
  if (!email || !password) return showToast('⚠️ Ingresa email y contraseña para el login del empleado', 'error');

  const btn = event.target;
  const originalText = btn.innerText;
  btn.innerText = '⏳ Agregando...';
  btn.disabled = true;


  try {
    // 1. Si es Repartidor, crear primero el registro en delivery_drivers
    let driverId = null;
    if (role === 'Repartidor') {
      const { data: driverData, error: driverError } = await supabaseClient
        .from('delivery_drivers')
        .insert([{ business_id: businessId, name, phone, is_available: true }])
        .select()
        .single();
      if (driverError) throw driverError;
      driverId = driverData.id;
    }

    // 2. Crear el usuario en Supabase Auth usando un cliente secundario no persistente
    const tempClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });

    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role,
          business_id: businessId
        }
      }
    });

    if (signUpError) {
      // Si el usuario ya existe en Auth, intentar reutilizar su ID
      if (signUpError.message && (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered') || signUpError.message.includes('User already registered'))) {
        // El email ya existe en Auth — verificar si ya tiene entrada en staff
        const { data: existingStaff } = await supabaseClient.from('staff').select('id').eq('email', email).eq('business_id', businessId).single();
        if (existingStaff) {
          if (driverId) {
            await supabaseClient.from('delivery_drivers').delete().eq('id', driverId);
          }
          throw new Error('Este empleado ya está registrado en esta sucursal con ese correo.');
        }
        // El usuario existe en Auth pero NO en staff de este negocio — intentar login para obtener el user_id
        const tempLoginClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
        const { data: loginData, error: loginError } = await tempLoginClient.auth.signInWithPassword({ email, password });
        if (loginError || !loginData.user) {
          if (driverId) {
            await supabaseClient.from('delivery_drivers').delete().eq('id', driverId);
          }
          throw new Error('El email ya está registrado pero la contraseña no coincide. Usa la contraseña original o un email diferente.');
        }
        signUpData = { user: loginData.user };
      } else {
        // Revertir creación de repartidor si falla Auth por otra razón
        if (driverId) {
          await supabaseClient.from('delivery_drivers').delete().eq('id', driverId);
        }
        throw signUpError;
      }
    }
    if (!signUpData.user) throw new Error('No se pudo crear el usuario en Supabase Auth.');

    const userId = signUpData.user.id;

    // 3. Guardar en la tabla staff
    const { error } = await supabaseClient.from('staff').insert([{
      business_id: businessId,
      name,
      role,
      phone,
      email,
      password,
      user_id: userId,
      driver_id: driverId,
      is_active: true,
      schedule_in: scheduleIn,
      schedule_out: scheduleOut,
      work_days: workDays
    }]);

    if (error) {
      // Revertir creación de repartidor si falla
      if (driverId) {
        await supabaseClient.from('delivery_drivers').delete().eq('id', driverId);
      }
      throw error;
    }

    showToast('✅ Empleado y cuenta de acceso creados con éxito');
    document.getElementById('staffName').value = '';
    document.getElementById('staffPhone').value = '';
    document.getElementById('staffEmail').value = '';
    document.getElementById('staffPassword').value = '';
    loadStaff();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function deleteStaff(id) {
  if (!confirm('¿Eliminar este empleado?')) return;
  try {
    const { data: staffMember } = await supabaseClient.from('staff').select('driver_id').eq('id', id).single();
    if (staffMember && staffMember.driver_id) {
      await supabaseClient.from('delivery_drivers').delete().eq('id', staffMember.driver_id);
    }
    await supabaseClient.from('staff').delete().eq('id', id);
    showToast('🗑️ Eliminado');
    loadStaff();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

// ===== EDITAR EMPLEADO =====
function openEditStaffModal(staffId) {
  const staff = allStaff.find(s => s.id === staffId);
  if (!staff) return showToast('⚠️ Empleado no encontrado', 'error');

  // Crear modal si no existe
  let modal = document.getElementById('editStaffModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editStaffModal';
    modal.className = 'fixed inset-0 bg-black/50 hidden items-center justify-center z-[100] backdrop-blur-sm p-4';
    modal.innerHTML = `
      <div class="bg-white p-5 rounded-2xl w-full max-w-sm shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onclick="closeEditStaffModal()" class="absolute top-3 right-3 text-gray-400 hover:text-black text-lg p-1">❌</button>
        <h3 class="text-lg font-black mb-3">✏️ Editar Empleado</h3>
        <input type="hidden" id="editStaffId">
        
        <div class="space-y-2">
          <div>
            <label class="font-bold text-[10px] text-gray-500 uppercase">Nombre</label>
            <input type="text" id="editStaffName" class="input !mt-0 !py-1.5 !text-sm" placeholder="Nombre completo">
          </div>
          
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="font-bold text-[10px] text-gray-500 uppercase">Rol</label>
              <select id="editStaffRole" class="input !mt-0 !py-1.5 !text-sm">
                <option value="Administrador">Administrador</option>
                <option value="Cajero">Cajero</option>
                <option value="Mesero">Mesero</option>
                <option value="Repartidor">Repartidor</option>
                <option value="Cocina">Cocina (KDS)</option>
                <option value="Kiosko">Kiosko</option>
              </select>
            </div>
            <div>
              <label class="font-bold text-[10px] text-gray-500 uppercase">Teléfono</label>
              <input type="tel" id="editStaffPhone" class="input !mt-0 !py-1.5 !text-sm" placeholder="Teléfono">
            </div>
          </div>
          
          <div class="px-3 py-2 bg-gray-50 rounded-xl">
            <p class="text-[9px] font-bold text-gray-400 uppercase">Email (no editable)</p>
            <p id="editStaffEmailDisplay" class="text-xs font-mono text-gray-600 truncate"></p>
          </div>
          
          <div class="p-3 bg-blue-50 rounded-xl space-y-2">
            <h3 class="text-xs font-black text-blue-700">⏰ Horario de Trabajo</h3>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[9px] font-bold text-gray-500 uppercase">Entrada</label>
                <input type="time" id="editStaffScheduleIn" class="input !mt-0 !py-1 !text-xs">
              </div>
              <div>
                <label class="text-[9px] font-bold text-gray-500 uppercase">Salida</label>
                <input type="time" id="editStaffScheduleOut" class="input !mt-0 !py-1 !text-xs">
              </div>
            </div>
            <div>
              <label class="text-[9px] font-bold text-gray-500 uppercase">Días Laborales</label>
              <input type="text" id="editStaffWorkDays" class="input !mt-0 !py-1 !text-xs" placeholder="Ej: Lun-Sáb">
            </div>
          </div>
          
          <button class="btn btn-primary w-full mt-2 !py-2 !text-sm" onclick="updateStaff()">💾 Guardar Cambios</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Llenar campos con datos actuales
  document.getElementById('editStaffId').value = staff.id;
  document.getElementById('editStaffName').value = staff.name || '';
  document.getElementById('editStaffRole').value = staff.role || 'Empleado';
  document.getElementById('editStaffPhone').value = staff.phone || '';
  document.getElementById('editStaffEmailDisplay').textContent = staff.email || 'Sin email';
  document.getElementById('editStaffScheduleIn').value = staff.schedule_in || '08:00';
  document.getElementById('editStaffScheduleOut').value = staff.schedule_out || '17:00';
  document.getElementById('editStaffWorkDays').value = staff.work_days || 'Lun-Sáb';

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeEditStaffModal() {
  const modal = document.getElementById('editStaffModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function updateStaff() {
  const id = document.getElementById('editStaffId').value;
  const name = document.getElementById('editStaffName').value.trim();
  const role = document.getElementById('editStaffRole').value;
  const phone = document.getElementById('editStaffPhone').value.trim();
  const scheduleIn = document.getElementById('editStaffScheduleIn').value;
  const scheduleOut = document.getElementById('editStaffScheduleOut').value;
  const workDays = document.getElementById('editStaffWorkDays').value.trim();

  if (!name) return showToast('⚠️ El nombre es requerido', 'error');

  try {
    const { error } = await supabaseClient.from('staff').update({
      name,
      role,
      phone,
      schedule_in: scheduleIn,
      schedule_out: scheduleOut,
      work_days: workDays
    }).eq('id', id);

    if (error) throw error;

    showToast('✅ Empleado actualizado');
    document.getElementById('editStaffModal').classList.add('hidden');
    document.getElementById('editStaffModal').style.display = 'none';
    loadStaff();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

async function clockIn(staffId) {
  try {
    const { error } = await supabaseClient.from('shifts').insert([{ business_id: businessId, staff_id: staffId, clock_in: new Date().toISOString(), date: new Date().toISOString().split('T')[0] }]);
    if (error) throw error;
    showToast('✅ Entrada registrada'); loadShifts();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

async function clockOut(staffId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabaseClient.from('shifts').select('*').eq('staff_id', staffId).eq('date', today).is('clock_out', null).order('clock_in', { ascending: false }).limit(1);
    if (!data?.length) return showToast('⚠️ No hay entrada activa hoy para este empleado', 'error');
    const shift = data[0];
    const clockOutTime = new Date();
    const hours = ((clockOutTime - new Date(shift.clock_in)) / 3600000).toFixed(2);
    const { error } = await supabaseClient.from('shifts').update({ clock_out: clockOutTime.toISOString(), total_hours: parseFloat(hours) }).eq('id', shift.id);
    if (error) throw error;
    showToast('✅ Salida registrada: ' + hours + 'h'); loadShifts();
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
}

// Manual attendance from dropdown
function registerEntry() {
  const staffId = document.getElementById('shiftStaffSelect')?.value;
  if (!staffId) return showToast('⚠️ Selecciona un empleado primero', 'error');
  clockIn(staffId);
}

function registerExit() {
  const staffId = document.getElementById('shiftStaffSelect')?.value;
  if (!staffId) return showToast('⚠️ Selecciona un empleado primero', 'error');
  clockOut(staffId);
}

async function loadShifts() {
  try {
    const { data } = await supabaseClient.from('shifts').select('*, staff(name, role)').eq('business_id', businessId).order('date', { ascending: false }).limit(30);
    const tbody = document.getElementById('shiftsList');
    if (!tbody) return;
    if (!data?.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400">Sin turnos registrados</td></tr>'; return; }
    tbody.innerHTML = data.map(s => `<tr>
      <td class="font-bold text-sm">${s.staff?.name || 'N/A'}</td>
      <td class="text-xs text-gray-500">${s.staff?.role || '-'}</td>
      <td class="text-sm">${new Date(s.date).toLocaleDateString()}</td>
      <td class="text-sm">${s.clock_in ? new Date(s.clock_in).toLocaleTimeString() : '-'}</td>
      <td class="text-sm">${s.clock_out ? new Date(s.clock_out).toLocaleTimeString() : '<span class="text-orange-500 font-bold">⏳ Activo</span>'}</td>
      <td class="font-bold ${s.clock_out ? 'text-green-600' : 'text-orange-600'}">${s.total_hours ? s.total_hours + 'h' : '-'}</td>
    </tr>`).join('');
  } catch (err) { console.error(err); }
}
