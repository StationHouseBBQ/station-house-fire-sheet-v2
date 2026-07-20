/**
 * Realistic demo defaults for CRM-workspace state. These are the `fallback`
 * values passed to dal.settings.get, so a fresh demo shows a populated CRM.
 * IDs are stable strings so seeds are idempotent across reads.
 */
import type { CrmAutomation, CrmTask } from "./types";

export const CRM_TASKS_SEED: CrmTask[] = [
  {
    id: "seed-task-1",
    title: "Call back Riverside Wedding about tasting date",
    dueDate: null, // resolved to "today" lazily so the demo always has an item due today
    priority: "high",
    done: false,
    leadId: null,
    linkedLabel: "Riverside Wedding",
    notes: "They asked for a Saturday tasting — confirm pitmaster availability.",
    createdBy: "manual",
    createdAt: "2026-07-18T14:00:00.000Z",
    updatedAt: "2026-07-18T14:00:00.000Z",
  },
  {
    id: "seed-task-2",
    title: "Send updated quote to corporate lunch lead",
    dueDate: "2026-07-24",
    priority: "normal",
    done: false,
    leadId: null,
    linkedLabel: "Corporate Lunch",
    notes: null,
    createdBy: "manual",
    createdAt: "2026-07-17T16:30:00.000Z",
    updatedAt: "2026-07-17T16:30:00.000Z",
  },
  {
    id: "seed-task-3",
    title: "Follow up on deposit invoice",
    dueDate: "2026-07-15",
    priority: "urgent",
    done: false,
    leadId: null,
    linkedLabel: null,
    notes: "Deposit still unpaid — overdue.",
    createdBy: "manual",
    createdAt: "2026-07-10T09:00:00.000Z",
    updatedAt: "2026-07-10T09:00:00.000Z",
  },
  {
    id: "seed-task-4",
    title: "Confirm final headcount",
    dueDate: "2026-07-12",
    priority: "normal",
    done: true,
    leadId: null,
    linkedLabel: null,
    notes: null,
    createdBy: "manual",
    createdAt: "2026-07-08T11:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
  },
];

export const CRM_AUTOMATIONS_SEED: CrmAutomation[] = [
  {
    id: "seed-auto-1",
    name: "Nudge stale new leads",
    enabled: true,
    trigger: "stage_dwell",
    stage: "new",
    days: 2,
    action: "create_task",
    taskTitle: "Reach out to {lead} — new lead is going cold",
    taskPriority: "high",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "seed-auto-2",
    name: "Chase unanswered quotes",
    enabled: true,
    trigger: "stage_dwell",
    stage: "quote_sent",
    days: 3,
    action: "create_task",
    taskTitle: "Follow up with {lead} on the quote we sent",
    taskPriority: "normal",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "seed-auto-3",
    name: "Prep booked events (event week)",
    enabled: false,
    trigger: "event_approaching",
    stage: "booked",
    days: 7,
    action: "reminder",
    taskTitle: "Event for {lead} is one week out — confirm logistics",
    taskPriority: "high",
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
  },
];
