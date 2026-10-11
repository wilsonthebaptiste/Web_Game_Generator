// STUB from chore/scaffold. Ownership passes to Contributor A once the scaffold merges.
// Implement against the RPCs in plan.md §1.2. Keep these signatures; changing them is a
// contract change (plan.md §9 rule 1).
import type { CreateRoomInput, RoomMembership, RoomSnapshot } from '../types/game'

/** Calls `create_room`. The caller becomes the host. */
export async function createRoom(_input: CreateRoomInput): Promise<RoomMembership> {
  throw new Error('not implemented')
}

/** Calls `get_room_snapshot`. Members only. */
export async function getRoomSnapshot(_code: string): Promise<RoomSnapshot> {
  throw new Error('not implemented')
}

/**
 * Subscribes to realtime changes on this room's `rooms` and `players` rows.
 * `onChange` is only a notification; the caller refetches the snapshot.
 * Returns an unsubscribe function.
 */
export function subscribeToRoom(_roomId: string, _onChange: () => void): () => void {
  throw new Error('not implemented')
}

/** Calls `end_game`. Host only. */
export async function endGame(_roomId: string): Promise<void> {
  throw new Error('not implemented')
}
