import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabaseAdmin = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function run() {
  const { data } = await supabaseAdmin.rpc('get_schema_columns', { p_table_name: 'users' });
  console.log(data);
}
run();
