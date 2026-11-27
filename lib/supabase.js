const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

function createConfiguredClient(key) {
  if (!process.env.SUPABASE_URL?.trim() || !key?.trim()) return null;
  try {
    return createClient(process.env.SUPABASE_URL, key);
  } catch {
    console.error('[supabase] invalid client configuration');
    return null;
  }
}

const supabase = createConfiguredClient(process.env.SUPABASE_SERVICE_KEY);
module.exports = { supabase };
