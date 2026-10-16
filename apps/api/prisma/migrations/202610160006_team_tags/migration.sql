-- AlterTable
ALTER TABLE "AiDraft" ADD COLUMN     "edited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TeamInvitation" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTag" (
    "organisationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("ticketId","tagId")
);

-- CreateIndex
CREATE INDEX "Tag_organisationId_createdAt_idx" ON "Tag"("organisationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organisationId_name_key" ON "Tag"("organisationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organisationId_slug_key" ON "Tag"("organisationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_id_organisationId_key" ON "Tag"("id", "organisationId");

-- CreateIndex
CREATE INDEX "TicketTag_organisationId_tagId_ticketId_idx" ON "TicketTag"("organisationId", "tagId", "ticketId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_createdById_organisationId_fkey" FOREIGN KEY ("createdById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_ticketId_organisationId_fkey" FOREIGN KEY ("ticketId", "organisationId") REFERENCES "Ticket"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_tagId_organisationId_fkey" FOREIGN KEY ("tagId", "organisationId") REFERENCES "Tag"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;
