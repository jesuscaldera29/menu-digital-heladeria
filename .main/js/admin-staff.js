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
        <button onclick="deleteStaff('${s.id}')" class="text-red-500 p-2 text-sm active:scale-95 transition-all">🗑️</button>
      </div>
    </div>`).join('');

  // Populate the attendance dropdown
  const select = document.getElementById('shiftStaffSelect');
  if (select) {
    select.innerHTML = '<option value="">-- Seleccionar Empleado --</option>' + 
      allStaff.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('');
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
      // Revertir creación de repartidor si falla Auth
      if (driverId) {
        await supabaseClient.from('delivery_drivers').delete().eq('id', driverId);
      }
      throw signUpError;
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
