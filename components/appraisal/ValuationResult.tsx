'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ValuationResultProps {
    valuation: number
    currency: string
}

export function ValuationResult({ valuation, currency }: ValuationResultProps) {
    return (
        <Card className="bg-primary/10 border-primary">
            <CardHeader>
                <CardTitle>Estimated Value</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-4xl font-bold text-primary">
                    {currency} {valuation.toLocaleString()}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                    Based on comparable market analysis.
                </p>
            </CardContent>
        </Card>
    )
}
