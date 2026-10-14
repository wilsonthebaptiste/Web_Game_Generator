// Player services. Owned by Contributor A.
import { normalizeRoomCode } from '../lib/roomCodes'
import type { JoinRoomInput, RoomMembership } from '../types/game'
import { callRoomRpc } from './rooms'

/**
 * Calls `join_room`. Returns the existing player if this browser already joined (rejoin); the
 * name is ignored in that case. Send the `value` from `validateDisplayName`.
 */
export async function joinRoom({ roomCode, displayName }: JoinRoomInput): Promise<RoomMembership> {
  const data = await callRoomRpc('join_room', {
    code: normalizeRoomCode(roomCode),
    display_name: displayName,
  })
  return data as RoomMembership
}
