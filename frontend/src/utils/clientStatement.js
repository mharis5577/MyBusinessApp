import { formatCurrency } from './pakistan';
import { normalizeBillType } from './billTypes';
import { getPaymentMethods, paymentMethodLines, compactPaymentInstructions } from './paymentMethods';

function billDue(bill) {
  return Math.max(
    0,
    Number(
      bill?.balance_due ??
        (Number(bill?.total_amount) || 0) - (Number(bill?.amount_paid) || 0)
    )
  );
}

/**
 * One WhatsApp message: unpaid customer sales + help still out.
 */
export function buildClientStatementText({
  customer,
  bills = [],
  settings = {},
  currencySymbol = 'Rs.',
  urdu = false,
}) {
  const name = customer?.name || 'Client';
  const company = settings.company_name || 'ELITE CHOCOLATE';
  const open = (bills || []).filter((b) => {
    if (String(b.status || '').toLowerCase() === 'cancelled') return false;
    return billDue(b) > 0;
  });
  const sales = open.filter((b) => normalizeBillType(b.bill_type) === 'customer');
  const help = open.filter((b) => normalizeBillType(b.bill_type) === 'help');
  const salesTotal = sales.reduce((s, b) => s + billDue(b), 0);
  const helpTotal = help.reduce((s, b) => s + billDue(b), 0);
  const grand = salesTotal + helpTotal;

  const lineFor = (b) => {
    const due = formatCurrency(currencySymbol, billDue(b));
    const when = b.due_date ? ` · due ${b.due_date}` : '';
    return `• ${b.invoice_number}: ${due}${when}`;
  };

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
    `Assalam o Alaikum ${name},`,
    '',
    `Account statement from ${company}.`,
    sales.length
      ? `Sales due: ${formatCurrency(currencySymbol, salesTotal)}\n${sales.map(lineFor).join('\n')}`
      : null,
    help.length
      ? `Help still out: ${formatCurrency(currencySymbol, helpTotal)}\n${help.map(lineFor).join('\n')}`
      : null,
    `Total to settle: ${formatCurrency(currencySymbol, grand)}`,
    '',
    methodBlock,
    instructions || null,
    '',
    `— ${company}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  if (!urdu) return en;

  return [
    `السلام علیکم ${name}،`,
    '',
    `کھاتہ ${company}`,
    `فروخت بقایا: ${formatCurrency(currencySymbol, salesTotal)}`,
    `مدد بقایا: ${formatCurrency(currencySymbol, helpTotal)}`,
    `کل: ${formatCurrency(currencySymbol, grand)}`,
    '',
    '---',
    '',
    en,
  ].join('\n');
}
