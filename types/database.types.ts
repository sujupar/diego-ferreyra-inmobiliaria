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
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string
                    role: string
                    phone: string | null
                    avatar_url: string | null
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name: string
                    role: string
                    phone?: string | null
                    avatar_url?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string
                    role?: string
                    phone?: string | null
                    avatar_url?: string | null
                    is_active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            invitations: {
                Row: {
                    id: string
                    email: string
                    role: string
                    invited_by: string | null
                    token: string
                    accepted_at: string | null
                    expires_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    email: string
                    role: string
                    invited_by?: string | null
                    token?: string
                    accepted_at?: string | null
                    expires_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    role?: string
                    invited_by?: string | null
                    token?: string
                    accepted_at?: string | null
                    expires_at?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "invitations_invited_by_fkey"
                        columns: ["invited_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    }
                ]
            }
            appraisals: {
                Row: {
                    id: string
                    user_id: string | null
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
                    origin: string | null
                    assigned_to: string | null
                    report_edits: Json | null
                }
                Insert: {
                    id?: string
                    user_id?: string | null
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
                    origin?: string | null
                    assigned_to?: string | null
                    report_edits?: Json | null
                }
                Update: {
                    id?: string
                    user_id?: string | null
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
                    origin?: string | null
                    assigned_to?: string | null
                    report_edits?: Json | null
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
            scheduled_appraisals: {
                Row: {
                    id: string
                    contact_name: string
                    contact_phone: string | null
                    contact_email: string | null
                    contact_id: string | null
                    property_address: string
                    scheduled_date: string
                    scheduled_time: string | null
                    origin: string | null
                    assigned_to: string | null
                    status: string
                    appraisal_id: string | null
                    notes: string | null
                    scheduling_notes: string | null
                    buyer_interest: Json | null
                    created_by: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    contact_name: string
                    contact_phone?: string | null
                    contact_email?: string | null
                    contact_id?: string | null
                    property_address: string
                    scheduled_date: string
                    scheduled_time?: string | null
                    origin?: string | null
                    assigned_to?: string | null
                    status?: string
                    appraisal_id?: string | null
                    notes?: string | null
                    scheduling_notes?: string | null
                    buyer_interest?: Json | null
                    created_by?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    contact_name?: string
                    contact_phone?: string | null
                    contact_email?: string | null
                    contact_id?: string | null
                    property_address?: string
                    scheduled_date?: string
                    scheduled_time?: string | null
                    origin?: string | null
                    assigned_to?: string | null
                    status?: string
                    appraisal_id?: string | null
                    notes?: string | null
                    scheduling_notes?: string | null
                    buyer_interest?: Json | null
                    created_by?: string | null
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "scheduled_appraisals_contact_id_fkey"
                        columns: ["contact_id"]
                        isOneToOne: false
                        referencedRelation: "contacts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "scheduled_appraisals_assigned_to_fkey"
                        columns: ["assigned_to"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "scheduled_appraisals_appraisal_id_fkey"
                        columns: ["appraisal_id"]
                        isOneToOne: false
                        referencedRelation: "appraisals"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "scheduled_appraisals_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
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
            meta_ads_daily: {
                Row: {
                    id: string
                    date: string
                    campaign_id: string
                    campaign_name: string | null
                    impressions: number
                    clicks: number
                    ctr: number
                    spend: number
                    leads: number
                    cost_per_lead: number | null
                    raw_data: Json | null
                    fetched_at: string
                }
                Insert: {
                    id?: string
                    date: string
                    campaign_id: string
                    campaign_name?: string | null
                    impressions?: number
                    clicks?: number
                    ctr?: number
                    spend?: number
                    leads?: number
                    cost_per_lead?: number | null
                    raw_data?: Json | null
                    fetched_at?: string
                }
                Update: {
                    id?: string
                    date?: string
                    campaign_id?: string
                    campaign_name?: string | null
                    impressions?: number
                    clicks?: number
                    ctr?: number
                    spend?: number
                    leads?: number
                    cost_per_lead?: number | null
                    raw_data?: Json | null
                    fetched_at?: string
                }
                Relationships: []
            }
            ghl_pipeline_daily: {
                Row: {
                    id: string
                    date: string
                    pipeline_id: string
                    pipeline_name: string | null
                    stage_id: string
                    stage_name: string | null
                    contact_count: number
                    new_contacts: number
                    opportunity_value: number
                    fetched_at: string
                }
                Insert: {
                    id?: string
                    date: string
                    pipeline_id: string
                    pipeline_name?: string | null
                    stage_id: string
                    stage_name?: string | null
                    contact_count?: number
                    new_contacts?: number
                    opportunity_value?: number
                    fetched_at?: string
                }
                Update: {
                    id?: string
                    date?: string
                    pipeline_id?: string
                    pipeline_name?: string | null
                    stage_id?: string
                    stage_name?: string | null
                    contact_count?: number
                    new_contacts?: number
                    opportunity_value?: number
                    fetched_at?: string
                }
                Relationships: []
            }
            deals: {
                Row: {
                    id: string
                    contact_id: string
                    stage: string
                    property_address: string
                    scheduled_date: string | null
                    scheduled_time: string | null
                    origin: string | null
                    assigned_to: string | null
                    created_by: string | null
                    appraisal_id: string | null
                    scheduled_appraisal_id: string | null
                    property_id: string | null
                    notes: string | null
                    stage_changed_at: string
                    created_at: string
                    updated_at: string
                    property_type: string | null
                    property_type_other: string | null
                    neighborhood: string | null
                    rooms: number | null
                    covered_area: number | null
                    visit_data: Json | null
                    visit_completed_at: string | null
                }
                Insert: {
                    id?: string
                    contact_id: string
                    stage?: string
                    property_address: string
                    scheduled_date?: string | null
                    scheduled_time?: string | null
                    origin?: string | null
                    assigned_to?: string | null
                    created_by?: string | null
                    appraisal_id?: string | null
                    scheduled_appraisal_id?: string | null
                    property_id?: string | null
                    notes?: string | null
                    property_type?: string | null
                    property_type_other?: string | null
                    neighborhood?: string | null
                    rooms?: number | null
                    covered_area?: number | null
                    visit_data?: Json | null
                    visit_completed_at?: string | null
                }
                Update: {
                    stage?: string
                    appraisal_id?: string | null
                    scheduled_appraisal_id?: string | null
                    property_id?: string | null
                    notes?: string | null
                    assigned_to?: string | null
                    stage_changed_at?: string
                    updated_at?: string
                    property_type?: string | null
                    property_type_other?: string | null
                    neighborhood?: string | null
                    rooms?: number | null
                    covered_area?: number | null
                    visit_data?: Json | null
                    visit_completed_at?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "deals_scheduled_appraisal_id_fkey"
                        columns: ["scheduled_appraisal_id"]
                        isOneToOne: false
                        referencedRelation: "scheduled_appraisals"
                        referencedColumns: ["id"]
                    }
                ]
            }
            properties: {
                Row: {
                    id: string
                    appraisal_id: string | null
                    address: string
                    neighborhood: string
                    city: string
                    property_type: string
                    rooms: number | null
                    bedrooms: number | null
                    bathrooms: number | null
                    garages: number | null
                    covered_area: number | null
                    total_area: number | null
                    floor: number | null
                    age: number | null
                    asking_price: number
                    currency: string
                    commission_percentage: number
                    contract_start_date: string | null
                    contract_end_date: string | null
                    origin: string | null
                    status: string
                    documents: Json
                    photos: string[]
                    legal_status: string
                    legal_reviewer_id: string | null
                    legal_notes: string | null
                    legal_reviewed_at: string | null
                    legal_docs: Json | null
                    legal_flags: Json | null
                    created_by: string | null
                    assigned_to: string | null
                    created_at: string
                    updated_at: string
                    description: string | null
                    latitude: number | null
                    longitude: number | null
                    video_url: string | null
                    tour_3d_url: string | null
                    expensas: number | null
                    amenities: Json
                    operation_type: string
                    title: string | null
                    postal_code: string | null
                    public_slug: string | null
                }
                Insert: {
                    id?: string
                    appraisal_id?: string | null
                    address: string
                    neighborhood: string
                    city?: string
                    property_type?: string
                    rooms?: number | null
                    bedrooms?: number | null
                    bathrooms?: number | null
                    garages?: number | null
                    covered_area?: number | null
                    total_area?: number | null
                    floor?: number | null
                    age?: number | null
                    asking_price: number
                    currency?: string
                    commission_percentage?: number
                    contract_start_date?: string | null
                    contract_end_date?: string | null
                    origin?: string | null
                    status?: string
                    documents?: Json
                    photos?: string[]
                    legal_status?: string
                    legal_reviewer_id?: string | null
                    legal_notes?: string | null
                    legal_reviewed_at?: string | null
                    legal_docs?: Json | null
                    legal_flags?: Json | null
                    created_by?: string | null
                    assigned_to?: string | null
                    created_at?: string
                    updated_at?: string
                    description?: string | null
                    latitude?: number | null
                    longitude?: number | null
                    video_url?: string | null
                    tour_3d_url?: string | null
                    expensas?: number | null
                    amenities?: Json
                    operation_type?: string
                    title?: string | null
                    postal_code?: string | null
                    public_slug?: string | null
                }
                Update: {
                    id?: string
                    appraisal_id?: string | null
                    address?: string
                    neighborhood?: string
                    city?: string
                    property_type?: string
                    rooms?: number | null
                    bedrooms?: number | null
                    bathrooms?: number | null
                    garages?: number | null
                    covered_area?: number | null
                    total_area?: number | null
                    floor?: number | null
                    age?: number | null
                    asking_price?: number
                    currency?: string
                    commission_percentage?: number
                    contract_start_date?: string | null
                    contract_end_date?: string | null
                    origin?: string | null
                    status?: string
                    documents?: Json
                    photos?: string[]
                    legal_status?: string
                    legal_reviewer_id?: string | null
                    legal_notes?: string | null
                    legal_reviewed_at?: string | null
                    legal_docs?: Json | null
                    legal_flags?: Json | null
                    created_by?: string | null
                    assigned_to?: string | null
                    created_at?: string
                    updated_at?: string
                    description?: string | null
                    latitude?: number | null
                    longitude?: number | null
                    video_url?: string | null
                    tour_3d_url?: string | null
                    expensas?: number | null
                    amenities?: Json
                    operation_type?: string
                    title?: string | null
                    postal_code?: string | null
                    public_slug?: string | null
                }
                Relationships: []
            }
            property_listings: {
                Row: {
                    id: string
                    property_id: string
                    portal: string
                    status: string
                    external_id: string | null
                    external_url: string | null
                    attempts: number
                    next_attempt_at: string | null
                    last_published_at: string | null
                    last_error: string | null
                    metadata: Json
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    property_id: string
                    portal: string
                    status?: string
                    external_id?: string | null
                    external_url?: string | null
                    attempts?: number
                    next_attempt_at?: string | null
                    last_published_at?: string | null
                    last_error?: string | null
                    metadata?: Json
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    property_id?: string
                    portal?: string
                    status?: string
                    external_id?: string | null
                    external_url?: string | null
                    attempts?: number
                    next_attempt_at?: string | null
                    last_published_at?: string | null
                    last_error?: string | null
                    metadata?: Json
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            property_metrics_daily: {
                Row: {
                    property_id: string
                    portal: string
                    date: string
                    views: number
                    contacts: number
                    favorites: number
                    whatsapps: number
                    raw: Json
                }
                Insert: {
                    property_id: string
                    portal: string
                    date: string
                    views?: number
                    contacts?: number
                    favorites?: number
                    whatsapps?: number
                    raw?: Json
                }
                Update: {
                    property_id?: string
                    portal?: string
                    date?: string
                    views?: number
                    contacts?: number
                    favorites?: number
                    whatsapps?: number
                    raw?: Json
                }
                Relationships: []
            }
            portal_credentials: {
                Row: {
                    portal: string
                    enabled: boolean
                    access_token: string | null
                    refresh_token: string | null
                    expires_at: string | null
                    metadata: Json
                    updated_at: string
                }
                Insert: {
                    portal: string
                    enabled?: boolean
                    access_token?: string | null
                    refresh_token?: string | null
                    expires_at?: string | null
                    metadata?: Json
                    updated_at?: string
                }
                Update: {
                    portal?: string
                    enabled?: boolean
                    access_token?: string | null
                    refresh_token?: string | null
                    expires_at?: string | null
                    metadata?: Json
                    updated_at?: string
                }
                Relationships: []
            }
            property_leads: {
                Row: {
                    id: string
                    property_id: string
                    name: string
                    email: string | null
                    phone: string | null
                    message: string | null
                    source: string
                    utm: Json
                    status: string
                    assigned_to: string | null
                    meta_lead_id: string | null
                    notes: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    property_id: string
                    name: string
                    email?: string | null
                    phone?: string | null
                    message?: string | null
                    source?: string
                    utm?: Json
                    status?: string
                    assigned_to?: string | null
                    meta_lead_id?: string | null
                    notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    property_id?: string
                    name?: string
                    email?: string | null
                    phone?: string | null
                    message?: string | null
                    source?: string
                    utm?: Json
                    status?: string
                    assigned_to?: string | null
                    meta_lead_id?: string | null
                    notes?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            property_meta_campaigns: {
                Row: {
                    id: string
                    property_id: string
                    campaign_id: string
                    adset_id: string | null
                    ad_ids: string[]
                    status: string
                    budget_daily: number | null
                    budget_currency: string | null
                    targeting: Json
                    copy: Json
                    landing_url: string | null
                    created_at: string
                    updated_at: string
                    paused_at: string | null
                    last_error: string | null
                    attempts: number
                }
                Insert: {
                    id?: string
                    property_id: string
                    campaign_id: string
                    adset_id?: string | null
                    ad_ids?: string[]
                    status?: string
                    budget_daily?: number | null
                    budget_currency?: string | null
                    targeting?: Json
                    copy?: Json
                    landing_url?: string | null
                    created_at?: string
                    updated_at?: string
                    paused_at?: string | null
                    last_error?: string | null
                    attempts?: number
                }
                Update: {
                    id?: string
                    property_id?: string
                    campaign_id?: string
                    adset_id?: string | null
                    ad_ids?: string[]
                    status?: string
                    budget_daily?: number | null
                    budget_currency?: string | null
                    targeting?: Json
                    copy?: Json
                    landing_url?: string | null
                    created_at?: string
                    updated_at?: string
                    paused_at?: string | null
                    last_error?: string | null
                    attempts?: number
                }
                Relationships: []
            }
            property_meta_metrics_daily: {
                Row: {
                    property_id: string
                    campaign_id: string
                    date: string
                    impressions: number
                    clicks: number
                    ctr: number | null
                    spend: number
                    leads: number
                    cost_per_lead: number | null
                    reach: number
                    raw: Json
                }
                Insert: {
                    property_id: string
                    campaign_id: string
                    date: string
                    impressions?: number
                    clicks?: number
                    ctr?: number | null
                    spend?: number
                    leads?: number
                    cost_per_lead?: number | null
                    reach?: number
                    raw?: Json
                }
                Update: {
                    property_id?: string
                    campaign_id?: string
                    date?: string
                    impressions?: number
                    clicks?: number
                    ctr?: number | null
                    spend?: number
                    leads?: number
                    cost_per_lead?: number | null
                    reach?: number
                    raw?: Json
                }
                Relationships: []
            }
            meta_provision_jobs: {
                Row: {
                    id: string
                    property_id: string
                    action: string
                    status: string
                    attempts: number
                    next_attempt_at: string | null
                    last_error: string | null
                    payload: Json
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    property_id: string
                    action: string
                    status?: string
                    attempts?: number
                    next_attempt_at?: string | null
                    last_error?: string | null
                    payload?: Json
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    property_id?: string
                    action?: string
                    status?: string
                    attempts?: number
                    next_attempt_at?: string | null
                    last_error?: string | null
                    payload?: Json
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            property_publish_events: {
                Row: {
                    id: string
                    listing_id: string | null
                    property_id: string | null
                    portal: string
                    event_type: string
                    payload: Json | null
                    error_message: string | null
                    actor: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    listing_id?: string | null
                    property_id?: string | null
                    portal: string
                    event_type: string
                    payload?: Json | null
                    error_message?: string | null
                    actor?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    listing_id?: string | null
                    property_id?: string | null
                    portal?: string
                    event_type?: string
                    payload?: Json | null
                    error_message?: string | null
                    actor?: string
                    created_at?: string
                }
                Relationships: []
            }
            ghl_commercial_actions_daily: {
                Row: {
                    id: string
                    date: string
                    tasaciones_solicitadas: number
                    tasaciones_coordinadas: number
                    tasaciones_realizadas: number
                    captaciones: number
                    fetched_at: string
                }
                Insert: {
                    id?: string
                    date: string
                    tasaciones_solicitadas?: number
                    tasaciones_coordinadas?: number
                    tasaciones_realizadas?: number
                    captaciones?: number
                    fetched_at?: string
                }
                Update: {
                    id?: string
                    date?: string
                    tasaciones_solicitadas?: number
                    tasaciones_coordinadas?: number
                    tasaciones_realizadas?: number
                    captaciones?: number
                    fetched_at?: string
                }
                Relationships: []
            }
            email_report_log: {
                Row: {
                    id: string
                    report_type: string
                    sent_at: string
                    recipients: string[]
                    subject: string | null
                    status: string
                    error_message: string | null
                    data_snapshot: Json | null
                }
                Insert: {
                    id?: string
                    report_type: string
                    sent_at?: string
                    recipients: string[]
                    subject?: string | null
                    status?: string
                    error_message?: string | null
                    data_snapshot?: Json | null
                }
                Update: {
                    id?: string
                    report_type?: string
                    sent_at?: string
                    recipients?: string[]
                    subject?: string | null
                    status?: string
                    error_message?: string | null
                    data_snapshot?: Json | null
                }
                Relationships: []
            }
            report_settings: {
                Row: {
                    id: string
                    recipients: string[]
                    daily_enabled: boolean
                    weekly_enabled: boolean
                    monthly_enabled: boolean
                    updated_at: string
                }
                Insert: {
                    id?: string
                    recipients?: string[]
                    daily_enabled?: boolean
                    weekly_enabled?: boolean
                    monthly_enabled?: boolean
                    updated_at?: string
                }
                Update: {
                    id?: string
                    recipients?: string[]
                    daily_enabled?: boolean
                    weekly_enabled?: boolean
                    monthly_enabled?: boolean
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
            legal_review_events: {
                Row: {
                    id: string
                    property_id: string
                    actor_id: string | null
                    actor_role: string
                    action: string
                    item_key: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    property_id: string
                    actor_id?: string | null
                    actor_role: string
                    action: string
                    item_key?: string | null
                    notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    property_id?: string
                    actor_id?: string | null
                    actor_role?: string
                    action?: string
                    item_key?: string | null
                    notes?: string | null
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "legal_review_events_property_id_fkey"
                        columns: ["property_id"]
                        isOneToOne: false
                        referencedRelation: "properties"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "legal_review_events_actor_id_fkey"
                        columns: ["actor_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    }
                ]
            }
            property_visits: {
                Row: {
                    id: string
                    property_id: string
                    advisor_id: string | null
                    contact_id: string | null
                    client_name: string
                    client_email: string | null
                    client_phone: string | null
                    scheduled_at: string
                    duration_minutes: number | null
                    notes: string | null
                    status: string
                    completed_at: string | null
                    completion_notes: string | null
                    reminder_sent_at: string | null
                    created_at: string
                    updated_at: string
                    created_by: string | null
                }
                Insert: {
                    id?: string
                    property_id: string
                    advisor_id?: string | null
                    contact_id?: string | null
                    client_name: string
                    client_email?: string | null
                    client_phone?: string | null
                    scheduled_at: string
                    duration_minutes?: number | null
                    notes?: string | null
                    status?: string
                    completed_at?: string | null
                    completion_notes?: string | null
                    reminder_sent_at?: string | null
                    created_at?: string
                    updated_at?: string
                    created_by?: string | null
                }
                Update: {
                    id?: string
                    property_id?: string
                    advisor_id?: string | null
                    contact_id?: string | null
                    client_name?: string
                    client_email?: string | null
                    client_phone?: string | null
                    scheduled_at?: string
                    duration_minutes?: number | null
                    notes?: string | null
                    status?: string
                    completed_at?: string | null
                    completion_notes?: string | null
                    reminder_sent_at?: string | null
                    created_at?: string
                    updated_at?: string
                    created_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "property_visits_property_id_fkey"
                        columns: ["property_id"]
                        isOneToOne: false
                        referencedRelation: "properties"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "property_visits_advisor_id_fkey"
                        columns: ["advisor_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "property_visits_contact_id_fkey"
                        columns: ["contact_id"]
                        isOneToOne: false
                        referencedRelation: "contacts"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "property_visits_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    }
                ]
            }
            visit_questionnaires: {
                Row: {
                    id: string
                    visit_id: string
                    response_source: string
                    liked: boolean | null
                    most_liked: string | null
                    least_liked: string | null
                    in_price: boolean | null
                    hypothetical_offer: number | null
                    responded_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    visit_id: string
                    response_source: string
                    liked?: boolean | null
                    most_liked?: string | null
                    least_liked?: string | null
                    in_price?: boolean | null
                    hypothetical_offer?: number | null
                    responded_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    visit_id?: string
                    response_source?: string
                    liked?: boolean | null
                    most_liked?: string | null
                    least_liked?: string | null
                    in_price?: boolean | null
                    hypothetical_offer?: number | null
                    responded_at?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "visit_questionnaires_visit_id_fkey"
                        columns: ["visit_id"]
                        isOneToOne: false
                        referencedRelation: "property_visits"
                        referencedColumns: ["id"]
                    }
                ]
            }
            visit_questionnaire_tokens: {
                Row: {
                    id: string
                    visit_id: string
                    token: string
                    expires_at: string
                    used_at: string | null
                    sent_to: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    visit_id: string
                    token: string
                    expires_at: string
                    used_at?: string | null
                    sent_to: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    visit_id?: string
                    token?: string
                    expires_at?: string
                    used_at?: string | null
                    sent_to?: string
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "visit_questionnaire_tokens_visit_id_fkey"
                        columns: ["visit_id"]
                        isOneToOne: false
                        referencedRelation: "property_visits"
                        referencedColumns: ["id"]
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            merge_deal_visit_data: {
                Args: { p_deal_id: string; p_patch: Json }
                Returns: Json
            }
        }
        Enums: {
            [_ in never]: never
        }
    }
}
