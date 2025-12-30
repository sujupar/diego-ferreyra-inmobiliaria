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
                    property_url: string
                    calculated_value: number | null
                    status: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    property_url: string
                    calculated_value?: number | null
                    status?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    property_url?: string
                    calculated_value?: number | null
                    status?: string
                    created_at?: string
                }
            }
            comparables: {
                Row: {
                    id: string
                    appraisal_id: string
                    url: string
                    price: number | null
                    features: Json | null
                }
                Insert: {
                    id?: string
                    appraisal_id: string
                    url: string
                    price?: number | null
                    features?: Json | null
                }
                Update: {
                    id?: string
                    appraisal_id?: string
                    url?: string
                    price?: number | null
                    features?: Json | null
                }
            }
            property_images: {
                Row: {
                    id: string
                    appraisal_id: string
                    url: string
                    ai_condition_score: number | null
                }
                Insert: {
                    id?: string
                    appraisal_id: string
                    url: string
                    ai_condition_score?: number | null
                }
                Update: {
                    id?: string
                    appraisal_id?: string
                    url?: string
                    ai_condition_score?: number | null
                }
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
