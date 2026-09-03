const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://ngegwyvmxtmcfcazsnoe.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_t2_BCAgEZkAS7oWzgWvtQA_RnngA7wm';

const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection
async function testConnection() {
  try {
    const { data, error } = await supabase.from('users').select('count');
    if (error) {
      console.log('⚠️  Supabase connection test:', error.message);
      return false;
    }
    console.log('✅ Supabase connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
    return false;
  }
}

module.exports = { supabase, testConnection };
