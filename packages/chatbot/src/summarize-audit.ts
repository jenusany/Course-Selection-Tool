import type { DegreeAuditResult } from "@wcs/core";

/** Compact, deterministic text digest of a degree audit — used as the get_degree_audit tool's result content. */
export function summarizeAuditForTool(audit: DegreeAuditResult): string {
  const lines: string[] = [];
  lines.push(`Degree: ${audit.degree.name} — overall status ${audit.status}.`);
  lines.push(`Degree credits: ${audit.creditsCompleted}/${audit.creditsRequired} completed, ${audit.creditsInProgress} in progress.`);

  for (const m of audit.modules) {
    lines.push(`Module: ${m.name} (${m.type.replace(/_/g, " ").toLowerCase()}) — ${m.status}. ${m.creditsCompleted}/${m.creditsRequired} credits completed, ${m.creditsInProgress} in progress.`);
    for (const r of m.requirements.filter((r) => r.status === "UNMET")) {
      const suggestions = r.suggestedCourses.slice(0, 3).map((c) => `${c.subject} ${c.number}`);
      lines.push(`  Unmet: ${r.label} (needs ${r.creditsRequired} credits)${suggestions.length ? ` — e.g. ${suggestions.join(", ")}` : ""}`);
    }
  }

  for (const r of audit.degreeRequirements.filter((r) => r.status === "UNMET")) {
    lines.push(`Unmet degree requirement: ${r.label}`);
  }

  if (audit.warnings.length > 0) lines.push(`Warnings: ${audit.warnings.map((w) => w.message).join("; ")}`);
  if (audit.advisories.length > 0) lines.push(`Advisories: ${audit.advisories.map((a) => a.message).join("; ")}`);

  return lines.join("\n");
}
