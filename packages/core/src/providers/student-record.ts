import type { CompletedCourse, Hold, InProgressCourse, StudentProfile } from "../types/domain.js";

/**
 * Boundary interface to Western's real student record system (PeopleSoft /
 * Student Center). packages/db ships a mock implementation backed by seeded
 * Postgres data; a future real implementation swaps in here without any
 * change to code in packages/core.
 */
export interface StudentRecordProvider {
  getProfile(studentId: string): Promise<StudentProfile>;
  getCompletedCourses(studentId: string): Promise<CompletedCourse[]>;
  getInProgressCourses(studentId: string): Promise<InProgressCourse[]>;
  getHolds(studentId: string): Promise<Hold[]>;
  getEnrollmentAppointment(studentId: string): Promise<Date | null>;
}
