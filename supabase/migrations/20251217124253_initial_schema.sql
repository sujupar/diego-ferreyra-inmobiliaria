create table public.appraisals (
  id uuid not null default gen_random_uuid() primary key,
  property_url text not null,
  calculated_value numeric,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.comparables (
  id uuid not null default gen_random_uuid() primary key,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  url text not null,
  price numeric,
  features jsonb
);

create table public.property_images (
  id uuid not null default gen_random_uuid() primary key,
  appraisal_id uuid not null references public.appraisals(id) on delete cascade,
  url text not null,
  ai_condition_score numeric
);

-- Enable RLS (Row Level Security) is generally good practice, 
-- but for internal tool MVP with 'service_role' or authenticated users, we should configure policies.
-- For now, enabling it but allowing public access for simplicity if auth is not fully rigorous yet, 
-- OR leaving disabled if it's strictly internal and secured by app logic.
-- Given the "Internal System" description, we'll try to keep it simple but extensible.

alter table public.appraisals enable row level security;
alter table public.comparables enable row level security;
alter table public.property_images enable row level security;

-- Policy: Allow authenticated users to do everything (Internal tool)
create policy "Enable all access for authenticated users" on public.appraisals
  for all to authenticated using (true) with check (true);

create policy "Enable all access for authenticated users" on public.comparables
  for all to authenticated using (true) with check (true);

create policy "Enable all access for authenticated users" on public.property_images
  for all to authenticated using (true) with check (true);

-- Also allow anon for now if using client-side logic without full auth flow for the "Preview"
-- BUT the prompt implies "Internal Management System", usually requiring login.
-- I'll stick to authenticated policies. If user has trouble, we can open it up.
