import { prisma } from "@wcs/db";
import type { BreadthCategory, CourseRef, MeetingTime, RequisiteNode, SectionComponent, Term } from "@wcs/core";

/** The academic year both seeded terms (Fall/Winter) share — see packages/db/prisma/seed/lib/courses.ts. */
export const PLANNING_YEAR = 2026;

export interface SectionDTO {
  id: string;
  term: Term;
  component: SectionComponent;
  sectionCode: string;
  meetingTimes: MeetingTime[];
  location: string | null;
  instructor: string | null;
  capacity: number;
  enrolledCount: number;
}

export interface PlanningCourseDTO {
  id: string;
  subject: string;
  number: string;
  subjectName: string;
  title: string;
  description: string | null;
  creditWeight: number;
  essay: boolean;
  breadth: BreadthCategory | null;
  level: number;
  prerequisiteTree: RequisiteNode | null;
  antirequisiteTree: RequisiteNode | null;
  sections: SectionDTO[];
}

export async function getPlanningCourses(): Promise<PlanningCourseDTO[]> {
  const rows = await prisma.course.findMany({
    where: { sections: { some: { year: PLANNING_YEAR } } },
    include: { sections: { where: { year: PLANNING_YEAR }, orderBy: [{ term: "asc" }, { component: "asc" }, { sectionCode: "asc" }] } },
    orderBy: [{ subject: "asc" }, { number: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id,
    subject: c.subject,
    number: c.number,
    subjectName: c.subjectName,
    title: c.title,
    description: c.description,
    creditWeight: c.creditWeight,
    essay: c.essay,
    breadth: c.breadth,
    level: c.level,
    prerequisiteTree: (c.prerequisiteTree as RequisiteNode | null) ?? null,
    antirequisiteTree: (c.antirequisiteTree as RequisiteNode | null) ?? null,
    sections: c.sections.map((s) => ({
      id: s.id,
      term: s.term,
      component: s.component,
      sectionCode: s.sectionCode,
      meetingTimes: s.meetingTimes as unknown as MeetingTime[],
      location: s.location,
      instructor: s.instructor,
      capacity: s.capacity,
      enrolledCount: s.enrolledCount,
    })),
  }));
}

export interface ScheduleItemDTO {
  id: string;
  courseId: string;
  preferredSectionId: string | null;
  fallbackSectionId: string | null;
}

export interface DraftScheduleDTO {
  id: string;
  term: Term;
  year: number;
  name: string;
  isEnrollmentPlan: boolean;
  items: ScheduleItemDTO[];
}

export async function getDraftSchedules(studentId: string): Promise<DraftScheduleDTO[]> {
  const rows = await prisma.draftSchedule.findMany({
    where: { studentId, year: PLANNING_YEAR },
    include: { items: true },
    orderBy: [{ term: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    term: s.term,
    year: s.year,
    name: s.name,
    isEnrollmentPlan: s.isEnrollmentPlan,
    items: s.items.map((i) => ({
      id: i.id,
      courseId: i.courseId,
      preferredSectionId: i.preferredSectionId,
      fallbackSectionId: i.fallbackSectionId,
    })),
  }));
}

export interface StudentRecordDTO {
  completed: { course: CourseRef; grade: number }[];
  inProgress: CourseRef[];
  moduleCodes: string[];
}
