import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Plus, Trash2, Mail, Phone, Tag, Check, PackagePlus, BookOpen, GitMerge, MessageCircle, Bell, ChevronDown, HeartHandshake } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { normalizePartyName } from '../utils/aging';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  normalizeWhatsAppPhone,
} from '../utils/paymentReminder';
import {
  billTypeBadgeClass,
  billTypeShortLabel,
  isHelpBill,
} from '../utils/billTypes';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';
import AppSelect from './AppSelect';
import PayeeBankSelect from './PayeeBankSelect';
import { getPaymentMethods } from '../utils/paymentMethods';

export default function CustomerManager({ currencySymbol = 'Rs.', settings = {} }) {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerRates, setCustomerRates] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [partyFilter, setPartyFilter] = useState('all');
  const [shopSettings, setShopSettings] = useState(settings || {});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Form State for new customer
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [partyType, setPartyType] = useState('customer');
  const [payeeBankName, setPayeeBankName] = useState('');
  const [payeeAccountTitle, setPayeeAccountTitle] = useState('');
  const [payeeAccountNumber, setPayeeAccountNumber] = useState('');
  const [payeePaymentNotes, setPayeePaymentNotes] = useState('');
  const addDropRef = useRef(null);

  // Merge tool
  const [mergePrimary, setMergePrimary] = useState('');
  const [mergeDupes, setMergeDupes] = useState([]);
  const [mergeConfirm, setMergeConfirm] = useState('');
  const [merging, setMerging] = useState(false);

  // Form State for existing catalog custom rate
  const [rateProductId, setRateProductId] = useState('');
  const [rateCustomPrice, setRateCustomPrice] = useState('');
  const [rateMsg, setRateMsg] = useState('');

  // Form State for brand NEW product created directly for client
  const [newProdName, setNewProdName] = useState('');
  const [newProdStdPrice, setNewProdStdPrice] = useState('');
  const [newProdClientPrice, setNewProdClientPrice] = useState('');
  const [newProdMsg, setNewProdMsg] = useState('');

  const apiFetchCustomers = async () => {
    try {
      const res = await apiFetch('/api/customers');
      const data = await res.json();
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchProducts = async () => {
    try {
      const res = await apiFetch('/api/products');
      const data = await res.json();
      setProducts(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchCustomerRates = async (customerId) => {
    try {
      const res = await apiFetch(`/api/customers/${customerId}/rates`);
      const data = await res.json();
      setCustomerRates(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const apiFetchLedger = async (customerName) => {
    try {
      const res = await apiFetch(`/api/ledger?name=${encodeURIComponent(customerName)}`);
      const data = await res.json();
      if (res.ok) setLedger(data);
      else setLedger(null);
    } catch (err) {
      console.error(err);
      setLedger(null);
    }
  };

  useEffect(() => {
    setShopSettings(settings || {});
  }, [settings]);

  useEffect(() => {
    apiFetchCustomers();
    apiFetchProducts();
  }, []);

  const openCall = (c, e) => {
    e.stopPropagation();
    const digits = String(c.phone || '').replace(/[^\d+]/g, '');
    if (!digits) {
      toast.error('No phone number on this client');
      return;
    }
    window.location.href = `tel:${digits}`;
  };

  const openWhatsApp = (c, e) => {
    e.stopPropagation();
    if (!normalizeWhatsAppPhone(c.phone)) {
      toast.error('No phone number on this client');
      return;
    }
    openWhatsAppReminder(c.phone, `Assalam o Alaikum ${c.name},`);
  };

  const remindUnpaid = async (c, e) => {
    e.stopPropagation();
    if (!normalizeWhatsAppPhone(c.phone)) {
      toast.error('No phone number on this client');
      return;
    }
    try {
      const res = await apiFetch(`/api/ledger?name=${encodeURIComponent(c.name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const unpaid = (data.bills || []).filter(
        (b) =>
          b.bill_type !== 'supplier' &&
          b.status !== 'cancelled' &&
          Number(b.balance_due ?? Math.max(0, (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0))) > 0
      );
      if (!unpaid.length) {
        toast.info('No unpaid bills for this client');
        return;
      }
      const bill = unpaid[0];
      const text = buildPaymentReminderText({
        bill: {
          ...bill,
          customer_phone: c.phone,
          balance_due: Number(bill.balance_due ?? Math.max(0, (Number(bill.total_amount) || 0) - (Number(bill.amount_paid) || 0))),
        },
        settings: shopSettings,
        currencySymbol,
        urdu: Boolean(shopSettings.urdu_labels),
      });
      openWhatsAppReminder(c.phone, text);
    } catch (err) {
      toast.error(err.message || 'Could not load unpaid bills');
    }
  };

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    apiFetchCustomerRates(c.id);
    apiFetchLedger(c.name);
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          address,
          tax_id: taxId,
          party_type: partyType,
          payee_bank_name: payeeBankName,
          payee_account_title: payeeAccountTitle,
          payee_account_number: payeeAccountNumber,
          payee_payment_notes: payeePaymentNotes,
        }),
      });
      if (res.ok) {
        setName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setTaxId('');
        setPartyType('customer');
        setPayeeBankName('');
        setPayeeAccountTitle('');
        setPayeeAccountNumber('');
        setPayeePaymentNotes('');
        toast.success('Client profile saved');
        apiFetchCustomers();
        if (addDropRef.current) addDropRef.current.open = false;
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Could not save client');
      }
    } catch (err) {
      toast.error('Error adding customer: ' + err.message);
    }
  };

  const askDeleteCustomer = (customer) => {
    setDeleteTarget(customer);
  };

  const confirmDeleteCustomer = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedCustomer?.id === id) setSelectedCustomer(null);
        toast.success('Client deleted');
        setDeleteTarget(null);
        apiFetchCustomers();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Could not delete client');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const rows =
      partyFilter === 'all'
        ? customers
        : customers.filter((c) => (c.party_type === 'supplier' ? 'supplier' : 'customer') === partyFilter);
    return [...rows].sort((a, b) => {
      const aOut = (Number(a.sales_outstanding) || 0) + (Number(a.help_outstanding) || 0) + (Number(a.buying_outstanding) || 0);
      const bOut = (Number(b.sales_outstanding) || 0) + (Number(b.help_outstanding) || 0) + (Number(b.buying_outstanding) || 0);
      if (aOut !== bOut) return bOut - aOut;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [customers, partyFilter]);

  const extraPayeeBanks = useMemo(
    () => [
      ...getPaymentMethods(shopSettings).map((m) => m.bank_name),
      ...customers.map((c) => c.payee_bank_name),
    ],
    [shopSettings, customers]
  );

  const mergeSuggestions = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      const key = normalizePartyName(c.name);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.values()].filter((g) => g.length > 1);
  }, [customers]);

  const toggleMergeDupe = (id) => {
    setMergeDupes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleMerge = async () => {
    if (!mergePrimary || !mergeDupes.length) {
      toast.error('Pick a primary and at least one duplicate');
      return;
    }
    if (mergeConfirm.trim() !== 'MERGE') {
      toast.error('Type MERGE to confirm');
      return;
    }
    setMerging(true);
    try {
      const res = await apiFetch('/api/customers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryId: Number(mergePrimary),
          duplicateIds: mergeDupes.map(Number),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Merged ${data.merged || mergeDupes.length} duplicate(s)`);
      setMergePrimary('');
      setMergeDupes([]);
      setMergeConfirm('');
      setSelectedCustomer(null);
      apiFetchCustomers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setMerging(false);
    }
  };

  // Assign Custom Rate for existing product
  const handleSaveRate = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !rateProductId || rateCustomPrice === '') return;

    try {
      const res = await apiFetch(`/api/customers/${selectedCustomer.id}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: parseInt(rateProductId, 10),
          custom_price: parseFloat(rateCustomPrice),
        }),
      });

      if (res.ok) {
        const updatedRates = await res.json();
        setCustomerRates(Array.isArray(updatedRates) ? updatedRates : await (async () => {
          const r = await apiFetch(`/api/customers/${selectedCustomer.id}/rates`);
          return (await r.json()) || [];
        })());
        setRateProductId('');
        setRateCustomPrice('');
        setRateMsg('Custom rate saved!');
        setTimeout(() => setRateMsg(''), 3000);
      }
    } catch (err) {
      toast.error('Error saving rate: ' + err.message);
    }
  };

  // Create brand NEW product and assign custom rate for selected client
  const handleCreateNewProductForClient = async (e) => {
    e.preventDefault();
    if (!selectedCustomer || !newProdName.trim() || !newProdStdPrice || !newProdClientPrice) return;

    try {
      // 1. Create product in catalog
      const prodRes = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProdName.trim(),
          description: `Custom product for ${selectedCustomer.name}`,
          price: parseFloat(newProdStdPrice),
          unit: 'unit',
          stock: 1000,
        }),
      });

      if (!prodRes.ok) {
        const err = await prodRes.json();
        throw new Error(err.error || 'Failed to create product');
      }

      const createdProduct = await prodRes.json();

      // 2. Assign negotiated price for this customer
      const rateRes = await apiFetch(`/api/customers/${selectedCustomer.id}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: createdProduct.id,
          custom_price: parseFloat(newProdClientPrice),
        }),
      });

      if (rateRes.ok) {
        setNewProdName('');
        setNewProdStdPrice('');
        setNewProdClientPrice('');
        setNewProdMsg(`Added "${createdProduct.name}" for ${selectedCustomer.name}!`);
        setTimeout(() => setNewProdMsg(''), 3000);
        apiFetchProducts();
        apiFetchCustomerRates(selectedCustomer.id);
      }
    } catch (err) {
      toast.error('Error creating product for client: ' + err.message);
    }
  };

  // Delete Custom Rate
  const handleDeleteRate = async (productId) => {
    if (!selectedCustomer) return;
    try {
      const res = await apiFetch(`/api/customers/${selectedCustomer.id}/rates/${productId}`, { method: 'DELETE' });
      if (res.ok) {
        apiFetchCustomerRates(selectedCustomer.id);
      }
    } catch (err) {
      toast.error('Error deleting rate: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="responsive-grid" style={{ gap: '1.5rem' }}>
        {/* Add Customer Form — collapsed until the header is tapped */}
        <form onSubmit={handleAddCustomer} className="glass-panel client-add-panel">
          <details className="client-add-drop" ref={addDropRef}>
            <summary className="client-add-summary">
              <span className="client-add-summary-lead">
                <Users size={18} />
                <span>
                  <strong>Add Client Profile</strong>
                  <span className="client-add-hint">Tap to enter name, phone, bank…</span>
                </span>
              </span>
              <ChevronDown size={18} className="client-add-chevron" aria-hidden />
            </summary>
            <div className="client-add-body">
              <div className="form-group">
                <label className="form-label">Client / Company Name *</label>
                <input className="form-input" type="text" placeholder="e.g. Peshawar Retail Client" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Party type</label>
                <AppSelect
                  value={partyType}
                  onChange={setPartyType}
                  aria-label="Party type"
                  options={[
                    { value: 'customer', label: 'Customer (sale / retail)' },
                    { value: 'supplier', label: 'Supplier (Saudia / buying)' },
                  ]}
                />
              </div>

              <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="text" placeholder="+92 300 0000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" placeholder="client@domain.pk" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-textarea" rows={2} placeholder="City, Location" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>

              <div className="client-add-bank">
                <p className="client-add-bank-title">
                  Supplier Pay To bank (optional — for Saudia / buying bills)
                </p>
                <div className="form-group">
                  <label className="form-label">Payee Bank Name</label>
                  <PayeeBankSelect
                    value={payeeBankName}
                    onChange={setPayeeBankName}
                    extraBanks={extraPayeeBanks}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payee Account Title</label>
                  <input className="form-input" type="text" placeholder="Account holder name" value={payeeAccountTitle} onChange={(e) => setPayeeAccountTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">IBAN / Account Number</label>
                  <input className="form-input" type="text" placeholder="SA…" value={payeeAccountNumber} onChange={(e) => setPayeeAccountNumber(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Notes (SWIFT, etc.)</label>
                  <input className="form-input" type="text" placeholder="SWIFT / remittance notes" value={payeePaymentNotes} onChange={(e) => setPayeePaymentNotes(e.target.value)} />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                <Plus size={16} /> Save Client Profile
              </button>
            </div>
          </details>
        </form>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.75rem' }}>Saved Client Directory</h3>
          <div className="party-filter-row">
            {[
              ['all', 'All'],
              ['customer', 'Customers'],
              ['supplier', 'Suppliers'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`party-filter-chip ${partyFilter === key ? 'active' : ''}`}
                onClick={() => setPartyFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredCustomers.length === 0 ? (
            <EmptyState title="No clients here" body="Add a customer or supplier to track dues." icon={Users} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
              {filteredCustomers.map((c) => {
                const isSelected = selectedCustomer?.id === c.id;
                const pt = c.party_type === 'supplier' ? 'supplier' : 'customer';
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    style={{
                      background: isSelected ? 'var(--surface-muted)' : 'var(--bg-card)',
                      borderColor: isSelected ? 'var(--accent-teal)' : 'var(--border-color)',
                      padding: '0.9rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: isSelected ? 'var(--accent-teal)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {c.name}
                        <span className={`type-badge ${pt}`}>{pt === 'supplier' ? 'Supplier' : 'Customer'}</span>
                      </h4>
                      {c.phone && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}><Phone size={12} /> {c.phone}</div>}
                      {c.email && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}><Mail size={12} /> {c.email}</div>}
                      {(Number(c.sales_outstanding) > 0 || Number(c.help_outstanding) > 0 || Number(c.buying_outstanding) > 0) && (
                        <div className="client-out-line">
                          {Number(c.sales_outstanding) > 0 ? (
                            <span>Sales due {formatCurrency(currencySymbol, c.sales_outstanding)}</span>
                          ) : null}
                          {Number(c.help_outstanding) > 0 ? (
                            <span className="is-help">
                              <HeartHandshake size={12} /> Help out {formatCurrency(currencySymbol, c.help_outstanding)}
                            </span>
                          ) : null}
                          {Number(c.buying_outstanding) > 0 ? (
                            <span>Buying due {formatCurrency(currencySymbol, c.buying_outstanding)}</span>
                          ) : null}
                        </div>
                      )}
                      {c.payee_account_number && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Pay To: {c.payee_bank_name || 'Bank'} · {c.payee_account_number}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {c.phone && (
                        <>
                          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.5rem' }} title="Call" onClick={(e) => openCall(c, e)}>
                            <Phone size={14} />
                          </button>
                          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.5rem', color: '#25D366' }} title="WhatsApp" onClick={(e) => openWhatsApp(c, e)}>
                            <MessageCircle size={14} />
                          </button>
                          {pt === 'customer' && (
                            <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.5rem' }} title="Remind unpaid" onClick={(e) => remindUnpaid(c, e)}>
                              <Bell size={14} />
                            </button>
                          )}
                        </>
                      )}
                      <span className="badge" style={{ background: isSelected ? 'var(--ink)' : 'var(--surface-muted)', color: isSelected ? '#f4f2eb' : 'var(--text-secondary)' }}>
                        {isSelected ? 'Selected' : 'Rates'}
                      </span>
                      <button
                        className="btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          askDeleteCustomer(c);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <GitMerge size={18} /> Merge duplicate clients
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Reassign bills and rates to the primary profile, then delete duplicates. Type MERGE to confirm.
        </p>
        {mergeSuggestions.length > 0 && (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--warning)' }}>
            Suggested pairs: {mergeSuggestions.map((g) => g.map((c) => c.name).join(' / ')).join(' · ')}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Primary (keep)</label>
            <AppSelect
              value={mergePrimary}
              onChange={setMergePrimary}
              placeholder="— Select —"
              options={[
                { value: '', label: '— Select —' },
                ...customers.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Duplicates (remove)</label>
            <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {customers
                .filter((c) => String(c.id) !== String(mergePrimary))
                .map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mergeDupes.includes(c.id)}
                      onChange={() => toggleMergeDupe(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
            </div>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Type MERGE</label>
          <input className="form-input" value={mergeConfirm} onChange={(e) => setMergeConfirm(e.target.value)} placeholder="MERGE" autoComplete="off" />
        </div>
        <button type="button" className="btn-primary" style={{ width: 'auto' }} disabled={merging} onClick={handleMerge}>
          <GitMerge size={16} /> Merge now
        </button>
      </div>

      {/* Client Product & Negotiated Rates Manager */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={20} /> Client-Specific Products & Custom Rates
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              {selectedCustomer
                ? `Managing products & negotiated wholesale rates for: ${selectedCustomer.name}`
                : 'Select a client from directory above to add new products or assign negotiated rates'}
            </p>
          </div>
          {(rateMsg || newProdMsg) && (
            <div style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Check size={14} /> {rateMsg || newProdMsg}
            </div>
          )}
        </div>

        {selectedCustomer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {ledger && (
              <div className="surface-block" style={{ padding: '1.1rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <BookOpen size={16} /> Client ledger — {ledger.customer_name}
                </h4>
                <div className="client-ledger-stats">
                  <div>
                    <div className="client-ledger-label">Sales due</div>
                    <div className="client-ledger-value" style={{ color: (ledger.totals.sales_outstanding || ledger.totals.outstanding) > 0 ? 'var(--status-due)' : undefined }}>
                      {formatCurrency(currencySymbol, ledger.totals.sales_outstanding ?? ledger.totals.outstanding)}
                    </div>
                  </div>
                  <div>
                    <div className="client-ledger-label">Help out</div>
                    <div className="client-ledger-value" style={{ color: (ledger.totals.help_outstanding || 0) > 0 ? 'var(--status-due)' : undefined }}>
                      {formatCurrency(currencySymbol, ledger.totals.help_outstanding || 0)}
                    </div>
                  </div>
                  {(ledger.totals.buying_outstanding || 0) > 0 ? (
                    <div>
                      <div className="client-ledger-label">Buying due</div>
                      <div className="client-ledger-value">{formatCurrency(currencySymbol, ledger.totals.buying_outstanding)}</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="client-ledger-label">Paid</div>
                    <div className="client-ledger-value" style={{ color: 'var(--status-paid)' }}>
                      {formatCurrency(currencySymbol, ledger.totals.paid)}
                    </div>
                  </div>
                  <div>
                    <div className="client-ledger-label">Bills</div>
                    <div className="client-ledger-value">{ledger.totals.bill_count}</div>
                  </div>
                </div>
                {(ledger.totals.help_given || 0) > 0 && (
                  <p className="client-ledger-help-note">
                    Help given {formatCurrency(currencySymbol, ledger.totals.help_given)} · returned {formatCurrency(currencySymbol, ledger.totals.help_repaid || 0)}
                  </p>
                )}
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(ledger.bills || []).slice(0, 16).map((b) => {
                    const due = Math.max(0, Number(b.balance_due ?? (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0)));
                    const help = isHelpBill(b);
                    return (
                      <div key={b.id} className="client-ledger-row">
                        <span>
                          <span className={`type-badge ${billTypeBadgeClass(b)}`}>{billTypeShortLabel(b)}</span>
                          {' '}
                          <span className="invoice-mono">{b.invoice_number}</span>
                          {' · '}
                          {help ? `Return ${b.due_date || '—'}` : b.bill_date}
                        </span>
                        <span className="client-ledger-row-amt">
                          {due > 0
                            ? formatCurrency(currencySymbol, due)
                            : formatCurrency(currencySymbol, b.total_amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '1.5rem' }}>
              
              {/* Option A: Assign rate for existing catalog product */}
              <form onSubmit={handleSaveRate} className="surface-block" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.85rem' }}>A. Set Rate for Existing Catalog Item</h4>

                <div className="form-group">
                  <label className="form-label">Select Catalog Product *</label>
                  <AppSelect
                    value={rateProductId}
                    onChange={setRateProductId}
                    required
                    placeholder="-- Choose Product --"
                    options={[
                      { value: '', label: '-- Choose Product --' },
                      ...products.map((p) => ({
                        value: String(p.id),
                        label: `${p.name} (Standard Price: ${currencySymbol}${p.price})`,
                      })),
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Special Rate for {selectedCustomer.name} ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    placeholder="e.g. 2200"
                    value={rateCustomPrice}
                    onChange={(e) => setRateCustomPrice(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
                  <Plus size={16} /> Save Negotiated Rate
                </button>
              </form>

              {/* Option B: Create BRAND NEW Product directly for this Client */}
              <form onSubmit={handleCreateNewProductForClient} style={{ background: 'rgba(99,102,241,0.08)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <PackagePlus size={18} /> B. Add Brand New Product for {selectedCustomer.name}
                </h4>

                <div className="form-group">
                  <label className="form-label">New Product Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Special Chocolate Gift Box"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Standard Catalog Price ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 5000"
                      value={newProdStdPrice}
                      onChange={(e) => setNewProdStdPrice(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Price for {selectedCustomer.name} ({currencySymbol}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 4500"
                      value={newProdClientPrice}
                      onChange={(e) => setNewProdClientPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '0.5rem', background: 'var(--accent-primary)' }}>
                  <PackagePlus size={16} /> Create & Assign Product
                </button>
              </form>

            </div>

            {/* Active Rates List */}
            <div className="surface-block" style={{ padding: '1.25rem' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.85rem' }}>
                Active Special Rates for {selectedCustomer.name} ({customerRates.length})
              </h4>

              {customerRates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No custom product rates set for {selectedCustomer.name}. Standard catalog prices will apply.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {customerRates.map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{r.product_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Standard Catalog Price: <del>{currencySymbol}{r.standard_price}</del>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
                          {currencySymbol}{r.custom_price}
                        </span>
                        <button className="btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleDeleteRate(r.product_id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            👈 Click on any client profile from the directory above to add new products or manage negotiated rates.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name || 'client'}?`}
        message="This removes the client profile. Past bills stay in history."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={confirmDeleteCustomer}
      />
    </div>
  );
}
