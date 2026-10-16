import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Module,
  Param,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Database } from './database.js';
import { Security } from './security.js';

@ApiTags('Reports')
@ApiCookieAuth()
@Controller('organisations/:organisationId/reports')
export class ReportsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Security) private readonly security: Security,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Organisation-scoped ticket volume, response, resolution, backlog and agent workload metrics',
  })
  async summary(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
  ) {
    const member = await this.security.membership(req, organisationId);
    if (member.role === 'CUSTOMER')
      throw new ForbiddenException('Staff access required');
    const [
      statuses,
      priorities,
      response,
      resolution,
      backlog,
      workload,
      recent,
    ] = await Promise.all([
      this.db.ticket.groupBy({
        by: ['status'],
        where: { organisationId },
        _count: { _all: true },
      }),
      this.db.ticket.groupBy({
        by: ['priority'],
        where: { organisationId },
        _count: { _all: true },
      }),
      this.db.$queryRaw<{ averageHours: number | null; responded: bigint }[]>`
        WITH first_reply AS (
          SELECT m."ticketId", min(m."createdAt") AS "repliedAt"
          FROM "Message" m JOIN "Membership" a ON a."id" = m."authorId" AND a."organisationId" = m."organisationId"
          WHERE m."organisationId" = ${organisationId}::uuid AND m."internal" = false AND a."role" IN ('ADMINISTRATOR'::"Role", 'AGENT'::"Role")
          GROUP BY m."ticketId"
        )
        SELECT avg(extract(epoch from (r."repliedAt" - t."createdAt")) / 3600)::float8 AS "averageHours", count(*)::bigint AS "responded"
        FROM first_reply r JOIN "Ticket" t ON t."id" = r."ticketId" WHERE t."organisationId" = ${organisationId}::uuid
      `,
      this.db.$queryRaw<{ averageHours: number | null; resolved: bigint }[]>`
        WITH first_resolution AS (
          SELECT DISTINCT ON (e."ticketId") e."ticketId", e."createdAt" AS "resolvedAt"
          FROM "TicketEvent" e WHERE e."organisationId" = ${organisationId}::uuid AND e."kind" = 'STATUS_CHANGED'
            AND e."detail"->>'to' IN ('RESOLVED', 'CLOSED') ORDER BY e."ticketId", e."createdAt"
        )
        SELECT avg(extract(epoch from (r."resolvedAt" - t."createdAt")) / 3600)::float8 AS "averageHours", count(*)::bigint AS "resolved"
        FROM first_resolution r JOIN "Ticket" t ON t."id" = r."ticketId" WHERE t."organisationId" = ${organisationId}::uuid
      `,
      this.db.$queryRaw<
        { under24h: bigint; day1to3: bigint; over3d: bigint }[]
      >`
        SELECT count(*) FILTER (WHERE "createdAt" > now() - interval '24 hours')::bigint AS "under24h",
          count(*) FILTER (WHERE "createdAt" <= now() - interval '24 hours' AND "createdAt" > now() - interval '3 days')::bigint AS "day1to3",
          count(*) FILTER (WHERE "createdAt" <= now() - interval '3 days')::bigint AS "over3d"
        FROM "Ticket" WHERE "organisationId" = ${organisationId}::uuid AND "status" IN ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER')
      `,
      this.db.ticket.groupBy({
        by: ['assigneeId'],
        where: { organisationId, status: { notIn: ['CLOSED', 'RESOLVED'] } },
        _count: { _all: true },
      }),
      this.db.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, count(*)::bigint AS count
        FROM "Ticket" WHERE "organisationId" = ${organisationId}::uuid AND "createdAt" >= now() - interval '14 days'
        GROUP BY date_trunc('day', "createdAt") ORDER BY date_trunc('day', "createdAt")
      `,
    ]);
    const agents = await this.db.membership.findMany({
      where: { organisationId, role: 'AGENT' },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
      take: 200,
    });
    const workloadById = new Map(
      workload.map((row) => [row.assigneeId, row._count._all]),
    );
    return {
      totalTickets: statuses.reduce((sum, row) => sum + row._count._all, 0),
      byStatus: Object.fromEntries(
        statuses.map((row) => [row.status, row._count._all]),
      ),
      byPriority: Object.fromEntries(
        priorities.map((row) => [row.priority, row._count._all]),
      ),
      response: {
        averageHours: response[0]?.averageHours ?? null,
        responded: Number(response[0]?.responded ?? 0n),
      },
      resolution: {
        averageHours: resolution[0]?.averageHours ?? null,
        resolved: Number(resolution[0]?.resolved ?? 0n),
      },
      backlogAge: {
        under24h: Number(backlog[0]?.under24h ?? 0n),
        day1to3: Number(backlog[0]?.day1to3 ?? 0n),
        over3d: Number(backlog[0]?.over3d ?? 0n),
      },
      workload: [
        ...agents.map((agent) => ({
          id: agent.id,
          name: agent.user.name,
          openTickets: workloadById.get(agent.id) ?? 0,
        })),
        {
          id: null as string | null,
          name: 'Unassigned',
          openTickets: workloadById.get(null) ?? 0,
        },
      ],
      unassignedTickets: workloadById.get(null) ?? 0,
      createdLast14Days: recent.map((row) => ({
        day: row.day,
        count: Number(row.count),
      })),
    };
  }
}

@Module({ controllers: [ReportsController] })
export class ReportsModule {}
