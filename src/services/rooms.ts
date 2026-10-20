// Room services. Owned by Contributor A. RPCs are defined in
// supabase/migrations/*_room_rpcs.sql; their results are already camelCase contract shapes.
import { toAppError } from '../lib/errors'
import { normalizeRoomCode } from '../lib/roomCodes'
import { ensureAnonymousSession, getSupabase } from '../lib/supabaseClient'
import type { Database } from '../types/database'
import type { CreateRoomInput, RoomMembership, RoomSnapshot } from '../types/game'

type RoomRpcs = Pick<
  Database['public']['Functions'],
  'create_room' | 'join_room' | 'get_room_snapshot' | 'end_game'
>

/**
 * Calls a room RPC as this browser's anonymous user. Every failure, including sign-in and
 * network errors, is rethrown as an AppError with a friendly message.
 * Shared with `players.ts`; not for use outside the room services.
 */
export async function callRoomRpc<Fn extends keyof RoomRpcs>(
  fn: Fn,
  args: RoomRpcs[Fn]['Args'],
): Promise<unknown> {
  try {
    await ensureAnonymousSession()
    const { data, error, status } = await getSupabase().rpc(fn, args)
    if (error) throw toAppError(error, status)
    return data
  } catch (error) {
    throw toAppError(error)
  }
}

/** Calls `create_room`. The caller becomes the host. Send the `value` from `validateDisplayName`. */
export async function createRoom({ displayName }: CreateRoomInput): Promise<RoomMembership> {
  const data = await callRoomRpc('create_room', { display_name: displayName })
  return data as RoomMembership
}

/** Calls `get_room_snapshot`. Members only; non-members get `NOT_A_MEMBER`. */
export async function getRoomSnapshot(code: string): Promise<RoomSnapshot> {
  const data = await callRoomRpc('get_room_snapshot', { code: normalizeRoomCode(code) })
  return data as RoomSnapshot
}

// realtime-js reuses a channel when the topic is already open, and a subscribed channel can't
// take new listeners, so every subscription gets its own topic.
let subscriptionCount = 0

/**
 * Subscribes to realtime changes on this room's `rooms` and `players` rows.
 * `onChange` is only a notification; the caller refetches the snapshot.
 * `onChange` also fires each time the channel (re)connects, so changes made while it was
 * connecting or offline are never missed.
 * Returns an unsubscribe function.
 */
export function subscribeToRoom(roomId: string, onChange: () => void): () => void {
  const supabase = getSupabase()
  subscriptionCount += 1
  const channel = supabase
    .channel(`room:${roomId}:${subscriptionCount}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange()
    })

  let active = true
  return () => {
    if (!active) return
    active = false
    void supabase.removeChannel(channel)
  }
}

/** Calls `end_game`. Host only. Sets the room to `finished`. */
export async function endGame(roomId: string): Promise<void> {
  await callRoomRpc('end_game', { room_id: roomId })
}
