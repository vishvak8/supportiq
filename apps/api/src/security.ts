import {
  Injectable,
  Inject,
  HttpException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Request, Response } from 'express';
import { Database } from './database.js';
import { settings } from './config.js';
export const digest = (s: string) =>
  createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
@Injectable()
export class Security {
  constructor(@Inject(Database) private readonly db: Database) {}
  csrf(req: Request, res: Response) {
    const cfg = settings();
    const value = token();
    const signed =
      value +
      '.' +
      createHmac('sha256', cfg.secret).update(value).digest('hex');
    res.cookie(cfg.csrfName, signed, {
      httpOnly: true,
      secure: cfg.production,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600000,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { token: signed };
  }
  verifyCsrf(req: Request) {
    const cfg = settings();
    if (req.get('origin') !== cfg.origin)
      throw new ForbiddenException('Request origin is not allowed');
    const header = req.get('x-csrf-token') || '';
    const cookie = req.cookies?.[cfg.csrfName] || '';
    if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(header) || !same(header, cookie))
      throw new ForbiddenException('Invalid CSRF token');
    const [value, signature] = header.split('.');
    if (
      !same(
        signature,
        createHmac('sha256', cfg.secret).update(value).digest('hex'),
      )
    )
      throw new ForbiddenException('Invalid CSRF token');
  }
  async limit(req: Request, category: string, max = 12) {
    const now = Date.now();
    const bucket = Math.floor(now / 900000);
    // Backend only trusts the direct socket address. Never arbitrary forwarded headers.
    const key = digest(`${category}:${req.ip}:${bucket}`);
    const row = await this.db.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt: new Date((bucket + 1) * 900000) },
      update: { count: { increment: 1 } },
    });
    if (row.count > max)
      throw new HttpException(
        'Too many attempts. Try again in 15 minutes.',
        429,
      );
  }
  async session(userId: string, res: Response) {
    const raw = token();
    const cfg = settings();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await this.db.session.create({
      data: { userId, tokenHash: digest(raw), expiresAt },
    });
    res.cookie(cfg.sessionName, raw, {
      httpOnly: true,
      secure: cfg.production,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }
  async user(req: Request) {
    const raw = req.cookies?.[settings().sessionName];
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw))
      throw new UnauthorizedException('Please sign in');
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(raw) },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.expiresAt <= new Date())
      throw new UnauthorizedException(
        'Your session has expired. Please sign in',
      );
    return session.userId;
  }
  async membership(req: Request, organisationId: string) {
    const userId = await this.user(req);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        organisationId,
      )
    )
      throw new ForbiddenException('Organisation access denied');
    const member = await this.db.membership.findUnique({
      where: { userId_organisationId: { userId, organisationId } },
    });
    if (!member || !member.active)
      throw new ForbiddenException('Organisation access denied');
    return member;
  }
}
