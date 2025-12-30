'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ScrapedProperty } from '@/lib/scraper/types'

const formSchema = z.object({
    url: z.string().url({ message: 'Por favor ingresa una URL válida.' }),
})

interface PropertyFormProps {
    onPropertyLoaded: (data: ScrapedProperty) => void
}

export function PropertyForm({ onPropertyLoaded }: PropertyFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            url: '',
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: values.url }),
            })

            if (!response.ok) {
                throw new Error('Error al obtener datos de la propiedad')
            }

            const scrapedData = await response.json()
            onPropertyLoaded(scrapedData)
        } catch (err) {
            setError('Error cargando la propiedad. Verifique la URL e intente de nuevo.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="w-full max-w-2xl mx-auto">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="relative group">
                        <div className="relative flex gap-2 bg-background p-1 rounded-full border shadow-sm hover:shadow-md transition-shadow duration-300">
                            <div className="pl-4 flex items-center justify-center text-muted-foreground">
                                <Search className="h-5 w-5" />
                            </div>
                            <FormField
                                control={form.control}
                                name="url"
                                render={({ field }) => (
                                    <FormItem className="flex-1 space-y-0">
                                        <FormControl>
                                            <Input
                                                className="h-12 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground/60 shadow-none px-2"
                                                placeholder="Pega la URL de Zonaprop, Argenprop, o MercadoLibre..."
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="absolute -bottom-6 left-4" />
                                    </FormItem>
                                )}
                            />
                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="h-12 px-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200"
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    "Analizar"
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            </Form>

            {error && (
                <div className="mt-4 p-4 text-sm text-destructive bg-destructive/5 rounded-lg border border-destructive/10 flex items-center animate-in fade-in slide-in-from-top-2">
                    <span className="mr-2">⚠️</span>
                    {error}
                </div>
            )}
        </div>
    )
}
