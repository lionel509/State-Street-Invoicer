/** Copy the built plugin into the vaults that bill people.
 *
 *  State Street is the home vault — the IOU pages and the Invoices/ folder live there.
 *  Berkshire gets it too so a stringing job can be invoiced from the venture side.
 *  Vanguard is deliberately absent and must stay that way — it is off-limits.
 */
import { copyFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

/** Override with OBSIDIAN_VAULT (parent folder) or OBSIDIAN_VAULTS
 *  (colon-separated list of vault paths, replacing the list entirely). */
const DOCS = process.env.OBSIDIAN_VAULT ?? "/Users/lionelweng/Documents";

const VAULTS = process.env.OBSIDIAN_VAULTS
  ? process.env.OBSIDIAN_VAULTS.split(":").filter(Boolean)
  : [
      `${DOCS}/State Street`,  // finances — IOU pages, Invoices/
      `${DOCS}/Berkshire`,     // business — Applied Badminton sales
    ];

for (const vault of VAULTS) {
  const target = join(vault, ".obsidian/plugins/state-street-invoicer");
  try {
    await access(join(vault, ".obsidian"));
  } catch {
    console.log(`skipped ${vault} — not an Obsidian vault`);
    continue;
  }
  await mkdir(target, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    await copyFile(file, join(target, file));
  }
  console.log(`installed -> ${target}`);
}

console.log("\nReload each vault, then enable 'State Street Invoicer' in Community Plugins.");
