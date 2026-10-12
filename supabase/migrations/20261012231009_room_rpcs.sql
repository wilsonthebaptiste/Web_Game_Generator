-- Room RPCs (plan.md §1.2): create_room, join_room, get_room_snapshot.
--
-- Every RPC is `security definer` with an empty search_path, checks auth.uid(), and signals
-- expected failures with `raise exception '<AppErrorCode>'` (see src/lib/errors.ts).
-- Results are jsonb in the camelCase shapes of src/types/game.ts, so services return them as-is.
--
-- Never edit this file once it has been applied anywhere. Add a new migration instead.

-- ---------------------------------------------------------------------------
-- Input cleaning. Mirrors src/lib/validation.ts and src/lib/roomCodes.ts.
-- ---------------------------------------------------------------------------

-- The characters JavaScript's String.prototype.trim() and \s treat as whitespace.
-- Postgres's own \s and btrim() only cover ASCII, so the set is spelled out.
create function private.js_whitespace_class()
returns text
language sql
immutable
set search_path = ''
as $$
  select '[\u0009-\u000d    -     　﻿]'
$$;

-- validateDisplayName: NFC-normalize, then trim. Returns null if the result is not a valid name.
create function private.clean_display_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  ws constant text := private.js_whitespace_class();
  v_name text;
begin
  if p_name is null then
    return null;
  end if;
  v_name := regexp_replace(normalize(p_name, nfc), '^' || ws || '+|' || ws || '+$', '', 'g');
  if char_length(v_name) not between 1 and 20
     or v_name ~ '[\u0001-\u001f\u007f-\u009f  ]' then
    return null;
  end if;
  return v_name;
end;
$$;

-- normalizeRoomCode + isValidRoomCode: strip whitespace and dashes, uppercase, check the format.
-- Returns null if the result is not a valid code.
create function private.clean_room_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_code is null then
    return null;
  end if;
  v_code := upper(regexp_replace(p_code, private.js_whitespace_class() || '|-', '', 'g'));
  if v_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$' then
    return null;
  end if;
  return v_code;
end;
$$;

-- A random code from ROOM_CODE_ALPHABET. Uses gen_random_uuid() as a source of strong random
-- bytes, skipping the UUID version/variant bytes and bytes >= 248 to avoid modulo bias.
create function private.generate_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_bytes bytea;
  v_byte int;
begin
  while char_length(v_code) < 5 loop
    v_bytes := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      continue when i in (6, 8);
      v_byte := get_byte(v_bytes, i);
      continue when v_byte >= 248;
      v_code := v_code || substr(alphabet, 1 + v_byte % 31, 1);
      exit when char_length(v_code) = 5;
    end loop;
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- JSON shapes (src/types/game.ts)
-- ---------------------------------------------------------------------------

create function private.room_json(r public.rooms)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'hostPlayerId', r.host_player_id,
    'status', r.status,
    'selectedMode', r.selected_mode,
    'currentRoundId', r.current_round_id,
    'roundLimit', r.round_limit,
    'createdAt', r.created_at,
    'expiresAt', r.expires_at
  )
$$;

create function private.player_json(p public.players)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'roomId', p.room_id,
    'displayName', p.display_name,
    'score', p.score,
    'joinedAt', p.joined_at
  )
$$;

-- Never includes round_secrets. reveal_snapshot is null until reveal_round writes it.
create function private.round_json(r public.rounds)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'roomId', r.room_id,
    'roundNumber', r.round_number,
    'mode', r.mode,
    'status', r.status,
    'promptSnapshot', r.prompt_snapshot,
    'revealSnapshot', r.reveal_snapshot,
    'submissionCount', r.submission_count,
    'createdAt', r.created_at,
    'revealedAt', r.revealed_at
  )
$$;

-- ---------------------------------------------------------------------------
-- Rate limits. Counted from the rows each action creates, so no extra table is needed.
-- A raised exception rolls back the whole call, so failed attempts can't be counted here.
-- ---------------------------------------------------------------------------

create function private.require_under_limit(p_action text, p_uid uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_action = 'create_room' then
    -- plan: no more than 5 rooms per auth.uid() per hour.
    select count(*) into v_count
    from public.rooms r
    join public.players p on p.id = r.host_player_id
    where p.auth_user_id = p_uid
      and r.created_at > now() - interval '1 hour';
    if v_count >= 5 then
      raise exception 'RATE_LIMITED';
    end if;
  elsif p_action = 'join_room' then
    -- At most 20 new rooms joined per auth.uid() per hour. Rejoining doesn't count.
    select count(*) into v_count
    from public.players
    where auth_user_id = p_uid
      and joined_at > now() - interval '1 hour';
    if v_count >= 20 then
      raise exception 'RATE_LIMITED';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_room(display_name) → RoomMembership
-- ---------------------------------------------------------------------------

create function public.create_room(display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_player_id uuid := gen_random_uuid();
  v_room public.rooms;
  v_player public.players;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_name := private.clean_display_name(display_name);
  if v_name is null then
    raise exception 'NAME_INVALID';
  end if;

  perform private.require_under_limit('create_room', v_uid);

  -- Retry on the (rare) code collision. 31^5 ≈ 28.6 million codes.
  for attempt in 1..10 loop
    begin
      insert into public.rooms (code, host_player_id)
      values (private.generate_room_code(), v_player_id)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if attempt = 10 then
        raise exception 'CODE_GENERATION_FAILED';
      end if;
    end;
  end loop;

  insert into public.players (id, room_id, auth_user_id, display_name)
  values (v_player_id, v_room.id, v_uid, v_name)
  returning * into v_player;

  return jsonb_build_object(
    'room', private.room_json(v_room),
    'player', private.player_json(v_player)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- join_room(code, display_name) → RoomMembership
-- A browser that already joined gets its existing player back (rejoin), even after the game
-- has started. The display_name argument is ignored on rejoin.
-- ---------------------------------------------------------------------------

create function public.join_room(code text, display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_name text;
  v_room public.rooms;
  v_player public.players;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_code := private.clean_room_code(code);
  if v_code is null then
    raise exception 'INVALID_ROOM_CODE';
  end if;

  select * into v_room from public.rooms r where r.code = v_code;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.expires_at <= now() then
    raise exception 'ROOM_EXPIRED';
  end if;

  select * into v_player
  from public.players p
  where p.room_id = v_room.id and p.auth_user_id = v_uid;
  if found then
    return jsonb_build_object(
      'room', private.room_json(v_room),
      'player', private.player_json(v_player)
    );
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'ROOM_NOT_JOINABLE';
  end if;

  v_name := private.clean_display_name(display_name);
  if v_name is null then
    raise exception 'NAME_INVALID';
  end if;

  perform private.require_under_limit('join_room', v_uid);

  begin
    insert into public.players (room_id, auth_user_id, display_name)
    values (v_room.id, v_uid, v_name)
    returning * into v_player;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'players_room_name_key' then
      raise exception 'NAME_TAKEN';
    end if;
    -- Two join requests from the same browser raced; return the row the other one created.
    select * into v_player
    from public.players p
    where p.room_id = v_room.id and p.auth_user_id = v_uid;
  end;

  return jsonb_build_object(
    'room', private.room_json(v_room),
    'player', private.player_json(v_player)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_room_snapshot(code) → RoomSnapshot
-- Members only: non-members get NOT_A_MEMBER (RoomPage sends them to /join/:code), so a room's
-- players are never visible to someone who hasn't joined.
-- ---------------------------------------------------------------------------

create function public.get_room_snapshot(code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_room public.rooms;
  v_me public.players;
  v_round public.rounds;
  v_my_answer jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_code := private.clean_room_code(code);
  if v_code is null then
    raise exception 'INVALID_ROOM_CODE';
  end if;

  select * into v_room from public.rooms r where r.code = v_code;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.expires_at <= now() then
    raise exception 'ROOM_EXPIRED';
  end if;

  select * into v_me
  from public.players p
  where p.room_id = v_room.id and p.auth_user_id = v_uid;
  if not found then
    raise exception 'NOT_A_MEMBER';
  end if;

  if v_room.current_round_id is not null then
    select * into v_round from public.rounds r where r.id = v_room.current_round_id;
    select a.answer_payload into v_my_answer
    from public.answers a
    where a.round_id = v_round.id and a.player_id = v_me.id;
  end if;

  return jsonb_build_object(
    'room', private.room_json(v_room),
    'players', coalesce(
      (select jsonb_agg(private.player_json(p) order by p.joined_at, p.id)
       from public.players p
       where p.room_id = v_room.id),
      '[]'::jsonb
    ),
    'currentRound', case when v_round.id is null then null else private.round_json(v_round) end,
    'me', private.player_json(v_me),
    'myAnswer', v_my_answer
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Postgres grants EXECUTE to PUBLIC on new functions, and Supabase also grants it
-- to anon and authenticated, so revoke and grant explicitly.
-- ---------------------------------------------------------------------------

revoke all on function private.js_whitespace_class() from public, anon, authenticated;
revoke all on function private.clean_display_name(text) from public, anon, authenticated;
revoke all on function private.clean_room_code(text) from public, anon, authenticated;
revoke all on function private.generate_room_code() from public, anon, authenticated;
revoke all on function private.room_json(public.rooms) from public, anon, authenticated;
revoke all on function private.player_json(public.players) from public, anon, authenticated;
revoke all on function private.round_json(public.rounds) from public, anon, authenticated;
revoke all on function private.require_under_limit(text, uuid) from public, anon, authenticated;

revoke all on function public.create_room(text) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.get_room_snapshot(text) from public, anon;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.get_room_snapshot(text) to authenticated;
