-- CreateTable
CREATE TABLE "Practitioner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "practiceName" TEXT,
    "province" TEXT,
    "reminderLinkId" TEXT NOT NULL,
    "consentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardedAt" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'PRACTITIONER',
    "reminderChannel" TEXT NOT NULL DEFAULT 'NONE',
    "reminderTime" TEXT NOT NULL DEFAULT '18:00',
    "reminderIncludeSat" BOOLEAN NOT NULL DEFAULT false,
    "whatsappNumber" TEXT,
    "reminderOptInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practitionerId" TEXT NOT NULL,
    "logDate" TEXT NOT NULL,
    "newPatients" INTEGER NOT NULL DEFAULT 0,
    "followUpPatients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyLog_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConditionEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyLogId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "conditionCode" TEXT NOT NULL,
    "conditionOther" TEXT,
    "diagnosisBasis" TEXT NOT NULL DEFAULT 'CLINICAL_DIAGNOSIS',
    "alsoSeeingGp" TEXT NOT NULL DEFAULT 'UNSURE',
    "referredByGp" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConditionEntry_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Condition" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL DEFAULT '',
    "rank" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "DayOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practitionerId" TEXT NOT NULL,
    "logDate" TEXT NOT NULL,
    "markedDoneAt" DATETIME,
    "snoozedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayOverride_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderDispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practitionerId" TEXT NOT NULL,
    "logDate" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "error" TEXT,
    "scheduledFor" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderDispatch_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Practitioner_email_key" ON "Practitioner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Practitioner_reminderLinkId_key" ON "Practitioner"("reminderLinkId");

-- CreateIndex
CREATE INDEX "Practitioner_reminderChannel_idx" ON "Practitioner"("reminderChannel");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_practitionerId_idx" ON "Session"("practitionerId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "DailyLog_logDate_idx" ON "DailyLog"("logDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_practitionerId_logDate_key" ON "DailyLog"("practitionerId", "logDate");

-- CreateIndex
CREATE INDEX "ConditionEntry_dailyLogId_idx" ON "ConditionEntry"("dailyLogId");

-- CreateIndex
CREATE INDEX "ConditionEntry_category_idx" ON "ConditionEntry"("category");

-- CreateIndex
CREATE INDEX "ConditionEntry_conditionCode_idx" ON "ConditionEntry"("conditionCode");

-- CreateIndex
CREATE INDEX "ConditionEntry_alsoSeeingGp_idx" ON "ConditionEntry"("alsoSeeingGp");

-- CreateIndex
CREATE INDEX "Condition_category_idx" ON "Condition"("category");

-- CreateIndex
CREATE INDEX "Condition_isActive_idx" ON "Condition"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DayOverride_practitionerId_logDate_key" ON "DayOverride"("practitionerId", "logDate");

-- CreateIndex
CREATE INDEX "ReminderDispatch_logDate_idx" ON "ReminderDispatch"("logDate");

-- CreateIndex
CREATE INDEX "ReminderDispatch_status_idx" ON "ReminderDispatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDispatch_practitionerId_logDate_channel_key" ON "ReminderDispatch"("practitionerId", "logDate", "channel");

