-- ============================================
-- Klantportaal Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES (linked to auth.users)
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null default 'client' check (role in ('admin', 'client')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- CLIENTS
-- ============================================
create table public.clients (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  email text not null,
  phone text,
  company text,
  profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================
-- PROJECTS
-- ============================================
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  client_id uuid references public.clients(id) on delete cascade not null,
  current_phase text not null default 'intake' check (current_phase in ('intake', 'design', 'development', 'review', 'opgeleverd')),
  status text not null default 'active' check (status in ('active', 'archived')),
  due_date date,
  start_meeting_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- PHASE TEMPLATES
-- ============================================
create table public.phase_templates (
  id uuid default uuid_generate_v4() primary key,
  phase text not null check (phase in ('intake', 'design', 'development', 'review', 'opgeleverd')),
  title text not null,
  description text not null default '',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- PROJECT PHASES
-- ============================================
create table public.project_phases (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  phase text not null check (phase in ('intake', 'design', 'development', 'review', 'opgeleverd')),
  status text not null default 'pending' check (status in ('pending', 'active', 'completed')),
  template_id uuid references public.phase_templates(id),
  custom_data jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- INVOICES
-- ============================================
create table public.invoices (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete cascade not null,
  number text not null,
  amount numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  due_date date not null,
  created_at timestamptz not null default now()
);

-- ============================================
-- QUOTES
-- ============================================
create table public.quotes (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  client_id uuid references public.clients(id) on delete cascade not null,
  number text not null,
  amount numeric(10,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  valid_until date not null,
  created_at timestamptz not null default now()
);

-- ============================================
-- FORMS
-- ============================================
create table public.forms (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text not null default '',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================
-- FORM SUBMISSIONS
-- ============================================
create table public.form_submissions (
  id uuid default uuid_generate_v4() primary key,
  form_id uuid references public.forms(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================
-- INVOICE SETTINGS
-- ============================================
create table public.invoice_settings (
  id uuid default uuid_generate_v4() primary key,
  company_name text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country text not null default 'Nederland',
  iban text not null default '',
  btw_number text not null default '',
  kvk_number text not null default '',
  invoice_prefix text not null default 'INV',
  year_format text not null default 'YY' check (year_format in ('YY', 'YYYY')),
  start_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.phase_templates enable row level security;
alter table public.project_phases enable row level security;
alter table public.invoices enable row level security;
alter table public.quotes enable row level security;
alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.invoice_settings enable row level security;

-- Helper function: check if user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- PROFILES policies
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles" on public.profiles for select using (public.is_admin());

-- CLIENTS policies
create policy "Admins full access to clients" on public.clients for all using (public.is_admin());
create policy "Clients can view own record" on public.clients for select using (profile_id = auth.uid());

-- PROJECTS policies
create policy "Admins full access to projects" on public.projects for all using (public.is_admin());
create policy "Clients can view own projects" on public.projects for select using (
  client_id in (select id from public.clients where profile_id = auth.uid())
);

-- PHASE TEMPLATES policies
create policy "Admins full access to templates" on public.phase_templates for all using (public.is_admin());
create policy "Clients can view templates" on public.phase_templates for select using (true);

-- PROJECT PHASES policies
create policy "Admins full access to project phases" on public.project_phases for all using (public.is_admin());
create policy "Clients can view own project phases" on public.project_phases for select using (
  project_id in (
    select p.id from public.projects p
    join public.clients c on c.id = p.client_id
    where c.profile_id = auth.uid()
  )
);

-- INVOICES policies
create policy "Admins full access to invoices" on public.invoices for all using (public.is_admin());
create policy "Clients can view own invoices" on public.invoices for select using (
  client_id in (select id from public.clients where profile_id = auth.uid())
);

-- QUOTES policies
create policy "Admins full access to quotes" on public.quotes for all using (public.is_admin());
create policy "Clients can view own quotes" on public.quotes for select using (
  client_id in (select id from public.clients where profile_id = auth.uid())
);

-- INVOICE SETTINGS policies
create policy "Admins full access to invoice_settings" on public.invoice_settings for all using (public.is_admin());

-- FORMS policies
create policy "Admins full access to forms" on public.forms for all using (public.is_admin());
create policy "Clients can view forms" on public.forms for select using (true);

-- FORM SUBMISSIONS policies
create policy "Admins full access to form_submissions" on public.form_submissions for all using (public.is_admin());
create policy "Clients can view own submissions" on public.form_submissions for select using (
  project_id in (
    select p.id from public.projects p
    join public.clients c on c.id = p.client_id
    where c.profile_id = auth.uid()
  )
);
create policy "Clients can insert own submissions" on public.form_submissions for insert with check (
  project_id in (
    select p.id from public.projects p
    join public.clients c on c.id = p.client_id
    where c.profile_id = auth.uid()
  )
);
create policy "Clients can update own submissions" on public.form_submissions for update using (
  project_id in (
    select p.id from public.projects p
    join public.clients c on c.id = p.client_id
    where c.profile_id = auth.uid()
  )
);
