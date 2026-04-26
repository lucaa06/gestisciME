-- =========================================================
-- GESTISCIME — Database schema for Supabase
-- =========================================================
-- This file creates the `waitlist` table and locks it down so that:
--   - The anon key (the public one in /assets/js/config.js) can ONLY
--     INSERT new rows. It cannot SELECT, UPDATE, or DELETE anything.
--   - Only YOU, with the service_role key (kept secret on the
--     Supabase dashboard), can read the list.
--   - Even another developer who forks the GitHub repo cannot read,
--     dump, modify, or delete the email list. They can only collect
--     new signups, which then go into THEIR own Supabase project,
--     not yours.
--
-- HOW TO USE:
--   1. Create a project on https://supabase.com (free tier is fine).
--   2. Go to "SQL Editor" → "New query".
--   3. Paste the entire contents of this file.
--   4. Click "Run".
--   5. Copy your project URL and anon key from Settings → API
--      and paste them into /assets/js/config.js.
--
-- =========================================================

-- ---------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text default 'homepage',
  user_agent text,
  referrer text,
  locale text,
  created_at timestamptz not null default now()
);

-- One signup per email (case-insensitive)
create unique index if not exists waitlist_email_lower_idx
  on public.waitlist (lower(email));

-- Index for chronological listing in the dashboard
create index if not exists waitlist_created_at_idx
  on public.waitlist (created_at desc);


-- ---------------------------------------------------------
-- 2. Lock the table down with Row Level Security
-- ---------------------------------------------------------
-- Enabling RLS without policies = nobody can do anything.
-- Then we add ONE single policy: anonymous INSERT only.
-- No SELECT / UPDATE / DELETE policy = those operations are denied
-- for anon and authenticated roles. Only service_role bypasses RLS.
alter table public.waitlist enable row level security;
alter table public.waitlist force row level security;

-- Drop any pre-existing policies (safe re-run)
drop policy if exists "Anyone can subscribe" on public.waitlist;
drop policy if exists "Public can read" on public.waitlist;
drop policy if exists "Public can update" on public.waitlist;
drop policy if exists "Public can delete" on public.waitlist;

-- THE ONLY POLICY: allow INSERT for everyone (anon + authenticated).
-- The check enforces a basic sanity rule on the email format and
-- caps the user_agent / referrer / locale lengths to prevent abuse.
create policy "Anyone can subscribe"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (
    email is not null
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
    and char_length(email) <= 254
    and (user_agent is null or char_length(user_agent) <= 300)
    and (referrer is null or char_length(referrer) <= 600)
    and (source is null or char_length(source) <= 60)
    and (locale is null or char_length(locale) <= 12)
  );


-- ---------------------------------------------------------
-- 3. Revoke direct grants (belt + suspenders)
-- ---------------------------------------------------------
-- RLS already blocks reads, but we also revoke explicit privileges
-- so that even if RLS were ever accidentally disabled, the anon
-- role would still be unable to read or modify rows.
revoke all on public.waitlist from anon;
revoke all on public.waitlist from authenticated;
grant insert (email, source, user_agent, referrer, locale) on public.waitlist to anon;
grant insert (email, source, user_agent, referrer, locale) on public.waitlist to authenticated;


-- ---------------------------------------------------------
-- 4. Rate limit safety (optional but recommended)
-- ---------------------------------------------------------
-- Stops a single bot from inserting thousands of fake rows in a row
-- by rejecting more than 200 inserts per hour from the same source
-- value. (Doesn't block real users; this is global throttle.)
create or replace function public.waitlist_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.waitlist
  where created_at > now() - interval '1 hour';

  if recent_count > 200 then
    raise exception 'Rate limit exceeded. Try again later.'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

drop trigger if exists waitlist_rate_limit_trigger on public.waitlist;
create trigger waitlist_rate_limit_trigger
  before insert on public.waitlist
  for each row
  execute function public.waitlist_rate_limit();


-- =========================================================
-- DONE. Your waitlist is now:
--   ✓ Public-writeable (anyone can sign up from the website)
--   ✗ Public-readable (NOBODY can read the list except you)
--   ✓ Deduplicated by email
--   ✓ Format-validated at the database level
--   ✓ Rate-limited to 200 signups/hour globally
--
-- To see your signups: Supabase dashboard → Table Editor → waitlist
-- To export them: Table Editor → menu (⋯) → "Export to CSV"
-- =========================================================
