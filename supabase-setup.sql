-- Plak dit in Supabase: Project → SQL Editor → New query → Run

create table if not exists rikken_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table rikken_state enable row level security;

-- Simpele, open policies: prima voor een klein privé-scorebord.
-- (Iedereen die de website-link heeft, kan de stand lezen en bijwerken —
-- er staan geen gevoelige gegevens in, dus dat is een prima afweging hier.)
create policy "Iedereen mag lezen" on rikken_state
  for select using (true);

create policy "Iedereen mag toevoegen" on rikken_state
  for insert with check (true);

create policy "Iedereen mag bijwerken" on rikken_state
  for update using (true);
