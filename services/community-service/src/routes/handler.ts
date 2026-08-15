import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

type Handler = (req: Request, res: Response) => Promise<void>;

export function withErrorHandling(fn: Handler) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.httpStatus).json({ error: { code: error.code, message: error.message } });
        return;
      }
      if (error instanceof ZodError) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu gửi lên không hợp lệ.', issues: error.issues },
        });
        return;
      }
      console.error(error);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' } });
    }
  };
}
