import {
  ConflictException,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Module,
  NotFoundException,
  Body,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiCookieAuth,
  ApiQuery,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { Prisma } from './generated/prisma/client.js';
import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import {
  messageInput,
  ticketInput,
  ticketQuery,
  ticketUpdate,
} from '@supportiq/contracts';
import { Database } from './database.js';
import { Security } from './security.js';
import { parse } from './validation.js';
import { PrivateStorage } from './storage.js';

export const ticketTransitions = {
  OPEN: ['IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED'],
  IN_PROGRESS: ['OPEN', 'WAITING_ON_CUSTOMER', 'RESOLVED'],
  WAITING_ON_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: [],
} as const;
const summary = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.TicketSelect;
const byRole = (role: string) =>
  role === 'CUSTOMER' ? { internal: false } : {};

@ApiTags('Tickets')
@ApiCookieAuth()
@Controller('organisations/:organisationId/tickets')
export class TicketsController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
    @Inject(PrivateStorage) private readonly storage: PrivateStorage,
  ) {}
  @Post()
  @ApiOperation({
    summary: 'Customer creates a ticket; requestId provides retry protection',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'description', 'requestId'],
      properties: {
        subject: { type: 'string', minLength: 3, maxLength: 160 },
        description: { type: 'string', minLength: 10, maxLength: 10000 },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
        requestId: { type: 'string', format: 'uuid' },
      },
    },
  })
  async create(
    @Req() req: Request,
    @Param('organisationId') id: string,
    @Body() body: unknown,
  ) {
    const member = await this.security.membership(req, id);
    if (member.role !== 'CUSTOMER')
      throw new ForbiddenException(
        'Use a customer membership to create a support request',
      );
    const production = process.env.NODE_ENV === 'production';
    await this.security.limit(req, 'ticket-create', production ? 5 : 50);
    if (production) {
      await this.security.dailyUserLimit(member.userId, 'ticket-create', 10);
      await this.security.dailyLimit(
        'ticket-create',
        Number(process.env.DEMO_DAILY_TICKET_LIMIT || 100),
      );
    }
    const data = parse(ticketInput, body);
    const existing = await this.db.ticket.findUnique({
      where: {
        customerId_requestId: {
          customerId: member.id,
          requestId: data.requestId,
        },
      },
      select: { ...summary, description: true },
    });
    if (existing) {
      if (
        existing.subject !== data.subject ||
        existing.description !== data.description ||
        existing.priority !== data.priority
      )
        throw new ConflictException(
          'This request ID was already used for a different ticket',
        );
      const { description: _description, ...result } = existing;
      return result;
    }
    try {
      return await this.db.ticket.create({
        data: {
          ...data,
          organisationId: id,
          customerId: member.id,
          messages: {
            create: {
              authorId: member.id,
              body: data.description,
              requestId: data.requestId,
            },
          },
          events: { create: { actorId: member.id, kind: 'CREATED' } },
        },
        select: summary,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(
          'Request already submitted; refresh your ticket list',
        );
      throw e;
    }
  }
  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'oldest'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'],
  })
  async list(
    @Req() req: Request,
    @Param('organisationId') id: string,
    @Query() query: unknown,
  ) {
    const member = await this.security.membership(req, id);
    const q = parse(ticketQuery, query);
    const where: Prisma.TicketWhereInput = {
      organisationId: id,
      ...(member.role === 'CUSTOMER' ? { customerId: member.id } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { subject: { contains: q.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.ticket.findMany({
        where,
        select: summary,
        orderBy: [
          { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' },
          { id: 'asc' },
        ],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.ticket.count({ where }),
    ]);
    return {
      items: items.map((ticket) => this.publicSummary(ticket, member.role)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get(':ticketId') async detail(
    @Req() req: Request,
    @Param('organisationId') id: string,
    @Param('ticketId') ticketId: string,
  ) {
    const member = await this.security.membership(req, id);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        ticketId,
      )
    )
      throw new NotFoundException('Ticket not found');
    const customer = member.role === 'CUSTOMER';
    const ticket = await this.db.ticket.findFirst({
      where: {
        id: ticketId,
        organisationId: id,
        ...(customer ? { customerId: member.id } : {}),
      },
      select: {
        ...summary,
        description: true,
        customer: { select: { user: { select: { name: true, email: true } } } },
        messages: {
          where: byRole(member.role),
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            body: true,
            internal: true,
            createdAt: true,
            author: {
              select: { role: true, user: { select: { name: true } } },
            },
            attachments: {
              select: {
                id: true,
                originalName: true,
                mediaType: true,
                byteSize: true,
                createdAt: true,
              },
            },
          },
        },
        tags: {
          select: { tag: { select: { id: true, name: true } } },
          orderBy: { tag: { name: 'asc' } },
        },
        events: {
          where: customer ? { customerVisible: true } : {},
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            kind: true,
            detail: true,
            customerVisible: true,
            createdAt: true,
            actor: { select: { user: { select: { name: true } } } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return {
      ...this.publicSummary(ticket, member.role),
      description: ticket.description,
      customer: customer ? undefined : ticket.customer.user,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        body: m.body,
        internal: customer ? undefined : m.internal,
        createdAt: m.createdAt,
        author: {
          name: m.author.user.name,
          role: customer ? undefined : m.author.role,
        },
        attachments: m.attachments,
      })),
      events: ticket.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        detail:
          member.role === 'CUSTOMER' && e.kind === 'ASSIGNED'
            ? undefined
            : e.detail,
        createdAt: e.createdAt,
        actor: { name: e.actor.user.name },
      })),
      tags: customer ? [] : ticket.tags.map(({ tag }) => tag),
    };
  }
  private publicSummary<
    T extends { assignee: { id: string; user: { name: string } } | null },
  >(ticket: T, role: string) {
    return {
      ...ticket,
      assignee: ticket.assignee
        ? role === 'CUSTOMER'
          ? { user: { name: ticket.assignee.user.name } }
          : ticket.assignee
        : null,
    };
  }

  @Post(':ticketId/attachments')
  @UseInterceptors(
    FilesInterceptor('files', process.env.NODE_ENV === 'production' ? 3 : 5, {
      limits: {
        fileSize:
          process.env.NODE_ENV === 'production'
            ? 2 * 1024 * 1024
            : 10 * 1024 * 1024,
        files: process.env.NODE_ENV === 'production' ? 3 : 5,
      },
    }),
  )
  async addAttachments(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('ticketId') ticketId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const member = await this.security.membership(req, organisationId);
    if (process.env.NODE_ENV === 'production') {
      await this.security.limit(req, 'ticket-attachment', 5);
      await this.security.dailyLimit(
        'ticket-attachment',
        Number(process.env.DEMO_DAILY_ATTACHMENT_LIMIT || 50),
      );
      await this.security.dailyUserLimit(member.userId, 'ticket-attachment', 5);
    }
    if (!files?.length)
      throw new BadRequestException('Choose at least one attachment');
    const data = parse(messageInput, {
      body: body.body,
      internal: body.internal === 'true',
      requestId: body.requestId,
      expectedVersion: Number(body.expectedVersion),
    });
    if (member.role === 'CUSTOMER' && data.internal)
      throw new ForbiddenException('Customers cannot create internal notes');
    const objects: {
      key: string;
      file: Express.Multer.File;
      mediaType: string;
      sha256: string;
    }[] = files.map((file) => ({
      key: `${organisationId}/${ticketId}/${randomUUID()}`,
      file,
      mediaType: this.validateUpload(file),
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    }));
    try {
      for (const object of objects)
        await this.storage.put(
          object.key,
          object.file.buffer,
          object.mediaType,
        );
      return await this.db.$transaction(async (tx) => {
        const ticket = await tx.ticket.findFirst({
          where: {
            id: ticketId,
            organisationId,
            ...(member.role === 'CUSTOMER' ? { customerId: member.id } : {}),
          },
          select: { status: true, version: true },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        if (ticket.status === 'CLOSED')
          throw new ConflictException('Reopen this ticket before replying');
        if (ticket.version !== data.expectedVersion)
          throw new ConflictException(
            'Ticket changed since it was opened. Refresh and try again.',
          );
        const changed = await tx.ticket.updateMany({
          where: {
            id: ticketId,
            organisationId,
            version: data.expectedVersion,
          },
          data: {
            version: { increment: 1 },
            ...(member.role === 'CUSTOMER' &&
            ticket.status === 'WAITING_ON_CUSTOMER'
              ? { status: 'IN_PROGRESS' }
              : {}),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'Ticket changed since it was opened. Refresh and try again.',
          );
        const message = await tx.message.create({
          data: {
            organisationId,
            ticketId,
            authorId: member.id,
            body: data.body,
            internal: data.internal,
            requestId: data.requestId,
          },
          select: { id: true, createdAt: true },
        });
        for (const object of objects)
          await tx.attachment.create({
            data: {
              organisationId,
              ticketId,
              messageId: message.id,
              uploadedById: member.id,
              objectKey: object.key,
              originalName: basename(object.file.originalname).slice(0, 240),
              mediaType: object.mediaType,
              byteSize: object.file.size,
              sha256: object.sha256,
            },
          });
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId,
            actorId: member.id,
            kind: data.internal ? 'INTERNAL_NOTE' : 'PUBLIC_REPLY',
            customerVisible: !data.internal,
          },
        });
        return {
          id: message.id,
          version: data.expectedVersion + 1,
          attachmentCount: objects.length,
          createdAt: message.createdAt,
        };
      });
    } catch (error) {
      await Promise.allSettled(
        objects.map((object) => this.storage.delete(object.key)),
      );
      throw error;
    }
  }

  @Get('/attachments/:attachmentId')
  async downloadAttachment(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const member = await this.security.membership(req, organisationId);
    if (process.env.NODE_ENV === 'production') {
      await this.security.limit(req, 'attachment-download', 20);
      await this.security.dailyLimit(
        'attachment-download',
        Number(process.env.DEMO_DAILY_ATTACHMENT_DOWNLOAD_LIMIT || 100),
      );
      await this.security.dailyUserLimit(
        member.userId,
        'attachment-download',
        20,
      );
    }
    const attachment = await this.db.attachment.findFirst({
      where: {
        id: attachmentId,
        organisationId,
        ...(member.role === 'CUSTOMER'
          ? { ticket: { customerId: member.id }, message: { internal: false } }
          : {}),
      },
      select: { objectKey: true, originalName: true, mediaType: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const bytes = await this.storage.get(attachment.objectKey);
    const filename = encodeURIComponent(basename(attachment.originalName));
    response.setHeader('Content-Type', attachment.mediaType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="attachment"; filename*=UTF-8''${filename}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.end(bytes);
  }

  private validateUpload(file: Express.Multer.File) {
    if (
      !file.originalname ||
      file.originalname.includes('\\') ||
      /[\r\n\0]/.test(file.originalname)
    )
      throw new BadRequestException('Invalid attachment name');
    const ext = extname(file.originalname).toLowerCase();
    const bytes = file.buffer;
    if (ext === '.pdf' && bytes.subarray(0, 5).toString() === '%PDF-')
      return 'application/pdf';
    if (['.txt', '.md', '.markdown'].includes(ext) && !bytes.includes(0)) {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (Buffer.from(decoded, 'utf8').equals(bytes))
        return ext === '.md' || ext === '.markdown'
          ? 'text/markdown'
          : 'text/plain';
    }
    if (
      ext === '.png' &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg')
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'image/jpeg';
    if (
      ext === '.webp' &&
      bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WEBP'
    )
      return 'image/webp';
    throw new BadRequestException(
      'Unsupported or invalid file. Use a real PDF, text, Markdown, JPEG, PNG, or WebP file.',
    );
  }
  @Post(':ticketId/messages')
  @ApiOperation({
    summary: 'Add a public reply or an agent-only internal note',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['body', 'requestId', 'expectedVersion'],
      properties: {
        body: { type: 'string', minLength: 1, maxLength: 10000 },
        internal: { type: 'boolean' },
        requestId: { type: 'string', format: 'uuid' },
        expectedVersion: { type: 'integer', minimum: 1 },
      },
    },
  })
  async reply(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ) {
    const member = await this.security.membership(req, organisationId);
    const data = parse(messageInput, body);
    if (member.role === 'CUSTOMER' && data.internal)
      throw new ForbiddenException('Customers cannot create internal notes');
    const production = process.env.NODE_ENV === 'production';
    await this.security.limit(req, 'ticket-message', production ? 20 : 60);
    if (production)
      await Promise.all([
        this.security.dailyLimit(
          'ticket-message',
          Number(process.env.DEMO_DAILY_MESSAGE_LIMIT || 200),
        ),
        this.security.dailyUserLimit(member.userId, 'ticket-message', 30),
      ]);
    return this.db.$transaction(async (tx) => {
      const where = {
        id: ticketId,
        organisationId,
        ...(member.role === 'CUSTOMER' ? { customerId: member.id } : {}),
      };
      const ticket = await tx.ticket.findFirst({
        where,
        select: { id: true, version: true, status: true },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      const previous = await tx.message.findUnique({
        where: {
          organisationId_authorId_requestId: {
            organisationId,
            authorId: member.id,
            requestId: data.requestId,
          },
        },
        select: { id: true, ticketId: true, body: true, internal: true },
      });
      if (previous) {
        if (
          previous.ticketId !== ticketId ||
          previous.body !== data.body ||
          previous.internal !== data.internal
        )
          throw new ConflictException(
            'Request ID already used for a different message',
          );
        return { id: previous.id, version: ticket.version, replayed: true };
      }
      if (ticket.version !== data.expectedVersion)
        throw new ConflictException(
          'Ticket changed since it was opened. Refresh and try again.',
        );
      if (ticket.status === 'CLOSED')
        throw new ConflictException('Reopen this ticket before replying');
      const nextStatus =
        member.role === 'CUSTOMER' && ticket.status === 'WAITING_ON_CUSTOMER'
          ? 'IN_PROGRESS'
          : ticket.status;
      const updated = await tx.ticket.updateMany({
        where: { id: ticketId, organisationId, version: data.expectedVersion },
        data: {
          version: { increment: 1 },
          ...(nextStatus !== ticket.status ? { status: nextStatus } : {}),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Ticket changed since it was opened. Refresh and try again.',
        );
      const message = await tx.message.create({
        data: {
          organisationId,
          ticketId,
          authorId: member.id,
          requestId: data.requestId,
          body: data.body,
          internal: data.internal,
        },
        select: {
          id: true,
          body: true,
          internal: true,
          createdAt: true,
          author: { select: { user: { select: { name: true } }, role: true } },
        },
      });
      await tx.ticketEvent.create({
        data: {
          organisationId,
          ticketId,
          actorId: member.id,
          kind: data.internal ? 'INTERNAL_NOTE' : 'PUBLIC_REPLY',
          customerVisible: !data.internal,
        },
      });
      if (nextStatus !== ticket.status)
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId,
            actorId: member.id,
            kind: 'STATUS_CHANGED',
            detail: { from: ticket.status, to: nextStatus },
          },
        });
      return {
        id: message.id,
        body: message.body,
        internal: member.role === 'CUSTOMER' ? undefined : message.internal,
        createdAt: message.createdAt,
        author: { name: message.author.user.name },
        version: data.expectedVersion + 1,
      };
    });
  }
  @Patch(':ticketId')
  @ApiOperation({
    summary:
      'Agents/admins update status, priority and eligible assignment with optimistic concurrency',
  })
  async update(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ) {
    const member = await this.security.membership(req, organisationId);
    if (member.role === 'CUSTOMER')
      throw new ForbiddenException('Staff access required');
    const data = parse(ticketUpdate, body);
    return this.db.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id: ticketId, organisationId },
        select: {
          id: true,
          status: true,
          priority: true,
          assigneeId: true,
          version: true,
        },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      if (ticket.version !== data.expectedVersion)
        throw new ConflictException(
          'Ticket changed since it was opened. Refresh and try again.',
        );
      if (
        data.status !== undefined &&
        data.status !== ticket.status &&
        !(ticketTransitions[ticket.status] as readonly string[]).includes(
          data.status,
        )
      )
        throw new ConflictException(
          `Cannot move a ${ticket.status} ticket to ${data.status}`,
        );
      const assign = Object.hasOwn(data, 'assigneeId');
      if (assign && data.assigneeId !== null) {
        const assignee = await tx.membership.findFirst({
          where: { id: data.assigneeId, organisationId, role: 'AGENT' },
          select: { id: true },
        });
        if (!assignee)
          throw new BadRequestException(
            'Assignee must be an agent in this organisation',
          );
      }
      if (data.tagIds !== undefined) {
        const uniqueIds = [...new Set(data.tagIds)];
        const valid = await tx.tag.findMany({
          where: { id: { in: uniqueIds }, organisationId },
          select: { id: true },
        });
        if (valid.length !== uniqueIds.length)
          throw new BadRequestException(
            'Every tag must belong to this organisation',
          );
        await tx.ticketTag.deleteMany({ where: { ticketId, organisationId } });
        if (uniqueIds.length)
          await tx.ticketTag.createMany({
            data: uniqueIds.map((tagId) => ({
              ticketId,
              organisationId,
              tagId,
            })),
          });
      }
      const updated = await tx.ticket.updateMany({
        where: { id: ticketId, organisationId, version: data.expectedVersion },
        data: {
          version: { increment: 1 },
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.priority !== undefined ? { priority: data.priority } : {}),
          ...(assign ? { assigneeId: data.assigneeId } : {}),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Ticket changed since it was opened. Refresh and try again.',
        );
      if (data.status !== undefined && data.status !== ticket.status)
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId,
            actorId: member.id,
            kind: 'STATUS_CHANGED',
            detail: { from: ticket.status, to: data.status },
          },
        });
      if (data.priority !== undefined && data.priority !== ticket.priority)
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId,
            actorId: member.id,
            kind: 'PRIORITY_CHANGED',
            detail: { from: ticket.priority, to: data.priority },
          },
        });
      if (assign && data.assigneeId !== ticket.assigneeId)
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId,
            actorId: member.id,
            kind: 'ASSIGNED',
            detail: { assigneeId: data.assigneeId },
          },
        });
      if (data.tagIds !== undefined)
        await tx.ticketEvent.create({
          data: {
            organisationId,
            ticketId,
            actorId: member.id,
            kind: 'TAGS_CHANGED',
            customerVisible: false,
            detail: { tagIds: [...new Set(data.tagIds)] },
          },
        });
      return tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: summary,
      });
    });
  }
}
@Module({ controllers: [TicketsController] })
export class TicketsModule {}
