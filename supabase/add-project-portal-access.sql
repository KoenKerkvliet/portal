-- Portaaltoegang per klant van een domein, voor de sectie Onderhoud op de
-- domeinpagina. Leest client_invites en auth.users (niet zelf leesbaar vanuit de
-- app) en is daarom security definer, met een expliciete admincheck.

create or replace function public.project_portal_access(p_project_id uuid)
returns table (
  client_id uuid,
  has_account boolean,
  invited_at timestamptz,
  invite_expires_at timestamptz,
  invite_used_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  if not public.is_admin() then
    raise exception 'Geen toegang';
  end if;

  return query
  select
    c.id,
    c.profile_id is not null,
    i.created_at,
    i.expires_at,
    i.used_at,
    u.last_sign_in_at
  from public.project_clients pc
  join public.clients c on c.id = pc.client_id
  left join auth.users u on u.id = c.profile_id
  left join lateral (
    select ci.created_at, ci.expires_at, ci.used_at
    from public.client_invites ci
    where ci.client_id = c.id
    order by ci.created_at desc
    limit 1
  ) i on true
  where pc.project_id = p_project_id;
end;
$$;

revoke execute on function public.project_portal_access(uuid) from public, anon;
grant execute on function public.project_portal_access(uuid) to authenticated;
