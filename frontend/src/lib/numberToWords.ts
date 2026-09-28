const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  }
  return (
    `${ONES[Math.floor(n / 100)]} Hundred` +
    (n % 100 ? ` ${underThousand(n % 100)}` : '')
  );
}

/**
 * Amount in words, South Asian numbering (lakh, crore).
 *
 * Standard on a payslip here: it makes the figure hard to alter after the
 * fact, which is the whole reason cheques and payslips have carried it for
 * a century.
 */
export function amountInWords(amount: number, currency = 'Rupees', minor = 'Paisa'): string {
  if (!Number.isFinite(amount)) return '';
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const fraction = Math.round((abs - whole) * 100);

  if (whole === 0 && fraction === 0) return `${currency} Zero Only`;

  const parts: string[] = [];
  let rest = whole;

  const crore = Math.floor(rest / 10_000_000);
  rest %= 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1_000);
  rest %= 1_000;

  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));

  let words = `${currency} ${parts.join(' ')}`.trim();
  if (fraction > 0) words += ` and ${underThousand(fraction)} ${minor}`;
  if (negative) words = `Minus ${words}`;

  return `${words} Only`;
}
