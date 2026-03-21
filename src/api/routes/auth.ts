import { Router, Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { config } from '../../config.js';

export const authRouter = Router();

/** Derive a session token from the app password. */
export function deriveToken(password: string): string {
  return createHmac('sha256', password).update('spark-bid-session').digest('hex');
}

/** Middleware: block requests without a valid Bearer token. */
export function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!config.appPassword) {
    // No password configured — open access (dev mode)
    next();
    return;
  }
  const header = req.headers['authorization'] ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token === deriveToken(config.appPassword)) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
}

// POST /api/auth/login
authRouter.post('/login', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ success: false, error: 'Password is required.' });
    return;
  }
  if (!config.appPassword || password === config.appPassword) {
    res.json({ success: true, token: deriveToken(password) });
  } else {
    res.status(401).json({ success: false, error: 'Incorrect password.' });
  }
});
