import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BARRIOS = ['Palermo', 'Recoleta', 'Belgrano', 'Caballito', 'Nuñez', 'Villa Urquiza', 'Almagro', 'San Telmo', 'Puerto Madero', 'Colegiales']
const CALLES = ['Av. Santa Fe', 'Av. Corrientes', 'Av. Callao', 'Av. Cabildo', 'Av. Libertador', 'Thames', 'Gurruchaga', 'Honduras', 'El Salvador', 'Costa Rica', 'Defensa', 'Bolivar', 'Peru', 'Juncal', 'Arenales']
const ORIGENES = ['embudo', 'referido', 'historico'] as const
const PROPERTY_TYPES = ['departamento', 'casa', 'ph'] as const

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

const TEST_USERS = [
  { email: 'asesor@test.com', password: 'Test1234!', full_name: 'Maria Gonzalez', role: 'asesor' },
  { email: 'coordinador@test.com', password: 'Test1234!', full_name: 'Carlos Rodriguez', role: 'coordinador' },
  { email: 'abogado@test.com', password: 'Test1234!', full_name: 'Laura Martinez', role: 'abogado' },
]

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const results: Record<string, unknown> = {}

    // 1. Create test users
    const userIds: Record<string, string> = {}

    for (const u of TEST_USERS) {
      const { data: existing } = await supabase.auth.admin.listUsers()
      const found = existing?.users?.find(x => x.email === u.email)

      if (found) {
        userIds[u.role] = found.id
        // Ensure profile exists
        await supabase.from('profiles').upsert({
          id: found.id, email: u.email, full_name: u.full_name, role: u.role,
        }, { onConflict: 'id' })
      } else {
        const { data: created, error } = await supabase.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
        })
        if (error) {
          results[`user_${u.role}_error`] = error.message
          continue
        }
        userIds[u.role] = created.user.id
        await supabase.from('profiles').upsert({
          id: created.user.id, email: u.email, full_name: u.full_name, role: u.role,
        }, { onConflict: 'id' })
      }
    }

    results.users_created = Object.keys(userIds).length

    // 2. Create 10 random appraisals
    const assignableIds = Object.values(userIds)
    const appraisalIds: string[] = []

    for (let i = 0; i < 10; i++) {
      const barrio = pick(BARRIOS)
      const calle = pick(CALLES)
      const numero = rand(100, 5000)
      const piso = rand(1, 15)
      const price = rand(80000, 300000)
      const origin = pick(ORIGENES)
      const assignedTo = assignableIds.length > 0 ? pick(assignableIds) : null

      const { data, error } = await supabase.from('appraisals').insert({
        property_title: `${pick(PROPERTY_TYPES)} en ${barrio}`,
        property_location: `${calle} ${numero}, Piso ${piso}, ${barrio}, CABA`,
        property_price: price,
        property_currency: 'USD',
        property_features: {
          coveredArea: rand(30, 150),
          totalArea: rand(35, 180),
          rooms: rand(1, 5),
          bedrooms: rand(1, 4),
          bathrooms: rand(1, 3),
          garages: rand(0, 2),
          floor: piso,
          age: rand(0, 50),
        },
        valuation_result: {
          publicationPrice: price,
          saleValue: Math.round(price * 0.95),
          moneyInHand: Math.round(price * 0.88),
          currency: 'USD',
          comparableAnalysis: [],
        },
        publication_price: price,
        sale_value: Math.round(price * 0.95),
        money_in_hand: Math.round(price * 0.88),
        currency: 'USD',
        comparable_count: rand(3, 8),
        origin,
        assigned_to: assignedTo,
        created_at: new Date(Date.now() - rand(0, 30) * 86400000).toISOString(),
      }).select('id').single()

      if (data) appraisalIds.push(data.id)
      if (error) results[`appraisal_${i}_error`] = error.message
    }

    results.appraisals_created = appraisalIds.length

    // 3. Create 5 properties in different workflow states
    const STATUSES = ['draft', 'pending_docs', 'pending_photos', 'pending_review', 'approved'] as const

    for (let i = 0; i < 5; i++) {
      const barrio = pick(BARRIOS)
      const calle = pick(CALLES)
      const status = STATUSES[i]

      const { error } = await supabase.from('properties').insert({
        address: `${calle} ${rand(100, 5000)}, Piso ${rand(1, 12)}`,
        neighborhood: barrio,
        city: 'CABA',
        property_type: pick(PROPERTY_TYPES),
        rooms: rand(1, 5),
        bedrooms: rand(1, 4),
        bathrooms: rand(1, 3),
        garages: rand(0, 2),
        covered_area: rand(30, 150),
        total_area: rand(35, 180),
        asking_price: rand(80000, 350000),
        currency: 'USD',
        commission_percentage: 3,
        origin: pick(ORIGENES),
        status,
        assigned_to: assignableIds.length > 0 ? pick(assignableIds) : null,
        legal_status: status === 'approved' ? 'approved' : 'pending',
        created_at: new Date(Date.now() - rand(0, 15) * 86400000).toISOString(),
      })

      if (error) results[`property_${i}_error`] = error.message
    }

    results.properties_created = 5

    return NextResponse.json({
      success: true,
      ...results,
      test_credentials: TEST_USERS.map(u => ({ email: u.email, password: u.password, role: u.role })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
