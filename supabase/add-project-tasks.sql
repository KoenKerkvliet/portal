-- Takenbord per domein (development- en opleverfase). De klant kijkt mee via een link
-- zonder inloggen (/d/planning/<board_token>, Edge Function public-document, type 'board')
-- en kan daar feedback geven en klanttaken als aangeleverd melden.
--   status         todo | doing | done
--   assignee       me (DesignPixels) | client (de klant moet iets doen/aanleveren)
--   due_date       uiterste datum (klanttaak) of geplande datum (eigen taak)
--   private        alleen zichtbaar voor de admin
--   is_feedback    door de klant ingediend via de link
--   client_done_at de klant meldde de taak als aangeleverd (admin beoordeelt)
--   done_note      toelichting die de klant ziet, bijv. "Besproken: we laten dit zo"

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee text not null default 'me' check (assignee in ('me', 'client')),
  due_date date,
  private boolean not null default false,
  is_feedback boolean not null default false,
  feedback_page text not null default '',
  feedback_author text not null default '',
  screenshot_path text,
  client_done_at timestamptz,
  done_note text not null default '',
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_tasks_project_idx on public.project_tasks (project_id, sort_order);

alter table public.project_tasks enable row level security;

drop policy if exists "Admins beheren taken" on public.project_tasks;
create policy "Admins beheren taken" on public.project_tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.project_tasks to authenticated;

-- Standaardtaken waarmee een leeg bord gevuld kan worden
create table if not exists public.task_template_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text not null default 'me' check (assignee in ('me', 'client')),
  sort_order integer not null default 0
);

alter table public.task_template_items enable row level security;

drop policy if exists "Admins beheren standaardtaken" on public.task_template_items;
create policy "Admins beheren standaardtaken" on public.task_template_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.task_template_items to authenticated;

insert into public.task_template_items (title, assignee, sort_order)
select * from (values
  ('Teksten aanleveren', 'client', 0),
  ('Foto''s en logo aanleveren', 'client', 1),
  ('Homepage bouwen', 'me', 2),
  ('Overige pagina''s bouwen', 'me', 3),
  ('Formulieren instellen', 'me', 4),
  ('Teksten en foto''s plaatsen', 'me', 5),
  ('Mobiel en tablet controleren', 'me', 6),
  ('Snelheid optimaliseren', 'me', 7),
  ('Vindbaarheid: titels en beschrijvingen', 'me', 8),
  ('Testsite doorlopen en feedback geven', 'client', 9),
  ('Feedback verwerken', 'me', 10),
  ('Oplevercheck', 'me', 11)
) as t(title, assignee, sort_order)
where not exists (select 1 from public.task_template_items);

-- Link voor de klant en wanneer die het laatst is gemaild
alter table public.projects add column if not exists board_token text unique;
alter table public.projects add column if not exists board_sent_at timestamptz;

-- Screenshots bij feedback (privé; tonen via tijdelijke links)
insert into storage.buckets (id, name, public)
values ('task-feedback', 'task-feedback', false)
on conflict (id) do nothing;

drop policy if exists "Admins lezen feedbackscreenshots" on storage.objects;
create policy "Admins lezen feedbackscreenshots" on storage.objects
  for select to authenticated using (bucket_id = 'task-feedback' and public.is_admin());

drop policy if exists "Admins verwijderen feedbackscreenshots" on storage.objects;
create policy "Admins verwijderen feedbackscreenshots" on storage.objects
  for delete to authenticated using (bucket_id = 'task-feedback' and public.is_admin());
