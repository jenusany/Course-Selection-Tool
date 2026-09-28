"use client";

import type { MeetingTime } from "@wcs/core";

const DAYS: MeetingTime["day"][] = ["MO", "TU", "WE", "TH", "FR"];
const DAY_LABEL: Record<MeetingTime["day"], string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri" };
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

export interface CalendarBlock {
  key: string;
  courseLabel: string;
  detailLabel: string;
  meetingTimes: MeetingTime[];
  tone: "committed" | "preview" | "preview-conflict";
  onRemove?: () => void;
}

const TONE_CLASSES: Record<CalendarBlock["tone"], string> = {
  committed: "border-western-purple/30 bg-western-purple/10 text-western-purple",
  preview: "border-dashed border-emerald-500/50 bg-emerald-50 text-emerald-800",
  "preview-conflict": "border-dashed border-red-500/60 bg-red-50 text-red-800",
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function clampPercent(minutesFromStart: number): number {
  return Math.min(100, Math.max(0, (minutesFromStart / TOTAL_MINUTES) * 100));
}

export function WeeklyCalendar({ blocks }: { blocks: CalendarBlock[] }) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="grid grid-cols-[3.5rem_repeat(5,1fr)] border-b border-neutral-200 text-xs font-medium text-neutral-500">
        <div className="px-2 py-2" />
        {DAYS.map((d) => (
          <div key={d} className="border-l border-neutral-200 px-2 py-2 text-center">
            {DAY_LABEL[d]}
          </div>
        ))}
      </div>
      <div className="relative grid grid-cols-[3.5rem_repeat(5,1fr)]" style={{ height: `${(END_HOUR - START_HOUR) * 3}rem` }}>
        <div className="relative">
          {hours.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 -translate-y-1/2 px-2 text-right text-[11px] text-neutral-600"
              style={{ top: `${clampPercent((h - START_HOUR) * 60)}%` }}
            >
              {h % 12 === 0 ? 12 : h % 12}
              {h < 12 ? "am" : "pm"}
            </div>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="relative border-l border-neutral-200">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-neutral-100"
                style={{ top: `${clampPercent((h - START_HOUR) * 60)}%` }}
              />
            ))}
            {blocks
              .flatMap((b) => b.meetingTimes.filter((m) => m.day === day).map((m) => ({ block: b, meeting: m })))
              .map(({ block, meeting }, i) => {
                const top = clampPercent(toMinutes(meeting.start) - START_HOUR * 60);
                const bottom = clampPercent(toMinutes(meeting.end) - START_HOUR * 60);
                return (
                  <div
                    key={`${block.key}-${i}`}
                    className={`absolute left-0.5 right-0.5 overflow-hidden rounded border px-1 py-0.5 text-[10px] leading-tight ${TONE_CLASSES[block.tone]}`}
                    style={{ top: `${top}%`, height: `${Math.max(bottom - top, 3)}%` }}
                    title={`${block.courseLabel} ${block.detailLabel} ${meeting.start}–${meeting.end}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-semibold">{block.courseLabel}</span>
                      {block.onRemove && (
                        <button
                          type="button"
                          onClick={block.onRemove}
                          className="shrink-0 rounded px-1 text-[10px] leading-none text-current/70 hover:bg-black/10"
                          aria-label={`Remove ${block.courseLabel}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="truncate">{block.detailLabel}</div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
