import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader, Save, AlertCircle, ShieldCheck, BadgeCheck, Briefcase,
  MapPin, KeyRound,
} from 'lucide-react';
import {
  getUser, createUser, updateUser, listUsers,
} from '../../api/adminApi';
import { useAuthStore } from '../../store/useAuthStore';

const card     = 'bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 rounded-2xl p-5 sm:p-7';
const labelCls = 'block text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5';
// text-base on phones: anything under 16px makes iOS Safari zoom in on focus.
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-800 text-base sm:text-sm text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

/** A permission switch with its consequence spelled out. */
const Switch = ({ on, onChange, icon: Icon, title, help, disabled, disabledHint }) => (
  <button type="button" onClick={() => !disabled && onChange(!on)} disabled={disabled}
    aria-pressed={on}
    className={`w-full flex items-start gap-3 text-left p-3 rounded-xl border transition ${
      disabled ? 'opacity-60 cursor-not-allowed border-gray-200 dark:border-white/10'
      : on ? 'bg-accent/5 border-accent/30' : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
    }`}>
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
      on ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-400'
    }`}><Icon size={17} /></span>
    <span className="min-w-0 flex-1">
      <span className="block font-bold text-sm text-gray-900 dark:text-zinc-100">{title}</span>
      <span className="block text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
        {disabled && disabledHint ? disabledHint : help}
      </span>
    </span>
    <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-accent' : 'bg-gray-300 dark:bg-zinc-600'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-5' : 'left-1'}`} />
    </span>
  </button>
);

export default function AdminUserProfile() {
  const { id } = useParams();
  const isNew  = !id || id === 'new';
  const navigate = useNavigate();
  const { user: me } = useAuthStore();

  const [form, setForm]    = useState({
    email: '', username: '', first_name: '', last_name: '',
    company_name: '', gst_number: '', phone_number: '',
    is_verified_b2b: false, is_agent: false, is_active: true,
    is_staff: false, is_superuser: false, assigned_agent: '',
    agent_profile: { agent_code: '', commission_percentage: '0.00' },
  });
  const [addresses, setAddr] = useState([]);
  const [meta, setMeta]      = useState({});      // date_joined, last_login, agent_can_order
  const [agents, setAgents]  = useState([]);
  const [password, setPass]  = useState('');
  const [loading, setLoad]   = useState(!isNew);
  const [saving, setSaving]  = useState(false);
  const [error, setError]    = useState('');
  const [saved, setSaved]    = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };
  const setAgentField = (k, v) => {
    setForm(f => ({ ...f, agent_profile: { ...f.agent_profile, [k]: v } }));
    setSaved(false);
  };

  const load = useCallback(() => {
    if (isNew) return;
    setLoad(true);
    getUser(id)
      .then(u => {
        setForm({
          email: u.email || '', username: u.username || '',
          first_name: u.first_name || '', last_name: u.last_name || '',
          company_name: u.company_name || '', gst_number: u.gst_number || '',
          phone_number: u.phone_number || '',
          is_verified_b2b: u.is_verified_b2b, is_agent: u.is_agent,
          is_active: u.is_active, is_staff: u.is_staff, is_superuser: u.is_superuser,
          assigned_agent: u.assigned_agent || '',
          agent_profile: {
            agent_code: u.agent_profile?.agent_code || '',
            commission_percentage: u.agent_profile?.commission_percentage ?? '0.00',
          },
        });
        setAddr(u.addresses || []);
        setMeta({ date_joined: u.date_joined, last_login: u.last_login, agent_can_order: u.agent_can_order });
      })
      .catch(() => setError('Failed to load this user.'))
      .finally(() => setLoad(false));
  }, [id, isNew]);

  useEffect(load, [load]);

  // Only agents can be assigned as someone's agent.
  useEffect(() => {
    listUsers({ role: 'agent', page_size: 100 })
      .then(d => setAgents(d.results || []))
      .catch(() => setAgents([]));
  }, []);

  const save = () => {
    setSaving(true); setError(''); setSaved(false);
    const payload = {
      ...form,
      assigned_agent: form.assigned_agent || null,
      // The nested profile is only meaningful for agents; the API ignores it
      // otherwise, but there is no reason to send it.
      agent_profile: form.is_agent ? form.agent_profile : undefined,
    };
    if (password) payload.password = password;

    const req = isNew ? createUser(payload) : updateUser(id, payload);
    req.then(u => {
      setPass('');
      if (isNew) navigate(`/admin/users/${u.id}`, { replace: true });
      else { setSaved(true); load(); }
    }).catch(err => {
      const d = err.response?.data;
      setError(d && typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join('  •  ')
        : 'Save failed.');
    }).finally(() => setSaving(false));
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader className="animate-spin" /></div>;

  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
  // The API refuses to let you revoke your own access; grey it out rather than
  // letting the click fail.
  const isSelf = !isNew && !!me?.email && me.email === form.email;
  const selfHint = 'You cannot revoke this on your own account — ask another superuser.';

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <button onClick={() => navigate('/admin/users')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 dark:text-zinc-400 hover:text-accent transition mb-4">
        <ArrowLeft size={16} /> All users
      </button>

      <h1 className="text-2xl font-black text-gray-900 dark:text-zinc-100 mb-1">
        {isNew ? 'Add User' : (form.company_name || form.email || 'User')}
      </h1>
      {!isNew && (
        <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6">
          Joined {fmt(meta.date_joined)} · Last seen {fmt(meta.last_login)}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm rounded-xl px-4 py-3 mb-5">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {saved && (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 text-sm font-semibold rounded-xl px-4 py-3 mb-5">
          Saved.
        </div>
      )}

      <div className="space-y-5">
        {/* ── Profile ── */}
        <div className={card}>
          <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-5">Profile</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Email *</label>
              <input type="email" className={inputCls} value={form.email}
                onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Company name</label>
              <input className={inputCls} value={form.company_name} onChange={e => set('company_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.phone_number} onChange={e => set('phone_number', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>GST number</label>
              <input className={inputCls} value={form.gst_number} onChange={e => set('gst_number', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Username</label>
              <input className={inputCls} value={form.username} placeholder={isNew ? 'defaults to the email' : ''}
                onChange={e => set('username', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>First name</label>
              <input className={inputCls} value={form.first_name} onChange={e => set('first_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Last name</label>
              <input className={inputCls} value={form.last_name} onChange={e => set('last_name', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Access ── */}
        <div className={card}>
          <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-1">Access & verification</h2>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mb-5">
            What this account is allowed to do. Changes take effect the next time they load a page.
          </p>
          <div className="space-y-2.5">
            <Switch on={form.is_verified_b2b} onChange={v => set('is_verified_b2b', v)}
              icon={BadgeCheck} title="B2B verified"
              help="Approves the business. Wholesale pricing and ordering unlock." />
            <Switch on={form.is_active} onChange={v => set('is_active', v)}
              icon={ShieldCheck} title="Account active"
              help="Turn off to block sign-in without deleting the account or its orders."
              disabled={isSelf && form.is_active} disabledHint={selfHint} />
            <Switch on={form.is_agent} onChange={v => set('is_agent', v)}
              icon={Briefcase} title="Sales agent"
              help="Can be assigned buyers and earns commission on their orders." />
            <Switch on={form.is_staff} onChange={v => set('is_staff', v)}
              icon={ShieldCheck} title="Staff"
              help="Access to the Django admin site at /django-admin."
              disabled={isSelf && form.is_staff} disabledHint={selfHint} />
            <Switch on={form.is_superuser} onChange={v => set('is_superuser', v)}
              icon={ShieldCheck} title="Superuser"
              help="Full access, including this admin panel and every user's permissions."
              disabled={isSelf && form.is_superuser} disabledHint={selfHint} />
          </div>

          {!isNew && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-4">
              Buyer-controlled: agent may order on their behalf —{' '}
              <span className="font-semibold">{meta.agent_can_order ? 'yes' : 'no'}</span>.
              Only the buyer can change this, from their own dashboard.
            </p>
          )}
        </div>

        {/* ── Agent setup ── */}
        <div className={card}>
          <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-5">Agent</h2>
          {form.is_agent ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Agent code *</label>
                <input className={inputCls} value={form.agent_profile.agent_code}
                  onChange={e => setAgentField('agent_code', e.target.value)} placeholder="e.g. AG-004" />
              </div>
              <div>
                <label className={labelCls}>Commission %</label>
                <input type="number" step="0.01" min="0" className={inputCls}
                  value={form.agent_profile.commission_percentage}
                  onChange={e => setAgentField('commission_percentage', e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Assigned agent (who handles this buyer)</label>
              <select className={inputCls} value={form.assigned_agent}
                onChange={e => set('assigned_agent', e.target.value ? Number(e.target.value) : '')}>
                <option value="">— None —</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.company_name || a.email}{a.agent_code ? ` (${a.agent_code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Password ── */}
        <div className={card}>
          <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
            <KeyRound size={18} className="text-accent" /> Password
          </h2>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mb-4">
            {isNew
              ? 'Set an initial password, or leave blank so they must use "forgot password".'
              : 'Type a new password to reset it. Leave blank to keep the current one.'}
          </p>
          <input type="password" autoComplete="new-password" className={`${inputCls} max-w-sm`}
            value={password} onChange={e => setPass(e.target.value)} placeholder="••••••••" />
        </div>

        {/* ── Addresses (read-only) ── */}
        {!isNew && (
          <div className={card}>
            <h2 className="text-lg font-black text-gray-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
              <MapPin size={18} className="text-accent" /> Addresses
            </h2>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mb-4">Managed by the buyer from their dashboard.</p>
            {!addresses.length ? (
              <p className="text-sm text-gray-400">No addresses saved.</p>
            ) : (
              <ul className="space-y-2">
                {addresses.map(a => (
                  <li key={a.id} className="text-sm text-gray-700 dark:text-zinc-300 border border-gray-100 dark:border-white/5 rounded-xl px-3 py-2">
                    {a.address_line_1}{a.address_line_2 ? `, ${a.address_line_2}` : ''}, {a.city}, {a.state} — {a.pincode}
                    {/* Who to ring about a delivery to this address — the whole
                        reason support opens this page. effective_*, so it falls
                        back to the account rather than showing nothing. */}
                    {(a.effective_phone || a.effective_email) && (
                      <span className="block text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                        {[a.effective_phone, a.effective_email].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {(a.is_default_shipping || a.is_default_billing) && (
                      <span className="ml-2 text-[11px] font-bold text-accent">
                        {a.is_default_shipping ? 'default shipping' : ''}
                        {a.is_default_shipping && a.is_default_billing ? ' · ' : ''}
                        {a.is_default_billing ? 'default billing' : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3 mt-6">
        <button onClick={() => navigate('/admin/users')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-white/5 transition">
          Cancel
        </button>
        <button onClick={save} disabled={saving || !form.email}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-50">
          {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
          {isNew ? 'Create user' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
