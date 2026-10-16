import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Inject,
  ForbiddenException,
  Module,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { Database } from './database.js';
import { Security, token, digest } from './security.js';
import { settings } from './config.js';
@ApiTags('Customer onboarding')
@ApiCookieAuth()
@Controller('organisations/:organisationId/customer-links')
export class OrganisationsController {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Security) private security: Security,
  ) {}
  private async admin(req: Request, id: string) {
    const member = await this.security.membership(req, id);
    if (member.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
  }
  @Post() async create(
    @Req() req: Request,
    @Param('organisationId') id: string,
  ) {
    await this.admin(req, id);
    await this.security.limit(req, 'customer-link', 30);
    const raw = token();
    const expiresAt = new Date(Date.now() + 48 * 3600000);
    await this.db.customerAccessLink.create({
      data: { organisationId: id, tokenHash: digest(raw), expiresAt },
    });
    return { url: `${settings().origin}/join#${raw}`, expiresAt };
  }
  @Get() async list(@Req() req: Request, @Param('organisationId') id: string) {
    await this.admin(req, id);
    return this.db.customerAccessLink.findMany({
      where: { organisationId: id },
      select: { id: true, createdAt: true, expiresAt: true, usedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
@Module({ controllers: [OrganisationsController] })
export class OrganisationsModule {}
