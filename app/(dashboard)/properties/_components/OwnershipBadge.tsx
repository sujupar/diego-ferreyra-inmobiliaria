'use client'

import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'

export function OwnershipBadge({ isMine }: { isMine: boolean }) {
  if (!isMine) return null
  return (
    <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
      <Star className="size-3 fill-current" />
      Mía
    </Badge>
  )
}
