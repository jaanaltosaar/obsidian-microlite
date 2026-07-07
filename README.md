# Microlite Hunks

Turn Obsidian's **File Recovery** history into an LLM-ready weekly review of what you've actually
been writing — one tap, one note, ready to paste into a chat for interrogation.

Obsidian's File Recovery core plugin quietly snapshots your notes as you edit. Microlite Hunks
reads those snapshots, groups them by note, and renders a single markdown note —
`microlite-hunks-YYYY-MM-DD.md` — with a per-day activity table (edit volume, active hours,
context-switching), bulk-sync detection, and heading-aware diffs of what changed, newest first.

## Use it

1. Enable the **File recovery** core plugin (Settings → File recovery).
2. Enable Microlite Hunks.
3. Tap the ribbon icon (⟲) — or run **Generate hunks (last 1 / 7 / 30 days)** from the command
   palette. A dated review note opens; paste it into your LLM.

Settings let you change the default window, output folder, diff context, the full-content
threshold, and the bulk-sync threshold.

Works on **desktop and mobile** — it reads File Recovery in-process, no external tools required.

## Prefer no plugin? Use the script.

Everything the plugin does is also available as a standalone Python script in [`manual/`](manual/),
which reads File Recovery straight from disk and can also feed
[hunk](https://github.com/modem-dev/hunk) for an interactive terminal review. That script is the
**golden oracle** this plugin's renderer is tested against (`npm test`). See
[`manual/README.md`](manual/README.md).

## Develop

```sh
npm install
npm run dev     # rebuild on change → main.js
npm test        # parity vs the Python oracle + privacy guard
npm run build   # type-check + production bundle
```

To try it, symlink `manifest.json`, `main.js`, and `styles.css` into a **separate dev vault**'s
`.obsidian/plugins/microlite/` (never develop against your main vault).

### Privacy

No vault-derived data is ever committed. Committed test fixtures are entirely synthetic; a guard
test (`test/no-private-data.test.ts`) fails CI if anything else slips in. Real-vault output stays
gitignored.

## License

MIT
