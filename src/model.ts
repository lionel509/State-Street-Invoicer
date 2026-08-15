/** The invoice model, and the money rules the vault has already settled on.
 *
 *  Two rules run through everything here and are not negotiable:
 *
 *  1. **Nothing is invented.** A figure appears on an invoice only if a note
 *     records it. A line with no amount renders as "—" and is counted in
 *     `linesUnpriced`, never quietly dropped or estimated at a picked rate.
 *  2. **Priced is not paid.** A USD amount means Chase posted the charge. It
 *     says nothing about repayment, which is tracked with `paid_date` on the
 *     item note. Invoices are therefore always issued `unpaid`.
 */

export type SourceKind = "iou" | "badminton" | "blank";
export type Currency = "CNY" | "USD";

export interface InvoiceLine {
  /** ISO date the charge happened, where the source records one. */
  date?: string;
  description: string;
  /** Shop price before Alipay's handling fee — CNY sources only. */
  stickerCny?: number;
  /** The 3% foreign-card Payment Handling Fee, passed on by Lionel's rule. */
  feeCny?: number;
  /** What actually left the account. This is the billed figure. */
  amountCny?: number;
  /** Only ever a posted amount from a statement or alert — never converted. */
  amountUsd?: number;
  qty?: number;
  unitUsd?: number;
  /** Wikilink target of the note this line came from. */
  link?: string;
  /** Receipt status, or anything else the source note flagged. */
  note?: string;
}

export interface InvoiceDraft {
  number: string;
  /** ISO issue date. */
  date: string;
  /** Plain person name — linked as [[Name]], never duplicated as a note. */
  billTo: string;
  source: SourceKind;
  /** Wikilink back to the record of truth (IOU page, sales ledger). */
  sourceLink?: string;
  /** Which column carries the bill. */
  currency: Currency;
  lines: InvoiceLine[];
  settleWhen?: string;
  /** Callouts to carry onto the invoice — provenance, caveats, warnings. */
  notes?: string[];
}

export interface InvoiceTotals {
  cny: number;
  /** Sum of *known* USD only. Never a conversion of the CNY total. */
  usdPriced: number;
  stickerCny: number;
  feeCny: number;
  lines: number;
  /** Lines carrying no amount in the billing currency at all. */
  linesUnpriced: number;
  /** Lines with a CNY amount but no posted USD yet. */
  linesAwaitingUsd: number;
}

export function totalsOf(draft: InvoiceDraft): InvoiceTotals {
  const t: InvoiceTotals = {
    cny: 0,
    usdPriced: 0,
    stickerCny: 0,
    feeCny: 0,
    lines: draft.lines.length,
    linesUnpriced: 0,
    linesAwaitingUsd: 0,
  };
  for (const l of draft.lines) {
    t.cny += l.amountCny ?? 0;
    t.usdPriced += l.amountUsd ?? 0;
    t.stickerCny += l.stickerCny ?? l.amountCny ?? 0;
    t.feeCny += l.feeCny ?? 0;
    const billed = draft.currency === "CNY" ? l.amountCny : l.amountUsd;
    if (billed == null) t.linesUnpriced++;
    if (draft.currency === "CNY" && l.amountCny != null && l.amountUsd == null) {
      t.linesAwaitingUsd++;
    }
  }
  return t;
}

export function money(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Credit lines read `−¥1.50`, never `¥-1.50` — the sign belongs outside the symbol. */
function signed(n: number, symbol: string): string {
  return n < 0 ? `−${symbol}${money(-n)}` : `${symbol}${money(n)}`;
}

export function cny(n: number | undefined): string {
  return n == null ? "—" : signed(n, "¥");
}

export function usd(n: number | undefined): string {
  return n == null ? "—" : signed(n, "$");
}

/** `[[Jacky Miao]]` / `[[Jacky Miao|Jacky]]` → `Jacky Miao`. */
export function personName(link: string | undefined): string {
  if (!link) return "";
  return link.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
}

/** Filenames cannot carry these; person names occasionally can. */
export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();
}

export function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    // U+2212 MINUS SIGN is what a hand-written markdown ledger actually contains, and
    // Number() rejects it — so a correction/refund row parsed as *unpriced* and dropped
    // out of the total, silently over-billing the customer. Normalise it to ASCII.
    const cleaned = v.replace(/[¥$,\s*]/g, "").replace(/−/g, "-");
    if (cleaned === "" || cleaned === "—" || cleaned === "–" || cleaned === "-") return undefined;
    // (1.50) is accounting notation for a negative.
    const bracketed = /^\((.+)\)$/.exec(cleaned);
    const n = Number(bracketed ? `-${bracketed[1]}` : cleaned);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
