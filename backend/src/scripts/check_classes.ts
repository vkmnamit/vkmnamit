import { supabaseAdmin } from '../config/supabase';

async function run() {
  const { data, error } = await supabaseAdmin.from('classes').select('*').limit(1);
  console.log(data, error);
}
run();
