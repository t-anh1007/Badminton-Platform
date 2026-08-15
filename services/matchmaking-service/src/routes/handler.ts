import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

type Handler = (req: Request, res: Response) => Promise<void>;

export function withErrorHandling(fn: Handler) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.httpStatus).json({
          error: { code: err.code, message: err.message, ...err.meta },
        });
        return;
      }
      if (err instanceof ZodError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu gửi lên không hợp lệ.', issues: err.issues },
        });
        return;
      }
      console.error(err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' } });
    }
  };
}
