import { describe, it, expect } from 'vitest';
import {
  normalizeBillType,
  invoicePrefixForType,
  isSupplierBill,
  isHelpBill,
  isSaleBill,
  partyTypeForBill,
  outstandingByPartyName,
} from './billTypes';

describe('normalizeBillType', () => {
  it('recognises the three types and treats loan as help', () => {
    expect(normalizeBillType('supplier')).toBe('supplier');
    expect(normalizeBillType('help')).toBe('help');
    expect(normalizeBillType('loan')).toBe('help');
    expect(normalizeBillType('customer')).toBe('customer');
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeBillType('  SUPPLIER ')).toBe('supplier');
  });

  it('defaults unknown or missing values to customer', () => {
    expect(normalizeBillType('nonsense')).toBe('customer');
    expect(normalizeBillType(null)).toBe('customer');
    expect(normalizeBillType(undefined)).toBe('customer');
  });
});

describe('invoicePrefixForType', () => {
  it('maps each type to its invoice prefix', () => {
    expect(invoicePrefixForType('supplier')).toBe('SAU');
    expect(invoicePrefixForType('help')).toBe('HLP');
    expect(invoicePrefixForType('customer')).toBe('INV');
    expect(invoicePrefixForType(null)).toBe('INV');
  });
});

describe('type predicates', () => {
  it('accepts either a type string or a bill object', () => {
    expect(isSupplierBill('supplier')).toBe(true);
    expect(isSupplierBill({ bill_type: 'supplier' })).toBe(true);
    expect(isHelpBill({ bill_type: 'loan' })).toBe(true);
    expect(isSaleBill({ bill_type: 'customer' })).toBe(true);
    expect(isSaleBill({ bill_type: 'supplier' })).toBe(false);
  });
});

describe('partyTypeForBill', () => {
  it('never returns help — help parties are customers', () => {
    expect(partyTypeForBill('supplier')).toBe('supplier');
    expect(partyTypeForBill('help')).toBe('customer');
    expect(partyTypeForBill('customer')).toBe('customer');
  });
});

describe('outstandingByPartyName', () => {
  it('splits balances by bill type per party', () => {
    const map = outstandingByPartyName([
      { customer_name: 'Ali', bill_type: 'customer', total_amount: 1000, amount_paid: 250 },
      { customer_name: 'ali', bill_type: 'help', total_amount: 500, amount_paid: 0 },
      { customer_name: 'Ali', bill_type: 'supplier', total_amount: 300, amount_paid: 0 },
    ]);
    expect(map.ali).toEqual({
      sales_outstanding: 750,
      help_outstanding: 500,
      buying_outstanding: 300,
    });
  });

  it('skips cancelled, settled, and unnamed bills', () => {
    const map = outstandingByPartyName([
      { customer_name: 'Ali', total_amount: 100, amount_paid: 0, status: 'cancelled' },
      { customer_name: 'Bob', total_amount: 100, amount_paid: 100 },
      { customer_name: '  ', total_amount: 100, amount_paid: 0 },
    ]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('prefers an explicit balance_due when present', () => {
    const map = outstandingByPartyName([
      { customer_name: 'Ali', total_amount: 1000, amount_paid: 0, balance_due: 120 },
    ]);
    expect(map.ali.sales_outstanding).toBe(120);
  });

  it('handles an empty or missing list', () => {
    expect(Object.keys(outstandingByPartyName([]))).toHaveLength(0);
    expect(Object.keys(outstandingByPartyName(null))).toHaveLength(0);
  });
});
