import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const supabaseAdmin = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
async function run() {
  const { error } = await supabaseAdmin.rpc('exec_sql', { sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password TEXT;' });
  console.log("Error:", error);
}
run();
