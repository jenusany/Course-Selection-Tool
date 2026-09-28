-- AlterTable
ALTER TABLE "EnrollmentAttempt" ADD COLUMN     "courseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_courseId_term_year_key" ON "Enrollment"("studentId", "courseId", "term", "year");

-- CreateIndex
CREATE INDEX "EnrollmentAttempt_intentId_sectionId_idx" ON "EnrollmentAttempt"("intentId", "sectionId");

-- CreateIndex
CREATE INDEX "EnrollmentIntent_status_appointmentTime_idx" ON "EnrollmentIntent"("status", "appointmentTime");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentIntent_studentId_term_year_key" ON "EnrollmentIntent"("studentId", "term", "year");

