import { App, Modal, Notice, Setting, SuggestModal } from "obsidian";
import type { Currency, InvoiceDraft, InvoiceLine } from "./model";
import { cny, money, toNumber, usd } from "./model";

/** A generic "pick one of these" list. */
export class PickModal<T> extends SuggestModal<T> {
  constructor(
    app: App,
    private items: T[],
    private label: (item: T) => string,
    private sub: (item: T) => string,
    private onPick: (item: T) => void,
    placeholder: string,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getSuggestions(query: string): T[] {
    const q = query.toLowerCase();
    return this.items.filter((i) => this.label(i).toLowerCase().includes(q));
  }

  renderSuggestion(item: T, el: HTMLElement): void {
    el.createEl("div", { text: this.label(item) });
    const s = this.sub(item);
    if (s) el.createEl("small", { text: s, cls: "ssi-suggest-sub" });
  }

  onChooseSuggestion(item: T): void {
    this.onPick(item);
  }
}

/**
 * Last look before writing. Shows exactly what will be billed, including the
 * lines that carry no figure — the ones worth catching before sending.
 */
export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private draft: InvoiceDraft,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("ssi-modal");
    contentEl.createEl("h2", { text: `Invoice ${this.draft.number}` });
    contentEl.createEl("p", {
      text: `Bill to ${this.draft.billTo} · ${this.draft.lines.length} line${
        this.draft.lines.length === 1 ? "" : "s"
      }`,
      cls: "ssi-sub",
    });

    const table = contentEl.createEl("table", { cls: "ssi-preview" });
    const body = table.createEl("tbody");
    const head = body.createEl("tr");
    for (const h of ["Date", "What", this.draft.currency === "CNY" ? "¥" : "$"]) {
      head.createEl("th", { text: h });
    }
    let total = 0;
    let unpriced = 0;
    for (const l of this.draft.lines) {
      const amount = this.draft.currency === "CNY" ? l.amountCny : l.amountUsd;
      if (amount == null) unpriced++;
      else total += amount;
      const tr = body.createEl("tr");
      tr.createEl("td", { text: l.date ?? "—" });
      tr.createEl("td", { text: l.description });
      tr.createEl("td", {
        text: this.draft.currency === "CNY" ? cny(l.amountCny) : usd(l.amountUsd),
        cls: amount == null ? "ssi-num ssi-missing" : "ssi-num",
      });
    }
    const foot = body.createEl("tr", { cls: "ssi-total-row" });
    foot.createEl("td", { text: "" });
    foot.createEl("td", { text: "Amount due" });
    foot.createEl("td", {
      text: this.draft.currency === "CNY" ? `¥${money(total)}` : `$${money(total)}`,
      cls: "ssi-num",
    });

    if (unpriced) {
      const w = contentEl.createEl("div", { cls: "ssi-warning" });
      w.createEl("strong", {
        text: `${unpriced} line${unpriced === 1 ? "" : "s"} with no recorded amount. `,
      });
      w.appendText(
        "They go on the invoice as “—” and are left out of the total. Nothing is estimated.",
      );
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Create invoice")
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Hand-entered invoice for anything the vault does not track yet. */
export class BlankInvoiceModal extends Modal {
  private billTo = "";
  private currency: Currency = "USD";
  private lines: InvoiceLine[] = [{ description: "" }];

  constructor(
    app: App,
    private number: string,
    private onSubmit: (billTo: string, currency: Currency, lines: InvoiceLine[]) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("ssi-modal");
    contentEl.createEl("h2", { text: `New invoice ${this.number}` });

    // Containers are created up front so the currency dropdown's callback has
    // something to redraw into.
    const fieldsEl = contentEl.createEl("div");
    contentEl.createEl("h3", { text: "Lines" });
    const linesEl = contentEl.createEl("div");
    const buttonsEl = contentEl.createEl("div");

    new Setting(fieldsEl)
      .setName("Bill to")
      .setDesc("A plain name — it is linked as [[Name]], never duplicated as a note.")
      .addText((t) =>
        t.setPlaceholder("Jacky Miao").onChange((v) => {
          this.billTo = v.trim();
        }),
      );

    new Setting(fieldsEl).setName("Currency").addDropdown((d) =>
      d
        .addOption("USD", "USD ($)")
        .addOption("CNY", "CNY (¥)")
        .setValue(this.currency)
        .onChange((v) => {
          this.currency = v as Currency;
          this.drawLines(linesEl);
        }),
    );

    this.drawLines(linesEl);

    new Setting(buttonsEl)
      .addButton((b) =>
        b.setButtonText("Add line").onClick(() => {
          this.lines.push({ description: "" });
          this.drawLines(linesEl);
        }),
      )
      .addButton((b) =>
        b
          .setButtonText("Create invoice")
          .setCta()
          .onClick(() => {
            const kept = this.lines.filter((l) => l.description.trim());
            if (!this.billTo || !kept.length) {
              new Notice("An invoice needs a name and at least one described line.");
              return;
            }
            this.close();
            this.onSubmit(this.billTo, this.currency, kept);
          }),
      );
  }

  private drawLines(host: HTMLElement): void {
    host.empty();
    this.lines.forEach((line, i) => {
      const row = host.createEl("div", { cls: "ssi-line-row" });

      const date = row.createEl("input", { cls: "ssi-in ssi-in-date" });
      date.type = "date";
      date.value = line.date ?? "";
      date.addEventListener("change", () => {
        line.date = date.value || undefined;
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
      amt.placeholder = this.currency === "CNY" ? "¥ amount" : "$ amount";
      amt.value = String(
        (this.currency === "CNY" ? line.amountCny : line.amountUsd) ?? "",
      );
      amt.addEventListener("input", () => {
        const n = toNumber(amt.value);
        if (this.currency === "CNY") line.amountCny = n;
        else line.amountUsd = n;
      });

      const del = row.createEl("button", { text: "✕", cls: "ssi-del" });
      del.addEventListener("click", () => {
        this.lines.splice(i, 1);
        if (!this.lines.length) this.lines.push({ description: "" });
        this.drawLines(host);
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
