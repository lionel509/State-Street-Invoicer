/** Reading item notes — pure, so the plugin and the CLI share one implementation.
 *
 *  Nothing here touches the Obsidian API. That is deliberate: it is what lets
 *  the same code be driven from a terminal, and what let the arithmetic be
 *  checked against `build_ious.py` before any of it shipped.
 */
import type { InvoiceDraft, InvoiceLine } from "./model";
import { personName, toNumber } from "./model";

export interface ItemFields {
  [key: string]: string | undefined;
}

export interface OwedItem {
  /** Note basename — the wikilink target back to the source. */
  basename: string;
  person: string;
  line: InvoiceLine;
  settleWhen?: string;
  paidDate?: string;
}

export interface OwedPerson {
  name: string;
  items: OwedItem[];
  settleWhen?: string;
  /** Existing `IOUs/IOU — <name>.md`, when the generator has written one. */
  iouPage?: string;
}

/** Flat `key: value` frontmatter. No YAML dependency, and none needed —
 *  every field the invoice reads is a scalar. */
export function frontmatterOf(text: string): ItemFields {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: ItemFields = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.length > 1 && v[0] === '"' && v[v.length - 1] === '"') {
      v = v.slice(1, -1);
    }
    out[kv[1]] = v === "" ? undefined : v;
  }
  return out;
}

/** An item note's frontmatter → one invoice line. Missing stays missing. */
export function itemToLine(fm: ItemFields, basename: string): InvoiceLine {
  return {
    date: fm.date,
    description: fm.what_is_it ?? basename,
    stickerCny: toNumber(fm.sticker_price_cny),
    feeCny: toNumber(fm.handling_fee_cny),
    amountCny: toNumber(fm.amount_cny),
    amountUsd: toNumber(fm.amount_usd),
    link: basename,
    note: fm.receipt,
  };
}

/** True for a note that belongs on somebody's bill. */
export function isOwed(fm: ItemFields): boolean {
  return fm.attribution === "owed" && !!fm.for_whom;
}

export function toOwedItem(fm: ItemFields, basename: string): OwedItem {
  return {
    basename,
    person: personName(fm.for_whom),
    paidDate: fm.paid_date,
    settleWhen: fm.settle_when,
    line: itemToLine(fm, basename),
  };
}

/** Group items into one entry per person, oldest purchase first. */
export function groupOwed(
  items: OwedItem[],
  iouPages: Map<string, string> = new Map(),
): OwedPerson[] {
  const byPerson = new Map<string, OwedItem[]>();
  for (const item of items) {
    if (!item.person) continue;
    const list = byPerson.get(item.person) ?? [];
    list.push(item);
    byPerson.set(item.person, list);
  }

  const people: OwedPerson[] = [];
  for (const [name, list] of byPerson) {
    list.sort((a, b) => (a.line.date ?? "").localeCompare(b.line.date ?? ""));
    people.push({
      name,
      items: list,
      settleWhen: list.find((i) => i.settleWhen)?.settleWhen,
      iouPage: iouPages.get(name),
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  return people;
}

export function draftFromOwed(
  person: OwedPerson,
  number: string,
  date: string,
): InvoiceDraft {
  // The awaiting-USD case already gets its own callout from the renderer;
  // repeating it here would say the same thing twice on the page.
  const notes: string[] = [];
  if (person.items.some((i) => i.line.feeCny != null)) {
    notes.push(
      "Billed at the **charged** amount, not the shop sticker price. Alipay adds a 3% " +
        "Payment Handling Fee on foreign cards, and that difference is a real cost of " +
        "fronting the purchase.",
    );
  }

  return {
    number,
    date,
    billTo: person.name,
    source: "iou",
    sourceLink: person.iouPage,
    currency: person.items.some((i) => i.line.amountCny != null) ? "CNY" : "USD",
    lines: person.items.map((i) => i.line),
    settleWhen: person.settleWhen,
    notes,
  };
}

/** The sentence added when group buys were deliberately left off. */
export function splitNote(count: number): string {
  return (
    `${count} purchase${count === 1 ? " is" : "s are"} marked ` +
    "`attribution: split` and deliberately left off this invoice — a group buy " +
    "would otherwise bill one person for everyone's share. Those splits are " +
    "hand-maintained in [[Debts & IOUs]]."
  );
}
