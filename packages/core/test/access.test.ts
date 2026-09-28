import { describe, expect, it } from "vitest";
import { canEditAcademicFile, canViewAcademicFile } from "../src/access/scope.js";

const base = {
  targetStudentUserId: "student-1",
  assignedCounsellorUserIds: ["counsellor-a"],
};

describe("canViewAcademicFile", () => {
  it("lets a student view their own file", () => {
    expect(canViewAcademicFile({ ...base, viewerRole: "STUDENT", viewerUserId: "student-1" })).toBe(true);
  });

  it("blocks a student from another student's file", () => {
    expect(canViewAcademicFile({ ...base, viewerRole: "STUDENT", viewerUserId: "student-2" })).toBe(false);
  });

  it("lets an assigned counsellor view the file", () => {
    expect(canViewAcademicFile({ ...base, viewerRole: "COUNSELLOR", viewerUserId: "counsellor-a" })).toBe(true);
  });

  it("blocks an unassigned counsellor from the file", () => {
    expect(canViewAcademicFile({ ...base, viewerRole: "COUNSELLOR", viewerUserId: "counsellor-b" })).toBe(false);
  });

  it("lets an admin view any file, assigned or not", () => {
    expect(canViewAcademicFile({ ...base, viewerRole: "ADMIN", viewerUserId: "admin-1" })).toBe(true);
  });
});

describe("canEditAcademicFile", () => {
  it("never lets a student edit, even their own file", () => {
    expect(canEditAcademicFile({ ...base, viewerRole: "STUDENT", viewerUserId: "student-1" })).toBe(false);
  });

  it("lets an assigned counsellor edit", () => {
    expect(canEditAcademicFile({ ...base, viewerRole: "COUNSELLOR", viewerUserId: "counsellor-a" })).toBe(true);
  });

  it("blocks an unassigned counsellor from editing", () => {
    expect(canEditAcademicFile({ ...base, viewerRole: "COUNSELLOR", viewerUserId: "counsellor-b" })).toBe(false);
  });

  it("lets an admin edit any file", () => {
    expect(canEditAcademicFile({ ...base, viewerRole: "ADMIN", viewerUserId: "admin-1" })).toBe(true);
  });
});
