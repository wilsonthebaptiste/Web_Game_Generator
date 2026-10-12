-- Round RPCs (plan.md §1.2): start_round and submit_answer.
-- Same conventions as the room RPCs: security definer, empty search_path, auth.uid() checks,
-- `raise exception '<AppErrorCode>'`, camelCase jsonb results.
--
-- Never edit this file once it has been applied anywhere. Add a new migration instead.

-- ---------------------------------------------------------------------------
-- start_round(room_id, mode) → Round
-- Host only. Picks a random active content item for the mode that this room hasn't used yet,
-- snapshots its public prompt into the round, and hides its answer key in round_secrets.
-- ---------------------------------------------------------------------------

create function public.start_round(room_id uuid, mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_me public.players;
  v_current public.rounds;
  v_round_count int;
  v_content public.content_items;
  v_round public.rounds;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lock the room so two clicks on Start can't create two rounds.
  select * into v_room from public.rooms r where r.id = start_round.room_id for update;
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
  if v_me.id <> v_room.host_player_id then
    raise exception 'NOT_HOST';
  end if;
  if v_room.status = 'finished' then
    raise exception 'ROOM_FINISHED';
  end if;
  if start_round.mode is null or start_round.mode not in ('trivia', 'word-guessing', 'social') then
    raise exception 'INVALID_MODE';
  end if;
  if (select count(*) from public.players p where p.room_id = v_room.id) < 2 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  if v_room.current_round_id is not null then
    select * into v_current from public.rounds r where r.id = v_room.current_round_id;
    if v_current.status = 'answering' then
      raise exception 'ROUND_IN_PROGRESS';
    end if;
  end if;

  select count(*) into v_round_count from public.rounds r where r.room_id = v_room.id;
  if v_round_count >= v_room.round_limit then
    raise exception 'ROUND_LIMIT_REACHED';
  end if;

  select * into v_content
  from public.content_items c
  where c.mode = start_round.mode
    and c.active
    and not exists (
      select 1 from public.rounds r where r.room_id = v_room.id and r.content_id = c.id
    )
  order by random()
  limit 1;
  if not found then
    raise exception 'NO_CONTENT_AVAILABLE';
  end if;

  insert into public.rounds (room_id, round_number, mode, content_id, prompt_snapshot)
  values (v_room.id, v_round_count + 1, start_round.mode, v_content.id, v_content.public_payload)
  returning * into v_round;

  insert into public.round_secrets (round_id, answer_key)
  values (v_round.id, v_content.answer_key);

  update public.rooms r
  set status = 'playing',
      selected_mode = start_round.mode,
      current_round_id = v_round.id
  where r.id = v_room.id;

  return private.round_json(v_round);
end;
$$;

-- ---------------------------------------------------------------------------
-- Answer validation. Mirrors validateAnswerPayload in
-- src/features/game/rules/validatePayload.ts and returns the cleaned payload to store.
-- ---------------------------------------------------------------------------

create function private.clean_answer_payload(
  p_round public.rounds,
  p_player_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  ws constant text := private.js_whitespace_class();
  v_value jsonb;
  v_text text;
  v_voted text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_ANSWER';
  end if;

  if p_round.mode = 'trivia' then
    v_value := p_payload -> 'choiceId';
    if v_value is null or jsonb_typeof(v_value) <> 'string' then
      raise exception 'INVALID_ANSWER';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(p_round.prompt_snapshot -> 'choices') choice
      where choice ->> 'id' = v_value #>> '{}'
    ) then
      raise exception 'INVALID_ANSWER';
    end if;
    return jsonb_build_object('choiceId', v_value #>> '{}');

  elsif p_round.mode = 'word-guessing' then
    v_value := p_payload -> 'text';
    if v_value is null or jsonb_typeof(v_value) <> 'string' then
      raise exception 'INVALID_ANSWER';
    end if;
    v_text := regexp_replace(v_value #>> '{}', '^' || ws || '+|' || ws || '+$', '', 'g');
    if char_length(v_text) not between 1 and 60 then
      raise exception 'INVALID_ANSWER';
    end if;
    return jsonb_build_object('text', v_text);

  elsif p_round.mode = 'social' then
    v_value := p_payload -> 'votedPlayerId';
    if v_value is null or jsonb_typeof(v_value) <> 'string' then
      raise exception 'INVALID_ANSWER';
    end if;
    v_voted := v_value #>> '{}';
    -- Compare as text so a malformed id is a validation error, not a cast error.
    if not exists (
      select 1 from public.players p where p.room_id = p_round.room_id and p.id::text = v_voted
    ) then
      raise exception 'INVALID_ANSWER';
    end if;
    if v_voted = p_player_id::text
       and not coalesce((p_round.prompt_snapshot ->> 'allowSelfVote')::boolean, false) then
      raise exception 'SELF_VOTE_NOT_ALLOWED';
    end if;
    return jsonb_build_object('votedPlayerId', v_voted);
  end if;

  raise exception 'INVALID_MODE';
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_answer(round_id, payload)
-- Inserts or replaces the caller's answer while the round is answering, then updates the
-- public submission count. Other players' answers are never readable by clients.
-- ---------------------------------------------------------------------------

create function public.submit_answer(round_id uuid, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_round public.rounds;
  v_room public.rooms;
  v_me public.players;
  v_clean jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lock the round so an answer can't slip in while reveal_round is scoring it.
  select * into v_round from public.rounds r where r.id = submit_answer.round_id for update;
  if not found then
    raise exception 'ROUND_NOT_FOUND';
  end if;

  select * into v_room from public.rooms r where r.id = v_round.room_id;
  select * into v_me
  from public.players p
  where p.room_id = v_round.room_id and p.auth_user_id = v_uid;
  if not found then
    raise exception 'NOT_A_MEMBER';
  end if;
  if v_room.expires_at <= now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status = 'finished' then
    raise exception 'ROOM_FINISHED';
  end if;
  if v_round.status <> 'answering' then
    raise exception 'ROUND_NOT_ANSWERING';
  end if;

  v_clean := private.clean_answer_payload(v_round, v_me.id, submit_answer.payload);

  insert into public.answers (round_id, player_id, answer_payload)
  values (v_round.id, v_me.id, v_clean)
  -- Named constraint, because a column list here would clash with the round_id parameter.
  on conflict on constraint answers_round_player_key do update
    set answer_payload = excluded.answer_payload;

  update public.rounds r
  set submission_count = (select count(*) from public.answers a where a.round_id = v_round.id)
  where r.id = v_round.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function private.clean_answer_payload(public.rounds, uuid, jsonb)
  from public, anon, authenticated;

revoke all on function public.start_round(uuid, text) from public, anon;
revoke all on function public.submit_answer(uuid, jsonb) from public, anon;
grant execute on function public.start_round(uuid, text) to authenticated;
grant execute on function public.submit_answer(uuid, jsonb) to authenticated;
