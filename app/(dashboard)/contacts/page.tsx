'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, User, Phone, Mail, Calendar, ChevronRight, Search } from 'lucide-react'

interface Contact {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  origin: string | null
  created_at: string
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico' }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('')

  useEffect(() => {
    const url = filterOrigin ? `/api/contacts?origin=${filterOrigin}` : '/api/contacts'
    setLoading(true)
    fetch(url)
      .then(r => r.json())
      .then(({ data }) => setContacts(data || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [filterOrigin])

  const filtered = search
    ? contacts.filter(c => c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
    : contacts

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground">{contacts.length} contacto{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/pipeline/new">
          <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo Contacto</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, email o telefono..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant={filterOrigin === '' ? 'default' : 'outline'} size="sm" onClick={() => setFilterOrigin('')}>Todos</Button>
          {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
            <Button key={key} variant={filterOrigin === key ? 'default' : 'outline'} size="sm" onClick={() => setFilterOrigin(key)}>{label}</Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin contactos</h3>
            <p className="text-sm text-muted-foreground">Los contactos se crean al agendar tasaciones.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Link key={c.id} href={`/contacts/${c.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.full_name}</span>
                      {c.origin && <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[c.origin] || c.origin}</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(c.created_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
