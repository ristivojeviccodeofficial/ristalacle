-- =====================================================================
-- La Clé — Supabase šema
-- Nalepi ceo fajl u Supabase → SQL Editor → Run (jednom).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- PROFILI (nalozi) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Automatski napravi profil kad se neko registruje
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Da li je trenutni korisnik admin (security definer da RLS ne ulazi u petlju)
create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ---------- DESTINACIJE ----------
create table if not exists public.destinations (
  slug       text primary key,
  name       text not null,
  emoji      text not null default '🏝️',
  sort       int  not null default 0,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.destinations (slug, name, emoji, sort) values
  ('mykonos',    'Mykonos',    '🏝️', 1),
  ('croatia',    'Croatia',    '⛵',  2),
  ('montenegro', 'Montenegro', '⛰️', 3)
on conflict (slug) do nothing;

-- ---------- VILE ----------
create table if not exists public.villas (
  id          uuid primary key default gen_random_uuid(),
  destination text not null references public.destinations(slug)
                on update cascade on delete restrict,
  name        text not null,
  location    text,
  description text,
  price_note  text,
  images      text[] not null default '{}',
  sort        int  not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- UPITI (rent / inquire) ----------
create table if not exists public.inquiries (
  id         uuid primary key default gen_random_uuid(),
  villa_id   uuid references public.villas(id) on delete set null,
  villa_name text,
  user_id    uuid references public.profiles(id) on delete set null,
  name       text not null check (char_length(name)  between 1 and 120),
  email      text not null check (char_length(email) between 3 and 200),
  phone      text check (char_length(phone) <= 60),
  check_in   date,
  check_out  date,
  guests     int check (guests is null or guests between 1 and 100),
  message    text check (char_length(message) <= 4000),
  status     text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);

-- ---------- CHAT ----------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  from_admin      boolean not null default false,
  body            text not null check (char_length(body) between 1 and 2000),
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages
  for each row execute function public.touch_conversation();

-- =====================================================================
-- BEZBEDNOST (Row Level Security) — ovo je ono što štiti podatke.
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.destinations  enable row level security;
alter table public.villas        enable row level security;
alter table public.inquiries     enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_user_is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- korisnik sme da menja samo ime i telefon (nikad is_admin)
revoke update on public.profiles from anon, authenticated;
grant  update (full_name, phone) on public.profiles to authenticated;

-- destinations
drop policy if exists dest_read on public.destinations;
create policy dest_read on public.destinations for select
  using (published or public.current_user_is_admin());
drop policy if exists dest_admin_ins on public.destinations;
create policy dest_admin_ins on public.destinations for insert to authenticated
  with check (public.current_user_is_admin());
drop policy if exists dest_admin_upd on public.destinations;
create policy dest_admin_upd on public.destinations for update to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());
drop policy if exists dest_admin_del on public.destinations;
create policy dest_admin_del on public.destinations for delete to authenticated
  using (public.current_user_is_admin());

-- villas
drop policy if exists villas_read on public.villas;
create policy villas_read on public.villas for select
  using (published or public.current_user_is_admin());
drop policy if exists villas_admin_ins on public.villas;
create policy villas_admin_ins on public.villas for insert to authenticated
  with check (public.current_user_is_admin());
drop policy if exists villas_admin_upd on public.villas;
create policy villas_admin_upd on public.villas for update to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());
drop policy if exists villas_admin_del on public.villas;
create policy villas_admin_del on public.villas for delete to authenticated
  using (public.current_user_is_admin());

-- inquiries: svako može da pošalje upit, samo vlasnik i admin ga čitaju
drop policy if exists inq_insert on public.inquiries;
create policy inq_insert on public.inquiries for insert to anon, authenticated
  with check (status = 'new' and (user_id is null or user_id = auth.uid()));
drop policy if exists inq_select on public.inquiries;
create policy inq_select on public.inquiries for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
drop policy if exists inq_admin_upd on public.inquiries;
create policy inq_admin_upd on public.inquiries for update to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());
drop policy if exists inq_admin_del on public.inquiries;
create policy inq_admin_del on public.inquiries for delete to authenticated
  using (public.current_user_is_admin());

-- conversations
drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());
drop policy if exists conv_insert on public.conversations;
create policy conv_insert on public.conversations for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists conv_admin_del on public.conversations;
create policy conv_admin_del on public.conversations for delete to authenticated
  using (public.current_user_is_admin());

-- messages
drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages for select to authenticated
  using (
    public.current_user_is_admin()
    or exists (select 1 from public.conversations c
               where c.id = conversation_id and c.user_id = auth.uid())
  );
drop policy if exists msg_insert_user on public.messages;
create policy msg_insert_user on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and from_admin = false
    and exists (select 1 from public.conversations c
                where c.id = conversation_id and c.user_id = auth.uid())
  );
drop policy if exists msg_insert_admin on public.messages;
create policy msg_insert_admin on public.messages for insert to authenticated
  with check (public.current_user_is_admin() and from_admin = true and sender_id = auth.uid());
drop policy if exists msg_update_read on public.messages;
create policy msg_update_read on public.messages for update to authenticated
  using (
    public.current_user_is_admin()
    or exists (select 1 from public.conversations c
               where c.id = conversation_id and c.user_id = auth.uid())
  ) with check (true);
-- može se menjati samo is_read
revoke update on public.messages from anon, authenticated;
grant  update (is_read) on public.messages to authenticated;

-- =====================================================================
-- STORAGE: slike vila (javno čitanje, upload samo admin)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('villa-images', 'villa-images', true)
on conflict (id) do nothing;

drop policy if exists villa_img_read on storage.objects;
create policy villa_img_read on storage.objects for select
  using (bucket_id = 'villa-images');
drop policy if exists villa_img_ins on storage.objects;
create policy villa_img_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'villa-images' and public.current_user_is_admin());
drop policy if exists villa_img_upd on storage.objects;
create policy villa_img_upd on storage.objects for update to authenticated
  using (bucket_id = 'villa-images' and public.current_user_is_admin());
drop policy if exists villa_img_del on storage.objects;
create policy villa_img_del on storage.objects for delete to authenticated
  using (bucket_id = 'villa-images' and public.current_user_is_admin());

-- =====================================================================
-- REALTIME (chat i obaveštenja o novim upitima)
-- Ako dobiješ grešku "already member of publication", slobodno je ignoriši.
-- =====================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.inquiries;

-- =====================================================================
-- KAKO POSTATI ADMIN
-- 1) Registruj se na sajtu (Sign in → Create account).
-- 2) Pokreni ovo sa SVOJIM mejlom:
--
--   update public.profiles set is_admin = true where email = 'tvoj@mejl.com';
-- =====================================================================
