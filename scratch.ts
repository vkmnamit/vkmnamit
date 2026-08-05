import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: classes } = await supabaseAdmin.from('classes').select('id, name, grade, school_id').limit(10);
  console.log("Classes:", classes);
  if (classes && classes.length > 0) {
    const { data: sections } = await supabaseAdmin.from('sections').select('id, name, class_id').eq('class_id', classes[0].id);
    console.log("Sections for first class:", sections);
  }
}
run();
