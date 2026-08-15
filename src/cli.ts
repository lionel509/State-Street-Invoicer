/** invoice.js — the same invoicer, driven from a terminal.
 *
 *  Why this exists: the plugin lives inside Obsidian, so it can only be run by
 *  a person clicking a command. Claude cannot click. Everything that decides
 *  what an invoice says is pure, though, so it runs just as well over the
 *  filesystem — and it reads the plugin's own `data.json`, so whatever is
 *  configured in the settings tab is what comes out here.
 *
 *    node invoice.js list
 *    node invoice.js iou "<name>"                # prints, writes nothing
 *    node invoice.js iou "<name>" --write
 *    node invoice.js badminton "<name>" --write
 *
 *  Dry run is the default. Writing takes --write, because an invoice number is
 *  a durable thing to spend.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { InvoiceDraft } from "./model";
import { money, safeFileName, totalsOf } from "./model";
import type { OwedItem } from "./items";
import {
  draftFromOwed,
  frontmatterOf,
  groupOwed,
  isOwed,
  splitNote,
  toOwedItem,
} from "./items";
import { LedgerUnavailable, draftFromBadminton, parseBadmintonLedger } from "./badminton";
import { renderInvoice } from "./render";
import {
  INDEX_NAME,
  buildIndexTable,
  indexSkeleton,
  nextNumberFrom,
  spliceIndex,
} from "./index-note";
import type { InvoicerSettings } from "./settings-defaults";
import { DEFAULT_SETTINGS } from "./settings-defaults";

/** Where to look when --vault is not given. Override with INVOICER_VAULT. */
const DEFAULT_VAULT =
  process.env.INVOICER_VAULT ?? "/Users/lionelweng/Documents/State Street";

/* --------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const has = (name: string) => argv.includes(`--${name}`);

const positional = argv.filter((a, i) => {
  if (a.startsWith("--")) return false;
  return !argv[i - 1]?.startsWith("--") || ["write", "help"].includes(argv[i - 1].slice(2));
});

const command = positional[0] ?? "list";
const target = positional[1];
const vault = flag("vault") ?? DEFAULT_VAULT;
const write = has("write");

/* ---------------------------------------------------------------- settings */

function loadSettings(): InvoicerSettings {
  const p = join(vault, ".obsidian/plugins/state-street-invoicer/data.json");
  if (!existsSync(p)) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    console.error(`! could not parse ${p} — falling back to defaults`);
    return { ...DEFAULT_SETTINGS };
  }
}

const settings = loadSettings();

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------------------------------------------ vault */

function markdownIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name);
}

/** `<vault>/*​/Items/*.md` — the same shape build_ious.py walks. */
function itemFiles(): { path: string; basename: string }[] {
  const out: { path: string; basename: string }[] = [];
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
  const owed: OwedItem[] = [];
  let splits = 0;
  for (const { path, basename } of itemFiles()) {
    const fm = frontmatterOf(readFileSync(path, "utf8"));
    if (fm.attribution === "split") splits++;
    if (!isOwed(fm)) continue;
    const item = toOwedItem(fm, basename);
    if (item.paidDate && settings.excludePaidItems) continue;
    owed.push(item);
  }

  const iouPages = new Map<string, string>();
  for (const name of markdownIn(join(vault, "IOUs"))) {
    const m = name.replace(/\.md$/, "").match(/^IOU — (.+)$/);
    if (m) iouPages.set(m[1], `IOU — ${m[1]}`);
  }

  return { people: groupOwed(owed, iouPages), splits };
}

function invoiceFolder(): string {
  const f = settings.invoiceFolder;
  return isAbsolute(f) ? f : resolve(vault, f);
}

function nextNumber(): string {
  const names = markdownIn(invoiceFolder()).map((n) => n.replace(/\.md$/, ""));
  return nextNumberFrom(names, settings.numberPrefix, today().slice(0, 4));
}

/* ------------------------------------------------------------------ output */

function emit(draft: InvoiceDraft): void {
  const text = renderInvoice(draft, settings);
  const t = totalsOf(draft);
  const amount =
    draft.currency === "CNY" ? `¥${money(t.cny)}` : `$${money(t.usdPriced)}`;

  if (!write) {
    console.log(text);
    console.error(
      `\n— dry run — ${draft.number} · ${draft.billTo} · ${amount}` +
        (t.linesUnpriced ? ` · ${t.linesUnpriced} line(s) unpriced` : "") +
        "\n  add --write to save it into the vault",
    );
    return;
  }

  const folder = invoiceFolder();
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${draft.number} — ${safeFileName(draft.billTo)}.md`);
  if (existsSync(file)) {
    console.error(`! ${file} already exists — nothing written`);
    process.exit(1);
  }
  writeFileSync(file, text, "utf8");
  rebuildIndex();
  console.log(
    `wrote ${file}\n  ${draft.billTo} · ${amount}` +
      (t.linesUnpriced ? ` · ${t.linesUnpriced} line(s) unpriced` : ""),
  );
}

function rebuildIndex(): void {
  const folder = invoiceFolder();
  const rows = markdownIn(folder)
    .map((n) => n.replace(/\.md$/, ""))
    .filter((b) => b !== INDEX_NAME)
    .map((basename) => ({
      basename,
      fm: frontmatterOf(readFileSync(join(folder, `${basename}.md`), "utf8")),
    }))
    .filter((r) => r.fm.type === "invoice")
    .sort((a, b) => b.basename.localeCompare(a.basename));

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

/* --------------------------------------------------------------- commands */

function cmdList(): void {
  const { people, splits } = readPeople();
  if (!people.length) {
    console.log("Nothing to invoice — no item note is marked `owed` with a `for_whom`.");
    return;
  }
  console.log(`Can invoice (vault: ${vault})\n`);
  console.log("person            items            ¥        USD priced");
  for (const p of people) {
    const t = totalsOf(draftFromOwed(p, "x", "x"));
    console.log(
      `${p.name.padEnd(16)} ${String(t.lines).padStart(5)} ${t.cny
        .toFixed(2)
        .padStart(12)} ${("$" + t.usdPriced.toFixed(2)).padStart(12)}` +
        (t.linesAwaitingUsd ? `  (${t.linesAwaitingUsd} awaiting USD)` : ""),
    );
  }
  if (splits) {
    console.log(
      `\n${splits} item(s) marked \`split\` are excluded — group buys are hand-maintained.`,
    );
  }
  console.log(`\nnext invoice number: ${nextNumber()}`);
}

function cmdIou(name: string): void {
  const { people, splits } = readPeople();
  const person =
    people.find((p) => p.name.toLowerCase() === name.toLowerCase()) ??
    people.find((p) => p.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!person) {
    console.error(
      `! no one owing called "${name}". Known: ${people.map((p) => p.name).join(", ")}`,
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

function cmdBadminton(customer: string): void {
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
    (j) => !j.paid && j.customer.toLowerCase() === customer.toLowerCase(),
  );
  if (!unpaid.length) {
    console.error(
      jobs.length
        ? `! no unpaid jobs for "${customer}". Customers in the ledger: ${[
            ...new Set(jobs.map((j) => j.customer)),
          ].join(", ")}`
        : "! the sales ledger has no sales in it yet — nothing to invoice",
    );
    process.exit(1);
  }
  emit(draftFromBadminton(customer, unpaid, nextNumber(), today(), settings));
}

/* ------------------------------------------------------------------- main */

switch (command) {
  case "list":
    cmdList();
    break;
  case "iou":
    if (!target) {
      console.error("! usage: node invoice.js iou \"<name>\" [--write]");
      process.exit(1);
    }
    cmdIou(target);
    break;
  case "badminton":
    if (!target) {
      console.error("! usage: node invoice.js badminton \"<customer>\" [--write]");
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
      `unknown command "${command}"\n` +
        "  list | iou <name> | badminton <customer> | index\n" +
        "  flags: --write  --vault <path>",
    );
    process.exit(1);
}
