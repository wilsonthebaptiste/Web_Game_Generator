// STUB from chore/scaffold. Ownership passes to Contributor A once the scaffold merges.
// Implement against the RPCs in plan.md §1.2. Keep these signatures; changing them is a
// contract change (plan.md §9 rule 1).
import type { JoinRoomInput, RoomMembership } from '../types/game'

/** Calls `join_room`. Returns the existing player if this browser already joined (rejoin). */
export async function joinRoom(_input: JoinRoomInput): Promise<RoomMembership> {
  throw new Error('not implemented')
}
