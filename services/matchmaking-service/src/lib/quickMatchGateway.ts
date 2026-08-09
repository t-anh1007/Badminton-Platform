import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { SkillTier } from '@prisma/client';
import { z } from 'zod';
import type { VenueBookingClient } from '../clients/venueBooking.js';
import { findPublicMatches, requestJoin } from '../domain/matches.js';
import { AppError } from './errors.js';
import { verifyAccessToken } from './jwt.js';

interface QuickMatchClientEvents {
  'quick_match:find': (input?: { skill?: SkillTier }) => void;
  'quick_match:accept': (input: { matchId: string }) => void;
}

interface QuickMatchServerEvents {
  'quick_match:proposal': (proposal: {
    matchId: string;
    openSlots: number;
    feePerSlot: string;
    startAt: string;
    endAt: string;
    court: { id: string; name: string };
    venue: { id: string; name: string; address: string; lat: number; lng: number };
  }) => void;
  'quick_match:joined': (join: {
    id: string;
    matchId: string;
    participantUserId: string;
    status: 'pending';
  }) => void;
  'quick_match:error': (error: { code: string; message: string }) => void;
}

interface QuickMatchSocketData {
  user: { id: string; roles: string[] };
}

type QuickMatchSocket = Socket<
  QuickMatchClientEvents,
  QuickMatchServerEvents,
  Record<string, never>,
  QuickMatchSocketData
>;

const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const quickMatchAcceptSchema = z.object({ matchId: z.string().uuid() }).strict();

function emitQuickMatchError(socket: QuickMatchSocket, error: unknown): void {
  if (error instanceof AppError) {
    socket.emit('quick_match:error', { code: error.code, message: error.message });
    return;
  }
  socket.emit('quick_match:error', { code: 'QUICK_MATCH_UNAVAILABLE', message: 'Quick match is temporarily unavailable.' });
}

export function attachQuickMatchGateway(httpServer: HttpServer, venueBookingClient: VenueBookingClient): () => Promise<void> {
  const io = new Server<QuickMatchClientEvents, QuickMatchServerEvents, Record<string, never>, QuickMatchSocketData>(httpServer, {
    cors: {
      origin: webOrigins,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (typeof token !== 'string') {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      if (!payload.roles.includes('player')) {
        next(new Error('FORBIDDEN'));
        return;
      }
      socket.data.user = { id: payload.sub, roles: payload.roles };
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('quick_match:find', async (input) => {
      try {
        const matches = await findPublicMatches(venueBookingClient, {
          skill: input?.skill,
          minOpenSlots: 1,
        });
        for (const match of matches.filter((candidate) => candidate.openSlots === 1)) {
          socket.emit('quick_match:proposal', {
            matchId: match.id,
            openSlots: match.openSlots,
            feePerSlot: match.feePerSlot,
            startAt: match.startAt,
            endAt: match.endAt,
            court: match.court,
            venue: match.venue,
          });
        }
      } catch (error) {
        emitQuickMatchError(socket, error);
      }
    });

    socket.on('quick_match:accept', async (input) => {
      try {
        const { matchId } = quickMatchAcceptSchema.parse(input);
        const join = await requestJoin(matchId, socket.data.user.id);
        socket.emit('quick_match:joined', {
          id: join.id,
          matchId: join.matchId,
          participantUserId: join.participantUserId,
          status: 'pending',
        });
      } catch (error) {
        emitQuickMatchError(socket, error);
      }
    });
  });

  return () => new Promise((resolve) => io.close(() => resolve()));
}
