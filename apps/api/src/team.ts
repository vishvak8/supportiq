import {
  Controller,
  Body,
  Get,
  Inject,
  ForbiddenException,
  Module,
  Param,
  Req,
  Res,
  Post,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { hash, argon2id } from 'argon2';
import { Database } from './database.js';
import { digest, Security, token as opaqueToken } from './security.js';
import { EmailService } from './email.js';
import { parse } from './validation.js';
import { settings } from './config.js';
@ApiTags('Team')
@ApiCookieAuth()
@Controller()
export class AgentsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Security) private readonly security: Security,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}
  @Get('organisations/:organisationId/agents')
  @ApiOperation({
    summary:
      'List active agents in the authenticated organisation for assignment',
  })
  async list(
    @Req() request: Request,
    @Param('organisationId') organisationId: string,
  ) {
    const member = await this.security.membership(request, organisationId);
    if (member.role === 'CUSTOMER')
      throw new ForbiddenException('Staff access required');
    return this.db.membership.findMany({
      where: { organisationId, role: 'AGENT', active: true },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
      take: 200,
    });
  }

  @Post('organisations/:organisationId/team/invitations')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Invite an agent to this organisation by email' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
  })
  async invite(
    @Req() request: Request,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    const member = await this.security.membership(request, organisationId);
    if (member.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
    if (!this.email.enabled)
      throw new BadRequestException(
        'Invitations are unavailable because email delivery is disabled for this demo.',
      );
    const { email } = parse(
      z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
        })
        .strict(),
      body,
    );
    await this.security.limit(request, 'team-invite', 20);
    if (process.env.NODE_ENV === 'production')
      await this.security.dailyLimit(
        'outbound-email',
        Number(process.env.DEMO_DAILY_EMAIL_LIMIT || 90),
      );
    const existingMember = await this.db.membership.findFirst({
      where: { organisationId, user: { email }, active: true },
      select: { id: true },
    });
    if (existingMember)
      throw new ConflictException(
        'This person already belongs to the organisation',
      );
    const raw = opaqueToken();
    const invitation = await this.db.teamInvitation.create({
      data: {
        organisationId,
        inviterId: member.id,
        email,
        role: 'AGENT',
        tokenHash: digest(raw),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      select: { id: true },
    });
    const inviteUrl = `${settings().origin}/invite#${raw}`;
    try {
      await this.email.send(
        email,
        'You are invited to SupportIQ',
        `An administrator invited you to join their SupportIQ support team. Open ${inviteUrl} within seven days to accept this invitation.`,
      );
    } catch {
      await this.db.teamInvitation.delete({ where: { id: invitation.id } });
      throw new BadRequestException(
        'Invitation email could not be delivered. Check SMTP configuration and try again.',
      );
    }
    return { ok: true, expiresAt: new Date(Date.now() + 7 * 86400000) };
  }

  @Post('team/invitations/accept')
  @ApiOperation({ summary: 'Accept a single-use team invitation' })
  async accept(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ) {
    const data = parse(
      z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          name: z.string().trim().min(1).max(100).optional(),
          password: z.string().min(12).max(128).optional(),
        })
        .strict(),
      body,
    );
    await this.security.limit(request, 'team-invite-accept', 10);
    let userId: string | null = null;
    try {
      userId = await this.security.user(request);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
    const invite = await this.db.teamInvitation.findUnique({
      where: { tokenHash: digest(data.token) },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt <= new Date()
    )
      throw new BadRequestException('This invitation is invalid or expired');
    let newPasswordHash: string | undefined;
    if (!userId) {
      if (!data.name || !data.password)
        throw new BadRequestException(
          'Name and password are required to create your account',
        );
      newPasswordHash = await hash(data.password, {
        type: argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    }
    const acceptedUser = await this.db.$transaction(async (tx) => {
      const claimed = await tx.teamInvitation.updateMany({
        where: {
          id: invite.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('This invitation is invalid or expired');
      let targetId = userId;
      if (!targetId) {
        const existing = await tx.user.findUnique({
          where: { email: invite.email },
          select: { id: true },
        });
        if (existing)
          throw new ConflictException(
            'Sign in to the invited email address, then accept the invitation again',
          );
        const created = await tx.user.create({
          data: {
            email: invite.email,
            name: data.name!,
            passwordHash: newPasswordHash!,
          },
          select: { id: true },
        });
        targetId = created.id;
      } else {
        const target = await tx.user.findUniqueOrThrow({
          where: { id: targetId },
          select: { email: true },
        });
        if (target.email !== invite.email)
          throw new ForbiddenException('Sign in to the invited email address');
      }
      const prior = await tx.membership.findUnique({
        where: {
          userId_organisationId: {
            userId: targetId,
            organisationId: invite.organisationId,
          },
        },
      });
      if (prior) {
        if (prior.role !== 'AGENT' || prior.active)
          throw new ConflictException(
            'You already belong to this organisation',
          );
        await tx.membership.update({
          where: { id: prior.id },
          data: { active: true, deactivatedAt: null },
        });
      } else {
        await tx.membership.create({
          data: {
            userId: targetId,
            organisationId: invite.organisationId,
            role: 'AGENT',
          },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: targetId },
        select: { id: true, name: true, email: true },
      });
    });
    if (!userId) await this.security.session(acceptedUser.id, response);
    return this.db.user.findUniqueOrThrow({
      where: { id: acceptedUser.id },
      select: {
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
      },
    });
  }

  @Get('organisations/:organisationId/team/members')
  async members(
    @Req() request: Request,
    @Param('organisationId') organisationId: string,
  ) {
    const member = await this.security.membership(request, organisationId);
    if (member.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
    return this.db.membership.findMany({
      where: { organisationId, role: 'AGENT' },
      select: {
        id: true,
        active: true,
        deactivatedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ active: 'desc' }, { user: { name: 'asc' } }],
    });
  }

  @Get('organisations/:organisationId/team/invitations')
  async invitations(
    @Req() request: Request,
    @Param('organisationId') organisationId: string,
  ) {
    const member = await this.security.membership(request, organisationId);
    if (member.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
    return this.db.teamInvitation.findMany({
      where: { organisationId },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('organisations/:organisationId/team/invitations/:invitationId/revoke')
  async revokeInvitation(
    @Req() request: Request,
    @Param('organisationId') organisationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    const member = await this.security.membership(request, organisationId);
    if (member.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
    const result = await this.db.teamInvitation.updateMany({
      where: {
        id: invitationId,
        organisationId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Pending invitation not found');
    return { ok: true };
  }

  @Delete('organisations/:organisationId/team/members/:memberId')
  async deactivate(
    @Req() request: Request,
    @Param('organisationId') organisationId: string,
    @Param('memberId') memberId: string,
  ) {
    const admin = await this.security.membership(request, organisationId);
    if (admin.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
    return this.db.$transaction(async (tx) => {
      const target = await tx.membership.findFirst({
        where: { id: memberId, organisationId, role: 'AGENT', active: true },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Active agent not found');
      const assigned = await tx.ticket.findMany({
        where: { organisationId, assigneeId: target.id },
        select: { id: true, version: true },
      });
      for (const ticket of assigned) {
        const update = await tx.ticket.updateMany({
          where: { id: ticket.id, organisationId, version: ticket.version },
          data: { assigneeId: null, version: { increment: 1 } },
        });
        if (update.count !== 1)
          throw new ConflictException(
            'A ticket changed while the agent was being removed. Try again.',
          );
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId: ticket.id,
            actorId: admin.id,
            kind: 'ASSIGNED',
            detail: { assigneeId: null, previousAssigneeId: target.id },
          },
        });
      }
      await tx.membership.update({
        where: { id: target.id },
        data: { active: false, deactivatedAt: new Date() },
      });
      return { ok: true, unassignedTickets: assigned.length };
    });
  }
}
@Module({ controllers: [AgentsController] })
export class TeamModule {}
