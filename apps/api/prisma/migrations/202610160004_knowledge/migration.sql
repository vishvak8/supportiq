-- CreateEnum
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ARTICLE', 'UPLOAD');

-- CreateEnum
CREATE TYPE "IngestionJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "originalName" TEXT,
    "mediaType" TEXT NOT NULL,
    "objectKey" TEXT,
    "body" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "status" "IngestionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_objectKey_key" ON "KnowledgeDocument"("objectKey");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_organisationId_status_updatedAt_idx" ON "KnowledgeDocument"("organisationId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_id_organisationId_key" ON "KnowledgeDocument"("id", "organisationId");

-- CreateIndex
CREATE INDEX "DocumentChunk_organisationId_documentId_generation_idx" ON "DocumentChunk"("organisationId", "documentId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_generation_chunkIndex_key" ON "DocumentChunk"("documentId", "generation", "chunkIndex");

-- CreateIndex
CREATE INDEX "IngestionJob_status_runAfter_lockedUntil_idx" ON "IngestionJob"("status", "runAfter", "lockedUntil");

-- Vector search indexes keep similarity retrieval inside PostgreSQL.
CREATE INDEX "DocumentChunk_embedding_hnsw_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE UNIQUE INDEX "IngestionJob_documentId_generation_key" ON "IngestionJob"("documentId", "generation");

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_createdById_organisationId_fkey" FOREIGN KEY ("createdById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_organisationId_fkey" FOREIGN KEY ("documentId", "organisationId") REFERENCES "KnowledgeDocument"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_documentId_organisationId_fkey" FOREIGN KEY ("documentId", "organisationId") REFERENCES "KnowledgeDocument"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;
