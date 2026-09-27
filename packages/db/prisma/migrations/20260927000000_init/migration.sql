-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'COUNSELLOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "StudentStanding" AS ENUM ('GOOD_STANDING', 'ON_PROBATION', 'REQUIRED_TO_WITHDRAW');

-- CreateEnum
CREATE TYPE "HoldType" AS ENUM ('FINANCIAL', 'ADVISING', 'MEDICAL_CLEARANCE', 'DISCIPLINARY', 'DOCUMENT_MISSING');

-- CreateEnum
CREATE TYPE "Term" AS ENUM ('FALL', 'WINTER', 'SUMMER');

-- CreateEnum
CREATE TYPE "BreadthCategory" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "SectionComponent" AS ENUM ('LEC', 'LAB', 'TUT');

-- CreateEnum
CREATE TYPE "ModuleType" AS ENUM ('HONOURS_SPECIALIZATION', 'MAJOR', 'MINOR', 'SPECIALIZATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('PENDING', 'QUEUED', 'VALIDATING', 'ENROLLED', 'PARTIALLY_ENROLLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AccommodationStatus" AS ENUM ('REQUESTED', 'ACTIVE', 'EXPIRED', 'DENIED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounsellorStudent" (
    "id" TEXT NOT NULL,
    "counsellorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounsellorStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "standing" "StudentStanding" NOT NULL DEFAULT 'GOOD_STANDING',
    "enrollmentAppointment" TIMESTAMP(3),
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hold" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "HoldType" NOT NULL,
    "reason" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creditWeight" DOUBLE PRECISION NOT NULL,
    "essay" BOOLEAN NOT NULL DEFAULT false,
    "breadth" "BreadthCategory",
    "level" INTEGER NOT NULL,
    "prerequisiteText" TEXT,
    "antirequisiteText" TEXT,
    "corequisiteText" TEXT,
    "extraInfo" TEXT,
    "prerequisiteTree" JSONB,
    "antirequisiteTree" JSONB,
    "sourceUrl" TEXT,
    "unverified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "term" "Term" NOT NULL,
    "year" INTEGER NOT NULL,
    "component" "SectionComponent" NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "meetingTimes" JSONB NOT NULL,
    "location" TEXT,
    "instructor" TEXT,
    "capacity" INTEGER NOT NULL,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ModuleType" NOT NULL,
    "faculty" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "requirementsRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProgram" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StudentProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sectionId" TEXT,
    "term" "Term" NOT NULL,
    "year" INTEGER NOT NULL,
    "grade" INTEGER,
    "status" "EnrollmentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSchedule" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" "Term" NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isEnrollmentPlan" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "preferredSectionId" TEXT,
    "fallbackSectionId" TEXT,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentIntent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" "Term" NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "IntentStatus" NOT NULL DEFAULT 'PENDING',
    "appointmentTime" TIMESTAMP(3) NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreValidationResult" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentAttempt" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "sectionId" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisingNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "counsellorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "faculty" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "followUps" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationTicket" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AccommodationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetitionException" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetitionException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLogEntry" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DegreeAuditSnapshot" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultJson" JSONB NOT NULL,

    CONSTRAINT "DegreeAuditSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarChunk" (
    "id" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CounsellorStudent_counsellorId_studentId_key" ON "CounsellorStudent"("counsellorId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Course_subject_level_idx" ON "Course"("subject", "level");

-- CreateIndex
CREATE UNIQUE INDEX "Course_subject_number_key" ON "Course"("subject", "number");

-- CreateIndex
CREATE INDEX "Section_courseId_term_year_idx" ON "Section"("courseId", "term", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProgram_studentId_programId_key" ON "StudentProgram"("studentId", "programId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_status_idx" ON "Enrollment"("studentId", "status");

-- CreateIndex
CREATE INDEX "AccessLogEntry_studentId_createdAt_idx" ON "AccessLogEntry"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "DegreeAuditSnapshot_studentId_generatedAt_idx" ON "DegreeAuditSnapshot"("studentId", "generatedAt");

-- AddForeignKey
ALTER TABLE "CounsellorStudent" ADD CONSTRAINT "CounsellorStudent_counsellorId_fkey" FOREIGN KEY ("counsellorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounsellorStudent" ADD CONSTRAINT "CounsellorStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgram" ADD CONSTRAINT "StudentProgram_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProgram" ADD CONSTRAINT "StudentProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSchedule" ADD CONSTRAINT "DraftSchedule_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DraftSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_preferredSectionId_fkey" FOREIGN KEY ("preferredSectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_fallbackSectionId_fkey" FOREIGN KEY ("fallbackSectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentIntent" ADD CONSTRAINT "EnrollmentIntent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreValidationResult" ADD CONSTRAINT "PreValidationResult_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "EnrollmentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentAttempt" ADD CONSTRAINT "EnrollmentAttempt_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "EnrollmentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisingNote" ADD CONSTRAINT "AdvisingNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisingNote" ADD CONSTRAINT "AdvisingNote_counsellorId_fkey" FOREIGN KEY ("counsellorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationTicket" ADD CONSTRAINT "AccommodationTicket_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetitionException" ADD CONSTRAINT "PetitionException_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLogEntry" ADD CONSTRAINT "AccessLogEntry_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLogEntry" ADD CONSTRAINT "AccessLogEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DegreeAuditSnapshot" ADD CONSTRAINT "DegreeAuditSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

