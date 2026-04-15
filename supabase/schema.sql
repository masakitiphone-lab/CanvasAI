create extension if not exists "pgcrypto";

create table if not exists projects (
  id text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  plan_key text not null default 'free',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists projects_owner_user_id_idx on projects(owner_user_id);
create index if not exists projects_owner_updated_at_idx on projects(owner_user_id, updated_at desc);

create table if not exists canvas_nodes (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  parent_id text null,
  kind text not null check (kind in ('user', 'ai', 'code', 'result', 'image', 'file', 'note')),
  content text not null default '',
  status text not null check (status in ('idle', 'generating', 'error', 'outdated', 'orphan')),
  position_x double precision not null default 0,
  position_y double precision not null default 0,
  is_root boolean not null default false,
  is_position_pinned boolean not null default false,
  model_provider text null,
  model_name text null,
  prompt_mode text null check (prompt_mode in ('auto', 'code', 'image-create', 'deep-research')),
  enabled_tools text[] not null default '{}'::text[] check (enabled_tools <@ array['google-search', 'url-context']::text[]),
  token_count integer null,
  created_at text not null
);

create index if not exists canvas_nodes_project_id_idx on canvas_nodes(project_id);
create index if not exists canvas_nodes_parent_id_idx on canvas_nodes(parent_id);

alter table if exists canvas_nodes
  add column if not exists prompt_mode text null check (prompt_mode in ('auto', 'code', 'image-create', 'deep-research'));

alter table if exists canvas_nodes
  add column if not exists enabled_tools text[] not null default '{}'::text[];

alter table if exists canvas_nodes
  add column if not exists token_count integer null;

create table if not exists canvas_edges (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  source_id text not null,
  target_id text not null
);

create index if not exists canvas_edges_project_id_idx on canvas_edges(project_id);

create table if not exists attachment_objects (
  id text primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id text null references projects(id) on delete set null,
  kind text not null check (kind in ('image', 'pdf', 'url')),
  name text not null,
  mime_type text null,
  size_bytes bigint null,
  url text not null,
  storage_path text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists attachment_objects_owner_user_id_idx on attachment_objects(owner_user_id);
create index if not exists attachment_objects_project_id_idx on attachment_objects(project_id);
create index if not exists attachment_objects_storage_path_idx on attachment_objects(storage_path);

create table if not exists node_attachments (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  node_id text not null references canvas_nodes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image', 'pdf', 'url')),
  name text not null,
  mime_type text null,
  size_bytes bigint null,
  url text not null,
  storage_path text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists node_attachments_project_id_idx on node_attachments(project_id);
create index if not exists node_attachments_node_id_idx on node_attachments(node_id);
create index if not exists node_attachments_owner_user_id_idx on node_attachments(owner_user_id);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  project_id text null references projects(id) on delete set null,
  action text not null,
  target_type text null,
  target_id text null,
  status text not null default 'ok',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_user_id_idx on audit_logs(user_id, occurred_at desc);
create index if not exists audit_logs_project_id_idx on audit_logs(project_id, occurred_at desc);
create index if not exists audit_logs_generation_error_idx
on audit_logs(action, status, occurred_at desc)
where status = 'error' and action in ('generation.text.error', 'generation.image.error');

create or replace view public.generation_error_logs as
select
  id,
  user_id,
  project_id,
  action,
  target_id,
  occurred_at,
  metadata ->> 'modelName' as model_name,
  metadata ->> 'promptMode' as prompt_mode,
  metadata ->> 'chargedCredits' as charged_credits,
  metadata ->> 'runtime' as runtime,
  coalesce(metadata -> 'error' ->> 'name', metadata ->> 'code') as error_name,
  coalesce(metadata -> 'error' ->> 'message', metadata ->> 'message') as error_message,
  metadata -> 'error' ->> 'stack' as error_stack,
  metadata as raw_metadata
from audit_logs
where status = 'error'
  and action in ('generation.text.error', 'generation.image.error');

create table if not exists user_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  daily_grant_amount integer not null default 500,
  last_daily_grant_date date null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text null references projects(id) on delete set null,
  amount integer not null,
  direction text not null check (direction in ('grant', 'debit', 'refund')),
  reason text not null,
  model_name text null,
  prompt_mode text null,
  request_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists credit_ledger_user_id_idx on credit_ledger(user_id, created_at desc);
create index if not exists credit_ledger_project_id_idx on credit_ledger(project_id, created_at desc);

create or replace function public.apply_daily_credit_grant(p_user_id uuid)
returns table (
  balance integer,
  daily_grant_amount integer,
  last_daily_grant_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row user_credit_balances%rowtype;
  v_today date := timezone('Asia/Singapore', now())::date;
  v_daily_grant integer := coalesce(nullif(current_setting('app.daily_credit_grant', true), '')::integer, 500);
begin
  insert into user_credit_balances (user_id, balance, daily_grant_amount, last_daily_grant_date, updated_at)
  values (p_user_id, 0, v_daily_grant, null, timezone('utc', now()))
  on conflict (user_id) do nothing;

  select *
  into v_row
  from user_credit_balances
  where user_id = p_user_id
  for update;

  if v_row.last_daily_grant_date is distinct from v_today then
    update user_credit_balances
    set balance = v_row.balance + v_row.daily_grant_amount,
        last_daily_grant_date = v_today,
        updated_at = timezone('utc', now())
    where user_id = p_user_id
    returning * into v_row;

    insert into credit_ledger (
      user_id,
      project_id,
      amount,
      direction,
      reason,
      model_name,
      prompt_mode,
      request_id,
      metadata
    )
    values (
      p_user_id,
      null,
      v_row.daily_grant_amount,
      'grant',
      'daily_grant',
      null,
      null,
      null,
      jsonb_build_object('timeZone', 'Asia/Singapore')
    );
  end if;

  return query
  select v_row.balance, v_row.daily_grant_amount, v_row.last_daily_grant_date;
end;
$$;

create or replace function public.consume_credits_atomic(
  p_user_id uuid,
  p_project_id text,
  p_amount integer,
  p_reason text,
  p_model_name text,
  p_prompt_mode text,
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  ok boolean,
  balance integer,
  required integer,
  debited integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row user_credit_balances%rowtype;
  v_today date := timezone('Asia/Singapore', now())::date;
  v_daily_grant integer := coalesce(nullif(current_setting('app.daily_credit_grant', true), '')::integer, 500);
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive.';
  end if;

  insert into user_credit_balances (user_id, balance, daily_grant_amount, last_daily_grant_date, updated_at)
  values (p_user_id, 0, v_daily_grant, null, timezone('utc', now()))
  on conflict (user_id) do nothing;

  select *
  into v_row
  from user_credit_balances
  where user_id = p_user_id
  for update;

  if v_row.last_daily_grant_date is distinct from v_today then
    update user_credit_balances
    set balance = v_row.balance + v_row.daily_grant_amount,
        last_daily_grant_date = v_today,
        updated_at = timezone('utc', now())
    where user_id = p_user_id
    returning * into v_row;

    insert into credit_ledger (
      user_id,
      project_id,
      amount,
      direction,
      reason,
      model_name,
      prompt_mode,
      request_id,
      metadata
    )
    values (
      p_user_id,
      null,
      v_row.daily_grant_amount,
      'grant',
      'daily_grant',
      null,
      null,
      null,
      jsonb_build_object('timeZone', 'Asia/Singapore')
    );
  end if;

  if v_row.balance < p_amount then
    return query
    select false, v_row.balance, p_amount, 0;
    return;
  end if;

  update user_credit_balances
  set balance = v_row.balance - p_amount,
      updated_at = timezone('utc', now())
  where user_id = p_user_id
  returning * into v_row;

  insert into credit_ledger (
    user_id,
    project_id,
    amount,
    direction,
    reason,
    model_name,
    prompt_mode,
    request_id,
    metadata
  )
  values (
    p_user_id,
    p_project_id,
    p_amount,
    'debit',
    p_reason,
    p_model_name,
    p_prompt_mode,
    p_request_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query
  select true, v_row.balance, p_amount, p_amount;
end;
$$;

create or replace function public.refund_credits_atomic(
  p_user_id uuid,
  p_project_id text,
  p_amount integer,
  p_reason text,
  p_model_name text,
  p_prompt_mode text,
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row user_credit_balances%rowtype;
  v_today date := timezone('Asia/Singapore', now())::date;
  v_daily_grant integer := coalesce(nullif(current_setting('app.daily_credit_grant', true), '')::integer, 500);
begin
  if p_amount <= 0 then
    return query
    select coalesce((
      select user_credit_balances.balance
      from user_credit_balances
      where user_credit_balances.user_id = p_user_id
    ), 0);
    return;
  end if;

  insert into user_credit_balances (user_id, balance, daily_grant_amount, last_daily_grant_date, updated_at)
  values (p_user_id, 0, v_daily_grant, v_today, timezone('utc', now()))
  on conflict (user_id) do nothing;

  select *
  into v_row
  from user_credit_balances
  where user_id = p_user_id
  for update;

  update user_credit_balances
  set balance = v_row.balance + p_amount,
      updated_at = timezone('utc', now())
  where user_id = p_user_id
  returning * into v_row;

  insert into credit_ledger (
    user_id,
    project_id,
    amount,
    direction,
    reason,
    model_name,
    prompt_mode,
    request_id,
    metadata
  )
  values (
    p_user_id,
    p_project_id,
    p_amount,
    'refund',
    p_reason,
    p_model_name,
    p_prompt_mode,
    p_request_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query
  select v_row.balance;
end;
$$;

grant execute on function public.apply_daily_credit_grant(uuid) to authenticated, service_role;
grant execute on function public.consume_credits_atomic(uuid, text, integer, text, text, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.refund_credits_atomic(uuid, text, integer, text, text, text, uuid, jsonb) to authenticated, service_role;

alter table projects enable row level security;
alter table canvas_nodes enable row level security;
alter table canvas_edges enable row level security;
alter table node_attachments enable row level security;
alter table attachment_objects enable row level security;
alter table audit_logs enable row level security;
alter table user_credit_balances enable row level security;
alter table credit_ledger enable row level security;

drop policy if exists "projects_select_own" on projects;
create policy "projects_select_own"
on projects
for select
using (owner_user_id = auth.uid());

drop policy if exists "projects_insert_own" on projects;
create policy "projects_insert_own"
on projects
for insert
with check (owner_user_id = auth.uid());

drop policy if exists "projects_update_own" on projects;
create policy "projects_update_own"
on projects
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "projects_delete_own" on projects;
create policy "projects_delete_own"
on projects
for delete
using (owner_user_id = auth.uid());

drop policy if exists "canvas_nodes_select_own" on canvas_nodes;
create policy "canvas_nodes_select_own"
on canvas_nodes
for select
using (
  exists (
    select 1
    from projects
    where projects.id = canvas_nodes.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_nodes_insert_own" on canvas_nodes;
create policy "canvas_nodes_insert_own"
on canvas_nodes
for insert
with check (
  exists (
    select 1
    from projects
    where projects.id = canvas_nodes.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_nodes_update_own" on canvas_nodes;
create policy "canvas_nodes_update_own"
on canvas_nodes
for update
using (
  exists (
    select 1
    from projects
    where projects.id = canvas_nodes.project_id
      and projects.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from projects
    where projects.id = canvas_nodes.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_nodes_delete_own" on canvas_nodes;
create policy "canvas_nodes_delete_own"
on canvas_nodes
for delete
using (
  exists (
    select 1
    from projects
    where projects.id = canvas_nodes.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_edges_select_own" on canvas_edges;
create policy "canvas_edges_select_own"
on canvas_edges
for select
using (
  exists (
    select 1
    from projects
    where projects.id = canvas_edges.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_edges_insert_own" on canvas_edges;
create policy "canvas_edges_insert_own"
on canvas_edges
for insert
with check (
  exists (
    select 1
    from projects
    where projects.id = canvas_edges.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_edges_update_own" on canvas_edges;
create policy "canvas_edges_update_own"
on canvas_edges
for update
using (
  exists (
    select 1
    from projects
    where projects.id = canvas_edges.project_id
      and projects.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from projects
    where projects.id = canvas_edges.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "canvas_edges_delete_own" on canvas_edges;
create policy "canvas_edges_delete_own"
on canvas_edges
for delete
using (
  exists (
    select 1
    from projects
    where projects.id = canvas_edges.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "node_attachments_select_own" on node_attachments;
create policy "node_attachments_select_own"
on node_attachments
for select
using (owner_user_id = auth.uid());

drop policy if exists "node_attachments_insert_own" on node_attachments;
create policy "node_attachments_insert_own"
on node_attachments
for insert
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from projects
    where projects.id = node_attachments.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "node_attachments_update_own" on node_attachments;
create policy "node_attachments_update_own"
on node_attachments
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "node_attachments_delete_own" on node_attachments;
create policy "node_attachments_delete_own"
on node_attachments
for delete
using (owner_user_id = auth.uid());

drop policy if exists "attachment_objects_select_own" on attachment_objects;
create policy "attachment_objects_select_own"
on attachment_objects
for select
using (owner_user_id = auth.uid());

drop policy if exists "attachment_objects_insert_own" on attachment_objects;
create policy "attachment_objects_insert_own"
on attachment_objects
for insert
with check (owner_user_id = auth.uid());

drop policy if exists "attachment_objects_update_own" on attachment_objects;
create policy "attachment_objects_update_own"
on attachment_objects
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "attachment_objects_delete_own" on attachment_objects;
create policy "attachment_objects_delete_own"
on attachment_objects
for delete
using (owner_user_id = auth.uid());

drop policy if exists "audit_logs_select_own" on audit_logs;
create policy "audit_logs_select_own"
on audit_logs
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from projects
    where projects.id = audit_logs.project_id
      and projects.owner_user_id = auth.uid()
  )
);

drop policy if exists "user_credit_balances_select_own" on user_credit_balances;
create policy "user_credit_balances_select_own"
on user_credit_balances
for select
using (user_id = auth.uid());

drop policy if exists "user_credit_balances_insert_own" on user_credit_balances;
create policy "user_credit_balances_insert_own"
on user_credit_balances
for insert
with check (user_id = auth.uid());

drop policy if exists "user_credit_balances_update_own" on user_credit_balances;
create policy "user_credit_balances_update_own"
on user_credit_balances
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "credit_ledger_select_own" on credit_ledger;
create policy "credit_ledger_select_own"
on credit_ledger
for select
using (user_id = auth.uid());

drop policy if exists "credit_ledger_insert_own" on credit_ledger;
create policy "credit_ledger_insert_own"
on credit_ledger
for insert
with check (user_id = auth.uid());
