-- CreateTable
CREATE TABLE "Complaint" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "viloyat" TEXT NOT NULL,
    "tuman" TEXT,
    "schoolInn" TEXT,
    "schoolName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contact" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminComment" TEXT,
    "beforeFileId" TEXT,
    "afterFileId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "daysToResolve" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_requestId_key" ON "Complaint"("requestId");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_createdAt_idx" ON "Complaint"("createdAt");

