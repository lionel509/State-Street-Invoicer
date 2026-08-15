/** Obsidian-side glue: get the vault's files in front of the pure readers in
 *  `items.ts` and `badminton.ts`. Everything here is read-only. */
import { App, FileSystemAdapter, normalizePath } from "obsidian";
import { isAbsolute, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { OwedItem, OwedPerson } from "./items";
import { groupOwed, isOwed, toOwedItem } from "./items";
import type { BadmintonJob } from "./badminton";
import { LedgerUnavailable, parseBadmintonLedger } from "./badminton";
import { nextNumberFrom } from "./index-note";
import type { InvoicerSettings } from "./settings-defaults";

// Every note under an `Items/` folder marked `attribution: owed` with a
// `for_whom` — the same query build_ious.py runs, on the same source.
export function scanOwedItems(app: App, settings: InvoicerSettings): OwedPerson[] {
  const items: OwedItem[] = [];

  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.includes("/Items/")) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm || !isOwed(fm)) continue;

    const item = toOwedItem(fm, file.basename);
    if (item.paidDate && settings.excludePaidItems) continue;
    items.push(item);
  }

  const iouPages = new Map<string, string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const m = file.basename.match(/^IOU — (.+)$/);
    if (m) iouPages.set(m[1], file.basename);
  }

  return groupOwed(items, iouPages);
}

/** Purchases marked `split` — a group buy, which this plugin must not bill. */
export function splitItemCount(app: App): number {
  let n = 0;
  for (const file of app.vault.getMarkdownFiles()) {
    if (!file.path.includes("/Items/")) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.attribution === "split") n++;
  }
  return n;
}

function resolveLedgerPath(app: App, configured: string): string {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new LedgerUnavailable(
      "Reading the Berkshire ledger needs the desktop app.",
    );
  }
  const p = configured.trim();
  if (!p) throw new LedgerUnavailable("No ledger path is set.");
  return isAbsolute(p) ? p : resolve(adapter.getBasePath(), p);
}

export function readBadmintonJobs(
  app: App,
  settings: InvoicerSettings,
): BadmintonJob[] {
  const path = resolveLedgerPath(app, settings.badmintonLedgerPath);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new LedgerUnavailable(`Could not read the ledger at ${path}`);
  }
  return parseBadmintonLedger(text);
}

export function nextInvoiceNumber(
  app: App,
  settings: InvoicerSettings,
  year: string,
): string {
  const folder = normalizePath(settings.invoiceFolder);
  const names = app.vault
    .getMarkdownFiles()
    .filter((f) => f.parent?.path === folder)
    .map((f) => f.basename);
  return nextNumberFrom(names, settings.numberPrefix, year);
}
