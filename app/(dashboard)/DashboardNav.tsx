'use client'

import { NavDropdown, NavLink, MobileNav } from '@/components/nav/NavDropdown'

interface NavSection {
  label: string
  href?: string
  items?: Array<{ href: string; label: string }>
}

export function DashboardNav({ sections }: { sections: NavSection[] }) {
  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden lg:flex gap-5 items-center">
        {sections.map(section =>
          section.href ? (
            <NavLink key={section.href} href={section.href} label={section.label} />
          ) : section.items ? (
            <NavDropdown key={section.label} label={section.label} items={section.items} />
          ) : null
        )}
      </nav>

      {/* Mobile nav */}
      <MobileNav sections={sections} />
    </>
  )
}
