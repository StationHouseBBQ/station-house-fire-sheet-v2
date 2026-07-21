import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Contact } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Catering · Contacts — V2 counterpart of the Manus SalesContacts.
 * Search, card list, upsert dialog (tags as comma input) and two-tap delete.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function ContactsView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts", "list"],
    queryFn: () => dal.contacts.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["contacts", "list"] });

  const upsertMut = useMutation({
    mutationFn: (c: Omit<Contact, "updatedAt">) => withSync(dal.contacts.upsert(c, actor)),
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.contacts.remove(id, actor)),
    onSuccess: () => { invalidate(); setArmedDeleteId(null); },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q)));
  }, [contacts, search]);

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Contacts</h1>
          <p className="text-sm text-zinc-500">{contacts.length} people</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Contact</button>
        </div>
      </header>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, company, email, tag…"
        className="mt-4 w-full rounded-lg border border-ink-700 bg-ink-800 px-4 py-3 text-zinc-100" />

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading contacts…</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No contacts match.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map(c => (
            <li key={c.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-zinc-100">{c.name}{c.company ? <span className="font-normal text-zinc-400"> — {c.company}</span> : null}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{c.email} · {c.phone}</p>
                  {c.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.tags.map(t => (
                        <span key={t} className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">{t}</span>
                      ))}
                    </div>
                  )}
                  {c.notes && <p className="mt-2 text-sm text-zinc-500">{c.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => { setEditing(c); setArmedDeleteId(null); }}
                    className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Edit</button>
                  {armedDeleteId === c.id ? (
                    <button onClick={() => removeMut.mutate(c.id)} disabled={removeMut.isPending}
                      className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                      Confirm delete
                    </button>
                  ) : (
                    <button onClick={() => setArmedDeleteId(c.id)}
                      className="min-h-[44px] rounded-lg border border-red-800/60 bg-ink-800 px-3 py-2 text-sm font-semibold text-red-400">Delete</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ContactDialog contact={editing === "new" ? null : editing}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setEditing(null)}
          onSubmit={c => upsertMut.mutate(c)} />
      )}
    </div>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

function ContactDialog({ contact, onSubmit, onCancel, busy, error }: {
  contact: Contact | null;
  onSubmit: (c: Omit<Contact, "updatedAt">) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [tags, setTags] = useState(contact?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");

  return (
    <div role="dialog" aria-modal="true" aria-label={contact ? "Edit contact" : "New contact"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit({
            id: contact?.id ?? "",
            name: name.trim(), company: company.trim() || null,
            email: email.trim(), phone: phone.trim(),
            tags: tags.split(",").map(t => t.trim()).filter(Boolean),
            notes: notes.trim() || null,
          });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{contact ? "Edit contact" : "New contact"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name *
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Company
          <input value={company} onChange={e => setCompany(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Phone
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Tags (comma-separated)
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="b2b, repeat, wedding"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save contact"}
          </button>
        </div>
      </form>
    </div>
  );
}
