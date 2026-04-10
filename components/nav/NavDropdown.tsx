'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

interface NavLink {
  href: string
  label: string
}

interface NavDropdownProps {
  label: string
  items: NavLink[]
}

export function NavDropdown({ label, items }: NavDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const isActive = items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[180px] rounded-md border bg-popover shadow-md z-50 py-1">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-sm transition-colors ${pathname === item.href ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function NavLink({ href, label }: NavLink) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={`text-sm font-medium transition-colors whitespace-nowrap ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
    >
      {label}
    </Link>
  )
}

interface MobileNavProps {
  sections: Array<{ label: string; items?: NavLink[]; href?: string }>
}

export function MobileNav({ sections }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(!open)} className="p-2 rounded-md hover:bg-accent" aria-label="Menu">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 bg-background border-b shadow-lg z-50 max-h-[70vh] overflow-y-auto">
          <nav className="p-4 space-y-1">
            {sections.map(section => (
              <div key={section.label}>
                {section.href ? (
                  <Link href={section.href} onClick={() => setOpen(false)}
                    className={`block px-3 py-2.5 rounded-md text-sm font-medium ${pathname === section.href ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                    {section.label}
                  </Link>
                ) : (
                  <>
                    <p className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground tracking-wider">{section.label}</p>
                    {section.items?.map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                        className={`block px-6 py-2.5 rounded-md text-sm ${pathname === item.href ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent'}`}>
                        {item.label}
                      </Link>
                    ))}
                  </>
                )}
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
