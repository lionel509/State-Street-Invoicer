import { App, PluginSettingTab, Setting } from "obsidian";
import type StateStreetInvoicer from "./main";

export type { InvoicerSettings } from "./settings-defaults";
export { DEFAULT_SETTINGS } from "./settings-defaults";

export class InvoicerSettingTab extends PluginSettingTab {
  plugin: StateStreetInvoicer;

  constructor(app: App, plugin: StateStreetInvoicer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "Who the invoice is from" });

    new Setting(containerEl)
      .setName("Name")
      .setDesc("Printed at the top of every invoice.")
      .addText((t) =>
        t
          .setPlaceholder("Your name")
          .setValue(this.plugin.settings.businessName)
          .onChange(async (v) => {
            this.plugin.settings.businessName = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Tagline")
      .setDesc("Optional second line — e.g. a venture name.")
      .addText((t) =>
        t
          .setPlaceholder("Your venture")
          .setValue(this.plugin.settings.businessTagline)
          .onChange(async (v) => {
            this.plugin.settings.businessTagline = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Contact")
      .setDesc("One per line — email, phone, handle.")
      .addTextArea((t) =>
        t.setValue(this.plugin.settings.contactLines).onChange(async (v) => {
          this.plugin.settings.contactLines = v;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Where invoices go" });

    new Setting(containerEl)
      .setName("Invoice folder")
      .setDesc("Vault-relative. Created on first use.")
      .addText((t) =>
        t
          .setPlaceholder("Invoices")
          .setValue(this.plugin.settings.invoiceFolder)
          .onChange(async (v) => {
            this.plugin.settings.invoiceFolder = v.trim() || "Invoices";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Number prefix")
      .setDesc("Numbers run PREFIX-YYYY-NNNN, counted per year from the folder.")
      .addText((t) =>
        t
          .setPlaceholder("INV")
          .setValue(this.plugin.settings.numberPrefix)
          .onChange(async (v) => {
            this.plugin.settings.numberPrefix = v.trim() || "INV";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Open the invoice after creating it")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openAfterCreate).onChange(async (v) => {
          this.plugin.settings.openAfterCreate = v;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Sources" });

    new Setting(containerEl)
      .setName("Applied Badminton sales ledger")
      .setDesc(
        "Absolute path, or relative to this vault's folder. Read-only — the plugin never writes to Berkshire.",
      )
      .addText((t) =>
        t
          .setPlaceholder("../Business/Sales Ledger.md")
          .setValue(this.plugin.settings.badmintonLedgerPath)
          .onChange(async (v) => {
            this.plugin.settings.badmintonLedgerPath = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Reconciliation note")
      .setDesc(
        "Linked from any line still awaiting a posted USD figure. Update it each statement period, or clear it to leave the link off.",
      )
      .addText((t) =>
        t
          .setPlaceholder("Card Reconciliation 2026-08")
          .setValue(this.plugin.settings.reconciliationNote)
          .onChange(async (v) => {
            this.plugin.settings.reconciliationNote = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Leave out items already marked paid")
      .setDesc(
        "An item note with a `paid_date` has been repaid and does not belong on a new invoice.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.excludePaidItems).onChange(async (v) => {
          this.plugin.settings.excludePaidItems = v;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Terms" });

    new Setting(containerEl)
      .setName("Payment terms")
      .setDesc("Printed under the total.")
      .addTextArea((t) =>
        t.setValue(this.plugin.settings.paymentTerms).onChange(async (v) => {
          this.plugin.settings.paymentTerms = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("How to pay")
      .setDesc("One per line — Zelle, Venmo, cash. Left off the invoice when empty.")
      .addTextArea((t) =>
        t.setValue(this.plugin.settings.paymentMethods).onChange(async (v) => {
          this.plugin.settings.paymentMethods = v;
          await this.plugin.saveSettings();
        }),
      );

    const note = containerEl.createEl("div", { cls: "ssi-settings-note" });
    note.createEl("strong", { text: "An invoice is a billing document, not a ledger. " });
    note.appendText(
      "Repayment is still recorded by setting `paid_date` on the item note and re-running build_ious.py — " +
        "this plugin never marks anything paid.",
    );
  }
}
