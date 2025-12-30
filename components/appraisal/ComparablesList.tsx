'use client'

import { useState } from 'react'
import { Trash2, Home, MapPin, ExternalLink, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ScrapedProperty } from '@/lib/scraper/types'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface ComparablesListProps {
    comparables: ScrapedProperty[]
    onAddComparable: (property: ScrapedProperty) => void
    onRemoveComparable: (index: number) => void
}

export function ComparablesList({ comparables, onAddComparable, onRemoveComparable }: ComparablesListProps) {
    const [url, setUrl] = useState('')
    // ... (rest of the component)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleAdd() {
        if (!url) return
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            })

            if (!response.ok) throw new Error('Failed to fetch')

            const data = await response.json()
            onAddComparable(data)
            setUrl('')
        } catch (err) {
            setError('Error al cargar la propiedad comparable.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-secondary/30 p-2 rounded-full border shadow-sm flex items-center gap-2 pr-2.5">
                <Input
                    className="h-10 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground shadow-none pl-4"
                    placeholder="Pega la URL de una propiedad comparable..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                <Button
                    onClick={handleAdd}
                    disabled={isLoading || !url}
                    size="sm"
                    className="rounded-full px-6 h-9 shadow-sm"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Agregar"}
                </Button>
            </div>
            {error && <p className="text-sm text-destructive mt-2 ml-4">{error}</p>}

            {comparables.length === 0 ? (
                <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed flex flex-col items-center justify-center">
                    <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center mb-4">
                        <Home className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium">No hay comparables agregados</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                        Agrega propiedades similares para comenzar el proceso de valoración precisa.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {comparables.map((comp, idx) => (
                        <Card key={idx} className="group overflow-hidden hover:shadow-xl transition-all duration-500 border-border/60 bg-card">
                            <div className="relative aspect-[4/3] bg-secondary overflow-hidden">
                                {comp.images && comp.images.length > 0 ? (
                                    <img
                                        src={comp.images[0]}
                                        alt={comp.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        <Home className="h-8 w-8" />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="h-8 w-8 shadow-sm rounded-full"
                                        onClick={() => onRemoveComparable(idx)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
                                    <div className="text-xl font-bold tracking-tight">
                                        {comp.currency} {comp.price?.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            <CardContent className="p-5 space-y-3">
                                <h4 className="font-medium text-sm line-clamp-2 leading-snug min-h-[2.5rem]" title={comp.title}>
                                    {comp.title}
                                </h4>

                                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    <span className="line-clamp-1">{comp.location}</span>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                    {comp.features.totalArea && (
                                        <Badge variant="secondary" className="font-normal bg-secondary/50 hover:bg-secondary/70">
                                            {comp.features.totalArea} m²
                                        </Badge>
                                    )}
                                    {comp.features.coveredArea && (
                                        <Badge variant="secondary" className="font-normal bg-secondary/50 hover:bg-secondary/70">
                                            {comp.features.coveredArea} m² cub
                                        </Badge>
                                    )}
                                </div>

                                <Separator className="my-2" />

                                <a
                                    href={comp.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    Ver Publicación <ExternalLink className="ml-1 h-3 w-3" />
                                </a>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}


