import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Inject,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Module,
} from '@nestjs/common';
import { ApiTags, ApiBody, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { hash, verify, argon2id } from 'argon2';
import { Prisma } from './generated/prisma/client.js';
import {
  registration,
  login,
  joinRegistration,
  joinExisting,
  passwordResetRequest,
  passwordReset,
} from '@supportiq/contracts';
import { Database } from './database.js';
import { Security, digest, token as opaqueToken } from './security.js';
import { parse } from './validation.js';
import { settings } from './config.js';
import { EmailService } from './email.js';
export const passwordHash = (value: string) =>
  hash(value, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
const dummyHash = passwordHash('unused-timing-comparison-password');
const safeUser = {
  id: true,
  name: true,
  email: true,
  memberships: {
    select: {
      id: true,
      role: true,
      organisation: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;
const credentialSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 12, maxLength: 128 },
  },
};
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(EmailService) private email: EmailService,
  ) {}
  @Get('csrf')
  @ApiOperation({
    summary: 'Obtain signed CSRF cookie and token before any mutation',
  })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.security.csrf(req, res);
  }
  @Get('me') async me(@Req() req: Request) {
    const id = await this.security.user(req);
    return this.db.user.findUniqueOrThrow({ where: { id }, select: safeUser });
  }
  @Post('register')
  @ApiBody({
    schema: {
      ...credentialSchema,
      required: ['name', 'email', 'password', 'organisation'],
      properties: {
        ...credentialSchema.properties,
        name: { type: 'string' },
        organisation: { type: 'string' },
      },
    },
  })
  async register(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.security.limit(req, 'registration', 8);
    const data = parse(registration, body);
    const password = await passwordHash(data.password);
    try {
      const user = await this.db.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: password,
          memberships: {
            create: {
              role: 'ADMINISTRATOR',
              organisation: { create: { name: data.organisation } },
            },
          },
        },
        select: safeUser,
      });
      await this.security.session(user.id, res);
      return user;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(
          'Unable to create this account. Sign in or use another email.',
        );
      throw e;
    }
  }
  @Post('login')
  @ApiBody({ schema: credentialSchema })
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.security.limit(req, 'login');
    const data = parse(login, body);
    const user = await this.db.user.findUnique({
      where: { email: data.email },
    });
    // Perform a real Argon2 verification even when the account does not exist.
    const valid = await verify(
      user?.passwordHash || (await dummyHash),
      data.password,
    );
    if (!user || !valid)
      throw new UnauthorizedException('Email or password is incorrect');
    await this.security.session(user.id, res);
    return this.db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: safeUser,
    });
  }
  @Post('logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[settings().sessionName];
    if (typeof raw === 'string')
      await this.db.session.deleteMany({ where: { tokenHash: digest(raw) } });
    res.clearCookie(settings().sessionName, {
      path: '/',
      secure: settings().production,
      httpOnly: true,
      sameSite: 'lax',
    });
    return { ok: true };
  }
  @Post('password/forgot')
  async forgotPassword(@Req() req: Request, @Body() body: unknown) {
    await this.security.limit(req, 'password-reset', 5);
    const { email } = parse(passwordResetRequest, body);
    const user = await this.db.user.findUnique({ where: { email } });
    if (user) {
      const token = opaqueToken();
      await this.db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      try {
        await this.email.send(
          user.email,
          'Reset your SupportIQ password',
          `A password reset was requested for your account. If you made this request, open ${settings().origin}/reset#${token} within one hour. If you did not request it, ignore this message.`,
        );
      } catch {
        // The response remains identical for known and unknown accounts.
      }
    }
    return { ok: true };
  }
  @Post('password/reset')
  async resetPassword(@Req() req: Request, @Body() body: unknown) {
    await this.security.limit(req, 'password-reset', 5);
    const data = parse(passwordReset, body);
    const newPasswordHash = await passwordHash(data.password);
    const user = await this.db.$transaction(async (tx) => {
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash: digest(data.token) },
      });
      if (!reset || reset.usedAt || reset.expiresAt <= new Date())
        throw new BadRequestException('This reset link is invalid or expired');
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('This reset link is invalid or expired');
      const updated = await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash: newPasswordHash },
        select: { id: true },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      return updated;
    });
    return { ok: Boolean(user) };
  }
  @Post('join')
  @ApiOperation({
    summary: 'Register a customer using a single-use private portal token',
  })
  @ApiBody({
    schema: {
      ...credentialSchema,
      required: ['name', 'email', 'password', 'token'],
      properties: {
        ...credentialSchema.properties,
        name: { type: 'string' },
        token: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
  })
  async registerCustomer(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.security.limit(req, 'join', 10);
    const data = parse(joinRegistration, body);
    const password = await passwordHash(data.password);
    try {
      const user = await this.db.$transaction(async (tx) => {
        const link = await tx.customerAccessLink.findUnique({
          where: { tokenHash: digest(data.token) },
        });
        if (!link || link.usedAt || link.expiresAt <= new Date())
          throw new BadRequestException(
            'This join link is invalid or expired. Ask your support team for a new link.',
          );
        const claimed = await tx.customerAccessLink.updateMany({
          where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new BadRequestException('This join link is invalid or expired');
        return tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            passwordHash: password,
            memberships: {
              create: { organisationId: link.organisationId, role: 'CUSTOMER' },
            },
          },
          select: safeUser,
        });
      });
      await this.security.session(user.id, res);
      return user;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(
          'Unable to join. If you have an account, sign in first and use this link again.',
        );
      throw e;
    }
  }
  @Post('join-existing')
  @ApiOperation({
    summary: 'Join another portal as a customer while signed in',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['token'],
      properties: { token: { type: 'string' } },
    },
  })
  async joinExisting(@Req() req: Request, @Body() body: unknown) {
    const userId = await this.security.user(req);
    await this.security.limit(req, 'join', 10);
    const data = parse(joinExisting, body);
    await this.db.$transaction(async (tx) => {
      const link = await tx.customerAccessLink.findUnique({
        where: { tokenHash: digest(data.token) },
      });
      if (!link || link.usedAt || link.expiresAt <= new Date())
        throw new BadRequestException('This join link is invalid or expired');
      const existing = await tx.membership.findUnique({
        where: {
          userId_organisationId: {
            userId,
            organisationId: link.organisationId,
          },
        },
      });
      if (existing) return; // Never downgrade or upgrade an existing role.
      const claimed = await tx.customerAccessLink.updateMany({
        where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('This join link is invalid or expired');
      await tx.membership.create({
        data: { userId, organisationId: link.organisationId, role: 'CUSTOMER' },
      });
    });
    return this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: safeUser,
    });
  }
}
@Module({ controllers: [AuthController] })
export class AuthModule {}
