-- CreateEnum
CREATE TYPE "AiDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'DISCARDED');

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "generatedById" UUID NOT NULL,
    "ticketVersion" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "insufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDraft_organisationId_ticketId_createdAt_idx" ON "AiDraft"("organisationId", "ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiDraft_id_organisationId_key" ON "AiDraft"("id", "organisationId");

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_ticketId_organisationId_fkey" FOREIGN KEY ("ticketId", "organisationId") REFERENCES "Ticket"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDraft" ADD CONSTRAINT "AiDraft_generatedById_organisationId_fkey" FOREIGN KEY ("generatedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;
