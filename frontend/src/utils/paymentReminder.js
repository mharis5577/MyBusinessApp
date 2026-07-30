import { formatCurrency } from './pakistan';

export function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

/**
 * Build a payment reminder message (EN or bilingual).
 * Supplier bills use remittance / payment-sent wording (you pay them).
 */
export function buildPaymentReminderText({
  bill,
  settings = {},
  currencySymbol = 'Rs.',
  urdu = false,
}) {
  if (!bill) return '';
  const paid = Number(bill.amount_paid) || 0;
  const balance = Number(
    bill.balance_due ?? Math.max(0, (Number(bill.total_amount) || 0) - paid)
  );
  const company = settings.company_name || 'ELITE CHOCOLATE';
  const isSupplier = bill.bill_type === 'supplier';

  if (isSupplier) {
    const en = [
      `Assalam o Alaikum ${bill.customer_name || 'Supplier'},`,
      '',
      `Payment for purchase ${bill.invoice_number} from ${company}.`,
      `Amount to pay: ${formatCurrency(currencySymbol, bill.total_amount)}`,
      balance > 0 && paid > 0
        ? `Paid so far: ${formatCurrency(currencySymbol, paid)} · Remaining: ${formatCurrency(currencySymbol, balance)}`
        : null,
      bill.due_date ? `Due / remittance date: ${bill.due_date}` : null,
      '',
      bill.payee_bank_name ? `Pay To bank: ${bill.payee_bank_name}` : null,
      bill.payee_account_title ? `Account title: ${bill.payee_account_title}` : null,
      bill.payee_account_number ? `IBAN / A/C: ${bill.payee_account_number}` : null,
      bill.payee_payment_notes || null,
      '',
      `— ${company}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    if (!urdu) return en;

    const ur = [
      `السلام علیکم ${bill.customer_name || 'سپلائر'}،`,
      '',
      `خریداری ادائیگی ${bill.invoice_number} — ${company}`,
      `ادا کی جانے والی رقم: ${formatCurrency(currencySymbol, bill.total_amount)}`,
      bill.payee_account_number ? `اکاؤنٹ / IBAN: ${bill.payee_account_number}` : null,
      '',
      `— ${company}`,
      '',
      '---',
      '',
      en,
    ]
      .filter((line) => line !== null)
      .join('\n');

    return ur;
  }

  const wallet = settings.mobile_wallet || settings.account_number || '';
  const instructions = settings.payment_instructions || '';

  const en = [
    `Assalam o Alaikum ${bill.customer_name || 'Client'},`,
    '',
    `Invoice ${bill.invoice_number} — Balance due: ${formatCurrency(currencySymbol, balance)}`,
    bill.due_date ? `Due date: ${bill.due_date}` : null,
    '',
    wallet ? `Pay via Raast / JazzCash / EasyPaisa: ${wallet}` : null,
    settings.bank_name ? `Bank: ${settings.bank_name}` : null,
    settings.account_title ? `Title: ${settings.account_title}` : null,
    settings.account_number && settings.account_number !== wallet
      ? `A/C: ${settings.account_number}`
      : null,
    instructions || null,
    '',
    `— ${company}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  if (!urdu) return en;

  const ur = [
    `السلام علیکم ${bill.customer_name || 'گاہک'}،`,
    '',
    `انوائس ${bill.invoice_number} — باقی رقم: ${formatCurrency(currencySymbol, balance)}`,
    bill.due_date ? `آخری تاریخ: ${bill.due_date}` : null,
    '',
    wallet ? `ادائیگی (راست / جازکیش / ایزی پیسہ): ${wallet}` : null,
    instructions || null,
    '',
    `— ${company}`,
    '',
    '---',
    '',
    en,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return ur;
}

export function openWhatsAppReminder(phone, text) {
  const wa = normalizeWhatsAppPhone(phone);
  const url = `${wa ? `https://wa.me/${wa}` : 'https://wa.me/'}?text=${encodeURIComponent(text)}`;
  // Capacitor WebView often blocks window.open; navigate instead
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      window.location.href = url;
      return;
    }
  } catch (_) {
    /* ignore */
  }
  window.open(url, '_blank');
}

export function openSmsReminder(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    alert('No phone number on this bill. Add a client phone first.');
    return;
  }
  // Android prefers ?body=, iOS often uses &body=
  const href = `sms:${digits}?body=${encodeURIComponent(text)}`;
  window.location.href = href;
}
