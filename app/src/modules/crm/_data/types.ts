/**
 * CRM workspace — module-local domain types.
 *
 * The V2 DAL has no tasks / conversations / automations / opportunity-overlay
 * repository. Rather than change the schema, this workspace layers those
 * concepts on top of the REAL data (dal.leads is the opportunity/contact
 * backbone) and persists the new state through dal.settings under the keys in
 * ./keys.ts. When proper repositories land server-side, migrate these shapes
 * into src/dal/types.ts and delete this folder (noted in the builder report).
 */
import type { LeadStage } from "../../../dal/types";

// ── Tasks ("crm.tasks") ─────────────────────────────────────────────────────
export type CrmTaskPriority = "low" | "normal" | "high" | "urgent";

export interface CrmTask {
  id: string;
  title: string;
  /** ISO date-only ("2026-07-25"). null = no due date (treated as upcoming). */
  dueDate: string | null;
  priority: CrmTaskPriority;
  done: boolean;
  /** Optional link to a lead (opportunity/contact backbone). */
  leadId: string | null;
  /** Denormalised label so a task reads standalone even if the lead is gone. */
  linkedLabel: string | null;
  notes: string | null;
  /** How the task was born — "manual" or the id of the automation that spawned it. */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Conversation threads ("crm.threads") ─────────────────────────────────────
export type CrmChannel = "call" | "email" | "sms" | "note";

export interface CrmMessage {
  id: string;
  channel: CrmChannel;
  body: string;
  actor: string;
  at: string;
}

/** Locally-added messages keyed by leadId. Seeded thread comes from lead.activity. */
export type CrmThreadMap = Record<string, CrmMessage[]>;

// ── Opportunity overlay ("crm.opportunities") ────────────────────────────────
/** Per-lead estimate that augments the lead when budgetCents is missing/wrong. */
export interface CrmOppOverlay {
  /** Estimated deal value in integer cents (null = fall back to lead.budgetCents). */
  estimatedValueCents: number | null;
  /** Win probability 0–100. */
  probabilityPct: number;
  /** Deal owner name. */
  owner: string;
}

export type CrmOppOverlayMap = Record<string, CrmOppOverlay>;

// ── Automations ("crm.automations") ──────────────────────────────────────────
export type CrmTriggerKind = "stage_dwell" | "no_activity" | "event_approaching";
export type CrmActionKind = "create_task" | "reminder";

export interface CrmAutomation {
  id: string;
  name: string;
  enabled: boolean;
  trigger: CrmTriggerKind;
  /** For stage_dwell: the stage a lead must be sitting in. */
  stage: LeadStage;
  /** Threshold in days (dwell time, days since last activity, or days-to-event). */
  days: number;
  action: CrmActionKind;
  /** Task title template; "{lead}" is replaced with the lead name. */
  taskTitle: string;
  taskPriority: CrmTaskPriority;
  createdAt: string;
  updatedAt: string;
}
