// src/cli.ts
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

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
function draftFromBadminton(customer, jobs, number, date, settings2) {
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
    settleWhen: settings2.paymentTerms || void 0,
    notes
  };
}

// src/render.ts
function renderInvoice(draft, settings2) {
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
  const from = [settings2.businessName, settings2.businessTagline].map((s) => s.trim()).filter(Boolean).join(" \xB7 ");
  const contact = settings2.contactLines.split("\n").map((s) => s.trim()).filter(Boolean).join(" \xB7 ");
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
    const recon = (settings2.reconciliationNote ?? "").trim();
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
  if (settings2.paymentTerms.trim()) {
    for (const l of settings2.paymentTerms.split("\n")) out.push(l);
    out.push("");
  }
  const methods = settings2.paymentMethods.split("\n").map((s) => s.trim()).filter(Boolean);
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
  const has2 = {
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
  if (has2.date) push("Date", "---");
  push("What", "---");
  if (has2.qty) push("Qty", "---:");
  if (has2.unit) push("Unit $", "---:");
  if (has2.sticker) push("Sticker \xA5", "---:");
  if (has2.fee) push("3% fee \xA5", "---:");
  if (has2.cny) push(draft.currency === "CNY" ? "**Charged \xA5**" : "Charged \xA5", "---:");
  if (has2.usd) push(draft.currency === "USD" ? "**Total $**" : "USD", "---:");
  if (has2.note) push("Receipt", "---");
  const rows = [];
  rows.push(`| ${head.join(" | ")} |`);
  rows.push(`|${align.join("|")}|`);
  for (const l of L) {
    const c2 = [];
    if (has2.date) c2.push(l.date ?? "\u2014");
    c2.push(describe(l));
    if (has2.qty) c2.push(l.qty != null ? String(l.qty) : "\u2014");
    if (has2.unit) c2.push(usd(l.unitUsd));
    if (has2.sticker) c2.push(cny(l.stickerCny));
    if (has2.fee) c2.push(cny(l.feeCny));
    if (has2.cny) {
      c2.push(
        l.amountCny != null && draft.currency === "CNY" ? `**${cny(l.amountCny)}**` : cny(l.amountCny)
      );
    }
    if (has2.usd) {
      c2.push(
        l.amountUsd != null && draft.currency === "USD" ? `**${usd(l.amountUsd)}**` : usd(l.amountUsd)
      );
    }
    if (has2.note) c2.push(l.note ? "\u2705" : "\u2014");
    rows.push(`| ${c2.join(" | ")} |`);
  }
  const t = totalsOf(draft);
  const c = [];
  if (has2.date) c.push("");
  c.push(`**${t.lines} item${t.lines === 1 ? "" : "s"}**`);
  if (has2.qty) c.push("");
  if (has2.unit) c.push("");
  if (has2.sticker) c.push(`**${cny(t.stickerCny)}**`);
  if (has2.fee) c.push(`**${cny(t.feeCny)}**`);
  if (has2.cny) c.push(`**${cny(t.cny)}**`);
  if (has2.usd) c.push(`**${usd(t.usdPriced)}**`);
  if (has2.note) c.push("");
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

// src/cli.ts
var DEFAULT_VAULT = process.env.INVOICER_VAULT ?? "/Users/lionelweng/Documents/State Street";
var argv = process.argv.slice(2);
var flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? void 0 : argv[i + 1];
};
var has = (name) => argv.includes(`--${name}`);
var positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  return !argv[i - 1]?.startsWith("--") || ["write", "help"].includes(argv[i - 1].slice(2));
});
var command = positional[0] ?? "list";
var target = positional[1];
var vault = flag("vault") ?? DEFAULT_VAULT;
var write = has("write");
function loadSettings() {
  const p = join(vault, ".obsidian/plugins/state-street-invoicer/data.json");
  if (!existsSync(p)) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    console.error(`! could not parse ${p} \u2014 falling back to defaults`);
    return { ...DEFAULT_SETTINGS };
  }
}
var settings = loadSettings();
function today() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function markdownIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
}
function itemFiles() {
  const out = [];
  for (const top of readdirSync(vault, { withFileTypes: true })) {
    if (!top.isDirectory() || top.name.startsWith(".")) continue;
    const items = join(vault, top.name, "Items");
    for (const name of markdownIn(items)) {
      out.push({ path: join(items, name), basename: name.replace(/\.md$/, "") });
    }
  }
  return out;
}
function readPeople() {
  const owed = [];
  let splits = 0;
  for (const { path, basename } of itemFiles()) {
    const fm = frontmatterOf(readFileSync(path, "utf8"));
    if (fm.attribution === "split") splits++;
    if (!isOwed(fm)) continue;
    const item = toOwedItem(fm, basename);
    if (item.paidDate && settings.excludePaidItems) continue;
    owed.push(item);
  }
  const iouPages = /* @__PURE__ */ new Map();
  for (const name of markdownIn(join(vault, "IOUs"))) {
    const m = name.replace(/\.md$/, "").match(/^IOU — (.+)$/);
    if (m) iouPages.set(m[1], `IOU \u2014 ${m[1]}`);
  }
  return { people: groupOwed(owed, iouPages), splits };
}
function invoiceFolder() {
  const f = settings.invoiceFolder;
  return isAbsolute(f) ? f : resolve(vault, f);
}
function nextNumber() {
  const names = markdownIn(invoiceFolder()).map((n) => n.replace(/\.md$/, ""));
  return nextNumberFrom(names, settings.numberPrefix, today().slice(0, 4));
}
function emit(draft) {
  const text = renderInvoice(draft, settings);
  const t = totalsOf(draft);
  const amount2 = draft.currency === "CNY" ? `\xA5${money(t.cny)}` : `$${money(t.usdPriced)}`;
  if (!write) {
    console.log(text);
    console.error(
      `
\u2014 dry run \u2014 ${draft.number} \xB7 ${draft.billTo} \xB7 ${amount2}` + (t.linesUnpriced ? ` \xB7 ${t.linesUnpriced} line(s) unpriced` : "") + "\n  add --write to save it into the vault"
    );
    return;
  }
  const folder = invoiceFolder();
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${draft.number} \u2014 ${safeFileName(draft.billTo)}.md`);
  if (existsSync(file)) {
    console.error(`! ${file} already exists \u2014 nothing written`);
    process.exit(1);
  }
  writeFileSync(file, text, "utf8");
  rebuildIndex();
  console.log(
    `wrote ${file}
  ${draft.billTo} \xB7 ${amount2}` + (t.linesUnpriced ? ` \xB7 ${t.linesUnpriced} line(s) unpriced` : "")
  );
}
function rebuildIndex() {
  const folder = invoiceFolder();
  const rows = markdownIn(folder).map((n) => n.replace(/\.md$/, "")).filter((b) => b !== INDEX_NAME).map((basename) => ({
    basename,
    fm: frontmatterOf(readFileSync(join(folder, `${basename}.md`), "utf8"))
  })).filter((r) => r.fm.type === "invoice").sort((a, b) => b.basename.localeCompare(a.basename));
  const table = buildIndexTable(rows);
  const indexPath = join(folder, `${INDEX_NAME}.md`);
  if (existsSync(indexPath)) {
    const text = readFileSync(indexPath, "utf8");
    const next = spliceIndex(text, table);
    if (next !== text) writeFileSync(indexPath, next, "utf8");
  } else {
    writeFileSync(indexPath, indexSkeleton(table), "utf8");
  }
}
function cmdList() {
  const { people, splits } = readPeople();
  if (!people.length) {
    console.log("Nothing to invoice \u2014 no item note is marked `owed` with a `for_whom`.");
    return;
  }
  console.log(`Can invoice (vault: ${vault})
`);
  console.log("person            items            \xA5        USD priced");
  for (const p of people) {
    const t = totalsOf(draftFromOwed(p, "x", "x"));
    console.log(
      `${p.name.padEnd(16)} ${String(t.lines).padStart(5)} ${t.cny.toFixed(2).padStart(12)} ${("$" + t.usdPriced.toFixed(2)).padStart(12)}` + (t.linesAwaitingUsd ? `  (${t.linesAwaitingUsd} awaiting USD)` : "")
    );
  }
  if (splits) {
    console.log(
      `
${splits} item(s) marked \`split\` are excluded \u2014 group buys are hand-maintained.`
    );
  }
  console.log(`
next invoice number: ${nextNumber()}`);
}
function cmdIou(name) {
  const { people, splits } = readPeople();
  const person = people.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? people.find((p) => p.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!person) {
    console.error(
      `! no one owing called "${name}". Known: ${people.map((p) => p.name).join(", ")}`
    );
    process.exit(1);
  }
  const draft = draftFromOwed(person, nextNumber(), today());
  if (splits) {
    draft.notes = draft.notes ?? [];
    draft.notes.push(splitNote(splits));
  }
  emit(draft);
}
function cmdBadminton(customer) {
  const configured = settings.badmintonLedgerPath;
  const path = isAbsolute(configured) ? configured : resolve(vault, configured);
  let jobs;
  try {
    jobs = parseBadmintonLedger(readFileSync(path, "utf8"));
  } catch (e) {
    const msg = e instanceof LedgerUnavailable ? e.message : `could not read ${path}`;
    console.error(`! ${msg}`);
    process.exit(1);
  }
  const unpaid = jobs.filter(
    (j) => !j.paid && j.customer.toLowerCase() === customer.toLowerCase()
  );
  if (!unpaid.length) {
    console.error(
      jobs.length ? `! no unpaid jobs for "${customer}". Customers in the ledger: ${[
        ...new Set(jobs.map((j) => j.customer))
      ].join(", ")}` : "! the sales ledger has no sales in it yet \u2014 nothing to invoice"
    );
    process.exit(1);
  }
  emit(draftFromBadminton(customer, unpaid, nextNumber(), today(), settings));
}
switch (command) {
  case "list":
    cmdList();
    break;
  case "iou":
    if (!target) {
      console.error('! usage: node invoice.js iou "<name>" [--write]');
      process.exit(1);
    }
    cmdIou(target);
    break;
  case "badminton":
    if (!target) {
      console.error('! usage: node invoice.js badminton "<customer>" [--write]');
      process.exit(1);
    }
    cmdBadminton(target);
    break;
  case "index":
    rebuildIndex();
    console.log(`rebuilt ${join(invoiceFolder(), INDEX_NAME)}.md`);
    break;
  default:
    console.error(
      `unknown command "${command}"
  list | iou <name> | badminton <customer> | index
  flags: --write  --vault <path>`
    );
    process.exit(1);
}
