# State Street Invoicer

An Obsidian plugin that turns what a finance vault already records into an invoice note —
an IOU page, a sales-ledger job, or a hand-entered one — and styles it so Obsidian's own
**Export to PDF** produces something sendable.

If your ledger already knows what someone owes, turning that into a document you can send
them shouldn't be a copy-paste job.

## The rule the whole plugin is built around

**Nothing is invented, and priced is not paid.**

It would be very easy to write an invoicer that quietly breaks both, so they're enforced
in code rather than trusted to a convention:

| The temptation | What it does instead |
|---|---|
| A line has a foreign-currency amount but no posted home-currency figure → convert it | Bills in the original currency, leaves the other as `—`, and prints a callout saying the statement hasn't landed |
| A line has no amount anywhere → estimate it, or drop it | Renders `—`, **excludes it from the total**, and warns on the invoice and in the confirm dialog that the total isn't the full bill |
| A line has a figure, so it looks settled → mark it paid | Every invoice is issued `status: unpaid`. The plugin never writes a `paid_date` |
| A group buy is money owed → bill it | Items marked as a split are **skipped by design**, with a note saying why. Billing one person for a whole group buy is the bug this avoids |
| Sum the sticker prices | Bills the **charged** amount — sticker plus handling fee |

The confirm dialog exists for the same reason: it shows the lines, and flags the unpriced
ones, *before* a file is written.

## Where the numbers come from

**Item notes, not summary pages.** Summary IOU pages tend to be generated from item notes
in the first place, so reading them would be reading a copy. The plugin scans
`*/Items/*.md` for `attribution: owed` plus `for_whom` and pulls `date`, `what_is_it`,
`sticker_price_cny`, `handling_fee_cny`, `amount_cny`, `amount_usd`, `receipt` and
`settle_when`. Items carrying a `paid_date` drop out.

**A sales ledger in another vault** is read from disk with `node:fs` — hence
`isDesktopOnly: true` — and never written to. The `## Sales` table is parsed by *header
name*, not column position, so adding a column doesn't silently shift every amount one to
the left. Placeholder and totals rows are skipped, `[[wikilink]]` customers resolve to
their canonical name, paid rows are filtered out, and owner rows are flagged.

**Blank invoices** are a small form for anything the vault doesn't track yet.

## What it writes

A normal note — `Invoices/INV-2026-0001 — Name.md` — searchable, backlinked, and carrying
`cssclasses: invoice-note` so `styles.css` gives it a real invoice layout in reading view
and in print. `Invoices/Invoices.md` is an index rebuilt on every write between
`INVOICE-TABLE` markers, so no invoice is ever an orphan.

Numbering is `PREFIX-YYYY-NNNN`, counted per year from what the folder already holds.

## Commands

| Command | Does |
|---|---|
| New invoice from an IOU | Person picker → confirm → note |
| New invoice from a stringing job | Customer picker over **unpaid** ledger rows |
| New blank invoice | Hand-entered lines |
| Rebuild the Invoices index | Re-reads the folder |

Settings cover the from-block and contact lines, the invoice folder, the number prefix,
the sales-ledger path, payment terms and methods, and the reconciliation note that an
unpriced line points at. That last one changes every statement period, which is exactly
why it's a setting and not a string in the source.

Defaults ship blank. Everything identifying a business is configured in the settings tab
and lives in the plugin's own `data.json`.

## Two front doors, one implementation

An Obsidian plugin can only be run by a person clicking a command. So everything that
decides what an invoice *says* lives in modules that never import the Obsidian API, and
there's a second entry point over the top of them:

```bash
node invoice.mjs list                      # who can be invoiced, and the next number
node invoice.mjs iou "<name>"              # prints the invoice, writes nothing
node invoice.mjs iou "<name>" --write      # saves it and rebuilds the index
node invoice.mjs badminton "<name>" --write
node invoice.mjs index                     # rebuild the index alone
```

**Dry run is the default** — writing takes `--write`, because an invoice number is a
durable thing to spend. Point it at a vault with `--vault <path>` or the
`INVOICER_VAULT` environment variable.

The CLI reads the plugin's own `data.json` from
`.obsidian/plugins/state-street-invoicer/`, so whatever is configured in the settings tab
is what comes out of the terminal. One set of rules, one renderer, two ways in.

`esbuild.config.mjs` builds the CLI with no `obsidian` external, so if a pure module ever
picks up an Obsidian import the build fails loudly rather than shipping something broken.

## Build and install

```bash
npm ci
OBSIDIAN_VAULT=/path/to/vaults npm run install-local
```

`install.mjs` copies the build into each vault it knows about; override the parent folder
with `OBSIDIAN_VAULT`, or replace the list entirely with `OBSIDIAN_VAULTS`, a
colon-separated set of vault paths.

```
src/
  main.ts               plugin: commands, ribbon, writing the note
  sources.ts            Obsidian glue — vault files into the pure readers
  modals.ts             picker, confirm, blank-invoice form
  settings.ts           settings tab
  cli.ts                the terminal front door
  ── pure, no Obsidian API ──
  items.ts              item-note frontmatter → lines → per-person drafts
  badminton.ts          the `## Sales` ledger parser
  render.ts             draft → markdown
  index-note.ts         the Invoices index table and numbering
  model.ts              types, totals, money formatting
  settings-defaults.ts  shape and defaults, shared with the CLI
```

## Known gaps

- Hand-maintained splits are excluded on purpose. Invoicing one seat of a split needs a
  different reader — that maths tends to live in prose, not frontmatter.
- The item-note schema it reads is the author's own. The pure modules are the place to
  adapt it.

## License

MIT
