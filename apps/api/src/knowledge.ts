import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
  forwardRef,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import { z } from 'zod';
import { Database } from './database.js';
import { Security } from './security.js';
import { PrivateStorage } from './storage.js';
import { OllamaProvider } from './ollama.js';
import { parse } from './validation.js';

const articleInput = z
  .object({
    title: z.string().trim().min(3).max(160),
    content: z.string().trim().min(40).max(100000),
  })
  .strict();
const searchInput = z
  .object({ query: z.string().trim().min(2).max(500) })
  .strict();
const docSelect = {
  id: true,
  title: true,
  type: true,
  originalName: true,
  mediaType: true,
  status: true,
  errorMessage: true,
  generation: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface IngestionWake {
  wake(delayMs?: number): void;
}

@ApiTags('Knowledge base')
@ApiCookieAuth()
@Controller('organisations/:organisationId/knowledge')
export class KnowledgeController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Security) private readonly security: Security,
    @Inject(PrivateStorage) private readonly storage: PrivateStorage,
    @Inject(OllamaProvider) private readonly ollama: OllamaProvider,
    @Inject(forwardRef(() => IngestionWorker))
    private readonly ingestion: IngestionWake,
  ) {}

  private async staff(req: Request, organisationId: string, admin = false) {
    const member = await this.security.membership(req, organisationId);
    if (
      member.role === 'CUSTOMER' ||
      (admin && member.role !== 'ADMINISTRATOR')
    )
      throw new ForbiddenException('Staff access required');
    return member;
  }

  @Get()
  async list(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
  ) {
    await this.staff(req, organisationId);
    this.ingestion.wake();
    return this.db.knowledgeDocument.findMany({
      where: { organisationId, deletedAt: null },
      select: docSelect,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  @Get(':documentId')
  async getOne(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.staff(req, organisationId);
    const doc = await this.db.knowledgeDocument.findFirst({
      where: { id: documentId, organisationId, deletedAt: null },
      select: { ...docSelect, body: true },
    });
    if (!doc) throw new NotFoundException('Knowledge document not found');
    return doc;
  }

  @Post('articles')
  @ApiOperation({
    summary: 'Create an article and queue durable local embedding ingestion',
  })
  async createArticle(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    const member = await this.staff(req, organisationId, true);
    const data = parse(articleInput, body);
    const production = process.env.NODE_ENV === 'production';
    if (production && data.content.length > 25000)
      throw new BadRequestException(
        'Public demo articles are limited to 25,000 characters',
      );
    await this.security.limit(req, 'knowledge-write', production ? 3 : 40);
    if (production) {
      await this.security.dailyUserLimit(member.userId, 'knowledge-upload', 1);
      await this.security.dailyLimit(
        'knowledge-upload',
        Number(process.env.DEMO_DAILY_KNOWLEDGE_UPLOAD_LIMIT || 4),
      );
    }
    const doc = await this.db.knowledgeDocument.create({
      data: {
        organisationId,
        createdById: member.id,
        title: data.title,
        type: 'ARTICLE',
        mediaType: 'text/markdown',
        body: data.content,
        status: 'PENDING',
        jobs: { create: { generation: 1 } },
      },
      select: docSelect,
    });
    this.ingestion.wake();
    return doc;
  }

  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize:
          process.env.NODE_ENV === 'production'
            ? 2 * 1024 * 1024
            : 20 * 1024 * 1024,
      },
    }),
  )
  async upload(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const member = await this.staff(req, organisationId, true);
    if (!file)
      throw new BadRequestException('Choose a PDF, Markdown, or text file');
    const production = process.env.NODE_ENV === 'production';
    await this.security.limit(req, 'knowledge-write', production ? 3 : 40);
    if (production) {
      await this.security.dailyUserLimit(member.userId, 'knowledge-upload', 1);
      await this.security.dailyLimit(
        'knowledge-upload',
        Number(process.env.DEMO_DAILY_KNOWLEDGE_UPLOAD_LIMIT || 4),
      );
    }
    const extension = extname(file.originalname).toLowerCase();
    let mediaType: string;
    let body: string;
    try {
      if (
        extension === '.pdf' &&
        file.buffer.subarray(0, 5).toString() === '%PDF-'
      ) {
        const parser = new PDFParse({ data: file.buffer });
        try {
          body = (await parser.getText()).text.trim();
        } finally {
          await parser.destroy();
        }
        mediaType = 'application/pdf';
        if (body.replace(/\s/g, '').length < 80)
          throw new BadRequestException(
            'Scanned PDF contains no extractable text. OCR is not implemented; upload a text-based PDF or Markdown file.',
          );
      } else if (
        ['.txt', '.md', '.markdown'].includes(extension) &&
        !file.buffer.includes(0)
      ) {
        body = new TextDecoder('utf-8', { fatal: true })
          .decode(file.buffer)
          .trim();
        mediaType = extension === '.txt' ? 'text/plain' : 'text/markdown';
      } else
        throw new BadRequestException(
          'Only valid PDF, Markdown, and plain text files are supported',
        );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'The file could not be read as valid PDF or UTF-8 text',
      );
    }
    const maxTextLength = production ? 25000 : 500000;
    if (body.length < 40 || body.length > maxTextLength)
      throw new BadRequestException(
        `Extracted text must contain 40 to ${maxTextLength.toLocaleString()} characters`,
      );
    const key = `${organisationId}/knowledge/${randomUUID()}`;
    await this.storage.put(key, file.buffer, mediaType);
    try {
      const doc = await this.db.knowledgeDocument.create({
        data: {
          organisationId,
          createdById: member.id,
          title: file.originalname.slice(0, 160),
          originalName: file.originalname.slice(0, 240),
          mediaType,
          objectKey: key,
          body,
          type: 'UPLOAD',
          status: 'PENDING',
          jobs: { create: { generation: 1 } },
        },
        select: docSelect,
      });
      this.ingestion.wake();
      return doc;
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  @Delete(':documentId')
  async remove(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.staff(req, organisationId, true);
    const doc = await this.db.knowledgeDocument.findFirst({
      where: { id: documentId, organisationId, deletedAt: null },
      select: { id: true, objectKey: true },
    });
    if (!doc) throw new NotFoundException('Knowledge document not found');
    await this.db.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: doc.id } });
      await tx.knowledgeDocument.update({
        where: { id: doc.id },
        data: {
          deletedAt: new Date(),
          status: 'DELETED',
          generation: { increment: 1 },
          body: null,
        },
      });
      await tx.ingestionJob.updateMany({
        where: { documentId: doc.id, status: { in: ['QUEUED', 'PROCESSING'] } },
        data: { status: 'FAILED', lastError: 'Document was deleted' },
      });
    });
    if (doc.objectKey)
      await this.storage.delete(doc.objectKey).catch(() => undefined);
    return { ok: true };
  }

  @Patch(':documentId')
  async updateArticle(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
  ) {
    const member = await this.staff(req, organisationId, true);
    const data = parse(articleInput, body);
    if (process.env.NODE_ENV === 'production') {
      if (data.content.length > 25000)
        throw new BadRequestException(
          'Public demo articles are limited to 25,000 characters',
        );
      await this.security.limit(req, 'knowledge-write', 3);
      await this.security.dailyUserLimit(member.userId, 'knowledge-upload', 1);
      await this.security.dailyLimit(
        'knowledge-upload',
        Number(process.env.DEMO_DAILY_KNOWLEDGE_UPLOAD_LIMIT || 4),
      );
    }
    const updated = await this.db.$transaction(async (tx) => {
      const current = await tx.knowledgeDocument.findFirst({
        where: {
          id: documentId,
          organisationId,
          type: 'ARTICLE',
          deletedAt: null,
        },
        select: { id: true, generation: true },
      });
      if (!current) throw new NotFoundException('Knowledge article not found');
      const generation = current.generation + 1;
      const updated = await tx.knowledgeDocument.update({
        where: { id: current.id },
        data: {
          title: data.title,
          body: data.content,
          generation,
          status: 'PENDING',
          errorMessage: null,
        },
        select: docSelect,
      });
      await tx.ingestionJob.create({
        data: { organisationId, documentId, generation },
      });
      return updated;
    });
    this.ingestion.wake();
    return updated;
  }

  @Post(':documentId/retry')
  async retry(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Param('documentId') documentId: string,
  ) {
    const member = await this.staff(req, organisationId, true);
    const production = process.env.NODE_ENV === 'production';
    if (production) {
      await this.security.limit(req, 'knowledge-retry', 3);
      await this.security.dailyUserLimit(member.userId, 'knowledge-upload', 1);
      await this.security.dailyLimit(
        'knowledge-upload',
        Number(process.env.DEMO_DAILY_KNOWLEDGE_UPLOAD_LIMIT || 4),
      );
    }
    const retried = await this.db.$transaction(async (tx) => {
      const current = await tx.knowledgeDocument.findFirst({
        where: {
          id: documentId,
          organisationId,
          deletedAt: null,
          status: 'FAILED',
        },
        select: { id: true, generation: true, body: true },
      });
      if (!current?.body)
        throw new NotFoundException('Failed knowledge document not found');
      const generation = current.generation + 1;
      const updated = await tx.knowledgeDocument.update({
        where: { id: documentId },
        data: { generation, status: 'PENDING', errorMessage: null },
        select: docSelect,
      });
      await tx.ingestionJob.create({
        data: { organisationId, documentId, generation },
      });
      return updated;
    });
    this.ingestion.wake();
    return retried;
  }

  @Post('search')
  @ApiOperation({
    summary: 'Tenant-scoped semantic search over ready knowledge documents',
  })
  async search(
    @Req() req: Request,
    @Param('organisationId') organisationId: string,
    @Body() body: unknown,
  ) {
    const member = await this.staff(req, organisationId);
    const { query } = parse(searchInput, body);
    if (process.env.NODE_ENV === 'production') {
      await this.security.limit(req, 'knowledge-search', 40);
      await this.security.dailyLimit(
        'knowledge-search',
        Number(process.env.DEMO_DAILY_SEARCH_LIMIT || 60),
      );
      await this.security.dailyUserLimit(member.userId, 'knowledge-search', 10);
    }
    const [vector] = await this.ollama.embed([query], 'query');
    const encoded = `[${vector.join(',')}]`;
    return this.db.$queryRaw<
      { id: string; title: string; excerpt: string; similarity: number }[]
    >`
      SELECT c."id", d."title", left(c."content", 420) AS "excerpt",
        1 - (c."embedding" <=> ${encoded}::vector) AS "similarity"
      FROM "DocumentChunk" c
      JOIN "KnowledgeDocument" d ON d."id" = c."documentId" AND d."organisationId" = c."organisationId"
      WHERE c."organisationId" = ${organisationId}::uuid
        AND d."status" = 'READY'::"DocumentStatus" AND d."deletedAt" IS NULL
        AND c."generation" = d."generation"
      ORDER BY c."embedding" <=> ${encoded}::vector LIMIT 8
    `;
  }
}

@Injectable()
export class IngestionWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(OllamaProvider) private readonly ollama: OllamaProvider,
  ) {}
  onModuleInit() {
    if (process.env.DISABLE_INGESTION_WORKER === '1') return;
    this.wake();
  }
  wake(delayMs = 0) {
    if (process.env.DISABLE_INGESTION_WORKER === '1') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.runOne();
    }, delayMs);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private async claim() {
    const rows = await this.db.$queryRaw<
      {
        id: string;
        organisationId: string;
        documentId: string;
        generation: number;
        attempts: number;
      }[]
    >`
      WITH next_job AS (
        SELECT "id" FROM "IngestionJob"
        WHERE ("status" = 'QUEUED' AND "runAfter" <= now()) OR ("status" = 'PROCESSING' AND "lockedUntil" < now())
        ORDER BY "runAfter", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "IngestionJob" j SET "status" = 'PROCESSING', "attempts" = j."attempts" + 1,
        "lockedUntil" = now() + interval '3 minutes', "updatedAt" = now()
      FROM next_job WHERE j."id" = next_job."id"
      RETURNING j."id", j."organisationId", j."documentId", j."generation", j."attempts"
    `;
    return rows[0];
  }

  async runOne() {
    if (this.running) return;
    this.running = true;
    let claimed = false;
    let retryDelayMs: number | undefined;
    let claimFailed = false;
    try {
      const job = await this.claim();
      if (!job) {
        const next = await this.db.ingestionJob.findFirst({
          where: { status: { in: ['QUEUED', 'PROCESSING'] } },
          orderBy: { runAfter: 'asc' },
          select: { status: true, runAfter: true, lockedUntil: true },
        });
        const nextRun = next
          ? next.status === 'PROCESSING'
            ? next.lockedUntil
            : next.runAfter
          : null;
        if (nextRun) this.wake(Math.max(1000, nextRun.getTime() - Date.now()));
        return;
      }
      claimed = true;
      try {
        const document = await this.db.knowledgeDocument.findFirst({
          where: {
            id: job.documentId,
            organisationId: job.organisationId,
            generation: job.generation,
            deletedAt: null,
          },
          select: { id: true, title: true, body: true },
        });
        if (!document?.body)
          throw new Error('Document changed or has no extractable text');
        const chunks: { content: string; start: number; end: number }[] = [];
        for (let start = 0; start < document.body.length;) {
          let end = Math.min(start + 1200, document.body.length);
          if (end < document.body.length) {
            const boundary = document.body.lastIndexOf(' ', end);
            if (boundary > start + 700) end = boundary;
          }
          const content = document.body.slice(start, end).trim();
          if (content) chunks.push({ content, start, end });
          if (end >= document.body.length) break;
          start = Math.max(start + 1, end - 120);
        }
        if (!chunks.length) throw new Error('Document has no indexable text');
        const embeddings = await this.ollama.embed(
          chunks.map(
            (chunk) => `title: ${document.title} | text: ${chunk.content}`,
          ),
          'document',
        );
        await this.db.$transaction(async (tx) => {
          const current = await tx.knowledgeDocument.findFirst({
            where: {
              id: job.documentId,
              organisationId: job.organisationId,
              generation: job.generation,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!current) {
            await tx.ingestionJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                lockedUntil: null,
                lastError: 'Document was replaced or removed',
              },
            });
            return;
          }
          await tx.documentChunk.deleteMany({
            where: { documentId: job.documentId },
          });
          for (let index = 0; index < chunks.length; index++) {
            const chunk = chunks[index]!;
            const vector = `[${embeddings[index]!.join(',')}]`;
            await tx.$executeRaw`INSERT INTO "DocumentChunk" ("id", "organisationId", "documentId", "generation", "chunkIndex", "content", "startOffset", "endOffset", "embedding") VALUES (${randomUUID()}::uuid, ${job.organisationId}::uuid, ${job.documentId}::uuid, ${job.generation}, ${index}, ${chunk.content}, ${chunk.start}, ${chunk.end}, ${vector}::vector)`;
          }
          await tx.knowledgeDocument.update({
            where: { id: job.documentId },
            data: { status: 'READY', errorMessage: null },
          });
          await tx.ingestionJob.update({
            where: { id: job.id },
            data: { status: 'COMPLETE', lockedUntil: null, lastError: null },
          });
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 300)
            : 'Document ingestion failed';
        const terminal = job.attempts >= 4;
        const delay = Math.min(60, 2 ** job.attempts);
        if (!terminal) retryDelayMs = delay * 60000;
        await this.db.$transaction(async (tx) => {
          await tx.ingestionJob.update({
            where: { id: job.id },
            data: {
              status: terminal ? 'FAILED' : 'QUEUED',
              runAfter: new Date(Date.now() + delay * 60000),
              lockedUntil: null,
              lastError: message,
            },
          });
          if (terminal)
            await tx.knowledgeDocument.updateMany({
              where: {
                id: job.documentId,
                generation: job.generation,
                deletedAt: null,
              },
              data: { status: 'FAILED', errorMessage: message },
            });
          else
            await tx.knowledgeDocument.updateMany({
              where: {
                id: job.documentId,
                generation: job.generation,
                deletedAt: null,
              },
              data: { status: 'PENDING', errorMessage: message },
            });
        });
      }
    } catch {
      // Avoid polling a sleeping free database; the next knowledge-base
      // request or restart wakes durable jobs again.
      claimFailed = true;
      if (process.env.NODE_ENV !== 'test')
        process.stderr.write(
          'SupportIQ ingestion worker could not claim work; it will retry when the backend or knowledge base is used again.\n',
        );
    } finally {
      this.running = false;
      if (retryDelayMs !== undefined) this.wake(retryDelayMs);
      else if (claimed) this.wake();
      else if (claimFailed) this.wake(300000);
    }
  }
}

@Module({
  controllers: [KnowledgeController],
  providers: [OllamaProvider, IngestionWorker],
})
export class KnowledgeModule {}
