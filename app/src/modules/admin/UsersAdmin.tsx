import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { AppUser, RoleIdLike } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { WORKSPACES } from "../../config/nav";
import { ROLES } from "../../config/roles";

/**
 * Admin · Users + Team Access — V2 counterparts of Manus UsersAdmin (parity
 * row 63) and TeamManagement (row 64). UsersAdmin manages accounts and roles;
 * TeamAccess is a read-only workspace × role matrix derived from the nav
 * config. UI gating is cosmetic — Supabase RLS is the authorization boundary.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const ROLE_BADGE: Record<RoleIdLike, string> = {
  owner_admin: "bg-fire text-white",
  catering_director: "bg-blue-600 text-white",
  kitchen: "bg-green-700 text-white",
  counter_foh: "bg-amber-600 text-white",
  packing: "bg-ink-700 text-zinc-300",
};

export function UsersAdmin() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ open: boolean; user: AppUser | null }>({ open: false, user: null });
  const [toggleError, setToggleError] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => dal.users.list() });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const upsertMut = useMutation({
    mutationFn: (u: Parameters<typeof dal.users.upsert>[0]) => withSync(dal.users.upsert(u, actor)),
    onSuccess: () => { setDialog({ open: false, user: null }); invalidate(); },
  });
  const toggleMut = useMutation({
    mutationFn: (id: string) => withSync(dal.users.toggleActive(id, actor)),
    onMutate: () => setToggleError(null),
    onSuccess: invalidate,
    onError: (e: Error) => setToggleError(e.message),
  });

  if (isLoading || !users) return <p className="py-20 text-center text-zinc-500">Loading users…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Users</h1>
          <p className="text-sm text-zinc-500">{users.filter(u => u.active).length}/{users.length} active</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ open: true, user: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Invite user</button>
        </div>
      </header>

      {toggleError && (
        <p className="mt-4 rounded-lg border border-red-700/60 bg-red-950/60 px-3 py-2 text-sm font-semibold text-red-400" role="alert">
          {toggleError}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5">Invited</th>
              <th className="px-3 py-2.5">Active</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {users.map(u => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{u.name}</td>
                <td className="px-3 py-2.5 text-zinc-400">{u.email}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${ROLE_BADGE[u.role]}`}>
                    {ROLES.find(r => r.id === u.role)?.label ?? u.role}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{new Date(u.invitedAt).toLocaleDateString()}</td>
                <td className="px-3 py-2.5">
                  <button role="switch" aria-checked={u.active} aria-label={`${u.name} active`}
                    onClick={() => toggleMut.mutate(u.id)}
                    className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                      u.active ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                    {u.active ? "Active" : "Off"}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={() => setDialog({ open: true, user: u })}
                    className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog.open && (
        <UserDialog user={dialog.user} busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, user: null })}
          onSubmit={u => upsertMut.mutate(u)} />
      )}
    </div>
  );
}

function UserDialog({ user, onSubmit, onCancel, busy, error }: {
  user: AppUser | null;
  onSubmit: (u: { id: string; name: string; email: string; role: RoleIdLike; active: boolean }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<RoleIdLike>(user?.role ?? "kitchen");
  const [active, setActive] = useState(user?.active ?? true);

  return (
    <div role="dialog" aria-modal="true" aria-label={user ? "Edit user" : "Invite user"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ id: user?.id ?? "", name, email, role, active }); }}>
        <h3 className="text-lg font-bold text-zinc-100">{user ? "Edit user" : "Invite user"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Role
          <select value={role} onChange={e => setRole(e.target.value as RoleIdLike)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-zinc-600">{ROLES.find(r => r.id === role)?.description}</span>
        </label>
        <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
          Active
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : user ? "Save changes" : "Send invite"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Read-only workspace × role access matrix derived from the nav config. */
export function TeamAccess() {
  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Team Access</h1>
        <p className="text-sm text-zinc-500">Workspace access by role — derived from the navigation config</p>
      </header>

      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Workspace</th>
              {ROLES.map(r => <th key={r.id} className="px-3 py-2.5 text-center">{r.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {WORKSPACES.map(w => (
              <tr key={w.id}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{w.label}
                  <span className="ml-1.5 text-xs font-normal text-zinc-600">({w.tabs.length} tabs)</span>
                </td>
                {ROLES.map(r => (
                  <td key={r.id} className="px-3 py-2.5 text-center">
                    {w.roles.includes(r.id)
                      ? <span className="font-bold text-green-400" aria-label={`${r.label} has access to ${w.label}`}>✓</span>
                      : <span className="text-zinc-700" aria-label={`${r.label} has no access to ${w.label}`}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        This matrix is read-only and reflects UI navigation gating. Supabase Row-Level Security is the authoritative
        permission boundary — changing the UI never grants data access.
      </p>
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
