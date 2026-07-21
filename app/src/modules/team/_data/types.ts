/**
 * Team-workspace domain types. All state lives under dal.settings keys
 * (see keys.ts). Money is integer cents everywhere; times are ISO strings
 * produced from currentTime() so the demo clock override applies.
 */

/** A staff member on the roster. Hourly rate is integer cents. */
export interface StaffMember {
  id: string;
  name: string;
  role: TeamRole;
  hourlyRateCents: number;
  active: boolean;
}

export type TeamRole =
  | "pitmaster"
  | "counter"
  | "catering_lead"
  | "packer"
  | "driver"
  | "kitchen";

/** A single clock-in / clock-out punch. outAt null ⇒ currently on the clock. */
export interface Punch {
  id: string;
  staffId: string;
  inAt: string;        // ISO
  outAt: string | null; // ISO or null while active
}

/** A scheduled shift for one person on one day. start/end are "HH:MM" 24h. */
export interface Shift {
  id: string;
  staffId: string;
  date: string;        // YYYY-MM-DD (Mon–Sun of some week)
  role: TeamRole;
  start: string;       // "HH:MM"
  end: string;         // "HH:MM"
}

/** Editable daily sales figure (integer cents) keyed by service date. */
export interface DailySales {
  date: string;        // YYYY-MM-DD
  salesCents: number;
}

/** A team announcement / message. */
export interface TeamMessage {
  id: string;
  author: string;      // actor
  body: string;
  at: string;          // ISO
  pinned: boolean;
}

/** The whole message board bucket: announcements + editable daily briefing. */
export interface MessageBoardState {
  briefing: string;         // today's editable briefing banner text
  briefingUpdatedAt: string | null;
  briefingUpdatedBy: string | null;
  messages: TeamMessage[];
}
