// ============================================================
// CONFIGURACIÓN DE SUPABASE - MULTI-TENANT
// ============================================================

const SUPABASE_URL = 'https://vtckqdbfqcqjtznrsdwx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TkT53yhICY185uhB4Z8IrQ_6nbw4Qc3';

// ✅ Inicializar cliente Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// HELPERS MULTI-TENANT
// ============================================================

/**
 * Extrae el slug del pathname de la URL actual.
 * Ej: "/tronco-e-filo" → "tronco-e-filo"
 * Ej: "/" → null
 * Ej: "/admin.html" → null
 */
function getSlugFromUrl() {
  const path = window.location.pathname;
  // Ignorar rutas de archivos estáticos y páginas del sistema
  const systemPaths = ['/', '/index.html', '/admin.html', '/login.html', '/register.html', '/order-status.html'];
  if (systemPaths.includes(path)) return null;

  // Ignorar rutas con extensión de archivo
  if (path.includes('.')) return null;

  // Limpiar el slash inicial
  const slug = path.replace(/^\//, '').replace(/\/$/, '');
  return slug || null;
}

/**
 * Busca un negocio por su slug.
 * @param {string} slug
 * @returns {Promise<Object|null>} business data or null
 */
async function getBusinessBySlug(slug) {
  if (!slug) return null;
  try {
    const { data, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) return null;
    return data;
  } catch (err) {
    console.error('Error fetching business:', err);
    return null;
  }
}

/**
 * Obtiene el negocio del usuario autenticado actual.
 * @returns {Promise<Object|null>} business data or null
 */
async function getCurrentBusiness() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;

    // 1. Try to find if user is owner of businesses
    const { data: ownerBizList, error } = await supabaseClient
      .from('businesses')
      .select('*')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: true });

    if (ownerBizList && ownerBizList.length > 0) {
      const overrideId = localStorage.getItem('override_business_id');
      if (overrideId) {
        const found = ownerBizList.find(b => b.id === overrideId);
        if (found) return found;
      }
      return ownerBizList[0];
    }

    // 2. Try to find if user is a staff member of a business
    const { data: staffMember } = await supabaseClient
      .from('staff')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (staffMember) {
      const { data: staffBiz } = await supabaseClient
        .from('businesses')
        .select('*')
        .eq('id', staffMember.business_id)
        .single();
      return staffBiz;
    }

    return null;
  } catch (err) {
    console.error('Error fetching current business:', err);
    return null;
  }
}

/**
 * Obtiene la sesión actual de autenticación.
 * @returns {Promise<Object|null>} session or null
 */
async function getCurrentSession() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
  } catch (err) {
    return null;
  }
}