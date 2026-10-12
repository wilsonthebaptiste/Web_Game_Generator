-- join_room: a finished room now raises ROOM_FINISHED ("This game has ended") instead of
-- ROOM_NOT_JOINABLE ("already started"), so the UI can tell the two apart (A's review item).
-- Rejoining a finished room still works, so members can see the final screen.
-- Everything else is unchanged from 20261012231009_room_rpcs.sql. `create or replace` keeps
-- the existing grants (authenticated only).
--
-- Never edit this file once it has been applied anywhere. Add a new migration instead.

create or replace function public.join_room(code text, display_name text)
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

  if v_room.status = 'finished' then
    raise exception 'ROOM_FINISHED';
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
