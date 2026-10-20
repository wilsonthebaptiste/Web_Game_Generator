-- reveal_round and end_game (plan.md §1.2, §1.5). Scoring happens only here, on the server.
-- Same conventions as the other RPCs: security definer, empty search_path, auth.uid() checks,
-- `raise exception '<AppErrorCode>'`.
--
-- Scoring mirrors src/features/game/rules/scoring.ts and is checked against every case in
-- scoring.fixtures.json:
--   trivia         +1 when choiceId equals the answer key's correctChoiceId (exact match)
--   word-guessing  +1 when lower(trim(text)) equals the normalized target or an accepted answer;
--                  trim uses the same whitespace set as JS trim(); blank guesses never score
--   social         +1 to the voted player per vote; votes for players outside the room are
--                  ignored, and so are self-votes unless the prompt's allowSelfVote is true
-- Answers from players who are not in the room are ignored.
--
-- Never edit this file once it has been applied anywhere. Add a new migration instead.

-- ---------------------------------------------------------------------------
-- reveal_round(round_id)
-- Host only. In one transaction: locks the round, scores every answer, adds the points to
-- players.score, writes rounds.reveal_snapshot, and marks the round revealed. A second call
-- raises ROUND_ALREADY_REVEALED and changes nothing, so points are never awarded twice.
-- ---------------------------------------------------------------------------

create function public.reveal_round(round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws constant text := private.js_whitespace_class();
  v_uid uuid := auth.uid();
  v_round public.rounds;
  v_room public.rooms;
  v_me public.players;
  v_key jsonb;
  v_allow_self_vote boolean;
  v_accepted text[];
  v_results jsonb;
  v_reveal jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lock the round: a concurrent submit_answer or a second reveal waits here, then sees the
  -- round as revealed.
  select * into v_round from public.rounds r where r.id = reveal_round.round_id for update;
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
  if v_me.id <> v_room.host_player_id then
    raise exception 'NOT_HOST';
  end if;
  if v_room.expires_at <= now() then
    raise exception 'ROOM_EXPIRED';
  end if;
  if v_room.status = 'finished' then
    raise exception 'ROOM_FINISHED';
  end if;
  if v_round.status <> 'answering' then
    raise exception 'ROUND_ALREADY_REVEALED';
  end if;

  select s.answer_key into v_key from public.round_secrets s where s.round_id = v_round.id;
  v_allow_self_vote := coalesce((v_round.prompt_snapshot ->> 'allowSelfVote')::boolean, false);
  if v_round.mode = 'word-guessing' then
    select array_agg(lower(regexp_replace(a, '^' || ws || '+|' || ws || '+$', '', 'g')))
    into v_accepted
    from (
      select v_key ->> 'targetAnswer' as a
      union all
      select jsonb_array_elements_text(coalesce(v_key -> 'acceptedAnswers', '[]'::jsonb))
    ) answers
    where a is not null;
  end if;

  -- One row per player in the room, with their answer (if any) and the points they earned.
  with roster as (
    select p.id, p.joined_at
    from public.players p
    where p.room_id = v_round.room_id
  ),
  submitted as (
    select a.player_id, a.answer_payload
    from public.answers a
    join roster on roster.id = a.player_id
    where a.round_id = v_round.id
  ),
  -- Points earned by each answer (trivia and word guessing).
  answer_points as (
    select
      s.player_id,
      case
        when v_round.mode = 'trivia' then
          case when s.answer_payload ->> 'choiceId' = v_key ->> 'correctChoiceId' then 1 else 0 end
        when v_round.mode = 'word-guessing' then
          case
            when jsonb_typeof(s.answer_payload -> 'text') = 'string'
             and regexp_replace(s.answer_payload ->> 'text', '^' || ws || '+|' || ws || '+$', '', 'g') <> ''
             and lower(regexp_replace(s.answer_payload ->> 'text', '^' || ws || '+|' || ws || '+$', '', 'g'))
                 = any (coalesce(v_accepted, '{}'))
            then 1 else 0
          end
        else 0
      end as points
    from submitted s
  ),
  -- Votes received by each player (social).
  votes as (
    select (s.answer_payload ->> 'votedPlayerId') as voted, count(*)::int as received
    from submitted s
    where v_round.mode = 'social'
      and jsonb_typeof(s.answer_payload -> 'votedPlayerId') = 'string'
      and exists (select 1 from roster where roster.id::text = s.answer_payload ->> 'votedPlayerId')
      and (v_allow_self_vote or s.answer_payload ->> 'votedPlayerId' <> s.player_id::text)
    group by 1
  ),
  scored as (
    select
      roster.id as player_id,
      roster.joined_at,
      s.answer_payload as answer,
      case
        when v_round.mode = 'social' then coalesce(v.received, 0)
        else coalesce(ap.points, 0)
      end as points
    from roster
    left join submitted s on s.player_id = roster.id
    left join answer_points ap on ap.player_id = roster.id
    left join votes v on v.voted = roster.id::text
  ),
  -- Record what each answer earned (votes cast earn the voter nothing).
  mark_answers as (
    update public.answers a
    set points_awarded = case when v_round.mode = 'social' then 0 else sc.points end
    from scored sc
    where a.round_id = v_round.id and a.player_id = sc.player_id
    returning a.id
  ),
  add_scores as (
    update public.players p
    set score = p.score + sc.points
    from scored sc
    where p.id = sc.player_id and sc.points > 0
    returning p.id
  )
  select jsonb_agg(
    jsonb_build_object(
      'playerId', sc.player_id,
      'answer', sc.answer,
      'pointsAwarded', sc.points,
      'isCorrect', case when v_round.mode = 'social' then null else sc.points > 0 end
    )
    order by sc.joined_at, sc.player_id
  )
  into v_results
  from scored sc;
  -- mark_answers and add_scores run even though nothing reads them: Postgres always executes
  -- data-modifying CTEs exactly once.

  v_results := coalesce(v_results, '[]'::jsonb);
  v_reveal := case v_round.mode
    when 'trivia' then jsonb_build_object(
      'mode', 'trivia',
      'correctChoiceId', v_key ->> 'correctChoiceId',
      'results', v_results
    )
    when 'word-guessing' then jsonb_build_object(
      'mode', 'word-guessing',
      'targetAnswer', v_key ->> 'targetAnswer',
      'acceptedAnswers', coalesce(v_key -> 'acceptedAnswers', '[]'::jsonb),
      'results', v_results
    )
    else jsonb_build_object('mode', 'social', 'results', v_results)
  end;

  update public.rounds r
  set status = 'revealed',
      reveal_snapshot = v_reveal,
      revealed_at = now()
  where r.id = v_round.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- end_game(room_id)
-- Host only. Marks the room finished. Calling it again on a finished room does nothing, so a
-- double click doesn't show an error. A round that was never revealed stays unscored.
-- ---------------------------------------------------------------------------

create function public.end_game(room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_me public.players;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_room from public.rooms r where r.id = end_game.room_id for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
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
  if v_room.expires_at <= now() then
    raise exception 'ROOM_EXPIRED';
  end if;

  update public.rooms r set status = 'finished' where r.id = v_room.id and r.status <> 'finished';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.reveal_round(uuid) from public, anon;
revoke all on function public.end_game(uuid) from public, anon;
grant execute on function public.reveal_round(uuid) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
