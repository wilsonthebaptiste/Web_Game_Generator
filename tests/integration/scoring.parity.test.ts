// Runs every case in B's scoring.fixtures.json through the real reveal_round (plan.md Phase 3).
// LOCAL SUPABASE ONLY (`npx supabase start`, needs Docker): rows are inserted directly with the
// local service-role key, because some cases (self-votes, votes from outside the room) are
// answers submit_answer would reject. reveal_round must ignore them anyway.
// Against `dev` this file is skipped; reveal-rpcs.test.ts covers player-level behavior there.
import { randomUUID } from 'node:crypto'
import fixtures from '../../src/features/game/rules/scoring.fixtures.json'
import type { Json } from '../../src/types/database'
import type { RevealSnapshot, RoomMembership } from '../../src/types/game'
import { adminClient, isLocalStack, newBrowser, type TestClient } from './helpers'

interface FixtureCase {
  name: string
  mode: 'trivia' | 'word-guessing' | 'social'
  players: string[]
  answerKey: Record<string, unknown>
  answers: { playerId: string; payload: Record<string, unknown> }[]
  expected: Record<string, number>
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = () =>
  Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

describe.skipIf(!isLocalStack())('scoring parity with scoring.fixtures.json', () => {
  let admin: TestClient
  let host: TestClient
  let hostUserId: string
  // Players other than the host don't need sessions, only auth users to point at.
  const otherUserIds: string[] = []
  let strangerPlayerId: string
  let bootstrapHostId: string

  /** Awaits a query, throwing on error or missing data. */
  async function must<T>(call: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
    const { data, error } = await call
    if (error) throw error
    if (data === null || data === undefined) throw new Error('Query returned no data')
    return data
  }

  /** Awaits a write that returns no rows, throwing on error. */
  async function ok(call: PromiseLike<{ error: unknown }>): Promise<void> {
    const { error } = await call
    if (error) throw error
  }

  /**
   * A room with the host and the given number of other players, inserted directly. Each insert is
   * its own transaction here, so the deferred rooms -> players FK can't help: the room starts out
   * pointing at the bootstrap room's host and is repointed once its own host exists.
   */
  async function insertRoom(otherPlayers: number) {
    const roomId = randomUUID()
    await ok(
      admin.from('rooms').insert({
        id: roomId,
        code: randomCode(),
        host_player_id: bootstrapHostId,
        status: 'playing',
      }),
    )
    const players = [
      { id: randomUUID(), auth_user_id: hostUserId },
      ...otherUserIds.slice(0, otherPlayers).map((auth_user_id) => ({
        id: randomUUID(),
        auth_user_id,
      })),
    ]
    for (const [i, p] of players.entries()) {
      // Stagger join times so results come back in a known order.
      const joined_at = new Date(Date.now() + i).toISOString()
      await ok(
        admin.from('players').insert({ ...p, room_id: roomId, display_name: `P${i}`, joined_at }),
      )
    }
    await ok(admin.from('rooms').update({ host_player_id: players[0].id }).eq('id', roomId))
    return { roomId, playerIds: players.map((p) => p.id) }
  }

  beforeAll(async () => {
    admin = adminClient()
    host = await newBrowser()
    hostUserId = (await host.auth.getUser()).data.user!.id
    const most = Math.max(...(fixtures.cases as FixtureCase[]).map((c) => c.players.length))
    for (let i = 0; i < most; i++) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `parity-${randomUUID()}@example.test`,
        email_confirm: true,
      })
      if (error) throw error
      otherUserIds.push(data.user.id)
    }
    // One room made the normal way. Its host anchors the inserted rooms (see insertRoom), and its
    // second player is the fixtures' "stranger": a real player, but in a different room.
    const { data, error } = await host.rpc('create_room', { display_name: 'Bootstrap' })
    if (error) throw error
    const bootstrap = data as unknown as RoomMembership
    bootstrapHostId = bootstrap.player.id
    strangerPlayerId = randomUUID()
    await ok(
      admin.from('players').insert({
        id: strangerPlayerId,
        room_id: bootstrap.room.id,
        auth_user_id: otherUserIds[0],
        display_name: 'Stranger',
      }),
    )
  })

  it.each((fixtures.cases as FixtureCase[]).map((c) => [c.name, c] as const))(
    '%s',
    async (_name, fixture) => {
      const { roomId, playerIds } = await insertRoom(fixture.players.length - 1)
      const ids: Record<string, string> = { stranger: strangerPlayerId }
      fixture.players.forEach((ref, i) => (ids[ref] = playerIds[i]))

      const prompt =
        fixture.mode === 'social'
          ? {
              mode: 'social',
              prompt: 'Q',
              responseType: 'vote-for-player',
              allowSelfVote: fixture.answerKey.allowSelfVote ?? false,
            }
          : {
              mode: fixture.mode,
              prompt: 'Q',
              ...(fixture.mode === 'trivia' ? { choices: [] } : {}),
            }
      const content = await must(
        admin.from('content_items').select('id').eq('mode', fixture.mode).limit(1).single(),
      )
      const round = await must(
        admin
          .from('rounds')
          .insert({
            room_id: roomId,
            round_number: 1,
            mode: fixture.mode,
            content_id: content.id,
            prompt_snapshot: prompt as Json,
          })
          .select('id')
          .single(),
      )
      await ok(
        admin.from('round_secrets').insert({
          round_id: round.id,
          answer_key: (fixture.mode === 'social' ? {} : fixture.answerKey) as Json,
        }),
      )
      await ok(admin.from('rooms').update({ current_round_id: round.id }).eq('id', roomId))
      for (const answer of fixture.answers) {
        const payload = { ...answer.payload }
        if (typeof payload.votedPlayerId === 'string') {
          payload.votedPlayerId = ids[payload.votedPlayerId] ?? randomUUID()
        }
        await ok(
          admin.from('answers').insert({
            round_id: round.id,
            player_id: ids[answer.playerId],
            answer_payload: payload as Json,
          }),
        )
      }

      const { error } = await host.rpc('reveal_round', { round_id: round.id })
      expect(error).toBeNull()

      const players = await must(admin.from('players').select('id, score').eq('room_id', roomId))
      const saved = await must(
        admin.from('rounds').select('status, reveal_snapshot').eq('id', round.id).single(),
      )
      const snapshot = saved.reveal_snapshot as unknown as RevealSnapshot
      const scores: Record<string, number> = {}
      const snapshotPoints: Record<string, number> = {}
      for (const ref of fixture.players) {
        scores[ref] = players.find((p) => p.id === ids[ref])!.score
        snapshotPoints[ref] = snapshot.results.find((r) => r.playerId === ids[ref])!.pointsAwarded
      }

      expect(saved.status).toBe('revealed')
      expect(scores).toEqual(fixture.expected)
      expect(snapshotPoints).toEqual(fixture.expected)
      expect(snapshot.results).toHaveLength(fixture.players.length)
    },
  )
})
