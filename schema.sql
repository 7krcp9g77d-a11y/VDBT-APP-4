-- ============================================================
--  Tuinplanner — database
--  Plak dit in Supabase > SQL Editor en voer het uit.
-- ============================================================

-- ---------- 1. Medewerkers ----------
-- Elke medewerker is een gebruiker in auth.users; hier hangt zijn naam en rol aan.
create table profiles (
  id    uuid primary key references auth.users on delete cascade,
  naam  text not null,
  rol   text not null default 'arbeider' check (rol in ('arbeider', 'kantoor')),
  actief boolean not null default true
);

-- Handige helper: is de ingelogde gebruiker kantoor?
create or replace function is_kantoor()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'kantoor');
$$;

-- ---------- 2. Stamgegevens (beheerd door kantoor) ----------
create table materialen (
  id   uuid primary key default gen_random_uuid(),
  naam text not null
);

create table taaktypes (
  id             uuid primary key default gen_random_uuid(),
  naam           text not null,
  standaard_duur int not null default 60   -- minuten
);

-- welk materiaal hoort standaard bij welk taaktype
create table taaktype_materiaal (
  taaktype_id  uuid references taaktypes on delete cascade,
  materiaal_id uuid references materialen on delete cascade,
  primary key (taaktype_id, materiaal_id)
);

create table werven (
  id     uuid primary key default gen_random_uuid(),
  klant  text not null,
  adres  text not null default '',
  actief boolean not null default true
);

-- ---------- 3. Het werfdossier ----------
create table werftaken (
  id          uuid primary key default gen_random_uuid(),
  werf_id     uuid not null references werven on delete cascade,
  taaktype_id uuid not null references taaktypes,
  opmerking   text not null default '',
  meerdaags   boolean not null default false,
  status      text not null default 'open' check (status in ('open', 'bezig', 'klaar')),
  aangemaakt  timestamptz not null default now()
);

-- extra materiaal, bovenop dat van het taaktype
create table werftaak_materiaal (
  werftaak_id  uuid references werftaken on delete cascade,
  materiaal_id uuid references materialen on delete cascade,
  primary key (werftaak_id, materiaal_id)
);

-- ---------- 4. Dagplanning ----------
create table planning (
  id          uuid primary key default gen_random_uuid(),
  werftaak_id uuid not null references werftaken on delete cascade,
  datum       date not null
);

create table planning_medewerkers (
  planning_id   uuid references planning on delete cascade,
  medewerker_id uuid references profiles on delete cascade,
  primary key (planning_id, medewerker_id)
);

create table starturen (
  datum         date not null,
  medewerker_id uuid not null references profiles on delete cascade,
  uur           time not null,
  primary key (datum, medewerker_id)
);

-- normale rijtijden; 'van' en 'naar' zijn een werf-id of het woord 'atelier'
create table rijtijden (
  van     text not null,
  naar    text not null,
  minuten int  not null,
  primary key (van, naar)
);

-- vrije instellingen, o.a. het adres van het atelier
create table instellingen (
  sleutel text primary key,
  waarde  jsonb not null
);

-- ---------- 5. Registraties ----------
create table events (
  id            uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references profiles on delete cascade,
  datum         date not null,
  ts            timestamptz not null default now(),
  type          text not null check (type in ('dag_start', 'vertrek', 'aankomst', 'taak_stop', 'dag_einde')),
  van           text,          -- werf-id of 'atelier'
  naar          text,
  planning_id   uuid references planning on delete set null,
  werftaak_id   uuid references werftaken on delete set null,
  afgewerkt     boolean        -- enkel bij taak_stop: true = klaar, false = later verder
);
create index on events (datum, medewerker_id);

create table rapporten (
  id            uuid primary key default gen_random_uuid(),
  planning_id   uuid references planning on delete set null,
  werftaak_id   uuid references werftaken on delete set null,
  medewerker_id uuid not null references profiles on delete cascade,
  ts            timestamptz not null default now(),
  tekst         text not null default '',
  afgewerkt     boolean not null
);

-- pad verwijst naar een bestand in de storage bucket 'werffotos'
create table rapport_fotos (
  id          uuid primary key default gen_random_uuid(),
  rapport_id  uuid not null references rapporten on delete cascade,
  pad         text not null
);

-- ============================================================
--  TOEGANGSREGELS (Row Level Security)
--  Zonder dit staat je database open. Niet overslaan.
-- ============================================================
alter table profiles             enable row level security;
alter table materialen           enable row level security;
alter table taaktypes            enable row level security;
alter table taaktype_materiaal   enable row level security;
alter table werven               enable row level security;
alter table werftaken            enable row level security;
alter table werftaak_materiaal   enable row level security;
alter table planning             enable row level security;
alter table planning_medewerkers enable row level security;
alter table starturen            enable row level security;
alter table rijtijden            enable row level security;
alter table instellingen         enable row level security;
alter table events               enable row level security;
alter table rapporten            enable row level security;
alter table rapport_fotos        enable row level security;

-- Iedereen die ingelogd is, mag alles lezen (arbeiders moeten de planning zien).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','materialen','taaktypes','taaktype_materiaal','werven','werftaken',
    'werftaak_materiaal','planning','planning_medewerkers','starturen','rijtijden',
    'instellingen','events','rapporten','rapport_fotos'
  ] loop
    execute format(
      'create policy "lezen voor ingelogde gebruikers" on %I for select to authenticated using (true);', t
    );
  end loop;
end $$;

-- Alleen het kantoor mag plannen en stamgegevens beheren.
do $$
declare t text;
begin
  foreach t in array array[
    'materialen','taaktypes','taaktype_materiaal','werven','werftaken',
    'werftaak_materiaal','planning','planning_medewerkers','starturen','rijtijden','instellingen'
  ] loop
    execute format(
      'create policy "kantoor beheert" on %I for all to authenticated using (is_kantoor()) with check (is_kantoor());', t
    );
  end loop;
end $$;

-- De werftaak-status wordt door de app aangepast als een arbeider een taak afsluit.
create policy "arbeider past status aan" on werftaken
  for update to authenticated
  using (true) with check (true);

-- Een medewerker registreert enkel voor zichzelf, en kan achteraf niets meer wijzigen.
create policy "eigen registratie schrijven" on events
  for insert to authenticated with check (medewerker_id = auth.uid());
create policy "kantoor corrigeert registraties" on events
  for update to authenticated using (is_kantoor()) with check (is_kantoor());
create policy "kantoor wist registraties" on events
  for delete to authenticated using (is_kantoor());

create policy "eigen rapport schrijven" on rapporten
  for insert to authenticated with check (medewerker_id = auth.uid());
create policy "kantoor wist rapporten" on rapporten
  for delete to authenticated using (is_kantoor());

create policy "eigen fotos koppelen" on rapport_fotos
  for insert to authenticated with check (
    exists (select 1 from rapporten r where r.id = rapport_id and r.medewerker_id = auth.uid())
  );

-- Iedereen mag zijn eigen profiel lezen; enkel kantoor beheert profielen.
create policy "kantoor beheert profielen" on profiles
  for all to authenticated using (is_kantoor()) with check (is_kantoor());

-- ============================================================
--  FOTO-OPSLAG
--  Maak in Supabase > Storage een PRIVATE bucket met naam: werffotos
--  Voer daarna dit uit:
-- ============================================================
create policy "ingelogd mag fotos zien" on storage.objects
  for select to authenticated using (bucket_id = 'werffotos');
create policy "ingelogd mag fotos uploaden" on storage.objects
  for insert to authenticated with check (bucket_id = 'werffotos');

-- ============================================================
--  STARTGEGEVENS — pas aan naar je eigen situatie
-- ============================================================
insert into instellingen (sleutel, waarde) values
  ('atelier', '{"klant": "Atelier", "adres": "Nijverheidsstraat 3, 9800 Deinze"}');

insert into materialen (naam) values
  ('Kettingzaag'), ('Bosmaaier'), ('Haagschaar'), ('Zitmaaier'),
  ('Aanhangwagen'), ('Bladblazer'), ('Kruiwagen + spades'), ('Trilplaat');

insert into taaktypes (naam, standaard_duur) values
  ('Haag scheren', 120), ('Gazon maaien', 90), ('Boom vellen', 180), ('Terras aanleggen', 960);

-- Na het aanmaken van je gebruikers in Supabase > Authentication:
--   insert into profiles (id, naam, rol) values
--     ('<uuid van Olivier>', 'Olivier', 'kantoor'),
--     ('<uuid van Aidan>',   'Aidan',   'arbeider'),
--     ('<uuid van Oliver>',  'Oliver',  'arbeider');
