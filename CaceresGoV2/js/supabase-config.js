// Datos necesarios para conectar la pagina con Supabase.
// La clave anon se puede usar en la pagina, pero la service_role no.
const SUPABASE_URL = "PEGA_AQUI_LA_URL_DE_TU_PROYECTO";
const SUPABASE_ANON_KEY = "PEGA_AQUI_LA_CLAVE_ANON";

const supabaseClient = SUPABASE_URL.startsWith("https://")
    && SUPABASE_ANON_KEY.length > 20
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
