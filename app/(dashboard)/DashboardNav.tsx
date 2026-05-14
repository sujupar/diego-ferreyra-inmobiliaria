'use client'

import { useEffect, useState } from 'react'
import { NavDropdown, NavLink, MobileNav } from '@/components/nav/NavDropdown'

interface NavSection {
  label: string
  href?: string
  items?: Array<{ href: string; label: string }>
}

export function DashboardNav({ sections }: { sections: NavSection[] }) {
  const hasInbox = sections.some(s => s.href === '/inbox')
  const [inboxCount, setInboxCount] = useState<number>(0)

  useEffect(() => {
    if (!hasInbox) return
    let active = true
    async function load() {
      try {
        const res = await fetch('/api/leads/count')
        if (!res.ok) return
        const { new: count } = await res.json()
        if (active) setInboxCount(count ?? 0)
      } catch {
        // best-effort
      }
    }
    load()
    const handle = setInterval(load, 60_000)
    return () => {
      active = false
      clearInterval(handle)
    }
  }, [hasInbox])

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden lg:flex gap-5 items-center">
        {sections.map(section =>
          section.href ? (
            <NavLink
              key={section.href}
              href={section.href}
              label={section.label}
              badge={section.href === '/inbox' ? inboxCount : undefined}
            />
          ) : section.items ? (
            <NavDropdown key={section.label} label={section.label} items={section.items} />
          ) : null,
        )}
      </nav>

      {/* Mobile nav */}
      <MobileNav sections={sections} />
    </>
  )
}
