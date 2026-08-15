/** Render a draft as a State Street note.
 *
 *  House style is followed deliberately: bare YAML tags, ISO dates, people
 *  linked by plain name, and a `**Hub:** [[Home]]` footer. The `cssclasses`
 *  entry is what styles.css hangs the print layout off, so Obsidian's
 *  Export to PDF comes out looking like an invoice rather than a note.
 *
 *  The header block is a custom `[!invoice-header]` callout rather than a bare
 *  table: reading view wraps every block in its own div, so "the first table"
 *  is not a thing CSS can reliably select, but a callout type is.
 */
import type { InvoiceDraft, InvoiceLine } from "./model";
import { cny, money, totalsOf, usd } from "./model";
import type { InvoicerSettings } from "./settings";

export function renderInvoice(
  draft: InvoiceDraft,
  settings: InvoicerSettings,
): string {
  const t = totalsOf(draft);
  const primary =
    draft.currency === "CNY" ? `¥${money(t.cny)}` : `$${money(t.usdPriced)}`;

  const out: string[] = [];

  /* ---------------------------------------------------------- frontmatter */
  out.push("---");
  out.push("tags:");
  out.push("  - finance");
  out.push("  - invoice");
  out.push(draft.source === "badminton" ? "  - badminton" : "  - debts");
  out.push("cssclasses:");
  out.push("  - invoice-note");
  out.push("type: invoice");
  out.push(`invoice_number: ${draft.number}`);
  out.push(`issued: ${draft.date}`);
  out.push(`bill_to: "[[${draft.billTo}]]"`);
  out.push(`source: ${draft.source}`);
  out.push(`currency: ${draft.currency}`);
  // Plain numbers — a thousands separator would make YAML read these as strings.
  if (t.cny) out.push(`total_cny: ${t.cny.toFixed(2)}`);
  out.push(
    draft.currency === "CNY"
      ? `total_usd_priced: ${t.usdPriced.toFixed(2)}`
      : `total_usd: ${t.usdPriced.toFixed(2)}`,
  );
  out.push(`lines: ${t.lines}`);
  out.push(`lines_unpriced: ${t.linesUnpriced}`);
  if (draft.currency === "CNY") {
    out.push(`lines_awaiting_usd: ${t.linesAwaitingUsd}`);
  }
  out.push("status: unpaid");
  out.push("paid_date:");
  out.push("---");
  out.push("");

  /* --------------------------------------------------------------- header */
  out.push(`# 🧾 Invoice ${draft.number} — ${draft.billTo}`);
  out.push("");

  const from = [settings.businessName, settings.businessTagline]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
  const contact = settings.contactLines
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");

  out.push("> [!invoice-header] INVOICE");
  out.push("> | | |");
  out.push("> |---|---|");
  if (from) out.push(`> | **From** | ${from} |`);
  if (contact) out.push(`> | **Contact** | ${contact} |`);
  out.push(`> | **Bill to** | [[${draft.billTo}]] |`);
  out.push(`> | **Invoice no.** | \`${draft.number}\` |`);
  out.push(`> | **Issued** | ${draft.date} |`);
  out.push(`> | **Amount due** | **${primary}** |`);
  out.push("> | **Status** | ❌ **UNPAID** |");
  out.push("");

  /* ---------------------------------------------------------------- lines */
  out.push("## What it is for");
  out.push("");
  out.push(...lineTable(draft));
  out.push("");

  /* --------------------------------------------------------------- totals */
  out.push("> [!success] Amount due");
  out.push(`> # ${primary}`);
  if (draft.currency === "CNY" && t.usdPriced) {
    out.push(
      `> ${
        t.linesAwaitingUsd
          ? `$${money(t.usdPriced)} of it priced in USD so far`
          : `$${money(t.usdPriced)} in USD, every line priced`
      }.`,
    );
  }
  if (draft.settleWhen) out.push(`> Settles **${draft.settleWhen}**.`);
  out.push("");

  if (t.linesUnpriced) {
    const n = t.linesUnpriced;
    out.push(
      `> [!warning] ${n} line${n === 1 ? "" : "s"} carr${
        n === 1 ? "ies" : "y"
      } no amount`,
    );
    out.push(
      "> They are shown as `—` because no note records a figure for them. **The total above " +
        "excludes them** — it is not the full bill until they are priced from a real receipt " +
        "or statement.",
    );
    out.push("");
  }

  if (draft.currency === "CNY" && t.linesAwaitingUsd) {
    const n = t.linesAwaitingUsd;
    out.push(
      `> [!info] ${n} line${n === 1 ? "" : "s"} still awaiting a posted USD figure`,
    );
    const recon = (settings.reconciliationNote ?? "").trim();
    out.push(
      "> The CNY column is the bill. USD appears per line only where Chase has actually " +
        "posted the charge" +
        (recon ? ` — see [[${recon}]].` : "."),
    );
    out.push("");
  }

  for (const n of draft.notes ?? []) {
    out.push("> [!info] Note");
    out.push(`> ${n}`);
    out.push("");
  }

  /* -------------------------------------------------------------- payment */
  out.push("## Settling up");
  out.push("");
  if (settings.paymentTerms.trim()) {
    for (const l of settings.paymentTerms.split("\n")) out.push(l);
    out.push("");
  }
  const methods = settings.paymentMethods
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (methods.length) {
    out.push("**How to pay**");
    out.push("");
    for (const m of methods) out.push(`- ${m}`);
    out.push("");
  }

  out.push("> [!caution] Marking this paid");
  if (draft.source === "iou") {
    out.push(
      "> Money arriving is recorded on the **item notes**, not here — set `paid_date: YYYY-MM-DD` " +
        "on each line's note and re-run `build_ious.py`. A USD figure on a line means Chase " +
        "posted the charge, never that the debt came back.",
    );
  } else if (draft.source === "badminton") {
    out.push(
      "> Record payment in **[[Applied Badminton — Sales Ledger]]** in Berkshire, which is the " +
        "record of truth for the sale. Then set `paid_date` in this note's frontmatter.",
    );
  } else {
    out.push(
      "> Set `paid_date: YYYY-MM-DD` in this note's frontmatter when the money lands, and " +
        "record it wherever the underlying obligation is tracked.",
    );
  }
  out.push("");

  /* --------------------------------------------------------------- footer */
  const seeAlso: string[] = [];
  if (draft.sourceLink) seeAlso.push(`[[${draft.sourceLink}]]`);
  if (draft.source === "iou") seeAlso.push("[[Debts & IOUs]]", "[[IOU Index]]");
  seeAlso.push("[[Invoices]]");
  out.push("---");
  out.push(`**See also:** ${seeAlso.join(" · ")}`);
  out.push("");
  out.push("**Hub:** [[Home]]");
  out.push("");

  return out.join("\n");
}

function lineTable(draft: InvoiceDraft): string[] {
  const L = draft.lines;
  const has = {
    date: L.some((l) => l.date),
    sticker: L.some((l) => l.stickerCny != null),
    fee: L.some((l) => l.feeCny != null),
    cny: L.some((l) => l.amountCny != null),
    usd: L.some((l) => l.amountUsd != null),
    qty: L.some((l) => l.qty != null),
    unit: L.some((l) => l.unitUsd != null),
    note: L.some((l) => l.note),
  };

  const head: string[] = [];
  const align: string[] = [];
  const push = (h: string, a: string) => {
    head.push(h);
    align.push(a);
  };

  if (has.date) push("Date", "---");
  push("What", "---");
  if (has.qty) push("Qty", "---:");
  if (has.unit) push("Unit $", "---:");
  if (has.sticker) push("Sticker ¥", "---:");
  if (has.fee) push("3% fee ¥", "---:");
  if (has.cny) push(draft.currency === "CNY" ? "**Charged ¥**" : "Charged ¥", "---:");
  if (has.usd) push(draft.currency === "USD" ? "**Total $**" : "USD", "---:");
  if (has.note) push("Receipt", "---");

  const rows: string[] = [];
  rows.push(`| ${head.join(" | ")} |`);
  rows.push(`|${align.join("|")}|`);

  for (const l of L) {
    const c: string[] = [];
    if (has.date) c.push(l.date ?? "—");
    c.push(describe(l));
    if (has.qty) c.push(l.qty != null ? String(l.qty) : "—");
    if (has.unit) c.push(usd(l.unitUsd));
    if (has.sticker) c.push(cny(l.stickerCny));
    if (has.fee) c.push(cny(l.feeCny));
    if (has.cny) {
      c.push(
        l.amountCny != null && draft.currency === "CNY"
          ? `**${cny(l.amountCny)}**`
          : cny(l.amountCny),
      );
    }
    if (has.usd) {
      c.push(
        l.amountUsd != null && draft.currency === "USD"
          ? `**${usd(l.amountUsd)}**`
          : usd(l.amountUsd),
      );
    }
    if (has.note) c.push(l.note ? "✅" : "—");
    rows.push(`| ${c.join(" | ")} |`);
  }

  // Totals row, mirroring the layout of the IOU pages.
  const t = totalsOf(draft);
  const c: string[] = [];
  if (has.date) c.push("");
  c.push(`**${t.lines} item${t.lines === 1 ? "" : "s"}**`);
  if (has.qty) c.push("");
  if (has.unit) c.push("");
  if (has.sticker) c.push(`**${cny(t.stickerCny)}**`);
  if (has.fee) c.push(`**${cny(t.feeCny)}**`);
  if (has.cny) c.push(`**${cny(t.cny)}**`);
  if (has.usd) c.push(`**${usd(t.usdPriced)}**`);
  if (has.note) c.push("");
  rows.push(`| ${c.join(" | ")} |`);

  return rows;
}

function describe(l: InvoiceLine): string {
  const text = escapeCell(l.description || "—");
  // A raw `|` — including the one in a wikilink alias — would split the cell.
  return l.link ? `${text} · [[${escapeCell(l.link)}\\|source]]` : text;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}
