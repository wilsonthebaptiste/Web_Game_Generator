import { useCallback, useEffect, useRef, useState } from 'react'
import { createAppError, toAppError } from '../lib/errors'
import { normalizeRoomCode } from '../lib/roomCodes'
import { ensureAnonymousSession, getSupabase } from '../lib/supabaseClient'
import { getRoomSnapshot, subscribeToRoom } from '../services/rooms'
import type {
  AppError,
  AppErrorCode,
  ConnectionStatus,
  RoomSession,
  RoomSnapshot,
} from '../types/game'

export type RoomSessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: RoomSession }
  | { status: 'error'; error: AppError; retry: () => void }

/** Errors that end the session. Anything else during a refetch keeps the last good snapshot. */
const FATAL_CODES: readonly AppErrorCode[] = [
  'ROOM_NOT_FOUND',
  'ROOM_EXPIRED',
  'NOT_A_MEMBER',
  'INVALID_ROOM_CODE',
]

/** Realtime events often arrive in bursts (a reveal updates every player), so wait briefly. */
export const REFETCH_DEBOUNCE_MS = 100

// realtime-js returns the already-open channel for a topic it knows, and a subscribed channel
// throws if listeners are added. removeChannel is async, so a quick retry could get the old
// channel back. Each subscription therefore gets its own topic (same approach as subscribeToRoom).
let roundsSubscriptionCount = 0

/**
 * The single source of room state for RoomPage (plan.md §1.6). It signs the browser in, loads
 * the authoritative snapshot, then subscribes to realtime changes on the room, its players, and
 * its rounds. Events are only notifications: every event triggers a fresh snapshot.
 *
 * Feature pages never subscribe on their own; they receive the `session` this hook builds.
 *
 * Reconnects: the snapshot is refetched when the realtime channel errors or re-subscribes after
 * a drop, when the browser comes back online, and when the tab becomes visible again (phones
 * pause background tabs). `session.connection` says whether live updates are flowing:
 * `offline` (the browser has no network), `reconnecting` (realtime is down and realtime-js is
 * retrying), or `connected`.
 */
export function useRoomSession(rawCode: string): RoomSessionState {
  const code = normalizeRoomCode(rawCode)
  const [attempt, setAttempt] = useState(0)
  // State is tagged with the code and attempt it belongs to. When either changes, the old state
  // is ignored and the hook reports `loading` until the new load finishes.
  const key = `${code}#${attempt}`
  const [stored, setStored] = useState<{ key: string; value: RoomSessionState }>({
    key,
    value: { status: 'loading' },
  })

  // Only the newest request may update state, so a slow old response can't overwrite new data.
  const latestRequest = useRef(0)
  const hasSession = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let active = true
    let unsubscribeRoom: (() => void) | undefined
    let roundsChannel: ReturnType<ReturnType<typeof getSupabase>['channel']> | undefined
    let debounce: ReturnType<typeof setTimeout> | undefined
    hasSession.current = false
    const setState = (value: RoomSessionState) => setStored({ key, value })

    let online = navigator.onLine
    // Optimistic until realtime reports a problem, so the banner doesn't flash on first load.
    let channelUp = true
    const connection = (): ConnectionStatus =>
      !online ? 'offline' : channelUp ? 'connected' : 'reconnecting'

    /** Updates `session.connection` without waiting for a snapshot. */
    const updateConnection = () => {
      if (!active) return
      const value = connection()
      setStored((prev) =>
        prev.key === key && prev.value.status === 'ready' && prev.value.session.connection !== value
          ? { key, value: { ...prev.value, session: { ...prev.value.session, connection: value } } }
          : prev,
      )
    }

    const fail = (error: AppError) => {
      if (!active) return
      hasSession.current = false
      setState({ status: 'error', error, retry })
    }

    const apply = (snapshot: RoomSnapshot) => {
      if (!snapshot.me) {
        fail(createAppError('NOT_A_MEMBER'))
        return
      }
      const me = snapshot.me
      hasSession.current = true
      setState({
        status: 'ready',
        session: {
          ...snapshot,
          me,
          isHost: me.id === snapshot.room.hostPlayerId,
          connection: connection(),
          refresh: () => refreshRef.current(),
        },
      })
    }

    const load = async (): Promise<RoomSnapshot | undefined> => {
      const request = ++latestRequest.current
      try {
        const snapshot = await getRoomSnapshot(code)
        if (active && request === latestRequest.current) apply(snapshot)
        return snapshot
      } catch (cause) {
        const error = toAppError(cause)
        const stale = !active || request !== latestRequest.current
        // Before the first snapshot every error is shown. Afterwards only fatal ones are;
        // a failed refetch keeps the last good state until the next event.
        if (!stale && (!hasSession.current || FATAL_CODES.includes(error.code))) fail(error)
        return undefined
      }
    }

    refreshRef.current = async () => {
      await load()
    }

    const scheduleRefetch = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void load(), REFETCH_DEBOUNCE_MS)
    }

    const start = async () => {
      try {
        await ensureAnonymousSession()
      } catch (cause) {
        fail(toAppError(cause))
        return
      }
      if (!active) return

      const snapshot = await load()
      if (!active || !snapshot) return

      try {
        const roomId = snapshot.room.id
        unsubscribeRoom = subscribeToRoom(roomId, scheduleRefetch)
        roundsChannel = getSupabase()
          .channel(`room-rounds:${roomId}:${++roundsSubscriptionCount}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` },
            scheduleRefetch,
          )
          // `SUBSCRIBED` fires ~100 ms before the server starts sending database changes
          // (measured on dev). Changes in that gap are lost, so refetch once the server confirms
          // "Subscribed to PostgreSQL". The snapshot covers every table, not just rounds.
          .on('system', {}, (payload: { extension?: string; status?: string }) => {
            if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
              scheduleRefetch()
            }
          })
          .subscribe((status) => {
            if (!active) return
            if (status === 'SUBSCRIBED') {
              // Back after a drop: catch up on anything missed while realtime was down.
              if (!channelUp) scheduleRefetch()
              channelUp = true
            } else {
              // CHANNEL_ERROR, TIMED_OUT, or an unexpected CLOSED. realtime-js keeps retrying;
              // meanwhile the snapshot may still load over HTTP.
              channelUp = false
              scheduleRefetch()
            }
            updateConnection()
          })
      } catch (cause) {
        fail(toAppError(cause))
        return
      }

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      document.addEventListener('visibilitychange', handleVisibility)
    }

    const handleOnline = () => {
      online = true
      updateConnection()
      scheduleRefetch()
    }
    const handleOffline = () => {
      online = false
      updateConnection()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefetch()
    }

    void start()

    return () => {
      active = false
      clearTimeout(debounce)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribeRoom?.()
      if (roundsChannel) void getSupabase().removeChannel(roundsChannel)
    }
  }, [code, key, retry])

  return stored.key === key ? stored.value : { status: 'loading' }
}
