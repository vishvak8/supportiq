-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "requestId" UUID;
UPDATE "Message" SET "requestId" = md5("id"::TEXT)::UUID;
ALTER TABLE "Message" ALTER COLUMN "requestId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "assigneeId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TicketEvent" ADD COLUMN     "customerVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "detail" JSONB;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");

-- CreateIndex
CREATE INDEX "Attachment_organisationId_ticketId_createdAt_idx" ON "Attachment"("organisationId", "ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_organisationId_authorId_requestId_key" ON "Message"("organisationId", "authorId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_organisationId_key" ON "Message"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Ticket_organisationId_assigneeId_status_updatedAt_idx" ON "Ticket"("organisationId", "assigneeId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_organisationId_fkey" FOREIGN KEY ("assigneeId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_organisationId_fkey" FOREIGN KEY ("ticketId", "organisationId") REFERENCES "Ticket"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_organisationId_fkey" FOREIGN KEY ("messageId", "organisationId") REFERENCES "Message"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_organisationId_fkey" FOREIGN KEY ("uploadedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

