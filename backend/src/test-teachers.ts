import { supabaseAdmin } from './config/supabase';
async function test() {
  const { data } = await supabaseAdmin.from('teachers').select('id, user:users(id, first_name)').limit(1);
  console.log(JSON.stringify(data, null, 2));
}
test();
