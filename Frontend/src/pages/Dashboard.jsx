import React, { useEffect, useState } from 'react';
import {
  ShoppingBag, MapPin, User, ChevronRight, Loader,
  Plus, Trash2, CheckCircle2, AlertCircle, Star, Pencil, X, FileText, Truck, CreditCard
} from 'lucide-react';
import api from '../api/axios';

const TAB_ORDERS  = 'orders';
const TAB_ADDRESS = 'addresses';
const TAB_ACCOUNT = 'account';

const EMPTY_ADDRESS = {
  address_line_1: '', address_line_2: '', city: '', state: '',
  pincode: '', is_default_shipping: false, is_default_billing: false,
};

const STATUS_COLORS = {
  pending:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  confirmed:  'text-blue-400   bg-blue-400/10   border-blue-400/20',
  processing: 'text-blue-400   bg-blue-400/10   border-blue-400/20',
  shipped:    'text-red-400 bg-red-400/10 border-red-400/20',
  delivered:  'text-green-400  bg-green-400/10  border-green-400/20',
  cancelled:  'text-red-400    bg-red-400/10    border-red-400/20',
};

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState(TAB_ORDERS);

  const tabs = [
    { id: TAB_ORDERS,  label: 'Past Orders',    icon: ShoppingBag },
    { id: TAB_ADDRESS, label: 'Addresses',       icon: MapPin      },
    { id: TAB_ACCOUNT, label: 'Account Details', icon: User        },
  ];

  return (
    <div className="bg-primary min-h-screen p-6 lg:p-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-white text-3xl font-bold mb-8">My Dashboard</h1>
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-60 shrink-0">
            <nav className="bg-secondary rounded-2xl border border-white/5 overflow-hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center justify-between gap-3 px-5 py-4 text-sm font-semibold transition-colors border-b border-white/5 last:border-0
                      ${active ? 'bg-accent/10 text-accent' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                  >
                    <span className="flex items-center gap-3"><Icon className="w-4 h-4" />{tab.label}</span>
                    {active && <ChevronRight className="w-4 h-4" />}
                  </button>
                );
              })}
            </nav>
          </aside>
          <main className="flex-1 min-w-0">
            {activeTab === TAB_ORDERS  && <PastOrders />}
            {activeTab === TAB_ADDRESS && <Addresses />}
            {activeTab === TAB_ACCOUNT && <AccountDetails />}
          </main>
        </div>
      </div>
    </div>
  );
};

const PastOrders = () => {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('orders/history/')
      .then(res => setOrders(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (orders.length === 0) return <Empty icon={ShoppingBag} message="You haven't placed any orders yet." />;

  return (
    <div className="bg-secondary rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h2 className="text-white text-xl font-bold">Past Orders</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-widest border-b border-white/5">
              <th className="text-left px-6 py-4">Order ID</th>
              <th className="text-left px-6 py-4">Date</th>
              <th className="text-left px-6 py-4">Items</th>
              <th className="text-left px-6 py-4">Total</th>
              <th className="text-left px-6 py-4">Status</th>
              <th className="text-left px-6 py-4">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              const totalQty    = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
              const statusClass = STATUS_COLORS[order.status?.toLowerCase()] || STATUS_COLORS.pending;
              return (
                <tr key={order.id} className={`border-b border-white/5 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                  <td className="px-6 py-4 text-accent font-mono font-bold">#{order.id}</td>
                  <td className="px-6 py-4 text-gray-300">
                    {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-gray-300">{totalQty} units</td>
                  <td className="px-6 py-4 text-white font-bold">₹{order.total_amount}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border capitalize ${statusClass}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => alert(`Invoice for order #${order.id} — coming soon.`)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent border border-white/10 hover:border-accent/40 px-3 py-1.5 rounded-lg transition-colors font-semibold"
                    >
                      <FileText className="w-3.5 h-3.5" /> Download
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Addresses = () => {
  const [addresses, setAddresses]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(EMPTY_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const fetchAddresses = () => {
    api.get('accounts/addresses/')
      .then(res => setAddresses(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAddresses(); }, []);

  const openAdd = () => { setEditTarget(null); setForm(EMPTY_ADDRESS); setError(''); setShowForm(true); };

  const openEdit = (addr) => {
    setEditTarget(addr.id);
    setForm({
      address_line_1:      addr.address_line_1,
      address_line_2:      addr.address_line_2 || '',
      city:                addr.city,
      state:               addr.state,
      pincode:             addr.pincode,
      is_default_shipping: addr.is_default_shipping,
      is_default_billing:  addr.is_default_billing,
    });
    setError('');
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    await api.delete(`accounts/addresses/${id}/`);
    fetchAddresses();
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.address_line_1 || !form.city || !form.state || !form.pincode) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      if (editTarget) {
        await api.put(`accounts/addresses/${editTarget}/`, form);
      } else {
        await api.post('accounts/addresses/', form);
      }
      setShowForm(false);
      fetchAddresses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save address.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white text-xl font-bold">Addresses</h2>
        <button onClick={openAdd} className="flex items-center gap-2 bg-accent hover:bg-accent/80 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add New
        </button>
      </div>

      {showForm && (
        <div className="bg-secondary rounded-2xl border border-accent/30 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold">{editTarget ? 'Edit Address' : 'New Address'}</h3>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400 hover:text-white" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput label="Address Line 1 *" value={form.address_line_1} onChange={v => setForm(p => ({ ...p, address_line_1: v }))} />
            <FormInput label="Address Line 2"   value={form.address_line_2} onChange={v => setForm(p => ({ ...p, address_line_2: v }))} />
            <FormInput label="City *"           value={form.city}           onChange={v => setForm(p => ({ ...p, city: v }))} />
            <FormInput label="State *"          value={form.state}          onChange={v => setForm(p => ({ ...p, state: v }))} />
            <FormInput label="Pincode *"        value={form.pincode}        onChange={v => setForm(p => ({ ...p, pincode: v }))} />
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_default_shipping}
                onChange={e => setForm(p => ({ ...p, is_default_shipping: e.target.checked }))}
                className="accent-accent" />
              <Truck className="w-3.5 h-3.5 text-accent" /> Default Shipping
            </label>
            <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_default_billing}
                onChange={e => setForm(p => ({ ...p, is_default_billing: e.target.checked }))}
                className="accent-accent" />
              <CreditCard className="w-3.5 h-3.5 text-accent" /> Default Billing
            </label>
          </div>
          {error && <div className="flex items-center gap-2 text-red-400 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
          <button onClick={handleSubmit} disabled={submitting}
            className="flex items-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm">
            {submitting ? <Loader className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {submitting ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      )}

      {addresses.length === 0 && !showForm ? (
        <Empty icon={MapPin} message="No addresses saved yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {addresses.map((addr) => (
            <div key={addr.id} className={`bg-secondary rounded-2xl border p-5 relative ${addr.is_default_shipping || addr.is_default_billing ? 'border-accent/40' : 'border-white/5'}`}>
              <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                {addr.is_default_shipping && (
                  <span className="flex items-center gap-1 text-accent text-xs font-bold">
                    <Truck className="w-3 h-3" /> Shipping
                  </span>
                )}
                {addr.is_default_billing && (
                  <span className="flex items-center gap-1 text-red-400 text-xs font-bold">
                    <CreditCard className="w-3 h-3" /> Billing
                  </span>
                )}
              </div>
              <p className="text-white font-semibold text-sm pr-20">{addr.address_line_1}</p>
              {addr.address_line_2 && <p className="text-gray-400 text-sm">{addr.address_line_2}</p>}
              <p className="text-gray-400 text-sm">{addr.city}, {addr.state} — {addr.pincode}</p>
              <div className="flex items-center gap-3 mt-4">
                <button onClick={() => openEdit(addr)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors font-semibold">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => handleDelete(addr.id)} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors font-semibold">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AccountDetails = () => {
  const [form, setForm]             = useState({ company_name: '', gst_number: '', phone_number: '', email: '' });
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    api.get('accounts/profile/')
      .then(res => setForm(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError(''); setSuccess(false); setSubmitting(true);
    try {
      await api.put('accounts/profile/', {
        company_name: form.company_name,
        gst_number:   form.gst_number,
        phone_number: form.phone_number,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="bg-secondary rounded-2xl border border-white/5 p-6">
      <h2 className="text-white text-xl font-bold mb-6">Account Details</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="sm:col-span-2">
          <label className="text-gray-400 text-xs font-bold uppercase tracking-widest block mb-1.5">Email</label>
          <input value={form.email || ''} disabled
            className="w-full bg-primary/50 border border-white/10 text-gray-500 rounded-xl px-4 py-3 text-sm cursor-not-allowed" />
        </div>
        <FormInput label="Company Name" value={form.company_name || ''} onChange={v => setForm(p => ({ ...p, company_name: v }))} />
        <FormInput label="Phone Number" value={form.phone_number || ''} onChange={v => setForm(p => ({ ...p, phone_number: v }))} />
        <div className="sm:col-span-2">
          <FormInput label="GST Number" value={form.gst_number || ''} onChange={v => setForm(p => ({ ...p, gst_number: v }))} />
        </div>
        {form.is_verified_b2b && (
          <div className="sm:col-span-2 flex items-center gap-2 text-green-400 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Verified B2B Account
          </div>
        )}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button onClick={handleSave} disabled={submitting}
          className="flex items-center gap-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm">
          {submitting && <Loader className="animate-spin w-4 h-4" />}
          {submitting ? 'Saving...' : 'Save Changes'}
        </button>
        {success && <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold"><CheckCircle2 className="w-4 h-4" />Changes saved!</span>}
        {error   && <span className="flex items-center gap-1.5 text-red-400 text-sm font-semibold"><AlertCircle className="w-4 h-4" />{error}</span>}
      </div>
    </div>
  );
};

const FormInput = ({ label, value, onChange, disabled = false }) => (
  <div>
    <label className="text-gray-400 text-xs font-bold uppercase tracking-widest block mb-1.5">{label}</label>
    <input value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      className="w-full bg-primary border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed" />
  </div>
);

const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <Loader className="animate-spin text-accent w-8 h-8" />
  </div>
);

const Empty = ({ icon: Icon, message }) => (
  <div className="text-center py-20">
    <Icon className="text-gray-600 w-14 h-14 mx-auto mb-4" />
    <p className="text-gray-400">{message}</p>
  </div>
);

export default Dashboard;