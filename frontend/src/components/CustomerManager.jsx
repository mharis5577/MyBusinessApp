import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Plus,
  Trash2,
  Mail,
  Phone,
  Tag,
  Check,
  PackagePlus,
  BookOpen,
  GitMerge,
  MessageCircle,
  Bell,
  ChevronRight,
  HeartHandshake,
  Star,
  Repeat,
  Search,
  UserPlus,
  X,
  Shield,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ArrowLeftRight,
  Edit3
} from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { playTapSound, playSuccessChime } from '../utils/audioEffects';
import { normalizePartyName } from '../utils/aging';
import { buildClientStatementText } from '../utils/clientStatement';
import { openWhatsAppReminder, normalizeWhatsAppPhone } from '../utils/paymentReminder';
import { billTypeBadgeClass, billTypeShortLabel, isHelpBill } from '../utils/billTypes';
import EmptyState from './EmptyState';
import ConfirmDialog from './ConfirmDialog';
import AppSelect from './AppSelect';
import PayeeBankSelect from './PayeeBankSelect';
import { getPaymentMethods } from '../utils/paymentMethods';

export default function CustomerManager({
  currencySymbol = 'Rs.',
  settings = {},
  onViewBill,
  onDuplicateBill,
  onNavigate,
}) {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerRates, setCustomerRates] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [partyFilter, setPartyFilter] = useState('all'); // 'all' | 'customer' | 'supplier' | 'dues' | 'vip'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('dues'); // 'dues' | 'vip' | 'name'
  const [isDirExpanded, setIsDirExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
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

  // Form State for editing existing customer
  const [editCustomer, setEditCustomer] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [editPartyType, setEditPartyType] = useState('customer');
  const [editPayeeBankName, setEditPayeeBankName] = useState('');
  const [editPayeeAccountTitle, setEditPayeeAccountTitle] = useState('');
  const [editPayeeAccountNumber, setEditPayeeAccountNumber] = useState('');
  const [editPayeePaymentNotes, setEditPayeePaymentNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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

  const openWhatsApp = (c, e) => {
    if (e) e.stopPropagation();
    if (!normalizeWhatsAppPhone(c.phone)) {
      toast.error('No valid phone number on this client');
      return;
    }
    openWhatsAppReminder(c.phone, `Assalam o Alaikum ${c.name},`);
  };

  const remindUnpaid = async (c, e) => {
    if (e) e.stopPropagation();
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
        toast.info('Nothing outstanding for this client');
        return;
      }
      const text = buildClientStatementText({
        customer: c,
        bills: unpaid,
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
    playTapSound();
    setSelectedCustomer(c);
    apiFetchCustomerRates(c.id);
    apiFetchLedger(c.name);
  };

  const handleReorderLastBill = async () => {
    if (!ledger?.bills?.length) {
      toast.info('No previous orders found for this customer');
      return;
    }
    const lastBillSummary = ledger.bills[0];
    playTapSound();
    try {
      const res = await apiFetch(`/api/bills/${lastBillSummary.id}`);
      const fullBill = await res.json();
      if (onDuplicateBill) {
        onDuplicateBill(fullBill);
        playSuccessChime();
        toast.success(`Loaded previous order items for ${fullBill.customer_name}! ⭐`);
      } else if (onNavigate) {
        onNavigate('create');
      }
    } catch {
      toast.error('Failed to load bill items for reorder');
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address.trim(),
          tax_id: taxId.trim(),
          party_type: partyType,
          payee_bank_name: payeeBankName,
          payee_account_title: payeeAccountTitle,
          payee_account_number: payeeAccountNumber,
          payee_payment_notes: payeePaymentNotes,
        }),
      });
      if (res.ok) {
        const created = await res.json();
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
        setShowAddModal(false);
        playSuccessChime();
        toast.success(`Added ${created?.name || 'Client'} to directory!`);
        apiFetchCustomers();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Could not save client');
      }
    } catch (err) {
      toast.error('Error adding customer: ' + err.message);
    }
  };

  const askDeleteCustomer = (customer, e) => {
    if (e) e.stopPropagation();
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

  const handleTogglePartyType = async (customer, e) => {
    if (e) e.stopPropagation();
    const currentType = customer.party_type === 'supplier' ? 'supplier' : 'customer';
    const nextType = currentType === 'supplier' ? 'customer' : 'supplier';
    playTapSound();
    try {
      const res = await apiFetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party_type: nextType }),
      });
      if (res.ok) {
        playSuccessChime();
        toast.success(`Switched ${customer.name} to ${nextType === 'supplier' ? 'Supplier 📦' : 'Customer 👤'}!`);
        setCustomers((prev) =>
          prev.map((c) => (c.id === customer.id ? { ...c, party_type: nextType } : c))
        );
        if (selectedCustomer?.id === customer.id) {
          setSelectedCustomer((prev) => (prev ? { ...prev, party_type: nextType } : prev));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Could not update status');
      }
    } catch (err) {
      toast.error('Error updating status: ' + err.message);
    }
  };

  const openEditModal = (customer, e) => {
    if (e) e.stopPropagation();
    playTapSound();
    setEditCustomer(customer);
    setEditName(customer.name || '');
    setEditEmail(customer.email || '');
    setEditPhone(customer.phone || '');
    setEditAddress(customer.address || '');
    setEditTaxId(customer.tax_id || '');
    setEditPartyType(customer.party_type === 'supplier' ? 'supplier' : 'customer');
    setEditPayeeBankName(customer.payee_bank_name || '');
    setEditPayeeAccountTitle(customer.payee_account_title || '');
    setEditPayeeAccountNumber(customer.payee_account_number || '');
    setEditPayeePaymentNotes(customer.payee_payment_notes || '');
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!editCustomer || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/customers/${editCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          address: editAddress.trim(),
          tax_id: editTaxId.trim(),
          party_type: editPartyType,
          payee_bank_name: editPayeeBankName,
          payee_account_title: editPayeeAccountTitle,
          payee_account_number: editPayeeAccountNumber,
          payee_payment_notes: editPayeePaymentNotes,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        playSuccessChime();
        toast.success(`Updated ${updated?.name || editName}!`);
        setCustomers((prev) =>
          prev.map((c) => (c.id === editCustomer.id ? { ...c, ...updated, party_type: editPartyType } : c))
        );
        if (selectedCustomer?.id === editCustomer.id) {
          setSelectedCustomer((prev) => ({ ...prev, ...updated, party_type: editPartyType }));
        }
        setEditCustomer(null);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Could not update profile');
      }
    } catch (err) {
      toast.error('Error updating customer: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    let rows = customers;

    if (partyFilter === 'customer') {
      rows = rows.filter((c) => (c.party_type || 'customer') !== 'supplier');
    } else if (partyFilter === 'supplier') {
      rows = rows.filter((c) => c.party_type === 'supplier');
    } else if (partyFilter === 'vip') {
      rows = rows.filter((c) => Number(c.sales_outstanding) > 5000 || Number(c.total_revenue || 0) > 10000);
    } else if (partyFilter === 'dues') {
      rows = rows.filter((c) => (Number(c.sales_outstanding) || 0) > 0 || (Number(c.help_outstanding) || 0) > 0 || (Number(c.buying_outstanding) || 0) > 0);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      rows = rows.filter((c) =>
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').includes(q) ||
        String(c.email || '').toLowerCase().includes(q)
      );
    }

    return [...rows].sort((a, b) => {
      if (sortBy === 'name') {
        return String(a.name).localeCompare(String(b.name));
      }
      if (sortBy === 'vip') {
        const aVip = (Number(a.sales_outstanding) > 5000 || Number(a.total_revenue || 0) > 10000) ? 1 : 0;
        const bVip = (Number(b.sales_outstanding) > 5000 || Number(b.total_revenue || 0) > 10000) ? 1 : 0;
        if (aVip !== bVip) return bVip - aVip;
      }
      const aOut = (Number(a.sales_outstanding) || 0) + (Number(a.help_outstanding) || 0) + (Number(a.buying_outstanding) || 0);
      const bOut = (Number(b.sales_outstanding) || 0) + (Number(b.help_outstanding) || 0) + (Number(b.buying_outstanding) || 0);
      if (aOut !== bOut) return bOut - aOut;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [customers, partyFilter, searchTerm, sortBy]);

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

  const getInitials = (clientName) => {
    if (!clientName) return 'CL';
    // Clean out parentheses, brackets, numbers, and symbols
    const clean = String(clientName).replace(/[\(\)\[\]\{\}\-_0-9]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) return clientName.slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3.5rem' }}>
      {/* 1. Header Toolbar & Search & Action Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={22} style={{ color: 'var(--accent-teal)' }} />
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                Client Directory
              </h2>
              <span className="dash-pill-badge" style={{ background: 'rgba(45, 212, 191, 0.15)', color: 'var(--accent-teal)' }}>
                {customers.length} Profiles
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Manage online clients, track outstanding balances, WhatsApp statements, and custom rates.
            </p>
          </div>

          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto', padding: '0.55rem 1.2rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus size={16} /> + Add Client Profile
          </button>
        </div>

        {/* Search & Filter Chips Row */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.4rem', height: '2.4rem', fontSize: '0.84rem' }}
              placeholder="Search by client name, phone or email…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ minWidth: '185px', flex: '0 0 auto' }}>
            <AppSelect
              value={partyFilter}
              onChange={(next) => {
                playTapSound();
                setPartyFilter(next);
              }}
              options={[
                { value: 'all', label: `All Profiles (${customers.length})` },
                { value: 'customer', label: 'Customers' },
                { value: 'dues', label: 'Has Dues' },
                { value: 'vip', label: 'VIPs ⭐' },
                { value: 'supplier', label: 'Suppliers 📦' },
              ]}
              style={{ minWidth: 185 }}
            />
          </div>
        </div>
      </div>

      {/* 2. Client Directory Contained Window with Dropdown Accordion */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingBottom: isDirExpanded ? '0.85rem' : '0',
            borderBottom: isDirExpanded ? '1px solid var(--border-color)' : 'none',
          }}
          onClick={() => setIsDirExpanded(!isDirExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <ChevronDown
              size={18}
              style={{
                transform: isDirExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.2s ease',
                color: 'var(--accent-teal)'
              }}
            />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Saved Client Profiles ({filteredCustomers.length})
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
            {/* Quick Jump to Client Dropdown */}
            <div style={{ width: '200px' }}>
              <AppSelect
                value={selectedCustomer ? String(selectedCustomer.id) : ''}
                onChange={(val) => {
                  const found = customers.find((c) => String(c.id) === String(val));
                  if (found) handleSelectCustomer(found);
                }}
                placeholder="⚡ Jump to Client…"
                options={[
                  { value: '', label: '⚡ Jump to Client…' },
                  ...customers.map((c) => ({
                    value: String(c.id),
                    label: `${c.name}${Number(c.sales_outstanding) > 0 ? ` (Due: ${currencySymbol}${c.sales_outstanding})` : ''}`
                  }))
                ]}
              />
            </div>

            {/* Sort Dropdown */}
            <div style={{ width: '150px' }}>
              <AppSelect
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: 'dues', label: 'Highest Dues' },
                  { value: 'vip', label: 'VIP Clients' },
                  { value: 'name', label: 'Name (A-Z)' },
                ]}
              />
            </div>
          </div>
        </div>

        {isDirExpanded && (
          <div style={{ marginTop: '1rem' }}>
            {filteredCustomers.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                <EmptyState
                  title={searchTerm ? 'No matching clients found' : 'No clients in this list'}
                  body={searchTerm ? `Try searching with a different keyword.` : 'Add a new client profile to get started.'}
                  icon={Users}
                  actionLabel={searchTerm ? 'Clear Search' : '+ Add Client'}
                  onAction={searchTerm ? () => setSearchTerm('') : () => setShowAddModal(true)}
                />
              </div>
            ) : (
              <div
                className="client-directory-grid"
                style={{
                  maxHeight: '440px',
                  overflowY: 'auto',
                  paddingRight: '6px',
                  paddingBottom: '2.5rem',
                }}
              >
                {filteredCustomers.map((c) => {
                  const isSelected = selectedCustomer?.id === c.id;
                  const pt = c.party_type === 'supplier' ? 'supplier' : 'customer';
                  const salesDue = Number(c.sales_outstanding) || 0;
                  const helpDue = Number(c.help_outstanding) || 0;
                  const buyingDue = Number(c.buying_outstanding) || 0;
                  const isVip = salesDue > 5000 || Number(c.total_revenue || 0) > 10000;
                  const initials = getInitials(c.name);

                  return (
                    <div
                      key={c.id}
                      className={`client-dir-card${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleSelectCustomer(c)}
                    >
                      <div>
                        {/* Card Header: Avatar & Title */}
                        <div className="client-dir-header">
                          <div className={`client-avatar-badge${isVip ? ' is-vip' : ''}`}>
                            {initials}
                          </div>

                          <div className="client-dir-title-box">
                            <div className="client-dir-name-row">
                              <span className="client-dir-name" title={c.name}>{c.name}</span>
                              {isVip && (
                                <span className="vip-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: 999, background: 'rgba(212, 175, 55, 0.18)', color: '#d4af37', border: '1px solid rgba(212, 175, 55, 0.4)' }}>
                                  <Star size={10} fill="#d4af37" /> VIP
                                </span>
                              )}
                              <button
                                type="button"
                                className={`type-badge-btn ${pt}`}
                                title={`Click to switch to ${pt === 'supplier' ? 'Customer' : 'Supplier'}`}
                                onClick={(e) => handleTogglePartyType(c, e)}
                              >
                                <ArrowLeftRight size={10} />
                                <span>{pt === 'supplier' ? 'Supplier' : 'Customer'}</span>
                              </button>
                            </div>

                            {/* Contact items with clean ellipsis */}
                            <div className="client-dir-meta-row">
                              {c.phone ? (
                                <div className="client-meta-item" title={c.phone}>
                                  <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                                  <span>{c.phone}</span>
                                </div>
                              ) : null}

                              {c.email ? (
                                <div className="client-meta-item" title={c.email}>
                                  <Mail size={12} style={{ color: 'var(--text-muted)' }} />
                                  <span>{c.email}</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Financial Status Badge */}
                        <div>
                          {pt === 'customer' ? (
                            salesDue > 0 ? (
                              <span className="client-health-badge is-due">
                                <AlertCircle size={13} /> Sales Due: {formatCurrency(currencySymbol, salesDue, { maximumFractionDigits: 0 })}
                              </span>
                            ) : helpDue > 0 ? (
                              <span className="client-health-badge is-help">
                                <HeartHandshake size={13} /> Help Lent: {formatCurrency(currencySymbol, helpDue, { maximumFractionDigits: 0 })}
                              </span>
                            ) : (
                              <span className="client-health-badge is-clear">
                                <CheckCircle2 size={13} /> All Clear · No Dues
                              </span>
                            )
                          ) : (
                            buyingDue > 0 ? (
                              <span className="client-health-badge is-due">
                                <Building2 size={13} /> Saudia Payable: {formatCurrency(currencySymbol, buyingDue, { maximumFractionDigits: 0 })}
                              </span>
                            ) : (
                              <span className="client-health-badge is-clear">
                                <CheckCircle2 size={13} /> Supplier Settled
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      {/* Bottom Action Bar */}
                      <div className="client-dir-actions-row" onClick={(e) => e.stopPropagation()}>
                        {c.phone && (
                          <>
                            <button
                              type="button"
                              className="client-act-btn is-wa"
                              title="Chat on WhatsApp"
                              onClick={(e) => openWhatsApp(c, e)}
                            >
                              <MessageCircle size={14} /> WA
                            </button>

                            {pt === 'customer' && (
                              <button
                                type="button"
                                className="client-act-btn"
                                title="Send Unpaid Statement via WhatsApp"
                                onClick={(e) => remindUnpaid(c, e)}
                              >
                                <Bell size={13} /> Statement
                              </button>
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          className="client-act-btn"
                          style={{ background: isSelected ? 'rgba(45, 212, 191, 0.15)' : undefined, color: isSelected ? 'var(--accent-teal)' : undefined }}
                          onClick={() => handleSelectCustomer(c)}
                        >
                          <BookOpen size={13} /> Ledger
                        </button>

                        <button
                          type="button"
                          className="client-act-btn"
                          title={`Switch status to ${pt === 'supplier' ? 'Customer' : 'Supplier'}`}
                          onClick={(e) => handleTogglePartyType(c, e)}
                        >
                          <ArrowLeftRight size={13} /> {pt === 'supplier' ? 'To Customer' : 'To Supplier'}
                        </button>

                        <button
                          type="button"
                          className="client-act-btn"
                          title="Edit Profile & Status"
                          onClick={(e) => openEditModal(c, e)}
                        >
                          <Edit3 size={13} /> Edit
                        </button>

                        <button
                          type="button"
                          className="client-act-btn is-danger"
                          title="Delete Client"
                          onClick={(e) => askDeleteCustomer(c, e)}
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
        )}
      </div>

      {/* 3. Selected Client Inspector Panel (Ledger & Custom Rates) */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Tag size={20} style={{ color: 'var(--accent-teal)' }} />
              {selectedCustomer
                ? `Client Profile: ${selectedCustomer.name}`
                : 'Client Profile & Custom Rates'}
              {selectedCustomer && (
                <button
                  type="button"
                  className={`type-badge-btn ${selectedCustomer.party_type === 'supplier' ? 'supplier' : 'customer'}`}
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.65rem' }}
                  title={`Click to switch to ${selectedCustomer.party_type === 'supplier' ? 'Customer' : 'Supplier'}`}
                  onClick={(e) => handleTogglePartyType(selectedCustomer, e)}
                >
                  <ArrowLeftRight size={11} />
                  <span>{selectedCustomer.party_type === 'supplier' ? 'Supplier 📦' : 'Customer 👤'}</span>
                </button>
              )}
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
              {selectedCustomer
                ? `Viewing ledger, 1-Click order duplicates, and negotiated wholesale rates for ${selectedCustomer.name}.`
                : 'Click any client card in the directory above to view their full ledger and custom pricing.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(rateMsg || newProdMsg) && (
              <div style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Check size={14} /> {rateMsg || newProdMsg}
              </div>
            )}
            {selectedCustomer && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={(e) => handleTogglePartyType(selectedCustomer, e)}
                  title={`Switch status to ${selectedCustomer.party_type === 'supplier' ? 'Customer' : 'Supplier'}`}
                >
                  <ArrowLeftRight size={14} />
                  {selectedCustomer.party_type === 'supplier' ? 'Switch to Customer' : 'Switch to Supplier'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={(e) => openEditModal(selectedCustomer, e)}
                  title="Edit Client Profile"
                >
                  <Edit3 size={14} /> Edit Profile
                </button>
              </>
            )}
          </div>
        </div>

        {selectedCustomer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {ledger && (
              <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 12px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <BookOpen size={16} style={{ color: 'var(--accent-teal)' }} /> Transaction Ledger ({ledger.totals?.bill_count || 0} Bills)
                  </h4>
                  {ledger?.bills?.length > 0 && (
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: 'auto', padding: '0.38rem 0.85rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      onClick={handleReorderLastBill}
                      title="Duplicate last order items to a new bill"
                    >
                      <Repeat size={13} /> 1-Click Reorder Box
                    </button>
                  )}
                </div>

                <div className="client-ledger-stats">
                  <div>
                    <div className="client-ledger-label">Sales Due</div>
                    <div className="client-ledger-value" style={{ color: (ledger.totals.sales_outstanding || ledger.totals.outstanding) > 0 ? 'var(--status-due)' : undefined }}>
                      {formatCurrency(currencySymbol, ledger.totals.sales_outstanding ?? ledger.totals.outstanding)}
                    </div>
                  </div>
                  <div>
                    <div className="client-ledger-label">Help Lent</div>
                    <div className="client-ledger-value" style={{ color: (ledger.totals.help_outstanding || 0) > 0 ? 'var(--status-due)' : undefined }}>
                      {formatCurrency(currencySymbol, ledger.totals.help_outstanding || 0)}
                    </div>
                  </div>
                  {selectedCustomer.party_type === 'supplier' && (ledger.totals.buying_outstanding || 0) > 0 && (
                    <div>
                      <div className="client-ledger-label">Saudia Payable</div>
                      <div className="client-ledger-value">{formatCurrency(currencySymbol, ledger.totals.buying_outstanding)}</div>
                    </div>
                  )}
                  <div>
                    <div className="client-ledger-label">Total Paid</div>
                    <div className="client-ledger-value" style={{ color: 'var(--status-paid)' }}>
                      {formatCurrency(currencySymbol, ledger.totals.paid)}
                    </div>
                  </div>
                  <div>
                    <div className="client-ledger-label">Total Invoices</div>
                    <div className="client-ledger-value">{ledger.totals.bill_count}</div>
                  </div>
                </div>

                {(ledger.totals.help_given || 0) > 0 && (
                  <p className="client-ledger-help-note">
                    Help given {formatCurrency(currencySymbol, ledger.totals.help_given)} · returned {formatCurrency(currencySymbol, ledger.totals.help_repaid || 0)}
                  </p>
                )}

                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.65rem' }}>
                  {(ledger.bills || []).slice(0, 16).map((b) => {
                    const due = Math.max(0, Number(b.balance_due ?? (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0)));
                    const help = isHelpBill(b);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className="client-ledger-row"
                        onClick={() => (onViewBill ? onViewBill(b) : null)}
                      >
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
                          <ChevronRight size={14} aria-hidden />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Rates & Product Assignment */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.25rem' }}>
              {/* Option A: Assign rate for existing catalog product */}
              <form onSubmit={handleSaveRate} className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.85rem' }}>A. Set Rate for Existing Catalog Item</h4>

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
                        label: `${p.name} (Std: ${currencySymbol}${p.price})`,
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
                    placeholder="e.g. Custom Gift Box"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Standard Price ({currencySymbol})</label>
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
                    <label className="form-label">Client Price ({currencySymbol})</label>
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
            <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.85rem' }}>
                Active Special Rates for {selectedCustomer.name} ({customerRates.length})
              </h4>

              {customerRates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
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
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            👈 Click on any client profile from the directory above to view their ledger or assign custom rates.
          </div>
        )}
      </div>

      {/* 4. Merge Duplicate Clients Tool */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <GitMerge size={17} style={{ color: 'var(--accent-teal)' }} /> Merge Duplicate Clients
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Reassign bills and rates to the primary profile, then delete duplicates. Type MERGE to confirm.
        </p>
        {mergeSuggestions.length > 0 && (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)', padding: '0.4rem 0.75rem', borderRadius: 6 }}>
            Suggested duplicates to combine: {mergeSuggestions.map((g) => g.map((c) => c.name).join(' / ')).join(' · ')}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Primary Profile (keep)</label>
            <AppSelect
              value={mergePrimary}
              onChange={setMergePrimary}
              placeholder="— Select Primary Client —"
              options={[
                { value: '', label: '— Select Primary Client —' },
                ...customers.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Duplicates to Merge (remove)</label>
            <div style={{ maxHeight: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', background: 'var(--surface-muted)', padding: '0.5rem', borderRadius: 8 }}>
              {customers
                .filter((c) => String(c.id) !== String(mergePrimary))
                .map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.83rem', cursor: 'pointer' }}>
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
        <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Confirm Action (Type <strong style={{ color: 'var(--text-primary)' }}>MERGE</strong> to proceed)
          </label>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              value={mergeConfirm}
              onChange={(e) => setMergeConfirm(e.target.value)}
              placeholder="MERGE"
              autoComplete="off"
              style={{
                width: '140px',
                height: '38px',
                padding: '0 0.75rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={merging || !mergePrimary || !mergeDupes.length}
              onClick={handleMerge}
              style={{
                width: 'auto',
                height: '38px',
                padding: '0 1.1rem',
                fontSize: '0.82rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxSizing: 'border-box',
                whiteSpace: 'nowrap',
              }}
            >
              <GitMerge size={15} /> Merge now
            </button>
          </div>
        </div>
      </div>

      {/* 5. Add Client Profile Modal */}
      {showAddModal &&
        createPortal(
          <div className="client-modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="client-modal-card" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserPlus size={20} style={{ color: 'var(--accent-teal)' }} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Add New Client Profile</h3>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto', padding: '0.35rem 0.55rem' }}
                  onClick={() => setShowAddModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group">
                  <label className="form-label">Client / Company Name *</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. Ali Retail Client"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Party Type</label>
                  <AppSelect
                    value={partyType}
                    onChange={setPartyType}
                    options={[
                      { value: 'customer', label: 'Online Customer (Retail / Sales)' },
                      { value: 'supplier', label: 'Supplier (Saudia / Buying)' },
                    ]}
                  />
                </div>

                <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">WhatsApp / Phone</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="+92 300 0000000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="client@domain.pk"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Shipping / City Address</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="City, delivery address or location"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                {/* Show Bank Details ONLY for Suppliers */}
                {partyType === 'supplier' && (
                  <div style={{ background: 'var(--surface-muted)', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 800, margin: '0 0 0.65rem', color: 'var(--text-primary)' }}>
                      Supplier Pay To Bank Details (for Saudia payments)
                    </p>
                    <div className="form-group">
                      <label className="form-label">Payee Bank Name</label>
                      <PayeeBankSelect
                        value={payeeBankName}
                        onChange={setPayeeBankName}
                        extraBanks={extraPayeeBanks}
                      />
                    </div>
                    <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label">Account Title</label>
                        <input
                          className="form-input"
                          type="text"
                          placeholder="Account title"
                          value={payeeAccountTitle}
                          onChange={(e) => setPayeeAccountTitle(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">IBAN / Account #</label>
                        <input
                          className="form-input"
                          type="text"
                          placeholder="SA…"
                          value={payeeAccountNumber}
                          onChange={(e) => setPayeeAccountNumber(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: 'auto' }}
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ width: 'auto' }}>
                    <Plus size={16} /> Save Client Profile
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 6. Edit Client Profile Modal */}
      {editCustomer &&
        createPortal(
          <div className="client-modal-overlay" onClick={() => !savingEdit && setEditCustomer(null)}>
            <div className="client-modal-card" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Edit3 size={20} style={{ color: 'var(--accent-teal)' }} />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Edit Profile & Status</h3>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto', padding: '0.35rem 0.55rem' }}
                  onClick={() => !savingEdit && setEditCustomer(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUpdateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group">
                  <label className="form-label">Client / Company Name *</label>
                  <input
                    className="form-input"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Party Status / Type</label>
                  <AppSelect
                    value={editPartyType}
                    onChange={setEditPartyType}
                    options={[
                      { value: 'customer', label: 'Online Customer (Retail / Sales)' },
                      { value: 'supplier', label: 'Supplier (Saudia / Buying)' },
                    ]}
                  />
                </div>

                <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">WhatsApp / Phone</label>
                    <input
                      className="form-input"
                      type="text"
                      placeholder="+92 300 0000000"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="client@domain.pk"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Shipping / City Address</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="City, delivery address or location"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                  />
                </div>

                {/* Show Bank Details ONLY for Suppliers */}
                {editPartyType === 'supplier' && (
                  <div style={{ background: 'var(--surface-muted)', padding: '0.85rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 800, margin: '0 0 0.65rem', color: 'var(--text-primary)' }}>
                      Supplier Pay To Bank Details (for Saudia payments)
                    </p>
                    <div className="form-group">
                      <label className="form-label">Payee Bank Name</label>
                      <PayeeBankSelect
                        value={editPayeeBankName}
                        onChange={setEditPayeeBankName}
                      />
                    </div>
                    <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group">
                        <label className="form-label">Account Title</label>
                        <input
                          className="form-input"
                          type="text"
                          placeholder="Account title"
                          value={editPayeeAccountTitle}
                          onChange={(e) => setEditPayeeAccountTitle(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">IBAN / Account #</label>
                        <input
                          className="form-input"
                          type="text"
                          placeholder="SA…"
                          value={editPayeeAccountNumber}
                          onChange={(e) => setEditPayeeAccountNumber(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: 'auto' }}
                    onClick={() => setEditCustomer(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={savingEdit}>
                    <Check size={16} /> {savingEdit ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Dialog */}
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
