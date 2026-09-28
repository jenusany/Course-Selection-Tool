// The one place that decides who may view or edit a student's academic
// file. Framework-independent and pure so both apps/web and any future
// consumer share a single answer — mirrors how validateScheduleAddition and
// canonical badge computation are the single source of truth elsewhere.

export type ViewerRole = "STUDENT" | "COUNSELLOR" | "ADMIN";

export interface AcademicFileAccessInput {
  viewerRole: ViewerRole;
  viewerUserId: string;
  targetStudentUserId: string;
  /** User ids of counsellors with an active CounsellorStudent link to the target student. */
  assignedCounsellorUserIds: readonly string[];
}

/** Whether the viewer may see the target student's academic file (student self-view, an assigned counsellor, or any admin). */
export function canViewAcademicFile(input: AcademicFileAccessInput): boolean {
  switch (input.viewerRole) {
    case "ADMIN":
      return true;
    case "STUDENT":
      return input.viewerUserId === input.targetStudentUserId;
    case "COUNSELLOR":
      return input.assignedCounsellorUserIds.includes(input.viewerUserId);
    default:
      return false;
  }
}

/** Whether the viewer may add advising notes / edit the academic file. Students never can, even on their own file. */
export function canEditAcademicFile(input: AcademicFileAccessInput): boolean {
  return input.viewerRole !== "STUDENT" && canViewAcademicFile(input);
}
