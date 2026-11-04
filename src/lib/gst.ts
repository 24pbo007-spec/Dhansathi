// GST (Goods & Services Tax, India) calculations. Pure functions.
//
// Intra-state supply: tax splits into CGST + SGST (half each).
// Inter-state supply: a single IGST at the full rate.
// "Inclusive" means the amount you typed already contains GST.

export const GST_RATES = [0, 0.1, 3, 5, 12, 18, 28] as const;

export type SupplyType = 'intra' | 'inter';

export interface GstLine {
  cgst: number;
  sgst: number;
  igst: number;
  totalGst: number;
  base: number; // taxable value (before GST)
  total: number; // base + GST
  cess: number;
}

/**
 * @param amount  the price you typed
 * @param ratePct GST rate as a percentage (e.g. 18)
 * @param supply  intra-state (CGST+SGST) or inter-state (IGST)
 * @param inclusive  true if `amount` already includes GST
 * @param cessPct optional compensation cess (e.g. on cars, tobacco)
 */
export function computeGst(amount: number, ratePct: number, supply: SupplyType, inclusive: boolean, cessPct = 0): GstLine {
  const amt = Math.max(0, amount || 0);
  const rate = (ratePct || 0) / 100;
  const cessRate = (cessPct || 0) / 100;
  const totalRate = rate + cessRate;

  const base = inclusive ? amt / (1 + totalRate) : amt;
  const gst = base * rate;
  const cess = base * cessRate;
  const igst = supply === 'inter' ? gst : 0;
  const cgst = supply === 'intra' ? gst / 2 : 0;
  const sgst = cgst;

  return {
    cgst,
    sgst,
    igst,
    cess,
    totalGst: gst,
    base,
    total: base + gst + cess,
  };
}

export interface InvoiceItem {
  id: string;
  name: string;
  amount: number; // taxable value per the inclusive flag
  ratePct: number;
  cessPct: number;
  qty: number;
}

export interface InvoiceResult {
  lines: (GstLine & { item: InvoiceItem })[];
  base: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalGst: number;
  grandTotal: number;
}

/** Total up a multi-item invoice. */
export function computeInvoice(items: InvoiceItem[], supply: SupplyType, inclusive: boolean): InvoiceResult {
  const lines = items.map((item) => {
    const line = computeGst((item.amount || 0) * Math.max(1, item.qty || 1), item.ratePct, supply, inclusive, item.cessPct);
    return { ...line, item };
  });
  const sum = (k: keyof GstLine) => lines.reduce((a, l) => a + l[k], 0);
  return {
    lines,
    base: sum('base'),
    cgst: sum('cgst'),
    sgst: sum('sgst'),
    igst: sum('igst'),
    cess: sum('cess'),
    totalGst: sum('totalGst'),
    grandTotal: sum('total'),
  };
}

export interface ItcResult {
  outputGst: number;
  inputGst: number;
  netPayable: number; // GST to pay in cash
  creditCarried: number; // unused input credit carried forward
}

/** Net GST payable = output tax collected − input tax credit available. */
export function computeItc(outputGst: number, inputGst: number): ItcResult {
  const output = Math.max(0, outputGst || 0);
  const input = Math.max(0, inputGst || 0);
  return {
    outputGst: output,
    inputGst: input,
    netPayable: Math.max(0, output - input),
    creditCarried: Math.max(0, input - output),
  };
}

/** What each GST rate is commonly used for — shown as a hint in the UI. */
export const RATE_EXAMPLES: Record<number, string> = {
  0: 'Fresh food, milk, books, most unbranded essentials',
  0.1: 'Rough diamonds',
  3: 'Gold, silver, jewellery',
  5: 'Packaged food, tea, footwear ≤ ₹1,000, economy transport',
  12: 'Processed food, mobiles, computers, business class travel',
  18: 'Most goods & services — soaps, electronics, restaurants (AC), telecom',
  28: 'Luxury & sin goods — cars, ACs, tobacco, aerated drinks',
};
