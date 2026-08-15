"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StateStreetInvoicer
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/model.ts
function totalsOf(draft) {
  const t = {
    cny: 0,
    usdPriced: 0,
    stickerCny: 0,
    feeCny: 0,
    lines: draft.lines.length,
    linesUnpriced: 0,
    linesAwaitingUsd: 0
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
function money(n) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function signed(n, symbol) {
  return n < 0 ? `\u2212${symbol}${money(-n)}` : `${symbol}${money(n)}`;
}
function cny(n) {
  return n == null ? "\u2014" : signed(n, "\xA5");
}
function usd(n) {
  return n == null ? "\u2014" : signed(n, "$");
}
function personName(link) {
  if (!link) return "";
  return link.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
}
function safeFileName(s) {
  return s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();
}
function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[¥$,\s*]/g, "").replace(/−/g, "-");
    if (cleaned === "" || cleaned === "\u2014" || cleaned === "\u2013" || cleaned === "-") return void 0;
    const bracketed = /^\((.+)\)$/.exec(cleaned);
    const n = Number(bracketed ? `-${bracketed[1]}` : cleaned);
    if (Number.isFinite(n)) return n;
  }
  return void 0;
}

// src/render.ts
function renderInvoice(draft, settings) {
  const t = totalsOf(draft);
  const primary = draft.currency === "CNY" ? `\xA5${money(t.cny)}` : `$${money(t.usdPriced)}`;
  const out = [];
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
  if (t.cny) out.push(`total_cny: ${t.cny.toFixed(2)}`);
  out.push(
    draft.currency === "CNY" ? `total_usd_priced: ${t.usdPriced.toFixed(2)}` : `total_usd: ${t.usdPriced.toFixed(2)}`
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
  out.push(`# \u{1F9FE} Invoice ${draft.number} \u2014 ${draft.billTo}`);
  out.push("");
  const from = [settings.businessName, settings.businessTagline].map((s) => s.trim()).filter(Boolean).join(" \xB7 ");
  const contact = settings.contactLines.split("\n").map((s) => s.trim()).filter(Boolean).join(" \xB7 ");
  out.push("> [!invoice-header] INVOICE");
  out.push("> | | |");
  out.push("> |---|---|");
  if (from) out.push(`> | **From** | ${from} |`);
  if (contact) out.push(`> | **Contact** | ${contact} |`);
  out.push(`> | **Bill to** | [[${draft.billTo}]] |`);
  out.push(`> | **Invoice no.** | \`${draft.number}\` |`);
  out.push(`> | **Issued** | ${draft.date} |`);
  out.push(`> | **Amount due** | **${primary}** |`);
  out.push("> | **Status** | \u274C **UNPAID** |");
  out.push("");
  out.push("## What it is for");
  out.push("");
  out.push(...lineTable(draft));
  out.push("");
  out.push("> [!success] Amount due");
  out.push(`> # ${primary}`);
  if (draft.currency === "CNY" && t.usdPriced) {
    out.push(
      `> ${t.linesAwaitingUsd ? `$${money(t.usdPriced)} of it priced in USD so far` : `$${money(t.usdPriced)} in USD, every line priced`}.`
    );
  }
  if (draft.settleWhen) out.push(`> Settles **${draft.settleWhen}**.`);
  out.push("");
  if (t.linesUnpriced) {
    const n = t.linesUnpriced;
    out.push(
      `> [!warning] ${n} line${n === 1 ? "" : "s"} carr${n === 1 ? "ies" : "y"} no amount`
    );
    out.push(
      "> They are shown as `\u2014` because no note records a figure for them. **The total above excludes them** \u2014 it is not the full bill until they are priced from a real receipt or statement."
    );
    out.push("");
  }
  if (draft.currency === "CNY" && t.linesAwaitingUsd) {
    const n = t.linesAwaitingUsd;
    out.push(
      `> [!info] ${n} line${n === 1 ? "" : "s"} still awaiting a posted USD figure`
    );
    const recon = (settings.reconciliationNote ?? "").trim();
    out.push(
      "> The CNY column is the bill. USD appears per line only where Chase has actually posted the charge" + (recon ? ` \u2014 see [[${recon}]].` : ".")
    );
    out.push("");
  }
  for (const n of draft.notes ?? []) {
    out.push("> [!info] Note");
    out.push(`> ${n}`);
    out.push("");
  }
  out.push("## Settling up");
  out.push("");
  if (settings.paymentTerms.trim()) {
    for (const l of settings.paymentTerms.split("\n")) out.push(l);
    out.push("");
  }
  const methods = settings.paymentMethods.split("\n").map((s) => s.trim()).filter(Boolean);
  if (methods.length) {
    out.push("**How to pay**");
    out.push("");
    for (const m of methods) out.push(`- ${m}`);
    out.push("");
  }
  out.push("> [!caution] Marking this paid");
  if (draft.source === "iou") {
    out.push(
      "> Money arriving is recorded on the **item notes**, not here \u2014 set `paid_date: YYYY-MM-DD` on each line's note and re-run `build_ious.py`. A USD figure on a line means Chase posted the charge, never that the debt came back."
    );
  } else if (draft.source === "badminton") {
    out.push(
      "> Record payment in **[[Applied Badminton \u2014 Sales Ledger]]** in Berkshire, which is the record of truth for the sale. Then set `paid_date` in this note's frontmatter."
    );
  } else {
    out.push(
      "> Set `paid_date: YYYY-MM-DD` in this note's frontmatter when the money lands, and record it wherever the underlying obligation is tracked."
    );
  }
  out.push("");
  const seeAlso = [];
  if (draft.sourceLink) seeAlso.push(`[[${draft.sourceLink}]]`);
  if (draft.source === "iou") seeAlso.push("[[Debts & IOUs]]", "[[IOU Index]]");
  seeAlso.push("[[Invoices]]");
  out.push("---");
  out.push(`**See also:** ${seeAlso.join(" \xB7 ")}`);
  out.push("");
  out.push("**Hub:** [[Home]]");
  out.push("");
  return out.join("\n");
}
function lineTable(draft) {
  const L = draft.lines;
  const has = {
    date: L.some((l) => l.date),
    sticker: L.some((l) => l.stickerCny != null),
    fee: L.some((l) => l.feeCny != null),
    cny: L.some((l) => l.amountCny != null),
    usd: L.some((l) => l.amountUsd != null),
    qty: L.some((l) => l.qty != null),
    unit: L.some((l) => l.unitUsd != null),
    note: L.some((l) => l.note)
  };
  const head = [];
  const align = [];
  const push = (h, a) => {
    head.push(h);
    align.push(a);
  };
  if (has.date) push("Date", "---");
  push("What", "---");
  if (has.qty) push("Qty", "---:");
  if (has.unit) push("Unit $", "---:");
  if (has.sticker) push("Sticker \xA5", "---:");
  if (has.fee) push("3% fee \xA5", "---:");
  if (has.cny) push(draft.currency === "CNY" ? "**Charged \xA5**" : "Charged \xA5", "---:");
  if (has.usd) push(draft.currency === "USD" ? "**Total $**" : "USD", "---:");
  if (has.note) push("Receipt", "---");
  const rows = [];
  rows.push(`| ${head.join(" | ")} |`);
  rows.push(`|${align.join("|")}|`);
  for (const l of L) {
    const c2 = [];
    if (has.date) c2.push(l.date ?? "\u2014");
    c2.push(describe(l));
    if (has.qty) c2.push(l.qty != null ? String(l.qty) : "\u2014");
    if (has.unit) c2.push(usd(l.unitUsd));
    if (has.sticker) c2.push(cny(l.stickerCny));
    if (has.fee) c2.push(cny(l.feeCny));
    if (has.cny) {
      c2.push(
        l.amountCny != null && draft.currency === "CNY" ? `**${cny(l.amountCny)}**` : cny(l.amountCny)
      );
    }
    if (has.usd) {
      c2.push(
        l.amountUsd != null && draft.currency === "USD" ? `**${usd(l.amountUsd)}**` : usd(l.amountUsd)
      );
    }
    if (has.note) c2.push(l.note ? "\u2705" : "\u2014");
    rows.push(`| ${c2.join(" | ")} |`);
  }
  const t = totalsOf(draft);
  const c = [];
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
function describe(l) {
  const text = escapeCell(l.description || "\u2014");
  return l.link ? `${text} \xB7 [[${escapeCell(l.link)}\\|source]]` : text;
}
function escapeCell(s) {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

// src/items.ts
function frontmatterOf(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.length > 1 && v[0] === '"' && v[v.length - 1] === '"') {
      v = v.slice(1, -1);
    }
    out[kv[1]] = v === "" ? void 0 : v;
  }
  return out;
}
function itemToLine(fm, basename) {
  return {
    date: fm.date,
    description: fm.what_is_it ?? basename,
    stickerCny: toNumber(fm.sticker_price_cny),
    feeCny: toNumber(fm.handling_fee_cny),
    amountCny: toNumber(fm.amount_cny),
    amountUsd: toNumber(fm.amount_usd),
    link: basename,
    note: fm.receipt
  };
}
function isOwed(fm) {
  return fm.attribution === "owed" && !!fm.for_whom;
}
function toOwedItem(fm, basename) {
  return {
    basename,
    person: personName(fm.for_whom),
    paidDate: fm.paid_date,
    settleWhen: fm.settle_when,
    line: itemToLine(fm, basename)
  };
}
function groupOwed(items, iouPages = /* @__PURE__ */ new Map()) {
  const byPerson = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (!item.person) continue;
    const list = byPerson.get(item.person) ?? [];
    list.push(item);
    byPerson.set(item.person, list);
  }
  const people = [];
  for (const [name, list] of byPerson) {
    list.sort((a, b) => (a.line.date ?? "").localeCompare(b.line.date ?? ""));
    people.push({
      name,
      items: list,
      settleWhen: list.find((i) => i.settleWhen)?.settleWhen,
      iouPage: iouPages.get(name)
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  return people;
}
function draftFromOwed(person, number, date) {
  const notes = [];
  if (person.items.some((i) => i.line.feeCny != null)) {
    notes.push(
      "Billed at the **charged** amount, not the shop sticker price. Alipay adds a 3% Payment Handling Fee on foreign cards, and that difference is a real cost of fronting the purchase."
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
    notes
  };
}
function splitNote(count) {
  return `${count} purchase${count === 1 ? " is" : "s are"} marked \`attribution: split\` and deliberately left off this invoice \u2014 a group buy would otherwise bill one person for everyone's share. Those splits are hand-maintained in [[Debts & IOUs]].`;
}

// src/badminton.ts
var LedgerUnavailable = class extends Error {
};
function isTruthyCell(cell) {
  const c = cell.trim().toLowerCase().replace(/\*/g, "");
  if (!c || c === "\u2014" || c === "-") return false;
  return /^(✅|yes|y|paid|true|✔️?)$/.test(c);
}
function stripCell(cell) {
  return cell.replace(/\\\|/g, "|").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/\*\*/g, "").replace(/`/g, "").trim();
}
function parseBadmintonLedger(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s+Sales\s*$/i.test(l.trim()));
  if (start === -1) {
    throw new LedgerUnavailable(
      "No `## Sales` heading in that file \u2014 is the path pointing at the sales ledger?"
    );
  }
  let header = null;
  const jobs = [];
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (/^#{1,6}\s/.test(raw)) break;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|");
    if (cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c))) continue;
    if (!header) {
      header = cells.map((c) => stripCell(c).toLowerCase());
      continue;
    }
    const col = (...names) => {
      for (const n of names) {
        const idx = header.findIndex((h) => h.includes(n));
        if (idx !== -1 && cells[idx] != null) return stripCell(cells[idx]);
      }
      return "";
    };
    const customer = col("customer", "person", "who");
    if (!customer || /^\*|^totals?$/i.test(customer)) continue;
    if (cells.some((c) => /\*totals?\*|^\s*\*\*totals?\*\*/i.test(c.trim()))) continue;
    jobs.push({
      date: col("date") || void 0,
      customer,
      what: col("what", "item", "service") || "Stringing job",
      qty: toNumber(col("qty", "quantity")),
      unitUsd: toNumber(col("unit")),
      totalUsd: toNumber(col("total")),
      paid: isTruthyCell(col("paid")),
      owner: isTruthyCell(col("owner")),
      note: col("note") || void 0
    });
  }
  return jobs;
}
function draftFromBadminton(customer, jobs, number, date, settings) {
  const notes = [
    "The sale itself is recorded in **[[Applied Badminton \u2014 Sales Ledger]]** over in Berkshire. This note is the billing document, not a second ledger \u2014 mark the sale paid there."
  ];
  const ownerLines = jobs.filter((j) => j.owner);
  const isStringing = (j) => /string/i.test(j.what);
  if (ownerLines.some(isStringing)) {
    notes.push(
      "One or more lines are **owner stringing jobs**, billed at string cost rather than the price ladder. Owners do not pay for labour (settled 2026-08-01)."
    );
  }
  if (ownerLines.some((j) => !isStringing(j))) {
    notes.push(
      "One or more lines are **goods sold to an owner**, billed at the same price everyone pays. Owners get labour free and string at cost; stock off the shelf is not discounted (set 2026-08-14)."
    );
  }
  return {
    number,
    date,
    billTo: customer,
    source: "badminton",
    sourceLink: "Applied Badminton \u2014 Sales Ledger",
    currency: "USD",
    lines: jobs.map((j) => ({
      date: j.date,
      description: j.what,
      qty: j.qty,
      unitUsd: j.unitUsd,
      amountUsd: j.totalUsd ?? void 0,
      note: j.note
    })),
    settleWhen: settings.paymentTerms || void 0,
    notes
  };
}

// src/index-note.ts
var INDEX_NAME = "Invoices";
var TABLE_START = "<!-- INVOICE-TABLE:START -->";
var TABLE_END = "<!-- INVOICE-TABLE:END -->";
function amount(raw, symbol) {
  const n = Number(raw);
  return Number.isFinite(n) ? `${symbol}${money(n)}` : `${symbol}${raw}`;
}
function buildIndexTable(rows) {
  const body = rows.map(({ basename, fm }) => {
    const total = fm.total_cny ? amount(fm.total_cny, "\xA5") : fm.total_usd ? amount(fm.total_usd, "$") : fm.total_usd_priced ? amount(fm.total_usd_priced, "$") : "\u2014";
    const paid = fm.paid_date ? `\u2705 ${fm.paid_date}` : "\u274C unpaid";
    return `| \`${fm.invoice_number ?? basename}\` | ${fm.bill_to ?? "\u2014"} | ${fm.issued ?? "\u2014"} | ${total} | ${paid} | [[${basename}]] |`;
  });
  return [
    TABLE_START,
    "| No. | Bill to | Issued | Amount | Paid? | Invoice |",
    "|---|---|---|---:|---|---|",
    ...body.length ? body : ["| \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | *no invoices yet* |"],
    TABLE_END
  ].join("\n");
}
function spliceIndex(existing, table) {
  const start = existing.indexOf(TABLE_START);
  const end = existing.indexOf(TABLE_END);
  if (start === -1 || end === -1) {
    return existing.trimEnd() + "\n\n" + table + "\n";
  }
  return existing.slice(0, start) + table + existing.slice(end + TABLE_END.length);
}
function indexSkeleton(table) {
  return `---
tags:
  - finance
  - meta
  - invoice
type: invoice-index
---

# \u{1F9FE} Invoices

Every invoice this vault has issued. Generated by **State Street Invoicer** \u2014 do not hand-edit
between the markers; the table is rewritten each time an invoice is created.

> [!caution] An invoice is a bill, not a receipt
> "Issued" means the document exists. Repayment lives where the obligation lives \u2014 \`paid_date\`
> on the item notes for an IOU (then re-run \`build_ious.py\`), or the Applied Badminton sales
> ledger in Berkshire for a stringing job.

${table}

**See also:** [[Debts & IOUs]] \xB7 [[IOU Index]]

---
**Hub:** [[Home]]
`;
}
function nextNumberFrom(basenames, prefix, year) {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-${year}-(\\d+)`);
  let max = 0;
  for (const b of basenames) {
    const m = b.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

// src/sources.ts
var import_obsidian = require("obsidian");
var import_node_path = require("node:path");
var import_node_fs = require("node:fs");
function scanOwedItems(app, settings) {
  const items = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.includes("/Items/")) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm || !isOwed(fm)) continue;
    const item = toOwedItem(fm, file.basename);
    if (item.paidDate && settings.excludePaidItems) continue;
    items.push(item);
  }
  const iouPages = /* @__PURE__ */ new Map();
  for (const file of app.vault.getMarkdownFiles()) {
    const m = file.basename.match(/^IOU — (.+)$/);
    if (m) iouPages.set(m[1], file.basename);
  }
  return groupOwed(items, iouPages);
}
function splitItemCount(app) {
  let n = 0;
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.includes("/Items/")) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.attribution === "split") n++;
  }
  return n;
}
function resolveLedgerPath(app, configured) {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof import_obsidian.FileSystemAdapter)) {
    throw new LedgerUnavailable(
      "Reading the Berkshire ledger needs the desktop app."
    );
  }
  const p = configured.trim();
  if (!p) throw new LedgerUnavailable("No ledger path is set.");
  return (0, import_node_path.isAbsolute)(p) ? p : (0, import_node_path.resolve)(adapter.getBasePath(), p);
}
function readBadmintonJobs(app, settings) {
  const path = resolveLedgerPath(app, settings.badmintonLedgerPath);
  let text;
  try {
    text = (0, import_node_fs.readFileSync)(path, "utf8");
  } catch {
    throw new LedgerUnavailable(`Could not read the ledger at ${path}`);
  }
  return parseBadmintonLedger(text);
}
function nextInvoiceNumber(app, settings, year) {
  const folder = (0, import_obsidian.normalizePath)(settings.invoiceFolder);
  const names = app.vault.getMarkdownFiles().filter((f) => f.parent?.path === folder).map((f) => f.basename);
  return nextNumberFrom(names, settings.numberPrefix, year);
}

// src/modals.ts
var import_obsidian2 = require("obsidian");
var PickModal = class extends import_obsidian2.SuggestModal {
  constructor(app, items, label, sub, onPick, placeholder) {
    super(app);
    this.items = items;
    this.label = label;
    this.sub = sub;
    this.onPick = onPick;
    this.setPlaceholder(placeholder);
  }
  getSuggestions(query) {
    const q = query.toLowerCase();
    return this.items.filter((i) => this.label(i).toLowerCase().includes(q));
  }
  renderSuggestion(item, el) {
    el.createEl("div", { text: this.label(item) });
    const s = this.sub(item);
    if (s) el.createEl("small", { text: s, cls: "ssi-suggest-sub" });
  }
  onChooseSuggestion(item) {
    this.onPick(item);
  }
};
var ConfirmModal = class extends import_obsidian2.Modal {
  constructor(app, draft, onConfirm) {
    super(app);
    this.draft = draft;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ssi-modal");
    contentEl.createEl("h2", { text: `Invoice ${this.draft.number}` });
    contentEl.createEl("p", {
      text: `Bill to ${this.draft.billTo} \xB7 ${this.draft.lines.length} line${this.draft.lines.length === 1 ? "" : "s"}`,
      cls: "ssi-sub"
    });
    const table = contentEl.createEl("table", { cls: "ssi-preview" });
    const body = table.createEl("tbody");
    const head = body.createEl("tr");
    for (const h of ["Date", "What", this.draft.currency === "CNY" ? "\xA5" : "$"]) {
      head.createEl("th", { text: h });
    }
    let total = 0;
    let unpriced = 0;
    for (const l of this.draft.lines) {
      const amount2 = this.draft.currency === "CNY" ? l.amountCny : l.amountUsd;
      if (amount2 == null) unpriced++;
      else total += amount2;
      const tr = body.createEl("tr");
      tr.createEl("td", { text: l.date ?? "\u2014" });
      tr.createEl("td", { text: l.description });
      tr.createEl("td", {
        text: this.draft.currency === "CNY" ? cny(l.amountCny) : usd(l.amountUsd),
        cls: amount2 == null ? "ssi-num ssi-missing" : "ssi-num"
      });
    }
    const foot = body.createEl("tr", { cls: "ssi-total-row" });
    foot.createEl("td", { text: "" });
    foot.createEl("td", { text: "Amount due" });
    foot.createEl("td", {
      text: this.draft.currency === "CNY" ? `\xA5${money(total)}` : `$${money(total)}`,
      cls: "ssi-num"
    });
    if (unpriced) {
      const w = contentEl.createEl("div", { cls: "ssi-warning" });
      w.createEl("strong", {
        text: `${unpriced} line${unpriced === 1 ? "" : "s"} with no recorded amount. `
      });
      w.appendText(
        "They go on the invoice as \u201C\u2014\u201D and are left out of the total. Nothing is estimated."
      );
    }
    new import_obsidian2.Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("Create invoice").setCta().onClick(() => {
        this.close();
        this.onConfirm();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var BlankInvoiceModal = class extends import_obsidian2.Modal {
  constructor(app, number, onSubmit) {
    super(app);
    this.number = number;
    this.onSubmit = onSubmit;
  }
  billTo = "";
  currency = "USD";
  lines = [{ description: "" }];
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ssi-modal");
    contentEl.createEl("h2", { text: `New invoice ${this.number}` });
    const fieldsEl = contentEl.createEl("div");
    contentEl.createEl("h3", { text: "Lines" });
    const linesEl = contentEl.createEl("div");
    const buttonsEl = contentEl.createEl("div");
    new import_obsidian2.Setting(fieldsEl).setName("Bill to").setDesc("A plain name \u2014 it is linked as [[Name]], never duplicated as a note.").addText(
      (t) => t.setPlaceholder("Jacky Miao").onChange((v) => {
        this.billTo = v.trim();
      })
    );
    new import_obsidian2.Setting(fieldsEl).setName("Currency").addDropdown(
      (d) => d.addOption("USD", "USD ($)").addOption("CNY", "CNY (\xA5)").setValue(this.currency).onChange((v) => {
        this.currency = v;
        this.drawLines(linesEl);
      })
    );
    this.drawLines(linesEl);
    new import_obsidian2.Setting(buttonsEl).addButton(
      (b) => b.setButtonText("Add line").onClick(() => {
        this.lines.push({ description: "" });
        this.drawLines(linesEl);
      })
    ).addButton(
      (b) => b.setButtonText("Create invoice").setCta().onClick(() => {
        const kept = this.lines.filter((l) => l.description.trim());
        if (!this.billTo || !kept.length) {
          new import_obsidian2.Notice("An invoice needs a name and at least one described line.");
          return;
        }
        this.close();
        this.onSubmit(this.billTo, this.currency, kept);
      })
    );
  }
  drawLines(host) {
    host.empty();
    this.lines.forEach((line, i) => {
      const row = host.createEl("div", { cls: "ssi-line-row" });
      const date = row.createEl("input", { cls: "ssi-in ssi-in-date" });
      date.type = "date";
      date.value = line.date ?? "";
      date.addEventListener("change", () => {
        line.date = date.value || void 0;
      });
      const desc = row.createEl("input", { cls: "ssi-in ssi-in-desc" });
      desc.type = "text";
      desc.placeholder = "What it is for";
      desc.value = line.description;
      desc.addEventListener("input", () => {
        line.description = desc.value;
      });
      const amt = row.createEl("input", { cls: "ssi-in ssi-in-amt" });
      amt.type = "text";
      amt.placeholder = this.currency === "CNY" ? "\xA5 amount" : "$ amount";
      amt.value = String(
        (this.currency === "CNY" ? line.amountCny : line.amountUsd) ?? ""
      );
      amt.addEventListener("input", () => {
        const n = toNumber(amt.value);
        if (this.currency === "CNY") line.amountCny = n;
        else line.amountUsd = n;
      });
      const del = row.createEl("button", { text: "\u2715", cls: "ssi-del" });
      del.addEventListener("click", () => {
        this.lines.splice(i, 1);
        if (!this.lines.length) this.lines.push({ description: "" });
        this.drawLines(host);
      });
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/settings-defaults.ts
var DEFAULT_SETTINGS = {
  businessName: "",
  businessTagline: "",
  contactLines: "",
  invoiceFolder: "Invoices",
  numberPrefix: "INV",
  badmintonLedgerPath: "",
  paymentTerms: "",
  paymentMethods: "",
  openAfterCreate: true,
  excludePaidItems: true,
  reconciliationNote: ""
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var InvoicerSettingTab = class extends import_obsidian3.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Who the invoice is from" });
    new import_obsidian3.Setting(containerEl).setName("Name").setDesc("Printed at the top of every invoice.").addText(
      (t) => t.setPlaceholder("Your name").setValue(this.plugin.settings.businessName).onChange(async (v) => {
        this.plugin.settings.businessName = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Tagline").setDesc("Optional second line \u2014 e.g. a venture name.").addText(
      (t) => t.setPlaceholder("Your venture").setValue(this.plugin.settings.businessTagline).onChange(async (v) => {
        this.plugin.settings.businessTagline = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Contact").setDesc("One per line \u2014 email, phone, handle.").addTextArea(
      (t) => t.setValue(this.plugin.settings.contactLines).onChange(async (v) => {
        this.plugin.settings.contactLines = v;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Where invoices go" });
    new import_obsidian3.Setting(containerEl).setName("Invoice folder").setDesc("Vault-relative. Created on first use.").addText(
      (t) => t.setPlaceholder("Invoices").setValue(this.plugin.settings.invoiceFolder).onChange(async (v) => {
        this.plugin.settings.invoiceFolder = v.trim() || "Invoices";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Number prefix").setDesc("Numbers run PREFIX-YYYY-NNNN, counted per year from the folder.").addText(
      (t) => t.setPlaceholder("INV").setValue(this.plugin.settings.numberPrefix).onChange(async (v) => {
        this.plugin.settings.numberPrefix = v.trim() || "INV";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Open the invoice after creating it").addToggle(
      (t) => t.setValue(this.plugin.settings.openAfterCreate).onChange(async (v) => {
        this.plugin.settings.openAfterCreate = v;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Sources" });
    new import_obsidian3.Setting(containerEl).setName("Applied Badminton sales ledger").setDesc(
      "Absolute path, or relative to this vault's folder. Read-only \u2014 the plugin never writes to Berkshire."
    ).addText(
      (t) => t.setPlaceholder("../Business/Sales Ledger.md").setValue(this.plugin.settings.badmintonLedgerPath).onChange(async (v) => {
        this.plugin.settings.badmintonLedgerPath = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Reconciliation note").setDesc(
      "Linked from any line still awaiting a posted USD figure. Update it each statement period, or clear it to leave the link off."
    ).addText(
      (t) => t.setPlaceholder("Card Reconciliation 2026-08").setValue(this.plugin.settings.reconciliationNote).onChange(async (v) => {
        this.plugin.settings.reconciliationNote = v.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Leave out items already marked paid").setDesc(
      "An item note with a `paid_date` has been repaid and does not belong on a new invoice."
    ).addToggle(
      (t) => t.setValue(this.plugin.settings.excludePaidItems).onChange(async (v) => {
        this.plugin.settings.excludePaidItems = v;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "Terms" });
    new import_obsidian3.Setting(containerEl).setName("Payment terms").setDesc("Printed under the total.").addTextArea(
      (t) => t.setValue(this.plugin.settings.paymentTerms).onChange(async (v) => {
        this.plugin.settings.paymentTerms = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("How to pay").setDesc("One per line \u2014 Zelle, Venmo, cash. Left off the invoice when empty.").addTextArea(
      (t) => t.setValue(this.plugin.settings.paymentMethods).onChange(async (v) => {
        this.plugin.settings.paymentMethods = v;
        await this.plugin.saveSettings();
      })
    );
    const note = containerEl.createEl("div", { cls: "ssi-settings-note" });
    note.createEl("strong", { text: "An invoice is a billing document, not a ledger. " });
    note.appendText(
      "Repayment is still recorded by setting `paid_date` on the item note and re-running build_ious.py \u2014 this plugin never marks anything paid."
    );
  }
};

// src/main.ts
var StateStreetInvoicer = class extends import_obsidian4.Plugin {
  settings = DEFAULT_SETTINGS;
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("receipt", "New invoice", () => this.invoiceFromIou());
    this.addCommand({
      id: "invoice-from-iou",
      name: "New invoice from an IOU",
      callback: () => this.invoiceFromIou()
    });
    this.addCommand({
      id: "invoice-from-badminton",
      name: "New invoice from an Applied Badminton job",
      callback: () => this.invoiceFromBadminton()
    });
    this.addCommand({
      id: "invoice-blank",
      name: "New blank invoice",
      callback: () => this.invoiceBlank()
    });
    this.addCommand({
      id: "rebuild-invoice-index",
      name: "Rebuild the Invoices index",
      callback: async () => {
        const n = await this.rebuildIndex();
        new import_obsidian4.Notice(`Invoices index rebuilt \u2014 ${n} invoice${n === 1 ? "" : "s"}.`);
      }
    });
    this.addSettingTab(new InvoicerSettingTab(this.app, this));
  }
  /* ------------------------------------------------------------- sources */
  invoiceFromIou() {
    const people = scanOwedItems(this.app, this.settings);
    if (!people.length) {
      new import_obsidian4.Notice(
        "Nothing to invoice \u2014 no item note is marked `attribution: owed` with a `for_whom`."
      );
      return;
    }
    const splits = splitItemCount(this.app);
    new PickModal(
      this.app,
      people,
      (p) => p.name,
      (p) => {
        const cnyTotal = p.items.reduce((s, i) => s + (i.line.amountCny ?? 0), 0);
        const usdTotal = p.items.reduce((s, i) => s + (i.line.amountUsd ?? 0), 0);
        const bits = [`${p.items.length} item${p.items.length === 1 ? "" : "s"}`];
        if (cnyTotal) bits.push(`\xA5${money(cnyTotal)}`);
        if (usdTotal) bits.push(`$${money(usdTotal)} priced`);
        return bits.join(" \xB7 ");
      },
      (person) => {
        const draft = draftFromOwed(person, this.nextNumber(), this.today());
        if (splits) {
          draft.notes = draft.notes ?? [];
          draft.notes.push(splitNote(splits));
        }
        this.confirmAndWrite(draft);
      },
      "Who is this invoice for?"
    ).open();
  }
  invoiceFromBadminton() {
    let jobs;
    try {
      jobs = readBadmintonJobs(this.app, this.settings);
    } catch (e) {
      const msg = e instanceof LedgerUnavailable ? e.message : String(e);
      new import_obsidian4.Notice(`Applied Badminton: ${msg}`, 8e3);
      return;
    }
    const unpaid = jobs.filter((j) => !j.paid);
    if (!unpaid.length) {
      new import_obsidian4.Notice(
        jobs.length ? `All ${jobs.length} job${jobs.length === 1 ? " is" : "s are"} already marked paid in the sales ledger.` : "The sales ledger has no sales in it yet \u2014 nothing to invoice.",
        7e3
      );
      return;
    }
    const byCustomer = /* @__PURE__ */ new Map();
    for (const j of unpaid) {
      const list = byCustomer.get(j.customer) ?? [];
      list.push(j);
      byCustomer.set(j.customer, list);
    }
    const customers = [...byCustomer.keys()].sort((a, b) => a.localeCompare(b));
    new PickModal(
      this.app,
      customers,
      (c) => c,
      (c) => {
        const list = byCustomer.get(c) ?? [];
        const total = list.reduce((s, j) => s + (j.totalUsd ?? 0), 0);
        return `${list.length} unpaid job${list.length === 1 ? "" : "s"} \xB7 $${money(total)}`;
      },
      (customer) => {
        const draft = draftFromBadminton(
          customer,
          byCustomer.get(customer) ?? [],
          this.nextNumber(),
          this.today(),
          this.settings
        );
        this.confirmAndWrite(draft);
      },
      "Which customer?"
    ).open();
  }
  invoiceBlank() {
    const number = this.nextNumber();
    new BlankInvoiceModal(
      this.app,
      number,
      (billTo, currency, lines) => {
        const draft = {
          number,
          date: this.today(),
          billTo,
          source: "blank",
          currency,
          lines,
          settleWhen: this.settings.paymentTerms || void 0
        };
        this.confirmAndWrite(draft);
      }
    ).open();
  }
  /* --------------------------------------------------------------- write */
  confirmAndWrite(draft) {
    new ConfirmModal(this.app, draft, () => void this.write(draft)).open();
  }
  async write(draft) {
    const folder = (0, import_obsidian4.normalizePath)(this.settings.invoiceFolder);
    await this.ensureFolder(folder);
    const path = (0, import_obsidian4.normalizePath)(
      `${folder}/${draft.number} \u2014 ${safeFileName(draft.billTo)}.md`
    );
    if (this.app.vault.getAbstractFileByPath(path)) {
      new import_obsidian4.Notice(`${path} already exists \u2014 nothing written.`, 7e3);
      return;
    }
    const file = await this.app.vault.create(
      path,
      renderInvoice(draft, this.settings)
    );
    await this.rebuildIndex();
    const t = totalsOf(draft);
    const amount2 = draft.currency === "CNY" ? `\xA5${money(t.cny)}` : `$${money(t.usdPriced)}`;
    new import_obsidian4.Notice(
      `${draft.number} \u2014 ${draft.billTo} \xB7 ${amount2}` + (t.linesUnpriced ? ` \xB7 ${t.linesUnpriced} line(s) unpriced` : ""),
      6e3
    );
    if (this.settings.openAfterCreate) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }
  }
  async ensureFolder(path) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian4.TFolder) return;
    if (existing) throw new Error(`${path} exists and is not a folder`);
    await this.app.vault.createFolder(path);
  }
  /* --------------------------------------------------------------- index */
  /** Keeps every invoice linked from one page — no orphans in the graph. */
  async rebuildIndex() {
    const folder = (0, import_obsidian4.normalizePath)(this.settings.invoiceFolder);
    const rows = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.parent?.path !== folder) continue;
      if (file.basename === INDEX_NAME) continue;
      const fm = frontmatterOf(await this.app.vault.cachedRead(file));
      if (fm.type !== "invoice") continue;
      rows.push({ basename: file.basename, fm });
    }
    rows.sort((a, b) => b.basename.localeCompare(a.basename));
    const table = buildIndexTable(rows);
    await this.ensureFolder(folder);
    const indexPath = (0, import_obsidian4.normalizePath)(`${folder}/${INDEX_NAME}.md`);
    const existing = this.app.vault.getAbstractFileByPath(indexPath);
    if (existing instanceof import_obsidian4.TFile) {
      const text = await this.app.vault.read(existing);
      const next = spliceIndex(text, table);
      if (next !== text) await this.app.vault.modify(existing, next);
    } else {
      await this.app.vault.create(indexPath, indexSkeleton(table));
    }
    return rows.length;
  }
  /* ------------------------------------------------------------- helpers */
  nextNumber() {
    return nextInvoiceNumber(this.app, this.settings, this.today().slice(0, 4));
  }
  /** Local ISO date — the vault dates everything YYYY-MM-DD. */
  today() {
    const d = /* @__PURE__ */ new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
