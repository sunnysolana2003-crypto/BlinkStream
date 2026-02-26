const { createClient } = require("@supabase/supabase-js");

let supabase = null;
let supabaseAdmin = null;
let authClient = null;

if (process.env.SUPABASE_URL) {
  if (process.env.SUPABASE_ANON_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
}

authClient = supabase || supabaseAdmin;

module.exports = { supabase, supabaseAdmin, authClient };
