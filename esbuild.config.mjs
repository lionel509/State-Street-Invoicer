import esbuild from "esbuild";
import builtins from "builtin-modules";

// The plugin, loaded by Obsidian.
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Obsidian supplies these at runtime; bundling them would break the plugin.
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2022",
  platform: "node",
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
  outfile: "main.js",
  minify: false,
});

// The CLI, run by node. Same logic, no Obsidian — src/cli.ts imports only the
// pure modules, so nothing here should ever pull the API in. If that changes,
// this build fails loudly rather than shipping a broken script.
await esbuild.build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  external: [...builtins],
  format: "esm",
  target: "es2022",
  platform: "node",
  logLevel: "info",
  sourcemap: false,
  treeShaking: true,
  outfile: "invoice.mjs",
  minify: false,
});
