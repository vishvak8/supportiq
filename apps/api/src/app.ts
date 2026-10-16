import 'reflect-metadata';
import {
  Module,
  Global,
  Controller,
  Get,
  Inject,
  Catch,
  HttpException,
  ServiceUnavailableException,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Database } from './database.js';
import { Security } from './security.js';
import { settings } from './config.js';
import { AuthModule } from './auth.js';
import { OrganisationsModule } from './organisations.js';
import { TicketsModule } from './tickets.js';
import { TeamModule } from './team.js';
import { EmailService } from './email.js';
import { PrivateStorage } from './storage.js';
import { KnowledgeModule } from './knowledge.js';
import { AiModule } from './ai.js';
import { ReportsModule } from './reports.js';
import { TagsModule } from './tags.js';
@Global()
@Module({
  providers: [Database, Security, EmailService, PrivateStorage],
  exports: [Database, Security, EmailService, PrivateStorage],
})
class CoreModule {}
@Controller('health')
class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }
}
@Module({
  imports: [
    CoreModule,
    AuthModule,
    OrganisationsModule,
    TicketsModule,
    TeamModule,
    KnowledgeModule,
    AiModule,
    ReportsModule,
    TagsModule,
  ],
  controllers: [HealthController],
})
class AppModule {}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail =
      error instanceof HttpException
        ? error.getResponse()
        : 'An unexpected error occurred';
    const message =
      typeof detail === 'object' && detail && 'message' in detail
        ? detail.message
        : detail;
    response.status(status).json({
      statusCode: status,
      message,
      requestId: response.getHeader('X-Request-Id'),
    });
  }
}
export async function createApp() {
  settings();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', false);
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', randomUUID());
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => {
      // No URLs, bodies, tokens, cookie headers, user IDs or exception contents.
      if (process.env.NODE_ENV !== 'test')
        process.stdout.write(
          JSON.stringify({
            requestId: res.getHeader('X-Request-Id'),
            method: req.method,
            status: res.statusCode,
          }) + '\n',
        );
    });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      try {
        app.get(Security).verifyCsrf(req);
      } catch (e) {
        const h = e as HttpException;
        res.status(h.getStatus()).json({
          statusCode: h.getStatus(),
          message: h.message,
          requestId: res.getHeader('X-Request-Id'),
        });
        return;
      }
    }
    next();
  });
  app.useGlobalFilters(new Errors());
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('SupportIQ REST API')
      .setDescription(
        'Stage 1. Browser uses /api proxy. Unsafe requests require exact Origin, CSRF cookie and X-CSRF-Token; session cookie authenticates protected routes.',
      )
      .setVersion('0.1.0')
      .addCookieAuth(settings().sessionName)
      .build(),
  );
  SwaggerModule.setup('docs', app, doc, {
    swaggerOptions: { persistAuthorization: false },
  });
  await app.init();
  return app;
}
