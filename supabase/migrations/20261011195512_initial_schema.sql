-- Initial schema for Party Game Generator (plan.md §1.4).
--
-- Security model (plan.md §1.2):
--   * Clients get SELECT-only RLS policies. No table allows client INSERT, UPDATE, or DELETE.
--   * Every write goes through a `security definer` RPC (added in later migrations).
--   * round_secrets and content_items hold answers and are never readable by clients.
--   * Only rooms, players, and rounds are published to Realtime.
--
-- Never edit this file once it has been applied anywhere. Add a new migration instead.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Not exposed through the Data API (only `public` is), so helpers here can't be called as RPCs.
create schema if not exists private;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Must match ROOM_CODE_ALPHABET and ROOM_CODE_LENGTH in src/lib/roomCodes.ts.
  code text not null unique
    constraint rooms_code_format check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  -- FK to players is added below (players don't exist yet). Deferred so create_room can insert
  -- the room and its host player in one transaction.
  host_player_id uuid not null,
  status text not null default 'lobby'
    constraint rooms_status_check check (status in ('lobby', 'playing', 'finished')),
  selected_mode text
    constraint rooms_selected_mode_check check (selected_mode in ('trivia', 'word-guessing', 'social')),
  current_round_id uuid,
  round_limit integer not null default 10
    constraint rooms_round_limit_check check (round_limit between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  -- Mirrors validateDisplayName in src/lib/validation.ts: 1–20 code points, already trimmed and
  -- NFC-normalized, no control characters or line/paragraph separators.
  display_name text not null
    constraint players_display_name_length check (char_length(display_name) between 1 and 20)
    constraint players_display_name_trimmed check (display_name = btrim(display_name))
    constraint players_display_name_nfc check (display_name is nfc normalized)
    constraint players_display_name_chars check (
      display_name !~ '[\u0001-\u001f\u007f-\u009f  ]'
    ),
  score integer not null default 0
    constraint players_score_check check (score >= 0),
  joined_at timestamptz not null default now(),
  -- One player per browser identity per room. Also serves as the index on room_id.
  constraint players_room_auth_user_key unique (room_id, auth_user_id)
);

-- Names are unique per room, ignoring case.
create unique index players_room_name_key on public.players (room_id, lower(display_name));

alter table public.rooms
  add constraint rooms_host_player_id_fkey foreign key (host_player_id)
    references public.players (id) deferrable initially deferred;

-- Content bank, written only by `npm run content:sync` migrations. No client access.
create table public.content_items (
  id text primary key,
  mode text not null
    constraint content_items_mode_check check (mode in ('trivia', 'word-guessing', 'social')),
  public_payload jsonb not null,
  answer_key jsonb not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round_number integer not null
    constraint rounds_round_number_check check (round_number >= 1),
  mode text not null
    constraint rounds_mode_check check (mode in ('trivia', 'word-guessing', 'social')),
  content_id text not null references public.content_items (id),
  status text not null default 'answering'
    constraint rounds_status_check check (status in ('answering', 'revealed')),
  -- Public prompt only (PromptSnapshot). Never contains the answer.
  prompt_snapshot jsonb not null,
  -- RevealSnapshot, written once by reveal_round.
  reveal_snapshot jsonb,
  submission_count integer not null default 0
    constraint rounds_submission_count_check check (submission_count >= 0),
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  -- Also serves as the index on room_id.
  constraint rounds_room_round_number_key unique (room_id, round_number),
  -- A round is revealed exactly when it has a reveal snapshot and a reveal time.
  constraint rounds_reveal_consistency check (
    (status = 'revealed') = (reveal_snapshot is not null and revealed_at is not null)
  )
);

alter table public.rooms
  add constraint rooms_current_round_id_fkey foreign key (current_round_id)
    references public.rounds (id) on delete set null;

-- Answer keys for active rounds, copied from content_items by start_round. No client access.
create table public.round_secrets (
  round_id uuid primary key references public.rounds (id) on delete cascade,
  answer_key jsonb not null
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  answer_payload jsonb not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  points_awarded integer not null default 0
    constraint answers_points_awarded_check check (points_awarded >= 0),
  -- One answer per player per round. Also serves as the index on round_id.
  constraint answers_round_player_key unique (round_id, player_id)
);

-- Supports the cascade from players and "my answers" lookups.
create index answers_player_id_idx on public.answers (player_id);
-- Membership checks in RLS look players up by auth user.
create index players_auth_user_id_idx on public.players (auth_user_id);
-- Lets start_round find content not yet used in a room.
create index rounds_content_id_idx on public.rounds (content_id);

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function private.set_updated_at();

create trigger answers_set_updated_at
  before update on public.answers
  for each row execute function private.set_updated_at();

create trigger content_items_set_updated_at
  before update on public.content_items
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges: clients may only read. Revoke Supabase's default grants so a missing RLS policy
-- can never turn into a client write.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant select on public.rooms, public.players, public.rounds, public.answers to authenticated;
-- content_items and round_secrets: no grants at all.

-- Tables created by later migrations also start with no client privileges.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;
alter table public.content_items enable row level security;
alter table public.round_secrets enable row level security;

-- True when the caller has a player row in the room. Security definer so the players policy
-- can use it without recursing into itself.
create function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players
    where room_id = p_room_id
      and auth_user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_member(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;

create policy "Members can read their rooms"
  on public.rooms for select
  to authenticated
  using (private.is_room_member(id));

create policy "Members can read players in their rooms"
  on public.players for select
  to authenticated
  using (private.is_room_member(room_id));

create policy "Members can read rounds in their rooms"
  on public.rounds for select
  to authenticated
  using (private.is_room_member(room_id));

create policy "Players can read their own answers"
  on public.answers for select
  to authenticated
  using (
    player_id in (
      select id from public.players where auth_user_id = (select auth.uid())
    )
  );

-- content_items and round_secrets: RLS on, no policies, no grants. Only security definer RPCs
-- can read them.

-- ---------------------------------------------------------------------------
-- Realtime: notifications only (clients refetch the snapshot). answers and round_secrets are
-- never published.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.rooms, public.players, public.rounds;
