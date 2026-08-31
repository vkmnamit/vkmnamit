import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_PUBLIC_ANON_KEY

const supabase = createClient(supabaseUrl!, supabaseKey!)

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase URL or Key is missing. Please check your environment variables.')
    process.exit(1)
}




/*
const { data: { user }, error } = await supabase.auth.getUser()

if (error) {
    console.error('Error fetching user:', error.message)
} else {
    console.log('User fetched successfully:', user?.id)
}
*/

export default supabase
