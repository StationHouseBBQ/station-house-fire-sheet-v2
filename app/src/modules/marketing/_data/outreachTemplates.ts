/**
 * Marketing · Outreach Message Templates (module-local).
 *
 * The Manus OutreachAgent leans on AI to draft follow-up messages and hands
 * them off to an external CRM. We don't fake the AI call; instead we give the
 * team a real, editable template library they can copy per target. The DAL
 * has no template repo, so these persist in localStorage within the module.
 *
 * Templates support simple {{placeholders}} — {{business}}, {{contact}},
 * {{owner}} — filled from the selected target when copying.
 */

export interface OutreachTemplate {
  id: string;
  name: string;
  channel: "email" | "sms" | "dm";
  subject: string;   // used for email; ignored for sms/dm
  body: string;
  updatedAt: string;
}

const KEY = "shbbq.mk.outreachTemplates.v1";

function seed(): OutreachTemplate[] {
  return [
    {
      id: "tpl-intro",
      name: "Cold intro — catering",
      channel: "email",
      subject: "BBQ catering for {{business}}?",
      body:
        "Hi {{contact}},\n\nI'm with Station House BBQ here in Tampa. We cater corporate lunches, " +
        "events and team meals — smoked brisket, pulled pork, all the sides.\n\nWould it be worth a quick " +
        "call to see if we'd be a fit for {{business}}?\n\nThanks,\n{{owner}}",
      updatedAt: "",
    },
    {
      id: "tpl-followup",
      name: "Follow-up — no reply",
      channel: "email",
      subject: "Following up — {{business}}",
      body:
        "Hi {{contact}},\n\nJust circling back on catering for {{business}}. Happy to send a sample menu " +
        "and pricing whenever the timing's right.\n\nBest,\n{{owner}}",
      updatedAt: "",
    },
    {
      id: "tpl-sms",
      name: "Quick text nudge",
      channel: "sms",
      subject: "",
      body: "Hey {{contact}}, it's {{owner}} at Station House BBQ — still keen to help with catering for {{business}}? Happy to send a menu.",
      updatedAt: "",
    },
  ];
}

export function listTemplates(): OutreachTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as OutreachTemplate[];
    return Array.isArray(parsed) ? parsed : seed();
  } catch {
    return seed();
  }
}

function writeAll(list: OutreachTemplate[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* non-fatal */ }
}

export function saveTemplate(t: OutreachTemplate, now: string): OutreachTemplate[] {
  const list = listTemplates();
  const next: OutreachTemplate = { ...t, updatedAt: now };
  const i = list.findIndex(x => x.id === t.id);
  if (i >= 0) list[i] = next; else list.push(next);
  writeAll(list);
  return list;
}

export function removeTemplate(id: string): OutreachTemplate[] {
  const list = listTemplates().filter(t => t.id !== id);
  writeAll(list);
  return list;
}

/** Fill {{business}} / {{contact}} / {{owner}} placeholders. */
export function fillTemplate(
  t: OutreachTemplate,
  vars: { business?: string; contact?: string; owner?: string },
): string {
  const map: Record<string, string> = {
    business: vars.business ?? "your business",
    contact: vars.contact ?? "there",
    owner: vars.owner ?? "the team",
  };
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => map[k] ?? `{{${k}}}`);
  const subject = t.channel === "email" && t.subject ? `Subject: ${fill(t.subject)}\n\n` : "";
  return subject + fill(t.body);
}
