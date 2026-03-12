export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            appraisals: {
                Row: {
                    id: string
                    property_title: string | null
                    property_location: string
                    property_description: string | null
                    property_url: string | null
                    property_price: number | null
                    property_currency: string | null
                    property_images: string[] | null
                    property_features: Json
                    valuation_result: Json
                    publication_price: number
                    sale_value: number | null
                    money_in_hand: number | null
                    currency: string | null
                    comparable_count: number
                    created_at: string
                    updated_at: string
                    notes: string | null
                }
                Insert: {
                    id?: string
                    property_title?: string | null
                    property_location: string
                    property_description?: string | null
                    property_url?: string | null
                    property_price?: number | null
                    property_currency?: string | null
                    property_images?: string[] | null
                    property_features: Json
                    valuation_result: Json
                    publication_price: number
                    sale_value?: number | null
                    money_in_hand?: number | null
                    currency?: string | null
                    comparable_count?: number
                    created_at?: string
                    updated_at?: string
                    notes?: string | null
                }
                Update: {
                    id?: string
                    property_title?: string | null
                    property_location?: string
                    property_description?: string | null
                    property_url?: string | null
                    property_price?: number | null
                    property_currency?: string | null
                    property_images?: string[] | null
                    property_features?: Json
                    valuation_result?: Json
                    publication_price?: number
                    sale_value?: number | null
                    money_in_hand?: number | null
                    currency?: string | null
                    comparable_count?: number
                    created_at?: string
                    updated_at?: string
                    notes?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "appraisal_comparables_appraisal_id_fkey"
                        columns: ["id"]
                        isOneToOne: false
                        referencedRelation: "appraisal_comparables"
                        referencedColumns: ["appraisal_id"]
                    }
                ]
            }
            market_image_settings: {
                Row: {
                    id: string
                    label: string
                    description: string | null
                    updated_at: string
                }
                Insert: {
                    id: string
                    label: string
                    description?: string | null
                    updated_at?: string
                }
                Update: {
                    id?: string
                    label?: string
                    description?: string | null
                    updated_at?: string
                }
                Relationships: []
            }
            appraisal_comparables: {
                Row: {
                    id: string
                    appraisal_id: string
                    title: string | null
                    location: string | null
                    url: string | null
                    price: number | null
                    currency: string | null
                    description: string | null
                    images: string[] | null
                    features: Json
                    analysis: Json | null
                    sort_order: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    appraisal_id: string
                    title?: string | null
                    location?: string | null
                    url?: string | null
                    price?: number | null
                    currency?: string | null
                    description?: string | null
                    images?: string[] | null
                    features: Json
                    analysis?: Json | null
                    sort_order?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    appraisal_id?: string
                    title?: string | null
                    location?: string | null
                    url?: string | null
                    price?: number | null
                    currency?: string | null
                    description?: string | null
                    images?: string[] | null
                    features?: Json
                    analysis?: Json | null
                    sort_order?: number
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "appraisal_comparables_appraisal_id_fkey"
                        columns: ["appraisal_id"]
                        isOneToOne: false
                        referencedRelation: "appraisals"
                        referencedColumns: ["id"]
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}
