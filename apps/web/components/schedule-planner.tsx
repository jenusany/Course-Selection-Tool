"use client";

import { useMemo, useState, useTransition } from "react";
import {
  buildCatalog,
  computeRequirementBadges,
  courseKey,
  evaluateRequisite,
  hasBlockingConflict,
  matchesCourseFilters,
  validateScheduleAddition,
  type BreadthCategory,
  type CatalogCourse,
  type CourseRef,
  type DegreeAuditResult,
  type ScheduleConflict,
  type Term,
} from "@wcs/core";
import type { DraftScheduleDTO, PlanningCourseDTO, SectionDTO } from "@/lib/schedule-data";
import {
  addScheduleItem,
  createDraftSchedule,
  deleteDraftSchedule,
  removeScheduleItem,
  renameDraftSchedule,
  setEnrollmentPlan,
} from "@/lib/schedule-actions";
import { WeeklyCalendar, type CalendarBlock } from "@/components/weekly-calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface SchedulePlannerProps {
  courses: PlanningCourseDTO[];
  initialSchedules: DraftScheduleDTO[];
  completed: { course: CourseRef; grade: number }[];
  inProgress: CourseRef[];
  moduleCodes: string[];
  audit: DegreeAuditResult;
}

const TERMS: Term[] = ["FALL", "WINTER"];
const TERM_LABEL: Record<Term, string> = { FALL: "Fall", WINTER: "Winter", SUMMER: "Summer" };
const BREADTH_OPTIONS: BreadthCategory[] = ["A", "B", "C"];

function toCatalogCourse(c: PlanningCourseDTO): CatalogCourse {
  return {
    subject: c.subject,
    number: c.number,
    subjectName: c.subjectName,
    title: c.title,
    creditWeight: c.creditWeight,
    level: c.level,
    breadth: c.breadth,
    essay: c.essay,
    prerequisiteTree: c.prerequisiteTree,
    antirequisiteTree: c.antirequisiteTree,
  };
}

function label(c: { subject: string; number: string }) {
  return `${c.subject} ${c.number}`;
}

export function SchedulePlanner({ courses, initialSchedules, completed, inProgress, moduleCodes, audit }: SchedulePlannerProps) {
  const [term, setTerm] = useState<Term>("FALL");
  const [schedules, setSchedules] = useState<DraftScheduleDTO[]>(initialSchedules);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(
    initialSchedules.find((s) => s.term === "FALL")?.id ?? null,
  );
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [breadthFilter, setBreadthFilter] = useState<string>("ALL");
  const [essayOnly, setEssayOnly] = useState(false);
  const [prereqsMetOnly, setPrereqsMetOnly] = useState(false);
  const [unmetOnly, setUnmetOnly] = useState(false);
  const [openSeatsOnly, setOpenSeatsOnly] = useState(false);
  const [hovered, setHovered] = useState<{ courseId: string; sectionId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const sectionById = useMemo(() => {
    const m = new Map<string, SectionDTO & { courseId: string }>();
    for (const c of courses) for (const s of c.sections) m.set(s.id, { ...s, courseId: c.id });
    return m;
  }, [courses]);
  const catalog = useMemo(() => buildCatalog(courses.map(toCatalogCourse)), [courses]);
  const subjects = useMemo(() => [...new Set(courses.map((c) => c.subject))].sort(), [courses]);
  const levels = useMemo(() => [...new Set(courses.map((c) => c.level))].sort((a, b) => a - b), [courses]);

  const termSchedules = useMemo(() => schedules.filter((s) => s.term === term), [schedules, term]);
  const activeSchedule = useMemo(
    () => termSchedules.find((s) => s.id === activeScheduleId) ?? termSchedules[0] ?? null,
    [termSchedules, activeScheduleId],
  );

  const existingEntries = useMemo(() => {
    if (!activeSchedule) return [];
    return activeSchedule.items.flatMap((item) => {
      const course = courseById.get(item.courseId);
      if (!course) return [];
      const section = item.preferredSectionId ? (sectionById.get(item.preferredSectionId) ?? null) : null;
      return [{ course: { subject: course.subject, number: course.number }, creditWeight: course.creditWeight, section }];
    });
  }, [activeSchedule, courseById, sectionById]);

  const committedCredits = existingEntries.reduce((sum, e) => sum + e.creditWeight, 0);

  const badgesByKey = useMemo(() => {
    const map = new Map<string, { label: string; source: string }[]>();
    for (const c of courses) map.set(courseKey(c), computeRequirementBadges(c, audit));
    return map;
  }, [courses, audit]);

  const prereqStatusByCourseId = useMemo(() => {
    const map = new Map<string, "SATISFIED" | "NOT_SATISFIED" | "UNKNOWN">();
    for (const c of courses) {
      map.set(
        c.id,
        c.prerequisiteTree
          ? evaluateRequisite(c.prerequisiteTree, { catalog, completed, inProgress, moduleCodes })
          : "SATISFIED",
      );
    }
    return map;
  }, [courses, catalog, completed, inProgress, moduleCodes]);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (!c.sections.some((s) => s.term === term)) return false;
      if (
        !matchesCourseFilters(toCatalogCourse(c), {
          query: query || undefined,
          subject: subjectFilter === "ALL" ? undefined : subjectFilter,
          level: levelFilter === "ALL" ? undefined : Number(levelFilter),
          breadth: breadthFilter === "ALL" ? undefined : (breadthFilter as BreadthCategory),
          essayOnly,
        })
      )
        return false;
      if (prereqsMetOnly && prereqStatusByCourseId.get(c.id) !== "SATISFIED") return false;
      if (unmetOnly && (badgesByKey.get(courseKey(c))?.length ?? 0) === 0) return false;
      if (openSeatsOnly && !c.sections.some((s) => s.term === term && s.enrolledCount < s.capacity)) return false;
      return true;
    });
  }, [courses, term, query, subjectFilter, levelFilter, breadthFilter, essayOnly, prereqsMetOnly, unmetOnly, openSeatsOnly, prereqStatusByCourseId, badgesByKey]);

  function conflictsFor(course: PlanningCourseDTO, section: SectionDTO): ScheduleConflict[] {
    return validateScheduleAddition({
      candidateCourse: toCatalogCourse(course),
      candidateSection: section,
      existingItems: existingEntries,
      completed,
      inProgress,
      catalog,
      moduleCodes,
    });
  }

  function handleCreateSchedule() {
    const name = newName.trim() || `${TERM_LABEL[term]} plan ${termSchedules.length + 1}`;
    startTransition(async () => {
      try {
        setError(null);
        const created = await createDraftSchedule(term, name);
        setSchedules((prev) => [...prev, created]);
        setActiveScheduleId(created.id);
        setNewName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create schedule.");
      }
    });
  }

  function handleDeleteSchedule(id: string) {
    startTransition(async () => {
      try {
        setError(null);
        await deleteDraftSchedule(id);
        setSchedules((prev) => prev.filter((s) => s.id !== id));
        if (activeScheduleId === id) setActiveScheduleId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete schedule.");
      }
    });
  }

  function handleMarkEnrollmentPlan(id: string) {
    startTransition(async () => {
      try {
        setError(null);
        await setEnrollmentPlan(id);
        setSchedules((prev) => prev.map((s) => (s.term === term ? { ...s, isEnrollmentPlan: s.id === id } : s)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't set enrollment plan.");
      }
    });
  }

  function handleAdd(course: PlanningCourseDTO, section: SectionDTO) {
    if (!activeSchedule) return;
    startTransition(async () => {
      try {
        setError(null);
        const item = await addScheduleItem(activeSchedule.id, course.id, section.id, null);
        setSchedules((prev) => prev.map((s) => (s.id === activeSchedule.id ? { ...s, items: [...s.items, item] } : s)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add course.");
      }
    });
  }

  function handleRemove(itemId: string) {
    startTransition(async () => {
      try {
        setError(null);
        await removeScheduleItem(itemId);
        setSchedules((prev) => prev.map((s) => ({ ...s, items: s.items.filter((i) => i.id !== itemId) })));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove course.");
      }
    });
  }

  const calendarBlocks: CalendarBlock[] = useMemo(() => {
    const committed: CalendarBlock[] = activeSchedule
      ? activeSchedule.items.flatMap((item) => {
          const course = courseById.get(item.courseId);
          const section = item.preferredSectionId ? sectionById.get(item.preferredSectionId) : undefined;
          if (!course || !section) return [];
          return [
            {
              key: item.id,
              courseLabel: label(course),
              detailLabel: `${section.component} ${section.sectionCode}`,
              meetingTimes: section.meetingTimes,
              tone: "committed" as const,
              onRemove: () => handleRemove(item.id),
            },
          ];
        })
      : [];

    if (hovered) {
      const course = courseById.get(hovered.courseId);
      const section = sectionById.get(hovered.sectionId);
      if (course && section && section.term === term) {
        const conflicts = conflictsFor(course, section);
        committed.push({
          key: "preview",
          courseLabel: label(course),
          detailLabel: `${section.component} ${section.sectionCode} (preview)`,
          meetingTimes: section.meetingTimes,
          tone: hasBlockingConflict(conflicts.filter((c) => c.type === "TIME_CONFLICT")) ? "preview-conflict" : "preview",
        });
      }
    }
    return committed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchedule, courseById, sectionById, hovered, term, existingEntries]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* A plain toggle group, not Radix Tabs: this switches a filter, not a tabpanel, so
              there's no associated tabpanel content for a real ARIA tabs pattern to control. */}
          <div role="group" aria-label="Select term" className="inline-flex rounded-md border border-neutral-200 bg-white p-1">
            {TERMS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={term === t}
                onClick={() => setTerm(t)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  term === t ? "bg-western-purple text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {TERM_LABEL[t]}
              </button>
            ))}
          </div>
          <span className="text-xs text-neutral-600">{committedCredits.toFixed(1)} credits in this draft</span>
        </div>

        <div className="flex flex-wrap gap-2 rounded-lg border border-neutral-200 bg-white p-3">
          <Input placeholder="Search subject, number, or title" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56" />
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-40" aria-label="Filter by subject"><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-32" aria-label="Filter by level"><SelectValue placeholder="Level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All levels</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l} value={String(l)}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={breadthFilter} onValueChange={setBreadthFilter}>
            <SelectTrigger className="w-36" aria-label="Filter by breadth category"><SelectValue placeholder="Breadth" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All breadth</SelectItem>
              {BREADTH_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>Category {b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(
            [
              ["Essay only", essayOnly, setEssayOnly],
              ["Prereqs met", prereqsMetOnly, setPrereqsMetOnly],
              ["Satisfies unmet requirement", unmetOnly, setUnmetOnly],
              ["Open seats", openSeatsOnly, setOpenSeatsOnly],
            ] as const satisfies ReadonlyArray<[string, boolean, (v: boolean) => void]>
          ).map(([lbl, checked, setter]) => (
            <label key={lbl} className="flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1.5 text-xs text-neutral-700">
              <Checkbox checked={checked} onCheckedChange={(v) => setter(v === true)} />
              {lbl}
            </label>
          ))}
        </div>

        {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>}

        <ul className="space-y-3">
          {filtered.map((course) => {
            const badges = badgesByKey.get(courseKey(course)) ?? [];
            const prereqStatus = prereqStatusByCourseId.get(course.id);
            const termSections = course.sections.filter((s) => s.term === term);
            return (
              <li key={course.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-neutral-900">{label(course)}</p>
                    <p className="text-sm text-neutral-700">{course.title}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <Badge variant="outline">{course.creditWeight.toFixed(1)} credit</Badge>
                    {course.breadth && <Badge variant="outline">Category {course.breadth}</Badge>}
                    {course.essay && <Badge variant="outline">Essay</Badge>}
                    {prereqStatus === "NOT_SATISFIED" && <Badge variant="destructive">Prereqs not met</Badge>}
                    {prereqStatus === "UNKNOWN" && <Badge variant="secondary">Prereqs unclear</Badge>}
                  </div>
                </div>
                {badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {badges.map((b) => (
                      <span key={`${b.source}-${b.label}`} className="rounded-full bg-western-purple/10 px-2 py-0.5 text-[11px] text-western-purple" title={b.label}>
                        Counts toward {b.source}
                      </span>
                    ))}
                  </div>
                )}
                <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
                  {termSections.map((section) => {
                    const conflicts = conflictsFor(course, section);
                    const blocked = hasBlockingConflict(conflicts);
                    const already = existingEntries.some((e) => courseKey(e.course) === courseKey(course));
                    return (
                      <li
                        key={section.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                        onMouseEnter={() => setHovered({ courseId: course.id, sectionId: section.id })}
                        onMouseLeave={() => setHovered((h) => (h?.sectionId === section.id ? null : h))}
                      >
                        <div className="text-neutral-600">
                          <span className="font-medium text-neutral-800">{section.component} {section.sectionCode}</span>{" "}
                          {section.meetingTimes.map((m) => `${m.day} ${m.start}–${m.end}`).join(", ") || "No scheduled meetings"}
                          {" · "}
                          {section.instructor} · {section.location} · {section.enrolledCount}/{section.capacity} seats
                        </div>
                        <div className="flex items-center gap-2">
                          {conflicts.length > 0 && (
                            <span className={blocked ? "text-red-700" : "text-amber-700"} title={conflicts.map((c) => c.message).join(" ")}>
                              {blocked ? "Can't add" : "Warning"}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending || blocked || already || !activeSchedule}
                            onClick={() => handleAdd(course, section)}
                          >
                            {already ? "Added" : "Add"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">No courses match these filters.</li>}
        </ul>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Draft schedules — {TERM_LABEL[term]}</h2>
          </div>
          <ul className="mt-2 space-y-1">
            {termSchedules.map((s) => (
              <li key={s.id} className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm ${s.id === activeSchedule?.id ? "bg-western-purple/10" : ""}`}>
                <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveScheduleId(s.id)}>
                  {s.name} {s.isEnrollmentPlan && <Badge className="ml-1">Enrollment plan</Badge>}
                  <span className="ml-1 text-xs text-neutral-600">({s.items.length})</span>
                </button>
                {!s.isEnrollmentPlan && (
                  <button type="button" disabled={isPending} onClick={() => handleMarkEnrollmentPlan(s.id)} className="text-xs text-western-purple underline disabled:opacity-50">
                    Mark as plan
                  </button>
                )}
                <button type="button" disabled={isPending} onClick={() => handleDeleteSchedule(s.id)} className="text-xs text-neutral-600 hover:text-red-600 disabled:opacity-50">
                  Delete
                </button>
              </li>
            ))}
            {termSchedules.length === 0 && <li className="px-2 py-1.5 text-sm text-neutral-500">No draft schedules yet for {TERM_LABEL[term]}.</li>}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input placeholder="New schedule name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-xs" />
            <Button size="sm" disabled={isPending} onClick={handleCreateSchedule}>New</Button>
          </div>
        </div>

        <WeeklyCalendar blocks={calendarBlocks} />

        {activeSchedule && (
          <div className="rounded-lg border border-neutral-200 bg-white p-3" data-testid="active-schedule-panel">
            <h3 className="text-sm font-semibold text-neutral-900">{activeSchedule.name}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {activeSchedule.items.map((item) => {
                const course = courseById.get(item.courseId);
                const section = item.preferredSectionId ? sectionById.get(item.preferredSectionId) : undefined;
                if (!course) return null;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span>
                      {label(course)} {section && `— ${section.component} ${section.sectionCode}`}
                    </span>
                    <button type="button" onClick={() => handleRemove(item.id)} className="text-xs text-neutral-600 hover:text-red-600">
                      Remove
                    </button>
                  </li>
                );
              })}
              {activeSchedule.items.length === 0 && <li className="text-neutral-500">No courses added yet.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
