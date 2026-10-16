import {
  ConflictException,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Body,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { tagInput } from '@supportiq/contracts';
import { Database } from './database.js';
import { Security } from './security.js';
import { parse } from './validation.js';

@ApiTags('Tags')
@ApiCookieAuth()
@Controller('organisations/:organisationId/tags')
export class TagsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Security) private readonly security: Security,
  ) {}
  @Get()
  async list(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
  ) {
    const member = await this.security.membership(req, organisationId);
    if (member.role === 'CUSTOMER')
      throw new ForbiddenException('Staff access required');
    return this.db.tag.findMany({
      where: { organisationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  @Post()
  async create(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    const member = await this.security.membership(req, organisationId);
    if (member.role !== 'ADMINISTRATOR')
      throw new ForbiddenException('Administrator access required');
    const { name } = parse(tagInput, body);
    const slug = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug)
      throw new ConflictException('Choose a tag name with letters or numbers');
    try {
      return await this.db.tag.create({
        data: { organisationId, createdById: member.id, name, slug },
        select: { id: true, name: true },
      });
    } catch {
      throw new ConflictException(
        'A similar tag already exists in this organisation',
      );
    }
  }
}
@Module({ controllers: [TagsController] })
export class TagsModule {}
