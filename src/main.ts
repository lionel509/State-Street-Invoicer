import { Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import type { Currency, InvoiceDraft, InvoiceLine } from "./model";
import { money, safeFileName, totalsOf } from "./model";
import { renderInvoice } from "./render";
import type { OwedPerson } from "./items";
import { draftFromOwed, frontmatterOf, splitNote } from "./items";
import type { BadmintonJob } from "./badminton";
import { LedgerUnavailable, draftFromBadminton } from "./badminton";
import {
  INDEX_NAME,
  buildIndexTable,
  indexSkeleton,
  spliceIndex,
} from "./index-note";
import {
  nextInvoiceNumber,
  readBadmintonJobs,
  scanOwedItems,
  splitItemCount,
} from "./sources";
import { BlankInvoiceModal, ConfirmModal, PickModal } from "./modals";
import type { InvoicerSettings } from "./settings-defaults";
import { DEFAULT_SETTINGS } from "./settings-defaults";
import { InvoicerSettingTab } from "./settings";

export default class StateStreetInvoicer extends Plugin {
  settings: InvoicerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("receipt", "New invoice", () => this.invoiceFromIou());

    this.addCommand({
      id: "invoice-from-iou",
      name: "New invoice from an IOU",
      callback: () => this.invoiceFromIou(),
    });

    this.addCommand({
      id: "invoice-from-badminton",
      name: "New invoice from an Applied Badminton job",
      callback: () => this.invoiceFromBadminton(),
    });

    this.addCommand({
      id: "invoice-blank",
      name: "New blank invoice",
      callback: () => this.invoiceBlank(),
    });

    this.addCommand({
      id: "rebuild-invoice-index",
      name: "Rebuild the Invoices index",
      callback: async () => {
        const n = await this.rebuildIndex();
        new Notice(`Invoices index rebuilt — ${n} invoice${n === 1 ? "" : "s"}.`);
      },
    });

    this.addSettingTab(new InvoicerSettingTab(this.app, this));
  }

  /* ------------------------------------------------------------- sources */

  private invoiceFromIou(): void {
    const people = scanOwedItems(this.app, this.settings);
    if (!people.length) {
      new Notice(
        "Nothing to invoice — no item note is marked `attribution: owed` with a `for_whom`.",
      );
      return;
    }

    const splits = splitItemCount(this.app);

    new PickModal<OwedPerson>(
      this.app,
      people,
      (p) => p.name,
      (p) => {
        const cnyTotal = p.items.reduce((s, i) => s + (i.line.amountCny ?? 0), 0);
        const usdTotal = p.items.reduce((s, i) => s + (i.line.amountUsd ?? 0), 0);
        const bits = [`${p.items.length} item${p.items.length === 1 ? "" : "s"}`];
        if (cnyTotal) bits.push(`¥${money(cnyTotal)}`);
        if (usdTotal) bits.push(`$${money(usdTotal)} priced`);
        return bits.join(" · ");
      },
      (person) => {
        const draft = draftFromOwed(person, this.nextNumber(), this.today());
        if (splits) {
          draft.notes = draft.notes ?? [];
          draft.notes.push(splitNote(splits));
        }
        this.confirmAndWrite(draft);
      },
      "Who is this invoice for?",
    ).open();
  }

  private invoiceFromBadminton(): void {
    let jobs: BadmintonJob[];
    try {
      jobs = readBadmintonJobs(this.app, this.settings);
    } catch (e) {
      const msg = e instanceof LedgerUnavailable ? e.message : String(e);
      new Notice(`Applied Badminton: ${msg}`, 8000);
      return;
    }

    const unpaid = jobs.filter((j) => !j.paid);
    if (!unpaid.length) {
      new Notice(
        jobs.length
          ? `All ${jobs.length} job${jobs.length === 1 ? " is" : "s are"} already marked paid in the sales ledger.`
          : "The sales ledger has no sales in it yet — nothing to invoice.",
        7000,
      );
      return;
    }

    const byCustomer = new Map<string, BadmintonJob[]>();
    for (const j of unpaid) {
      const list = byCustomer.get(j.customer) ?? [];
      list.push(j);
      byCustomer.set(j.customer, list);
    }
    const customers = [...byCustomer.keys()].sort((a, b) => a.localeCompare(b));

    new PickModal<string>(
      this.app,
      customers,
      (c) => c,
      (c) => {
        const list = byCustomer.get(c) ?? [];
        const total = list.reduce((s, j) => s + (j.totalUsd ?? 0), 0);
        return `${list.length} unpaid job${list.length === 1 ? "" : "s"} · $${money(total)}`;
      },
      (customer) => {
        const draft = draftFromBadminton(
          customer,
          byCustomer.get(customer) ?? [],
          this.nextNumber(),
          this.today(),
          this.settings,
        );
        this.confirmAndWrite(draft);
      },
      "Which customer?",
    ).open();
  }

  private invoiceBlank(): void {
    const number = this.nextNumber();
    new BlankInvoiceModal(
      this.app,
      number,
      (billTo: string, currency: Currency, lines: InvoiceLine[]) => {
        const draft: InvoiceDraft = {
          number,
          date: this.today(),
          billTo,
          source: "blank",
          currency,
          lines,
          settleWhen: this.settings.paymentTerms || undefined,
        };
        this.confirmAndWrite(draft);
      },
    ).open();
  }

  /* --------------------------------------------------------------- write */

  private confirmAndWrite(draft: InvoiceDraft): void {
    new ConfirmModal(this.app, draft, () => void this.write(draft)).open();
  }

  private async write(draft: InvoiceDraft): Promise<void> {
    const folder = normalizePath(this.settings.invoiceFolder);
    await this.ensureFolder(folder);

    const path = normalizePath(
      `${folder}/${draft.number} — ${safeFileName(draft.billTo)}.md`,
    );
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`${path} already exists — nothing written.`, 7000);
      return;
    }

    const file = await this.app.vault.create(
      path,
      renderInvoice(draft, this.settings),
    );
    await this.rebuildIndex();

    const t = totalsOf(draft);
    const amount =
      draft.currency === "CNY" ? `¥${money(t.cny)}` : `$${money(t.usdPriced)}`;
    new Notice(
      `${draft.number} — ${draft.billTo} · ${amount}` +
        (t.linesUnpriced ? ` · ${t.linesUnpriced} line(s) unpriced` : ""),
      6000,
    );

    if (this.settings.openAfterCreate) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    if (existing) throw new Error(`${path} exists and is not a folder`);
    await this.app.vault.createFolder(path);
  }

  /* --------------------------------------------------------------- index */

  /** Keeps every invoice linked from one page — no orphans in the graph. */
  private async rebuildIndex(): Promise<number> {
    const folder = normalizePath(this.settings.invoiceFolder);
    const rows: { basename: string; fm: Record<string, string | undefined> }[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.parent?.path !== folder) continue;
      if (file.basename === INDEX_NAME) continue;
      // Read the file rather than the metadata cache: an invoice written a
      // moment ago has not necessarily been indexed yet, and it would go
      // missing from its own index.
      const fm = frontmatterOf(await this.app.vault.cachedRead(file));
      if (fm.type !== "invoice") continue;
      rows.push({ basename: file.basename, fm });
    }
    rows.sort((a, b) => b.basename.localeCompare(a.basename));

    const table = buildIndexTable(rows);
    await this.ensureFolder(folder);
    const indexPath = normalizePath(`${folder}/${INDEX_NAME}.md`);
    const existing = this.app.vault.getAbstractFileByPath(indexPath);

    if (existing instanceof TFile) {
      const text = await this.app.vault.read(existing);
      const next = spliceIndex(text, table);
      if (next !== text) await this.app.vault.modify(existing, next);
    } else {
      await this.app.vault.create(indexPath, indexSkeleton(table));
    }
    return rows.length;
  }

  /* ------------------------------------------------------------- helpers */

  private nextNumber(): string {
    return nextInvoiceNumber(this.app, this.settings, this.today().slice(0, 4));
  }

  /** Local ISO date — the vault dates everything YYYY-MM-DD. */
  private today(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
