import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Zap, Save, RefreshCw, UserCheck, PackageCheck, Calculator, FilePlus2, Camera, History, ChevronDown, ChevronUp, ShoppingCart, Package, HeartHandshake, Edit3, MessageCircle, Printer } from 'lucide-react';
import { parseNaturalBillText } from '../utils/naturalParser';
import { pakistanToday, addDaysToDateString, formatCurrency, pakistanNowTime } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { openWhatsAppReminder, buildPaymentReminderText, normalizeWhatsAppPhone } from '../utils/paymentReminder';
import BarcodeScanner from './BarcodeScanner';
import ConfirmDialog from './ConfirmDialog';
import AppSelect from './AppSelect';
import PayeeBankSelect from './PayeeBankSelect';
import { clearBillDraft, draftHasContent, loadBillDraft, saveBillDraft } from '../utils/billDraft';
import { HELP_PERIODS, normalizeBillType, CREATE_BILL_TYPE_KEY } from '../utils/billTypes';

export default function SmartBillForm({ onBillGenerated, currencySymbol = 'Rs.', defaultTaxRate = 0, draftBill = null, onDraftConsumed, active = true }) {
  const toast = useToast();
  const savingRef = useRef(false);
  const dateTouchedRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const saveAckRef = useRef({ zero: false, stock: false });
  const [billType, setBillType] = useState('customer'); // 'customer' | 'supplier' | 'help'
  const [helpPeriodDays, setHelpPeriodDays] = useState(30);
  const [naturalText, setNaturalText] = useState('');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerRates, setCustomerRates] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [skuQuery, setSkuQuery] = useState('');
  const [saveMode, setSaveMode] = useState('view'); // 'view' | 'new'
  const [scanOpen, setScanOpen] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveConfirm, setSaveConfirm] = useState(null);
  const [editingBillId, setEditingBillId] = useState(null);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [billDate, setBillDate] = useState(() => pakistanToday());
  const [dueDate, setDueDate] = useState(() => addDaysToDateString(pakistanToday(), 14));
  const [taxRate, setTaxRate] = useState(defaultTaxRate);
  const [discountRate, setDiscountRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer / Raast');
  const [cashTendered, setCashTendered] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [notes, setNotes] = useState('Thank you for your order!');
  const [payeeBankName, setPayeeBankName] = useState('');
  const [payeeAccountTitle, setPayeeAccountTitle] = useState('');
  const [payeeAccountNumber, setPayeeAccountNumber] = useState('');
  const [payeePaymentNotes, setPayeePaymentNotes] = useState('');

  // Items State
  const [items, setItems] = useState([
    { product_id: null, description: '', quantity: 1, unit_price: 0 },
  ]);

  // Fetch initial helper data
  useEffect(() => {
    if (!editingBillId) fetchNextInvoiceNumber(billType);
    fetchCustomersAndProducts();
  }, [billType, editingBillId]);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (active) fetchCustomersAndProducts();
  }, [active]);

  useEffect(() => {
    setTaxRate(defaultTaxRate);
  }, [defaultTaxRate]);

  // Apply duplicate / draft / edit bill once
  useEffect(() => {
    if (!draftBill) return;
    const b = draftBill;
    const isEdit = Boolean(b.isEditing);
    setEditingBillId(isEdit ? b.id : null);
    dateTouchedRef.current = false;
    setBillType(normalizeBillType(b.bill_type));
    setCustomerName(b.customer_name || '');
    setCustomerEmail(b.customer_email || '');
    setCustomerPhone(b.customer_phone || '');
    setCustomerAddress(b.customer_address || '');
    setBillDate(b.bill_date || pakistanToday());
    setDueDate(b.due_date || addDaysToDateString(pakistanToday(), 14));
    setTaxRate(b.tax_rate ?? defaultTaxRate);
    setDiscountRate(b.discount_rate ?? 0);
    setPaymentMethod(b.payment_method || (b.bill_type === 'supplier' ? 'Bank Transfer / Remittance' : b.bill_type === 'help' ? 'Cash' : 'Bank Transfer / Raast'));
    setNotes(b.notes || (b.bill_type === 'supplier' ? 'Purchase remittance / payment advice' : b.bill_type === 'help' ? 'Help money — return after the agreed period' : 'Thank you for your order!'));
    setPayeeBankName(b.payee_bank_name || '');
    setPayeeAccountTitle(b.payee_account_title || '');
    setPayeeAccountNumber(b.payee_account_number || '');
    setPayeePaymentNotes(b.payee_payment_notes || '');
    if (b.items && b.items.length) {
      setItems(
        b.items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description || '',
          quantity: it.quantity || 1,
          unit_price: it.unit_price || 0,
        }))
      );
    }
    if (isEdit) {
      setInvoiceNumber(b.invoice_number || '');
    } else {
      fetchNextInvoiceNumber(normalizeBillType(b.bill_type));
    }
    clearBillDraft();
    draftHydratedRef.current = true;
    if (onDraftConsumed) onDraftConsumed();
  }, [draftBill]);

  // Restore in-progress bill after force-close / tab leave
  useEffect(() => {
    if (draftBill || draftHydratedRef.current) return;
    const saved = loadBillDraft();
    if (!draftHasContent(saved)) {
      draftHydratedRef.current = true;
      return;
    }
    draftHydratedRef.current = true;
    dateTouchedRef.current = Boolean(saved.dateTouched);
    setBillType(normalizeBillType(saved.billType));
    setNaturalText(saved.naturalText || '');
    setInvoiceNumber(saved.invoiceNumber || '');
    setCustomerName(saved.customerName || '');
    setCustomerEmail(saved.customerEmail || '');
    setCustomerPhone(saved.customerPhone || '');
    setCustomerAddress(saved.customerAddress || '');
    setBillDate(saved.billDate || pakistanToday());
    setDueDate(saved.dueDate || addDaysToDateString(pakistanToday(), 14));
    setTaxRate(saved.taxRate ?? defaultTaxRate);
    setDiscountRate(saved.discountRate ?? 0);
    setPaymentMethod(saved.paymentMethod || 'Bank Transfer / Raast');
    setCashTendered(saved.cashTendered || '');
    setInitialPayment(saved.initialPayment || '');
    setNotes(saved.notes || 'Thank you for your order!');
    setHelpPeriodDays(saved.helpPeriodDays === 'custom' ? 'custom' : Number(saved.helpPeriodDays) || 30);
    setPayeeBankName(saved.payeeBankName || '');
    setPayeeAccountTitle(saved.payeeAccountTitle || '');
    setPayeeAccountNumber(saved.payeeAccountNumber || '');
    setPayeePaymentNotes(saved.payeePaymentNotes || '');
    setSelectedCustomerId(saved.selectedCustomerId || null);
    if (Array.isArray(saved.items) && saved.items.length) {
      setItems(
        saved.items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description || '',
          quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
          unit_price: Number(it.unit_price) || 0,
        }))
      );
    }
    toast.info('Draft restored', 2200);
  }, [draftBill, defaultTaxRate, toast]);

  useEffect(() => {
    let want = '';
    try {
      want = sessionStorage.getItem(CREATE_BILL_TYPE_KEY) || '';
    } catch {
      return;
    }
    if (normalizeBillType(want) !== 'help') return;
    try {
      sessionStorage.removeItem(CREATE_BILL_TYPE_KEY);
    } catch {
      /* ignore */
    }
    if (draftBill) return;
    setBillType('help');
    setSelectedCustomerId(null);
    setPaymentMethod('Cash');
    setTaxRate(0);
    setDiscountRate(0);
    setHelpPeriodDays(30);
    setDueDate(addDaysToDateString(pakistanToday(), 30));
    setNotes('Help money — return after the agreed period');
    setItems((prev) => {
      const desc = String(prev[0]?.description || '').trim();
      const emptyOrDefault = !desc || (prev.length === 1 && !prev[0].unit_price);
      if (emptyOrDefault) {
        return [{ product_id: null, description: 'Help / loan given', quantity: 1, unit_price: Number(prev[0]?.unit_price) || 0 }];
      }
      return prev;
    });
  }, [draftBill]);

  // Autosave draft while composing
  useEffect(() => {
    if (!active) return undefined;
    if (!draftHydratedRef.current && !draftBill) return undefined;
    const t = setTimeout(() => {
      const draft = {
        billType,
        naturalText,
        invoiceNumber,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        billDate,
        dueDate,
        taxRate,
        discountRate,
        paymentMethod,
        cashTendered,
        initialPayment,
        notes,
        helpPeriodDays,
        payeeBankName,
        payeeAccountTitle,
        payeeAccountNumber,
        payeePaymentNotes,
        selectedCustomerId,
        items,
        dateTouched: dateTouchedRef.current,
      };
      if (draftHasContent(draft)) saveBillDraft(draft);
      else clearBillDraft();
    }, 400);
    return () => clearTimeout(t);
  }, [
    billType,
    naturalText,
    invoiceNumber,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    billDate,
    dueDate,
    taxRate,
    discountRate,
    paymentMethod,
    cashTendered,
    initialPayment,
    notes,
    helpPeriodDays,
    payeeBankName,
    payeeAccountTitle,
    payeeAccountNumber,
    payeePaymentNotes,
    selectedCustomerId,
    items,
    draftBill,
    active,
  ]);

  // Refresh Pakistan date if form left open past midnight (unless user edited date)
  useEffect(() => {
    const syncDates = () => {
      if (dateTouchedRef.current) return;
      const today = pakistanToday();
      setBillDate((prev) => (prev === today ? prev : today));
      setDueDate(addDaysToDateString(today, 14));
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') syncDates();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', syncDates);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', syncDates);
    };
  }, []);

  useEffect(() => {
    if (billType !== 'help') return;
    if (helpPeriodDays === 'custom') return;
    const days = Number(helpPeriodDays);
    if (!billDate || !days) return;
    setDueDate(addDaysToDateString(billDate, days));
  }, [billDate, billType, helpPeriodDays]);

  const fetchNextInvoiceNumber = async (bType = 'customer') => {
    try {
      const res = await apiFetch(`/api/bills/next-number?type=${bType}`);
      const data = await res.json();
      if (data.invoice_number) setInvoiceNumber(data.invoice_number);
    } catch (err) {
      console.error('Error fetching invoice number:', err);
    }
  };

  const fetchCustomersAndProducts = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        apiFetch('/api/customers'),
        apiFetch('/api/products')
      ]);
      const cData = await cRes.json();
      const pData = await pRes.json();
      setCustomers(cData || []);
      setProducts(pData || []);
    } catch (err) {
      console.error('Error fetching dropdown data:', err);
    }
  };

  // Fetch Customer Special Rates on Customer Select
  const fetchCustomerRates = async (cId) => {
    if (!cId) {
      setCustomerRates([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/customers/${cId}/rates`);
      const data = await res.json();
      setCustomerRates(data || []);
    } catch (err) {
      console.error('Error fetching customer rates:', err);
    }
  };

  const filteredParties = useMemo(() => {
    return (customers || []).filter((c) => {
      const pt = c.party_type === 'supplier' ? 'supplier' : 'customer';
      if (billType === 'supplier') return pt === 'supplier';
      return pt === 'customer';
    });
  }, [customers, billType]);

  const extraPayeeBanks = useMemo(
    () => (customers || []).map((c) => c.payee_bank_name).filter(Boolean),
    [customers]
  );

  // Select Customer from Saved DB list
  const handleSelectCustomer = (e) => {
    const custId = e.target.value;
    if (!custId) {
      setSelectedCustomerId(null);
      setCustomerRates([]);
      return;
    }
    const found = customers.find((c) => c.id === parseInt(custId, 10));
    if (found) {
      setSelectedCustomerId(found.id);
      setCustomerName(found.name);
      setCustomerEmail(found.email || '');
      setCustomerPhone(found.phone || '');
      setCustomerAddress(found.address || '');
      setPayeeBankName(found.payee_bank_name || '');
      setPayeeAccountTitle(found.payee_account_title || '');
      setPayeeAccountNumber(found.payee_account_number || '');
      setPayeePaymentNotes(found.payee_payment_notes || '');
      fetchCustomerRates(found.id);
    }
  };

  const productOptions = useMemo(() => [
    { value: '', label: '-- Select Item from Catalog --' },
    ...(products || []).map((p) => ({
      value: String(p.id),
      label: p.name,
    })),
    { value: 'custom', label: '✏️ Custom / Other item (type manually)...' },
  ], [products]);

  // Select Product for an Item Row (Check for Customer Special Rate, allow pricing edit)
  const handleSelectProduct = (index, productId) => {
    if (!productId) {
      const updated = [...items];
      updated[index] = {
        product_id: null,
        description: '',
        quantity: updated[index]?.quantity || 1,
        unit_price: 0,
      };
      setItems(updated);
      return;
    }
    if (productId === 'custom') {
      const updated = [...items];
      updated[index] = {
        ...updated[index],
        product_id: null,
      };
      setItems(updated);
      return;
    }
    const pId = parseInt(productId, 10);
    const found = products.find((p) => p.id === pId);
    if (found) {
      // Check if selected customer has a special custom rate for this product
      let effectivePrice = found.price;
      const customRateObj = customerRates.find((r) => r.product_id === pId);
      if (customRateObj && customRateObj.custom_price !== undefined) {
        effectivePrice = customRateObj.custom_price;
        toast.info(`Applied last price for ${customerName || 'client'}: ${currencySymbol}${effectivePrice}`);
      }

      const stock = Number(found.stock);
      if (billType === 'customer' && !Number.isNaN(stock) && stock <= 0) {
        toast.info(`Low stock warning: "${found.name}" has ${stock} in stock.`);
      } else if (billType === 'customer' && !Number.isNaN(stock) && stock <= 5) {
        toast.info(`Low stock: only ${stock} left for "${found.name}".`);
      }

      const updated = [...items];
      const prevQty = updated[index]?.quantity;
      updated[index] = {
        product_id: found.id,
        description: found.name,
        quantity: prevQty && prevQty > 0 ? prevQty : 1,
        unit_price: effectivePrice,
      };
      setItems(updated);
    }
  };

  const getStockWarnings = () => {
    if (billType !== 'customer') return [];
    const warnings = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const product = products.find((p) => p.id === item.product_id);
      if (!product) continue;
      const stock = Number(product.stock);
      const qty = Number(item.quantity) || 0;
      if (Number.isNaN(stock)) continue;
      if (qty > stock) {
        warnings.push(`"${product.name}" — need ${qty}, only ${stock} in stock`);
      } else if (stock - qty <= 5) {
        warnings.push(`"${product.name}" — after this sale stock will be ${Math.max(0, stock - qty)}`);
      }
    }
    return warnings;
  };

  // Line Item Handlers
  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  // Auto-save a newly written custom product into the database catalog
  const handleCustomItemBlur = async (index) => {
    const it = items[index];
    const desc = String(it?.description || '').trim();
    if (!desc || it?.product_id || billType === 'help') return;

    const existing = (products || []).find(
      (p) => p.name.trim().toLowerCase() === desc.toLowerCase()
    );
    if (existing) {
      const updated = [...items];
      updated[index] = { ...it, product_id: existing.id };
      setItems(updated);
      return;
    }

    try {
      const unitPrice = parseFloat(it.unit_price) || 0;
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: desc,
          description: desc,
          price: unitPrice,
          cost_price: 0,
          unit: 'item',
          stock: 100,
          sku: '',
        }),
      });
      if (res.ok) {
        const newProd = await parseJsonSafe(res);
        if (newProd && newProd.id) {
          const updated = [...items];
          updated[index] = { ...it, product_id: newProd.id };
          setItems(updated);
          const pRes = await apiFetch('/api/products');
          const pData = await pRes.json();
          if (Array.isArray(pData)) setProducts(pData);
          toast.success(`"${desc}" added to catalog`);
        }
      }
    } catch (e) {
      console.warn('Auto catalog add on blur skipped:', e);
    }
  };

  const autoSaveCustomProductsToCatalog = async (currentItems) => {
    if (billType === 'help') return currentItems;
    const itemsCopy = [...currentItems];
    let updatedProducts = false;

    for (let i = 0; i < itemsCopy.length; i++) {
      const it = itemsCopy[i];
      const desc = String(it.description || '').trim();
      if (!desc || it.product_id) continue;

      const existing = (products || []).find(
        (p) => p.name.trim().toLowerCase() === desc.toLowerCase()
      );

      if (existing) {
        itemsCopy[i] = {
          ...it,
          product_id: existing.id,
        };
      } else {
        try {
          const unitPrice = parseFloat(it.unit_price) || 0;
          const res = await apiFetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: desc,
              description: desc,
              price: unitPrice,
              cost_price: 0,
              unit: 'item',
              stock: 100,
              sku: '',
            }),
          });
          if (res.ok) {
            const newProd = await parseJsonSafe(res);
            if (newProd && newProd.id) {
              itemsCopy[i] = {
                ...it,
                product_id: newProd.id,
              };
              updatedProducts = true;
            }
          }
        } catch (e) {
          console.warn('Auto catalog add skipped:', e);
        }
      }
    }

    if (updatedProducts) {
      try {
        const pRes = await apiFetch('/api/products');
        const pData = await pRes.json();
        if (Array.isArray(pData)) setProducts(pData);
      } catch (err) {
        console.error('Error refreshing products:', err);
      }
    }

    return itemsCopy;
  };

  // Auto-save a newly written customer into the customers directory
  const autoSaveCustomerToDirectory = async () => {
    const trimmedName = String(customerName || '').trim();
    if (!trimmedName || billType === 'help' || selectedCustomerId) return null;
    if (
      trimmedName.toLowerCase() === 'saudia arabia supplier' ||
      trimmedName.toLowerCase() === 'cash customer' ||
      trimmedName.toLowerCase() === 'walk-in customer'
    ) return null;

    const existing = (customers || []).find(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (existing) {
      setSelectedCustomerId(existing.id);
      return existing;
    }

    try {
      const res = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: String(customerEmail || '').trim(),
          phone: String(customerPhone || '').trim(),
          address: String(customerAddress || '').trim(),
          party_type: billType === 'supplier' ? 'supplier' : 'customer',
          payee_bank_name: payeeBankName || '',
          payee_account_title: payeeAccountTitle || '',
          payee_account_number: payeeAccountNumber || '',
          payee_payment_notes: payeePaymentNotes || '',
        }),
      });
      if (res.ok) {
        const created = await parseJsonSafe(res);
        if (created && created.id) {
          setSelectedCustomerId(created.id);
          const cRes = await apiFetch('/api/customers');
          const cData = await cRes.json();
          if (Array.isArray(cData)) setCustomers(cData);
          toast.success(`Client "${trimmedName}" saved to directory`);
          return created;
        }
      }
    } catch (e) {
      console.warn('Auto customer add skipped:', e);
    }
    return null;
  };

  // Automatically remember custom prices for this customer for future bills
  const saveCustomerRatesOnBillSave = async (cId, currentItems) => {
    if (!cId || !Array.isArray(currentItems) || billType === 'help') return;
    for (const it of currentItems) {
      if (it.product_id && Number(it.unit_price) > 0) {
        try {
          await apiFetch(`/api/customers/${cId}/rates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: it.product_id,
              custom_price: Number(it.unit_price),
            }),
          });
        } catch (_) {
          /* non-blocking */
        }
      }
    }
  };

  const addItemRow = () => {
    setItems([...items, { product_id: null, description: '', quantity: 1, unit_price: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Smart Quick-Parse: fill customer + line items from free text
  const handleNaturalParse = () => {
    const parsed = parseNaturalBillText(naturalText);
    if (!parsed || (!parsed.customerName && (!parsed.items || parsed.items.length === 0))) {
      toast.error('Could not parse that text. Try: "2 Ferrero Rocher @ 2450 for Al-Fatah"');
      return;
    }

    if (parsed.customerName) {
      setCustomerName(parsed.customerName);
      setSelectedCustomerId(null);
    }

    if (parsed.items && parsed.items.length > 0) {
      setItems(
        parsed.items.map((item) => ({
          product_id: null,
          description: item.description || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
        }))
      );
    }
  };

  const parseJsonSafe = async (res) => {
    const contentType = res?.headers?.get?.('content-type') || '';
    const text = await res.text();
    if (!text) return null;
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 200) || `HTTP ${res.status}` };
    }
  };

  // Math Calculations
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0)), 0);
  const taxAmount = (subtotal * (parseFloat(taxRate) || 0)) / 100;
  const discountAmount = (subtotal * (parseFloat(discountRate) || 0)) / 100;
  const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);
  const isCashSale = billType !== 'help' && String(paymentMethod).toLowerCase().includes('cash');
  const tenderedNum = parseFloat(cashTendered);
  const changeDue =
    isCashSale && Number.isFinite(tenderedNum) && tenderedNum > 0
      ? Math.round((tenderedNum - totalAmount) * 100) / 100
      : null;
  const stockWarnings = getStockWarnings();
  const initialPayNum = parseFloat(initialPayment) || 0;
  const remainingAfterInitial = Math.max(0, Math.round((totalAmount - initialPayNum) * 100) / 100);

  const recordInitialPayment = async (billId, amount) => {
    const res = await apiFetch(`/api/bills/${billId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        method: paymentMethod,
        payment_date: billDate,
        notes: 'Payment at bill creation',
      }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) throw new Error(data?.error || `Payment failed (${res.status})`);
    return data;
  };

  const resetFormForNew = async () => {
    setNaturalText('');
    setSelectedCustomerId(null);
    setCustomerRates([]);
    setCustomerName(billType === 'supplier' ? 'Saudia Arabia Supplier' : '');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerAddress('');
    setPayeeBankName('');
    setPayeeAccountTitle('');
    setPayeeAccountNumber('');
    setPayeePaymentNotes('');
    setBillDate(pakistanToday());
    setDueDate(addDaysToDateString(pakistanToday(), billType === 'help' ? Number(helpPeriodDays) || 30 : 14));
    setTaxRate(billType === 'help' ? 0 : defaultTaxRate);
    setDiscountRate(0);
    setPaymentMethod(
      billType === 'supplier'
        ? 'Bank Transfer / Remittance'
        : billType === 'help'
          ? 'Cash'
          : 'Bank Transfer / Raast'
    );
    setCashTendered('');
    setInitialPayment('');
    setNotes(
      billType === 'supplier'
        ? 'Purchase remittance / payment advice'
        : billType === 'help'
          ? 'Help money — return after the agreed period'
          : 'Thank you for your order!'
    );
    setItems(
      billType === 'help'
        ? [{ product_id: null, description: 'Help / loan given', quantity: 1, unit_price: 0 }]
        : [{ product_id: null, description: '', quantity: 1, unit_price: 0 }]
    );
    setSkuQuery('');
    dateTouchedRef.current = false;
    clearBillDraft();
    await fetchNextInvoiceNumber(billType);
  };

  const applySkuLookup = (rawQuery) => {
    const q = String(rawQuery ?? skuQuery).trim().toLowerCase();
    if (!q) return;
    const found = products.find(
      (p) =>
        String(p.sku || '').toLowerCase() === q ||
        String(p.name || '').toLowerCase().includes(q)
    );
    if (!found) {
      toast.error(`No item matched "${rawQuery ?? skuQuery}"`);
      return;
    }

    let effectivePrice = found.price;
    const customRateObj = customerRates.find((r) => r.product_id === found.id);
    if (customRateObj && customRateObj.custom_price !== undefined) {
      effectivePrice = customRateObj.custom_price;
    }
    const newRow = {
      product_id: found.id,
      description: found.name,
      quantity: 1,
      unit_price: effectivePrice,
    };

    setItems((prev) => {
      const emptyIdx = prev.findIndex((it) => !String(it.description || '').trim());
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = newRow;
        return next;
      }
      return [...prev, newRow];
    });
    setSkuQuery('');
    toast.success(`Added ${found.name}`);
  };

  const handleRepeatLastOrder = async () => {
    const name = (customerName || '').trim();
    if (!name) {
      toast.error('Select or enter a client first');
      return;
    }
    setRepeating(true);
    try {
      const res = await apiFetch(`/api/bills?search=${encodeURIComponent(name)}&type=${billType}`);
      const list = await res.json();
      if (!res.ok) throw new Error(list?.error || `HTTP ${res.status}`);
      const match = (list || []).find(
        (b) =>
          String(b.customer_name || '').trim().toLowerCase() === name.toLowerCase() &&
          Array.isArray(b.items) &&
          b.items.length > 0
      );
      if (!match) {
        toast.error('No previous bill found for this client');
        return;
      }
      setCustomerEmail(match.customer_email || customerEmail);
      setCustomerPhone(match.customer_phone || customerPhone);
      setCustomerAddress(match.customer_address || customerAddress);
      setTaxRate(match.tax_rate ?? defaultTaxRate);
      setDiscountRate(match.discount_rate ?? 0);
      setPaymentMethod(
        match.payment_method ||
          (billType === 'supplier' ? 'Bank Transfer / Remittance' : 'Bank Transfer / Raast')
      );
      setItems(
        match.items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description || '',
          quantity: it.quantity || 1,
          unit_price: it.unit_price || 0,
        }))
      );
      setBillDate(pakistanToday());
      setDueDate(addDaysToDateString(pakistanToday(), billType === 'help' ? Number(helpPeriodDays) || 30 : 14));
      toast.success(`Loaded items from ${match.invoice_number}`);
    } catch (err) {
      toast.error(err.message || 'Could not load last order');
    } finally {
      setRepeating(false);
    }
  };

  // Submit and Save to SQLite DB
  const performSave = async () => {
    if (savingRef.current || loading) return;
    const mode = saveMode;
    savingRef.current = true;
    setLoading(true);
    try {
      // Auto-save any newly typed customer and custom items directly into the directory & catalog
      const savedCust = await autoSaveCustomerToDirectory();
      const finalCustId = selectedCustomerId || savedCust?.id;
      const enrichedItems = await autoSaveCustomProductsToCatalog(items);

      if (finalCustId) {
        saveCustomerRatesOnBillSave(finalCustId, enrichedItems);
      }

      const payload = {
        bill_type: billType,
        invoice_number: invoiceNumber,
        customer_name: customerName.slice(0, 120),
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        bill_date: billDate || pakistanToday(),
        bill_time: pakistanNowTime(),
        due_date: dueDate || addDaysToDateString(pakistanToday(), 14),
        subtotal,
        tax_rate: parseFloat(taxRate) || 0,
        tax_amount: taxAmount,
        discount_rate: parseFloat(discountRate) || 0,
        discount_amount: discountAmount,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: 'pending',
        notes:
          isCashSale && changeDue != null
            ? `${notes}${notes?.trim() ? '\n' : ''}Cash tendered: ${currencySymbol}${tenderedNum.toFixed(2)} · Change: ${currencySymbol}${Math.max(0, changeDue).toFixed(2)}${changeDue < 0 ? ' (short)' : ''}`
            : notes,
        payment_method: paymentMethod,
        payee_bank_name: billType === 'supplier' ? payeeBankName : '',
        payee_account_title: billType === 'supplier' ? payeeAccountTitle : '',
        payee_account_number: billType === 'supplier' ? payeeAccountNumber : '',
        payee_payment_notes: billType === 'supplier' ? payeePaymentNotes : '',
        items: (enrichedItems || items).map((it) => ({
          ...it,
          description: String(it.description || '').slice(0, 160),
        })),
      };

      const url = editingBillId ? `/api/bills/${editingBillId}` : '/api/bills';
      const method = editingBillId ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error(
          (data && data.error) ||
            `Failed to save bill (HTTP ${res.status}). Is the backend running on port 11000?`
        );
      }

      if (!data) {
        throw new Error('Server returned an empty response after saving the bill.');
      }

      if (data.invoice_number && data.invoice_number !== invoiceNumber) {
        setInvoiceNumber(data.invoice_number);
      }

      let savedBill = data;
      if (initialPayNum > 0 && savedBill?.id && !editingBillId) {
        if (initialPayNum > totalAmount) {
          toast.info('Payment amount capped to bill total.');
        }
        savedBill = await recordInitialPayment(savedBill.id, Math.min(initialPayNum, totalAmount));
      }

      clearBillDraft();
      saveAckRef.current = { zero: false, stock: false };

      if (editingBillId) {
        toast.success(`Updated ${savedBill.invoice_number || invoiceNumber}`);
        setEditingBillId(null);
        onBillGenerated(savedBill);
        return;
      }

      if (mode === 'whatsapp') {
        const phone = savedBill.customer_phone || customerPhone;
        const norm = normalizeWhatsAppPhone(phone);
        if (norm) {
          const reminder = buildPaymentReminderText({
            bill: savedBill,
            currencySymbol,
          });
          openWhatsAppReminder(phone, reminder);
        } else {
          toast.info('No phone number entered for WhatsApp invoice.');
        }
        onBillGenerated(savedBill);
      } else if (mode === 'print') {
        onBillGenerated(savedBill);
        setTimeout(() => {
          window.print();
        }, 600);
      } else if (mode === 'new') {
        await resetFormForNew();
        const remain = Number(savedBill?.balance_due) || 0;
        toast.success(
          remain > 0
            ? `Saved ${savedBill.invoice_number}. Remaining ${formatCurrency(currencySymbol, remain)}`
            : `Saved ${savedBill.invoice_number}. Fully paid.`
        );
      } else {
        onBillGenerated(savedBill);
      }
    } catch (err) {
      const msg =
        err.message === 'Failed to fetch'
          ? 'Cannot reach the API. Start the backend (port 11000) and keep the Vite proxy running.'
          : err.message;
      toast.error('Error saving bill: ' + msg);
    } finally {
      savingRef.current = false;
      setLoading(false);
      setSaveMode('view');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current || loading) return;
    if (!customerName.trim()) {
      toast.error(
        billType === 'supplier'
          ? 'Please enter or select a supplier / pay-to name.'
          : billType === 'help'
            ? 'Please enter the person’s name.'
            : 'Please enter or select a customer name.'
      );
      return;
    }
    if (items.length === 0 || items.some((i) => !i.description.trim())) {
      toast.error('Please ensure all item descriptions are filled out.');
      return;
    }
    if (!Number.isFinite(totalAmount)) {
      toast.error('Bill total is invalid. Check quantities and prices.');
      return;
    }
    if (totalAmount <= 0 && !saveAckRef.current.zero) {
      setSaveConfirm({
        type: 'zero',
        title: 'Save Rs. 0 bill?',
        message: 'Bill total is Rs. 0 (or less). Save anyway?',
      });
      return;
    }

    const oversell = stockWarnings.filter((w) => w.includes('need'));
    if (oversell.length > 0 && !saveAckRef.current.stock) {
      setSaveConfirm({
        type: 'stock',
        title: 'Stock warning',
        message: `${oversell.join(' · ')}. Save anyway? Stock will not go below 0.`,
      });
      return;
    }

    await performSave();
  };

  const confirmSaveWarning = async () => {
    if (!saveConfirm) return;
    if (saveConfirm.type === 'zero') saveAckRef.current.zero = true;
    if (saveConfirm.type === 'stock') saveAckRef.current.stock = true;
    setSaveConfirm(null);

    const oversell = stockWarnings.filter((w) => w.includes('need'));
    if (saveConfirm.type === 'zero' && oversell.length > 0 && !saveAckRef.current.stock) {
      setSaveConfirm({
        type: 'stock',
        title: 'Stock warning',
        message: `${oversell.join(' · ')}. Save anyway? Stock will not go below 0.`,
      });
      return;
    }

    await performSave();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel bill-type-panel">
        <div className="bill-type-head">
          <h3>Bill type</h3>
          <p>Sale to a client, stock from Saudia, or help money for a period.</p>
        </div>

        <div className="bill-type-grid" role="radiogroup" aria-label="Bill type">
          <button
            type="button"
            role="radio"
            aria-checked={billType === 'customer'}
            className={`bill-type-card${billType === 'customer' ? ' is-active' : ''}`}
            onClick={() => {
              setBillType('customer');
              setSelectedCustomerId(null);
              if (customerName === 'Saudia Arabia Supplier') setCustomerName('');
              setPaymentMethod((pm) => (pm === 'Bank Transfer / Remittance' || pm === 'Cash' ? 'Bank Transfer / Raast' : pm));
              if (!notes || notes === 'Purchase remittance / payment advice' || notes === 'Help money — return after the agreed period') {
                setNotes('Thank you for your order!');
              }
            }}
          >
            <span className="bill-type-icon" aria-hidden>
              <ShoppingCart size={18} />
            </span>
            <span className="bill-type-copy">
              <strong>Customer sale</strong>
              <small>Local clients · #INV</small>
            </span>
            <span className="bill-type-check" aria-hidden />
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={billType === 'supplier'}
            className={`bill-type-card is-saudia${billType === 'supplier' ? ' is-active' : ''}`}
            onClick={() => {
              setBillType('supplier');
              setSelectedCustomerId(null);
              const blankOrDefault =
                !customerName.trim() || customerName.trim() === 'Saudia Arabia Supplier';
              if (blankOrDefault) setCustomerName('Saudia Arabia Supplier');
              setPaymentMethod('Bank Transfer / Remittance');
              if (!notes || notes === 'Thank you for your order!' || notes === 'Help money — return after the agreed period') {
                setNotes('Purchase remittance / payment advice');
              }
            }}
          >
            <span className="bill-type-icon" aria-hidden>
              <Package size={18} />
            </span>
            <span className="bill-type-copy">
              <strong>Saudia purchase</strong>
              <small>Stock buying cost · #SAU</small>
            </span>
            <span className="bill-type-check" aria-hidden />
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={billType === 'help'}
            className={`bill-type-card is-help${billType === 'help' ? ' is-active' : ''}`}
            onClick={() => {
              setBillType('help');
              setSelectedCustomerId(null);
              if (customerName === 'Saudia Arabia Supplier') setCustomerName('');
              setPaymentMethod('Cash');
              setTaxRate(0);
              setDiscountRate(0);
              setHelpPeriodDays(30);
              setDueDate(addDaysToDateString(billDate || pakistanToday(), 30));
              if (!notes || notes === 'Thank you for your order!' || notes === 'Purchase remittance / payment advice') {
                setNotes('Help money — return after the agreed period');
              }
              setItems((prev) => {
                const desc = String(prev[0]?.description || '').trim();
                const emptyOrDefault = !desc || prev.length === 1 && !prev[0].unit_price;
                if (emptyOrDefault) {
                  return [{ product_id: null, description: 'Help / loan given', quantity: 1, unit_price: Number(prev[0]?.unit_price) || 0 }];
                }
                return prev;
              });
            }}
          >
            <span className="bill-type-icon" aria-hidden>
              <HeartHandshake size={18} />
            </span>
            <span className="bill-type-copy">
              <strong>Help / loan</strong>
              <small>Give money for a period · #HLP</small>
            </span>
            <span className="bill-type-check" aria-hidden />
          </button>
        </div>
      </div>
      {/* Smart Quick-Parse Banner */}
      {billType !== 'help' && (
      <div className="glass-panel" style={{ padding: '1.25rem', border: '1px solid var(--border-color)', background: 'var(--surface-inset)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Zap size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Smart Quick Bill Auto-Fill</h3>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Type or paste quick text like: <i>"2 Ferrero Rocher @ Rs. 2450, 1 Perfume @ 4850 for Al-Fatah"</i>
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Type items and customer info..."
            value={naturalText}
            onChange={(e) => setNaturalText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNaturalParse()}
          />
          <button className="btn-primary" type="button" onClick={handleNaturalParse} style={{ whiteSpace: 'nowrap' }}>
            Auto-Fill Form
          </button>
        </div>
      </div>
      )}

      {/* Main Bill Generator Form */}
      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '1.75rem' }}>
        {editingBillId && (
          <div
            style={{
              background: 'rgba(212, 175, 55, 0.14)',
              border: '1px solid #d4af37',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '0.85rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong style={{ color: '#d4af37', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Edit3 size={17} /> Editing Existing Bill: {invoiceNumber}
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Modifying items, rates, or client details will update this bill directly in your records.
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', padding: '0.4rem 0.95rem', fontSize: '0.82rem' }}
              onClick={() => {
                setEditingBillId(null);
                resetFormForNew();
                toast.info('Edit cancelled');
              }}
            >
              Cancel Edit
            </button>
          </div>
        )}
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>
              {billType === 'help' ? 'Help / loan' : 'Auto Bill Generator'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {billType === 'help'
                ? 'Give money to a person and set when they should return it'
                : 'Fill invoice details & save directly to database'}
            </p>
          </div>

          <div className="surface-block" style={{ marginTop: '1rem', padding: '0.9rem 1rem', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label className="form-label" htmlFor="bill-serial-number">Bill Serial Number *</label>
              <input
                id="bill-serial-number"
                type="text"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.02em' }}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0001 or custom serial"
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                Auto-suggested — edit freely before saving. Refresh loads the next unused number.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              title="Load next unused serial"
              onClick={() => fetchNextInvoiceNumber(billType)}
              style={{ padding: '0.7rem 1rem' }}
            >
              <RefreshCw size={14} /> Next #
            </button>
          </div>
        </div>

        {/* Customer / Supplier & Date Section */}
        <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <label className="form-label">
              {billType === 'supplier' ? 'Supplier / Pay To *' : billType === 'help' ? 'Person *' : 'Customer Name *'}
            </label>
            {filteredParties.length > 0 && (
              <AppSelect
                className="app-select--spaced"
                style={{ marginBottom: '0.5rem' }}
                value={selectedCustomerId || ''}
                onChange={(next) => handleSelectCustomer({ target: { value: next } })}
                placeholder={
                  billType === 'supplier'
                    ? '-- Load Saved Supplier --'
                    : billType === 'help'
                      ? '-- Load saved person --'
                      : '-- Load Saved Client --'
                }
                options={[
                  {
                    value: '',
                    label:
                      billType === 'supplier'
                        ? '-- Load Saved Supplier --'
                        : billType === 'help'
                          ? '-- Load saved person --'
                          : '-- Load Saved Client --',
                  },
                  ...filteredParties.map((c) => ({ value: String(c.id), label: c.name })),
                ]}
              />
            )}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
              {billType === 'supplier'
                ? 'Showing supplier parties only — or type a new Jeddah supplier name below.'
                : billType === 'help'
                  ? 'Type a name or load a saved person. They can return this later.'
                  : 'Showing customer parties only — or type a new retail client name below.'}
            </p>
            <input
              type="text"
              className="form-input"
              placeholder={
                billType === 'supplier'
                  ? 'e.g. Jeddah Trading Co.'
                  : billType === 'help'
                    ? 'e.g. Imran Ali'
                    : 'e.g. Acme Corporation'
              }
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
            {billType === 'help' && (
              <div className="form-group" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
                <label className="form-label">Phone (for return reminder)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="03XX-XXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={repeating || !customerName.trim()}
              onClick={handleRepeatLastOrder}
            >
              <History size={16} /> {repeating ? 'Loading…' : billType === 'help' ? 'Repeat last help' : 'Repeat last order'}
            </button>

            <div className="grid-2-mobile-1" style={{ display: showAdvanced ? 'grid' : 'none', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <label className="form-label">{billType === 'supplier' ? 'Supplier Email' : 'Customer Email'}</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder={billType === 'supplier' ? 'supplier@example.com' : 'billing@acme.com'}
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">{billType === 'supplier' ? 'Supplier Phone' : 'Phone Number'}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="03XX-XXXXXXX / +966…"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: '0.75rem', display: showAdvanced ? 'block' : 'none' }}>
              <label className="form-label">{billType === 'supplier' ? 'Supplier Address' : 'Billing Address'}</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder={billType === 'supplier' ? 'City, Kingdom of Saudi Arabia' : 'Street, City (e.g. Peshawar, Lahore, Islamabad)'}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </div>

            {showAdvanced && billType === 'supplier' && (
              <div style={{ marginTop: '0.9rem', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--surface-inset)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.65rem', color: 'var(--text-secondary)' }}>
                  Supplier Pay To bank (shown on payment advice)
                </p>
                <div className="form-group">
                  <label className="form-label">Bank Name</label>
                  <PayeeBankSelect
                    value={payeeBankName}
                    onChange={setPayeeBankName}
                    extraBanks={extraPayeeBanks}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Payee account title"
                    value={payeeAccountTitle}
                    onChange={(e) => setPayeeAccountTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">IBAN / Account Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="SA…"
                    value={payeeAccountNumber}
                    onChange={(e) => setPayeeAccountNumber(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Payment Notes (SWIFT, etc.)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="SWIFT / remittance reference"
                    value={payeePaymentNotes}
                    onChange={(e) => setPayeePaymentNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">{billType === 'supplier' ? 'Bill Date' : billType === 'help' ? 'Given on' : 'Invoice Date'}</label>
                <input
                  type="date"
                  className="form-input"
                  value={billDate}
                  onChange={(e) => {
                    dateTouchedRef.current = true;
                    setBillDate(e.target.value);
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{billType === 'help' ? 'Return by' : 'Due Date'}</label>
                <input
                  type="date"
                  className="form-input"
                  value={dueDate}
                  onChange={(e) => {
                    dateTouchedRef.current = true;
                    setHelpPeriodDays('custom');
                    setDueDate(e.target.value);
                  }}
                />
              </div>
            </div>

            {billType === 'help' && (
              <div className="form-group">
                <label className="form-label">Return after</label>
                <div className="cash-chip-row">
                  {HELP_PERIODS.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      className={`cash-chip${helpPeriodDays === p.days ? ' is-active' : ''}`}
                      onClick={() => {
                        dateTouchedRef.current = true;
                        setHelpPeriodDays(p.days);
                        setDueDate(addDaysToDateString(billDate || pakistanToday(), p.days));
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{billType === 'help' ? 'How you gave it' : 'Payment Method'}</label>
              <AppSelect
                value={paymentMethod}
                aria-label="Payment method"
                onChange={(next) => {
                  setPaymentMethod(next);
                  if (!String(next).toLowerCase().includes('cash')) setCashTendered('');
                }}
                options={
                  billType === 'supplier'
                    ? [
                        'Bank Transfer / Remittance',
                        'Bank Transfer / Raast',
                        'Cash',
                      ]
                    : billType === 'help'
                      ? [
                          'Cash',
                          'Bank Transfer / Raast',
                          'JazzCash / EasyPaisa',
                        ]
                      : [
                          'Bank Transfer / Raast',
                          'JazzCash / EasyPaisa',
                          'Cash Counter Sale',
                          'Credit / Debit Card',
                        ]
                }
              />
            </div>

            {isCashSale && (
              <div className="cash-change-box form-group">
                <label className="form-label">Cash tendered ({currencySymbol})</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="form-input"
                  placeholder="Customer handed you…"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                />
                <div className="cash-chip-row">
                  <button type="button" className="cash-chip" onClick={() => setCashTendered(String(Math.ceil(totalAmount)))}>
                    Exact
                  </button>
                  {[500, 1000, 5000].map((n) => (
                    <button key={n} type="button" className="cash-chip" onClick={() => setCashTendered(String(n))}>
                      {currencySymbol}{n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="cash-chip"
                    onClick={() => setCashTendered(String(Math.ceil(totalAmount / 100) * 100 || 100))}
                  >
                    Round ↑100
                  </button>
                </div>
                {changeDue != null && (
                  <div className={`cash-change-result ${changeDue < 0 ? 'is-short' : 'is-ok'}`}>
                    {changeDue < 0
                      ? `Short by ${currencySymbol}${Math.abs(changeDue).toFixed(2)}`
                      : `Change due: ${currencySymbol}${changeDue.toFixed(2)}`}
                  </div>
                )}
              </div>
            )}

            <div className="form-group" style={{ display: showAdvanced ? 'block' : 'none' }}>
              <label className="form-label">Notes & Terms</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-secondary form-advanced-toggle"
          style={{ marginBottom: '1.25rem' }}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span>{showAdvanced ? 'Hide extra fields' : 'More options'}</span>
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Line Items */}
        {billType === 'help' ? (
          <div className="surface-block" style={{ padding: '1rem 1.05rem', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Amount given</h4>
            <div className="grid-2-mobile-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Amount ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="form-input"
                  placeholder="e.g. 5000"
                  value={items[0]?.unit_price || ''}
                  onChange={(e) => {
                    const amount = parseFloat(e.target.value) || 0;
                    setItems([
                      {
                        product_id: null,
                        description: items[0]?.description || 'Help / loan given',
                        quantity: 1,
                        unit_price: amount,
                      },
                    ]);
                  }}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reason (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Family need, urgent help"
                  value={items[0]?.description === 'Help / loan given' ? '' : items[0]?.description || ''}
                  onChange={(e) => {
                    const desc = String(e.target.value).trim() || 'Help / loan given';
                    setItems([
                      {
                        product_id: null,
                        description: desc,
                        quantity: 1,
                        unit_price: Number(items[0]?.unit_price) || 0,
                      },
                    ]);
                  }}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.55rem' }}>
              This is not a sale. When they return the money, open this bill and tap Pay.
            </p>
          </div>
        ) : (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Line Items & Services</h4>
            <button type="button" className="btn-secondary" onClick={addItemRow} style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', width: 'auto' }}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, minWidth: 160 }}
              placeholder="Quick add by SKU or name…"
              value={skuQuery}
              onChange={(e) => setSkuQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applySkuLookup();
                }
              }}
            />
            <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => applySkuLookup()}>
              <PackageCheck size={16} /> Add
            </button>
            <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => setScanOpen(true)}>
              <Camera size={16} /> Scan
            </button>
          </div>

          <BarcodeScanner
            open={scanOpen}
            onClose={() => setScanOpen(false)}
            onDetected={(code) => {
              setSkuQuery(code);
              applySkuLookup(code);
            }}
          />

          {/* Desktop table */}
          <div className="table-container desktop-only-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Description</th>
                  <th style={{ width: '15%' }}>Qty</th>
                  <th style={{ width: '20%' }}>Unit Price ({currencySymbol})</th>
                  <th style={{ width: '20%' }}>Total ({currencySymbol})</th>
                  <th style={{ width: '5%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                  const selectedVal = item.product_id ? String(item.product_id) : (item.description ? 'custom' : '');
                  return (
                    <tr key={index}>
                      <td style={{ minWidth: 260 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <AppSelect
                            className="app-select--spaced"
                            value={selectedVal}
                            placeholder="-- Select Item from Catalog --"
                            onChange={(next) => handleSelectProduct(index, next)}
                            options={productOptions}
                          />
                          {(!item.product_id || selectedVal === 'custom') && (
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Type custom item description..."
                              value={item.description}
                              onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                              onBlur={() => handleCustomItemBlur(index)}
                              required
                            />
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0 8px', minWidth: 28, height: 36, fontSize: '1rem', fontWeight: 'bold' }}
                            onClick={() => handleItemChange(index, 'quantity', Math.max(1, (parseInt(item.quantity) || 1) - 1))}
                            disabled={parseInt(item.quantity) <= 1}
                            title="Decrease quantity"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            style={{ textAlign: 'center', width: 54, padding: '0.4rem 0.2rem' }}
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            required
                          />
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0 8px', minWidth: 28, height: 36, fontSize: '1rem', fontWeight: 'bold' }}
                            onClick={() => handleItemChange(index, 'quantity', (parseInt(item.quantity) || 1) + 1)}
                            title="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          placeholder="0.00"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                          required
                        />
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {currencySymbol}{lineTotal.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => removeItemRow(index)}
                          disabled={items.length <= 1}
                          style={{ opacity: items.length <= 1 ? 0.4 : 1 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="mobile-only line-item-cards">
            {items.map((item, index) => {
              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
              const selectedVal = item.product_id ? String(item.product_id) : (item.description ? 'custom' : '');
              return (
                <div className="line-item-card" key={`m-${index}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Item {index + 1}</span>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => removeItemRow(index)}
                      disabled={items.length <= 1}
                      style={{ opacity: items.length <= 1 ? 0.4 : 1, width: 'auto', minHeight: 36 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div style={{ marginBottom: '0.45rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Item from Catalog</label>
                    <AppSelect
                      style={{ marginBottom: '0.35rem' }}
                      value={selectedVal}
                      placeholder="-- Select Item from Catalog --"
                      onChange={(next) => handleSelectProduct(index, next)}
                      options={productOptions}
                    />
                    {(!item.product_id || selectedVal === 'custom') && (
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Type custom item description..."
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        onBlur={() => handleCustomItemBlur(index)}
                        required
                      />
                    )}
                  </div>
                  <div className="qty-price-row">
                    <div>
                      <label className="form-label">Qty</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0 12px', minWidth: 36, height: 38, fontSize: '1.1rem', fontWeight: 'bold' }}
                          onClick={() => handleItemChange(index, 'quantity', Math.max(1, (parseInt(item.quantity) || 1) - 1))}
                          disabled={parseInt(item.quantity) <= 1}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          className="form-input"
                          style={{ textAlign: 'center', flex: 1 }}
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          required
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0 12px', minWidth: 36, height: 38, fontSize: '1.1rem', fontWeight: 'bold' }}
                          onClick={() => handleItemChange(index, 'quantity', (parseInt(item.quantity) || 1) + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Unit Price ({currencySymbol})</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className="form-input"
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                  </div>
                  <div className="line-total-row">
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Line total</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{currencySymbol}{lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Math Summary & Submit Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          {billType !== 'help' && (
          <div style={{ minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Discount Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input"
                  value={discountRate}
                  onChange={(e) => setDiscountRate(e.target.value)}
                />
              </div>
            </div>
          </div>
          )}

          <div className="glass-panel surface-block" style={{ padding: '1.25rem', minWidth: '300px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--text-secondary)' }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{currencySymbol}{subtotal.toFixed(2)}</span>
            </div>

            {parseFloat(taxRate) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--text-secondary)' }}>
                <span>Tax ({taxRate}%):</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>+{currencySymbol}{taxAmount.toFixed(2)}</span>
              </div>
            )}

            {parseFloat(discountRate) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: 'var(--success)' }}>
                <span>Discount ({discountRate}%):</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>-{currencySymbol}{discountAmount.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0 0 0', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', fontSize: '1.2rem', fontWeight: 800 }}>
              <span>{billType === 'help' ? 'Amount given:' : 'Grand Total:'}</span>
              <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {currencySymbol}{totalAmount.toFixed(2)}
              </span>
            </div>

            <div className="form-group" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
              <label className="form-label">
                {billType === 'help' ? 'Already returned now (optional)' : 'Amount received now (optional)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder={billType === 'help' ? '0 — usually empty until they repay' : '0 — partial or full payment'}
                value={initialPayment}
                onChange={(e) => setInitialPayment(e.target.value)}
              />
              {initialPayNum > 0 && (
                <div style={{ marginTop: '0.45rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ color: 'var(--success)' }}>
                    Paid now: {formatCurrency(currencySymbol, Math.min(initialPayNum, totalAmount))}
                  </span>
                  <span style={{ color: remainingAfterInitial > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }}>
                    Remaining: {formatCurrency(currencySymbol, remainingAfterInitial)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }} className="stack-on-mobile">
          {stockWarnings.length > 0 && billType === 'customer' && (
            <div style={{ flex: 1, minWidth: '220px', fontSize: '0.85rem', color: 'var(--warning)', fontWeight: 600 }}>
              Stock: {stockWarnings.join(' · ')}
            </div>
          )}
          {!editingBillId && (
            <>
              <button
                type="submit"
                className="btn-secondary"
                style={{ padding: '0.85rem 1.15rem', fontSize: '0.95rem', width: 'auto' }}
                disabled={loading}
                onClick={() => setSaveMode('new')}
              >
                <FilePlus2 size={18} /> {loading && saveMode === 'new' ? 'Saving…' : 'Save & New'}
              </button>
              <button
                type="submit"
                className="btn-secondary"
                style={{ padding: '0.85rem 1.15rem', fontSize: '0.95rem', width: 'auto', color: '#25D366', borderColor: '#25D366' }}
                disabled={loading}
                onClick={() => setSaveMode('whatsapp')}
              >
                <MessageCircle size={18} /> {loading && saveMode === 'whatsapp' ? 'Saving…' : 'Save & WhatsApp'}
              </button>
              <button
                type="submit"
                className="btn-secondary"
                style={{ padding: '0.85rem 1.15rem', fontSize: '0.95rem', width: 'auto' }}
                disabled={loading}
                onClick={() => setSaveMode('print')}
              >
                <Printer size={18} /> {loading && saveMode === 'print' ? 'Saving…' : 'Save & Print'}
              </button>
            </>
          )}
          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '0.85rem 1.75rem', fontSize: '1rem', width: 'auto' }}
            disabled={loading}
            onClick={() => setSaveMode('view')}
          >
            <Save size={18} /> {loading ? 'Saving…' : editingBillId ? 'Save Changes' : 'Save & View'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(saveConfirm)}
        title={saveConfirm?.title || 'Confirm'}
        message={saveConfirm?.message || ''}
        confirmLabel="Save anyway"
        cancelLabel="Go back"
        danger={false}
        busy={loading}
        onCancel={() => {
          saveAckRef.current = { zero: false, stock: false };
          setSaveConfirm(null);
        }}
        onConfirm={confirmSaveWarning}
      />
    </div>
  );
}
