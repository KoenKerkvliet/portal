-- Ingelogde klanten mogen hun eigen opdracht alleen accepteren of afwijzen (RLS-policy
-- "Clients can accept own assignments"), niet de inhoud wijzigen. Zelfde patroon als
-- guard_quote_client_update; daarnaast kan een eenmaal gegeven reactie niet meer
-- omgedraaid worden. Admin en service_role (o.a. de publieke link) mogen alles.

create or replace function public.guard_assignment_client_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Klant: inhoud mag niet wijzigen
  if new.project_id     is distinct from old.project_id
     or new.client_id   is distinct from old.client_id
     or new.title       is distinct from old.title
     or new.content     is distinct from old.content
     or new.created_at  is distinct from old.created_at
     or new.last_sent_at is distinct from old.last_sent_at then
    raise exception 'Klanten mogen een opdracht alleen accepteren of afwijzen, niet de inhoud wijzigen';
  end if;

  if new.status is distinct from old.status then
    -- Status mag alleen richting accepted/declined
    if new.status not in ('accepted', 'declined') then
      raise exception 'Ongeldige statuswijziging voor klant';
    end if;
    -- Een gegeven reactie kan niet meer omgedraaid worden
    if old.status in ('accepted', 'declined') then
      raise exception 'Op deze opdracht is al gereageerd';
    end if;
  end if;

  return new;
end;
$$;

-- Alleen als trigger bedoeld; niet aanroepbaar via de API (triggers blijven werken)
revoke execute on function public.guard_assignment_client_update() from public, anon, authenticated;

drop trigger if exists trg_guard_assignment_client_update on public.assignments;
create trigger trg_guard_assignment_client_update before update on public.assignments
  for each row execute function public.guard_assignment_client_update();
