/** The Applied Badminton sales ledger — pure parser, no Obsidian API.
 *
 *  The ledger lives in Berkshire and is read-only from here. Money coming in
 *  is Berkshire's record; this only ever produces the billing document.
 */
import type { InvoiceDraft } from "./model";
import { toNumber } from "./model";
import type { InvoicerSettings } from "./settings-defaults";

export interface BadmintonJob {
  date?: string;
  customer: string;
  what: string;
  qty?: number;
  unitUsd?: number;
  totalUsd?: number;
  paid: boolean;
  owner: boolean;
  note?: string;
}

export class LedgerUnavailable extends Error {}

/** True for the ✅/yes/paid family, false for ❌/blank/anything else. */
function isTruthyCell(cell: string): boolean {
  const c = cell.trim().toLowerCase().replace(/\*/g, "");
  if (!c || c === "—" || c === "-") return false;
  return /^(✅|yes|y|paid|true|✔️?)$/.test(c);
}

/** Cell text → plain text. Wikilinks collapse to their *target*, which is the
 *  person's canonical name — an alias would not resolve back to their entity. */
function stripCell(cell: string): string {
  return cell
    .replace(/\\\|/g, "|")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * Parse the `## Sales` table out of the ledger.
 *
 * Columns are matched by header text, not position, so a new column in the
 * ledger does not silently shift every amount by one. Placeholder rows (the
 * italic "first sale goes here") and the totals row are skipped.
 */
export function parseBadmintonLedger(text: string): BadmintonJob[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s+Sales\s*$/i.test(l.trim()));
  if (start === -1) {
    throw new LedgerUnavailable(
      "No `## Sales` heading in that file — is the path pointing at the sales ledger?",
    );
  }

  let header: string[] | null = null;
  const jobs: BadmintonJob[] = [];

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (/^#{1,6}\s/.test(raw)) break; // next section
    const trimmed = raw.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
    if (cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c))) continue; // separator

    if (!header) {
      header = cells.map((c) => stripCell(c).toLowerCase());
      continue;
    }

    const col = (...names: string[]): string => {
      for (const n of names) {
        const idx = header!.findIndex((h) => h.includes(n));
        if (idx !== -1 && cells[idx] != null) return stripCell(cells[idx]);
      }
      return "";
    };

    const customer = col("customer", "person", "who");
    if (!customer || /^\*|^totals?$/i.test(customer)) continue;
    if (cells.some((c) => /\*totals?\*|^\s*\*\*totals?\*\*/i.test(c.trim()))) continue;

    jobs.push({
      date: col("date") || undefined,
      customer,
      what: col("what", "item", "service") || "Stringing job",
      qty: toNumber(col("qty", "quantity")),
      unitUsd: toNumber(col("unit")),
      totalUsd: toNumber(col("total")),
      paid: isTruthyCell(col("paid")),
      owner: isTruthyCell(col("owner")),
      note: col("note") || undefined,
    });
  }

  return jobs;
}

export function draftFromBadminton(
  customer: string,
  jobs: BadmintonJob[],
  number: string,
  date: string,
  settings: InvoicerSettings,
): InvoiceDraft {
  const notes = [
    "The sale itself is recorded in **[[Applied Badminton — Sales Ledger]]** over in Berkshire. " +
      "This note is the billing document, not a second ledger — mark the sale paid there.",
  ];
  // Owners get labour free and string at cost, but goods off the shelf are sold to everyone
  // at the same price — so an owner line means one of two different things (set 2026-08-14).
  const ownerLines = jobs.filter((j) => j.owner);
  const isStringing = (j: BadmintonJob) => /string/i.test(j.what);
  if (ownerLines.some(isStringing)) {
    notes.push(
      "One or more lines are **owner stringing jobs**, billed at string cost rather than the " +
        "price ladder. Owners do not pay for labour (settled 2026-08-01).",
    );
  }
  if (ownerLines.some((j) => !isStringing(j))) {
    notes.push(
      "One or more lines are **goods sold to an owner**, billed at the same price everyone " +
        "pays. Owners get labour free and string at cost; stock off the shelf is not discounted " +
        "(set 2026-08-14).",
    );
  }
  return {
    number,
    date,
    billTo: customer,
    source: "badminton",
    sourceLink: "Applied Badminton — Sales Ledger",
    currency: "USD",
    lines: jobs.map((j) => ({
      date: j.date,
      description: j.what,
      qty: j.qty,
      unitUsd: j.unitUsd,
      amountUsd: j.totalUsd ?? undefined,
      note: j.note,
    })),
    settleWhen: settings.paymentTerms || undefined,
    notes,
  };
}
