/**
 * Script to create the first admin user.
 * Run with: npx tsx scripts/create-admin.ts
 *
 * Prerequisites:
 * - Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * - Run the migration 20260410000000_auth_profiles_invitations.sql first
 *
 * Usage:
 * npx tsx scripts/create-admin.ts <email> <password> <full_name>
 *
 * Example:
 * npx tsx scripts/create-admin.ts admin@diegofeinmobiliaria.com mypassword123 "Admin"
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
}

const [email, password, fullName] = process.argv.slice(2)

if (!email || !password || !fullName) {
    console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> <full_name>')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
    console.log(`Creating admin user: ${email}`)

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
    })

    if (authError) {
        console.error('Auth error:', authError.message)
        process.exit(1)
    }

    console.log(`Auth user created: ${authData.user.id}`)

    // Create profile
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            id: authData.user.id,
            email,
            full_name: fullName,
            role: 'admin',
        })

    if (profileError) {
        console.error('Profile error:', profileError.message)
        process.exit(1)
    }

    console.log('Admin profile created successfully!')

    // Also assign existing appraisals to this admin
    const { data: appraisals } = await supabase
        .from('appraisals')
        .select('id')
        .is('user_id', null)

    if (appraisals && appraisals.length > 0) {
        const { error: updateError } = await supabase
            .from('appraisals')
            .update({ user_id: authData.user.id })
            .is('user_id', null)

        if (updateError) {
            console.error('Warning: Could not assign existing appraisals:', updateError.message)
        } else {
            console.log(`Assigned ${appraisals.length} existing appraisals to admin user`)
        }
    }

    console.log('\nDone! You can now log in at /login')
}

main().catch(console.error)
