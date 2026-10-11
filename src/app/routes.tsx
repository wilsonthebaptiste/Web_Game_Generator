import type { RouteObject } from 'react-router-dom'
import { HomePage } from '../features/home/HomePage'
import { NotFoundPage } from './NotFoundPage'
import { RoomPage } from './RoomPage'

// LobbyPage, GamePage, and FinalScreen are not routes. RoomPage picks one from `room.status`.
export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/join/:code', element: <HomePage /> },
  { path: '/room/:code', element: <RoomPage /> },
  { path: '*', element: <NotFoundPage /> },
]
