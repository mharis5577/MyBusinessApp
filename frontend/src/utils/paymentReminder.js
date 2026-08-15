import { formatCurrency } from './pakistan';
import { toast } from './toast';
import { getPaymentMethods, paymentMethodLines, compactPaymentInstructions } from './paymentMethods';

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
  const isHelp = bill.bill_type === 'help' || bill.bill_type === 'loan';

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

  if (isHelp) {
    const remaining = formatCurrency(currencySymbol, balance);
    const en = [
      `Assalam o Alaikum ${bill.customer_name || 'Friend'},`,
      '',
      `Help / loan ${bill.invoice_number} from ${company}.`,
      `Still to return: ${remaining}`,
      bill.due_date ? `Return by: ${bill.due_date}` : null,
      '',
      `— ${company}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    if (!urdu) return en;

    return [
      `السلام علیکم ${bill.customer_name || ''}،`,
      '',
      `مدد / قرض ${bill.invoice_number} — ${company}`,
      `واپسی باقی: ${remaining}`,
      bill.due_date ? `واپسی کی تاریخ: ${bill.due_date}` : null,
      '',
      `— ${company}`,
      '',
      '---',
      '',
      en,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  const methods = getPaymentMethods(settings);
  const methodBlock = methods.length
    ? methods
        .map((m, i) => {
          const lines = paymentMethodLines(m);
          if (!lines.length) return null;
          const header = methods.length > 1 ? `Payment option ${i + 1}:` : 'Payment details:';
          return [header, ...lines].join('\n');
        })
        .filter(Boolean)
        .join('\n\n')
    : null;
  const instructions = compactPaymentInstructions(settings.payment_instructions, methods);

  const en = [
    `Assalam o Alaikum ${bill.customer_name || 'Client'},`,
    '',
    `Invoice ${bill.invoice_number} — Balance due: ${formatCurrency(currencySymbol, balance)}`,
    bill.due_date ? `Due date: ${bill.due_date}` : null,
    '',
    methodBlock,
    instructions || null,
    '',
    `— ${company}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  if (!urdu) return en;

  const primaryWallet =
    methods.find((m) => m.mobile_wallet)?.mobile_wallet ||
    methods.find((m) => m.account_number)?.account_number ||
    '';

  const ur = [
    `السلام علیکم ${bill.customer_name || 'گاہک'}،`,
    '',
    `انوائس ${bill.invoice_number} — باقی رقم: ${formatCurrency(currencySymbol, balance)}`,
    bill.due_date ? `آخری تاریخ: ${bill.due_date}` : null,
    '',
    primaryWallet ? `ادائیگی (راست / جازکیش / ایزی پیسہ): ${primaryWallet}` : null,
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
    toast.error('No phone number on this bill. Add a client phone first.');
    return;
  }
  // Android prefers ?body=, iOS often uses &body=
  const href = `sms:${digits}?body=${encodeURIComponent(text)}`;
  window.location.href = href;
}
