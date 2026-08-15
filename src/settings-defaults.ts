/** Settings shape and defaults, kept free of the Obsidian API so the CLI can
 *  read the very same `data.json` the settings tab writes. Configure once in
 *  the UI, and the terminal honours it. */

export interface InvoicerSettings {
  /** Who the invoice is from. */
  businessName: string;
  businessTagline: string;
  contactLines: string;
  /** Vault-relative folder the invoice notes are written to. */
  invoiceFolder: string;
  numberPrefix: string;
  /** Path to Berkshire's sales ledger. Absolute, or relative to this vault. */
  badmintonLedgerPath: string;
  paymentTerms: string;
  paymentMethods: string;
  openAfterCreate: boolean;
  /** Skip IOU items that already carry a `paid_date`. */
  excludePaidItems: boolean;
  /** Note an unpriced line points at. Changes every statement period. */
  reconciliationNote: string;
}

/** Deliberately impersonal — everything that identifies a business is set in the
 *  settings tab and lives in the plugin's own `data.json`, never in the source. */
export const DEFAULT_SETTINGS: InvoicerSettings = {
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
  reconciliationNote: "",
};
