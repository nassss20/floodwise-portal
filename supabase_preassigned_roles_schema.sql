-- FloodWise: Pre-assigned Roles & User Roles Extension Schema

-- 1. Add email column to user_roles if it doesn't exist yet
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Create the preassigned_roles table for pre-authorizing users before they log in
CREATE TABLE IF NOT EXISTS public.preassigned_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.preassigned_roles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Allow authenticated users to view pre-assigned roles
CREATE POLICY "Enable read access for authenticated users" ON public.preassigned_roles
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users (admins) to insert pre-assigned roles
CREATE POLICY "Enable insert for authenticated users" ON public.preassigned_roles
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update pre-assigned roles
CREATE POLICY "Enable update for authenticated users" ON public.preassigned_roles
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to delete pre-assigned roles (upon claiming or revoking)
CREATE POLICY "Enable delete for authenticated users" ON public.preassigned_roles
    FOR DELETE USING (auth.role() = 'authenticated');

-- 5. Enable Realtime updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.preassigned_roles;
