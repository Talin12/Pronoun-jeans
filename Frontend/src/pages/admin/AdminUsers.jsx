import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, Loader, ChevronLeft, ChevronRight, ShieldCheck, BadgeCheck,
  Briefcase, Plus, Pencil,
} from 'lucide-react';
import { listUsers, updateUser } from '../../api/adminApi';

const FILTERS = [
  { key: 'all',        label: 'Everyone',   params: {} },
  { key: 'buyer',      label: 'Buyers',     params: { role: 'buyer' } },
  { key: 'unverified', label: 'To verify',  params: { role: 'buyer', verified: 'false' } },
  { key: 'agent',      label: 'Agents',     params: { role: 'agent' } },
  { key: 'staff',      label: 'Staff',      params: { role: 'staff' } },
  { key: 'inactive',   label: 'Deactivated', params: { active: 'false' } },
];

/** Small square badge, e.g. B2B-verified or superuser. */
const Tag = ({ tone, icon: Icon, children }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${tone}`}>
    {Icon && <Icon size={11} />}{children}
  </span>
);

export default function AdminUsers() {
  const [data, setData]     = useState({ results: [], count: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage]     = useState(1);
  const [busyId, setBusy]   = useState(null);
  const [error, setError]   = useState('');
  const navigate = useNavigate();

  const fetch = useCallback(() => {
    setLoad(true);
    const params = FILTERS.find(f => f.key === filter)?.params || {};
    listUsers({ search, page, ...params })
      .then(setData)
      .catch(() => setData({ results: [], count: 0 }))
      .finally(() => setLoad(false));
  }, [search, page, filter]);

  useEffect(() => {
    const t = setTimeout(fetch, 200);
    return () => clearTimeout(t);
  }, [fetch]);

  const patch = (u, body, label) => {
    setBusy(u.id); setError('');
    const before = { ...u };
    setData(d => ({ ...d, results: d.results.map(r => (r.id === u.id ? { ...r, ...body } : r)) }));
    updateUser(u.id, body)
      .catch(err => {
        setData(d => ({ ...d, results: d.results.map(r => (r.id === u.id ? before : r)) }));
        const detail = err.response?.data;
        setError(detail && typeof detail === 'object'
          ? Object.values(detail).flat().join(' ')
          : `Could not ${label}. Please try again.`);
      })
      .finally(() => setBusy(null));
  };

  const pageSize   = 24;
  const totalPages = Math.max(1, Math.ceil((data.count || 0) / pageSize));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-accent text-xs font-black uppercase tracking-widest mb-1">Admin Panel</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100">Users</h1>
          <p className="text-gray-500 dark:text-zinc-400 text-sm mt-1">
            {loading ? '—' : `${data.count} account${data.count !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => navigate('/admin/users/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition shadow-sm shrink-0">
          <Plus size={18} /> Add User
        </button>
      </div>

      {/* Filters scroll sideways on a phone. */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-4 pb-1">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => { setPage(1); setFilter(f.key); }}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border whitespace-nowrap transition ${
              filter === f.key
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'text-gray-600 dark:text-zinc-400 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}>{f.label}</button>
        ))}
      </div>

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => { setPage(1); setSearch(e.target.value); }}
          placeholder="Search email, company, GST or phone…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-zinc-900 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-sm font-semibold text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>
      ) : !data.results.length ? (
        <div className="text-center py-20 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No users match this view</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.results.map(u => (
            <div key={u.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 bg-white dark:bg-zinc-900 border rounded-2xl p-3 transition-shadow hover:shadow-md ${
                u.is_active ? 'border-gray-100 dark:border-white/5' : 'border-dashed border-gray-300 dark:border-white/15 opacity-70'
              }`}>
              <div className="w-11 h-11 rounded-full bg-accent/10 text-accent flex items-center justify-center font-black shrink-0">
                {(u.company_name || u.email || '?').charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">
                  {u.company_name || u.email}
                </p>
                <p className="text-sm text-gray-500 dark:text-zinc-400 truncate">
                  {u.company_name ? `${u.email} · ` : ''}{u.phone_number || 'No phone'}
                  {u.gst_number ? ` · GST ${u.gst_number}` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {u.is_superuser && <Tag tone="bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400" icon={ShieldCheck}>Superuser</Tag>}
                  {u.is_staff && !u.is_superuser && <Tag tone="bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" icon={ShieldCheck}>Staff</Tag>}
                  {u.is_agent && <Tag tone="bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400" icon={Briefcase}>Agent{u.agent_code ? ` ${u.agent_code}` : ''}</Tag>}
                  {u.assigned_agent_email && <Tag tone="bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-zinc-400">via {u.assigned_agent_email}</Tag>}
                  {!u.is_active && <Tag tone="bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400">Deactivated</Tag>}
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* The one action worth doing without opening the profile. */}
                <button onClick={() => patch(u, { is_verified_b2b: !u.is_verified_b2b }, 'change verification')}
                  disabled={busyId === u.id}
                  title={u.is_verified_b2b ? 'B2B verified — click to revoke' : 'Not verified — click to verify'}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition disabled:cursor-wait ${
                    u.is_verified_b2b
                      ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20 hover:bg-green-100 dark:hover:bg-green-500/20'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}>
                  {busyId === u.id ? <Loader size={13} className="animate-spin" /> : <BadgeCheck size={13} />}
                  {u.is_verified_b2b ? 'Verified' : 'Verify B2B'}
                </button>
                <button onClick={() => navigate(`/admin/users/${u.id}`)}
                  className="inline-flex items-center justify-center gap-1.5 ml-auto sm:ml-0 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-white/5 transition shrink-0">
                  <Pencil size={15} /> Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="p-2 rounded-lg border border-gray-200 dark:border-white/10 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/5"><ChevronLeft size={18} /></button>
          <span className="text-sm text-gray-600 dark:text-zinc-400 font-semibold">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="p-2 rounded-lg border border-gray-200 dark:border-white/10 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/5"><ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  );
}
