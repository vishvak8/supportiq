import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Module,
} from '@nestjs/common';
import {
  ApiTags,
  ApiCookieAuth,
  ApiBody,
  ApiQuery,
  ApiOperation,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Prisma } from './generated/prisma/client.js';
import { ticketInput, ticketQuery } from '@supportiq/contracts';
import { Database } from './database.js';
import { Security } from './security.js';
import { parse } from './validation.js';
const summary = {
  id: true,
  subject: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;
@ApiTags('Tickets')
@ApiCookieAuth()
@Controller('organisations/:organisationId/tickets')
export class TicketsController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
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
    await this.security.limit(req, 'ticket-create', 50);
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
          messages: { create: { authorId: member.id, body: data.description } },
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
    return { items, total, page: q.page, pageSize: q.pageSize };
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
    const ticket = await this.db.ticket.findFirst({
      where: {
        id: ticketId,
        organisationId: id,
        ...(member.role === 'CUSTOMER' ? { customerId: member.id } : {}),
      },
      select: {
        ...summary,
        description: true,
        messages: {
          where: { internal: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { user: { select: { name: true } } } },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return {
      ...ticket,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        author: { name: m.author.user.name },
      })),
    };
  }
}
@Module({ controllers: [TicketsController] })
export class TicketsModule {}
