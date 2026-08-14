import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import type { SkillTier } from '@prisma/client'
import { z } from 'zod'
import type { VenueBookingClient } from '../clients/venueBooking.js'
import { findPublicMatches, requestJoin } from '../domain/matches.js'
import { AppError } from './errors.js'
import { verifyAccessToken } from './jwt.js'

interface QuickMatchClientEvents {
  'quick_match:find': (input: { requestId: string; skill?: SkillTier }) => void
  'quick_match:stop': (input: { requestId: string }) => void
  'quick_match:accept': (input: { requestId: string; matchId: string }) => void
}

interface QuickMatchServerEvents {
  'quick_match:progress': (event: { requestId: string; elapsedMs: number; scannedCount: number; candidateCount: number; phase: 'starting' | 'scanning' | 'proposal' | 'completed' }) => void
  'quick_match:proposal': (proposal: { requestId: string; matchId: string; openSlots: number; feePerSlot: string; startAt: string; endAt: string; court: { id: string; name: string }; venue: { id: string; name: string; address: string; lat: number; lng: number } }) => void
  'quick_match:stopped': (event: { requestId: string }) => void
  'quick_match:joined': (join: { requestId: string; id: string; matchId: string; participantUserId: string; status: 'pending' }) => void
  'quick_match:error': (error: { requestId?: string; code: string; message: string }) => void
}

interface QuickMatchSocketData { user: { id: string; roles: string[] } }
type QuickMatchSocket = Socket<QuickMatchClientEvents, QuickMatchServerEvents, Record<string, never>, QuickMatchSocketData>
type SearchState = { startedAt: number; proposalIds: Set<string>; acceptingIds: Set<string> }

const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean)
const requestIdSchema = z.string().min(1).max(100)
const quickMatchFindSchema = z.object({ requestId: requestIdSchema, skill: z.enum(['newcomer', 'beginner', 'intermediate', 'intermediate_plus', 'advanced']).optional() }).strict()
const quickMatchStopSchema = z.object({ requestId: requestIdSchema }).strict()
const quickMatchAcceptSchema = z.object({ requestId: requestIdSchema, matchId: z.string().uuid() }).strict()

function emitQuickMatchError(socket: QuickMatchSocket, error: unknown, requestId?: string): void {
  if (error instanceof AppError) {
    socket.emit('quick_match:error', { requestId, code: error.code, message: error.message })
    return
  }
  socket.emit('quick_match:error', { requestId, code: 'QUICK_MATCH_UNAVAILABLE', message: 'Quick match is temporarily unavailable.' })
}

export function attachQuickMatchGateway(httpServer: HttpServer, venueBookingClient: VenueBookingClient): () => Promise<void> {
  const io = new Server<QuickMatchClientEvents, QuickMatchServerEvents, Record<string, never>, QuickMatchSocketData>(httpServer, { cors: { origin: webOrigins } })

  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (typeof token !== 'string') return next(new Error('UNAUTHENTICATED'))
    try {
      const payload = verifyAccessToken(token)
      if (!payload.roles.includes('player')) return next(new Error('FORBIDDEN'))
      socket.data.user = { id: payload.sub, roles: payload.roles }
      next()
    } catch {
      next(new Error('INVALID_TOKEN'))
    }
  })

  io.on('connection', (socket) => {
    const searches = new Map<string, SearchState>()

    socket.on('quick_match:find', async (rawInput) => {
      let requestId: string | undefined
      try {
        const input = quickMatchFindSchema.parse(rawInput)
        requestId = input.requestId
        const state: SearchState = { startedAt: Date.now(), proposalIds: new Set(), acceptingIds: new Set() }
        searches.set(requestId, state)
        socket.emit('quick_match:progress', { requestId, elapsedMs: 0, scannedCount: 0, candidateCount: 0, phase: 'starting' })
        const matches = await findPublicMatches(venueBookingClient, { skill: input.skill, minOpenSlots: 1 })
        if (searches.get(requestId) !== state) return
        const candidates = matches.filter((candidate) => candidate.openSlots === 1)
        socket.emit('quick_match:progress', { requestId, elapsedMs: Math.max(0, Date.now() - state.startedAt), scannedCount: matches.length, candidateCount: candidates.length, phase: candidates.length ? 'proposal' : 'completed' })
        for (const match of candidates) {
          if (searches.get(requestId) !== state) return
          state.proposalIds.add(match.id)
          socket.emit('quick_match:proposal', { requestId, matchId: match.id, openSlots: match.openSlots, feePerSlot: match.feePerSlot, startAt: match.startAt, endAt: match.endAt, court: match.court, venue: match.venue })
        }
      } catch (error) {
        emitQuickMatchError(socket, error, requestId)
      }
    })

    socket.on('quick_match:stop', (rawInput) => {
      try {
        const { requestId } = quickMatchStopSchema.parse(rawInput)
        searches.delete(requestId)
        socket.emit('quick_match:stopped', { requestId })
      } catch (error) {
        emitQuickMatchError(socket, error)
      }
    })

    socket.on('quick_match:accept', async (rawInput) => {
      let requestId: string | undefined
      try {
        const input = quickMatchAcceptSchema.parse(rawInput)
        requestId = input.requestId
        const state = searches.get(input.requestId)
        if (!state || !state.proposalIds.has(input.matchId)) throw new AppError(409, 'QUICK_MATCH_PROPOSAL_EXPIRED', 'Quick match proposal is no longer active.')
        if (state.acceptingIds.has(input.matchId)) return
        state.acceptingIds.add(input.matchId)
        const join = await requestJoin(input.matchId, socket.data.user.id)
        if (searches.get(input.requestId) !== state) return
        searches.delete(input.requestId)
        socket.emit('quick_match:joined', { requestId: input.requestId, id: join.id, matchId: join.matchId, participantUserId: join.participantUserId, status: 'pending' })
      } catch (error) {
        emitQuickMatchError(socket, error, requestId)
      }
    })

    socket.on('disconnect', () => searches.clear())
  })

  return () => new Promise((resolve) => io.close(() => resolve()))
}
