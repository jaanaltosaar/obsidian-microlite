# Microlite

Turn Obsidian's **File Recovery** history into an LLM-ready review of what you've actually been
writing — one tap, one note, ready to paste into a chat for interrogation.

## The idea

Obsidian can contain fluidal structure, with crystals called _microlites_ suspended in the flow of
molten lava.

Similarly, you can view your notes in the Obsidian note-taking app through the microscopic
modifications you make to them day to day, or week to week. These changes crystallize what is on
your mind, what you have been working on, and where you are headed next.

Most importantly, they focus a large language model's attention on what is most salient, rather than
overloading its finite context with entire files — most of which is irrelevant to what you care
about.

Each set of changes forms a _hunk_ (from "chunk"): the lines that changed in a file, plus some
surrounding "context" lines. With large language models such as ChatGPT or Claude, this is known as
_context engineering_.

It helps most when you have modified several files at once — some very small (only a few lines),
others very large (tens of thousands of lines, such as a journal kept over a year, or book
excerpts). Snapshots capture how your notes evolve over time, and they give a large language model a
read on your state of mind from the notes you have captured or modified.

## What it does

Obsidian's File Recovery core plugin quietly snapshots your notes as you edit. Microlite reads those
snapshots, groups them by note, and renders a single markdown note — `microlite-hunks-YYYY-MM-DD.md`
— with a per-day activity table (edit volume, active hours, context-switching), bulk-sync detection,
and heading-aware diffs of what changed, newest first. It shows renamed notes under their current
name, folds in each note's live content so fresh edits aren't hidden, and drops notes you only
opened but did not change.

## What it accesses

Microlite runs entirely on your device and makes **no network requests**. It reads File Recovery
snapshots and your notes' current content, and it writes one review note. It lists your Markdown
files for a single purpose — detecting renames — and matches a renamed note's snapshots to its
current file by content, reading a file only when its size matches a snapshot. Nothing leaves your
vault.

By default it also adds its output folder to Obsidian's **Excluded files** list (Settings → Files
and links) so the generated review notes stay out of Search, Quick switcher, Graph, and backlinks.
This edits only that one filter and never touches your own excludes; turn it off with the **Exclude
output folder from search** setting.

## Use it

1. Enable the **File recovery** core plugin (Settings → File recovery).
2. Enable Microlite.
3. Tap the Microlite ribbon icon — or run **Generate hunks (last 1 / 6 / 12 / 24 hours · 7 / 30 days)**
   from the command palette. A dated review note opens; paste it into your LLM.

Settings let you change the default window, output folder, diff context, the full-content threshold,
the bulk-sync threshold, and whether the output folder is excluded from search.

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
npm run dev            # rebuild on change → main.js
npm test               # parity vs the Python oracle + privacy guard
npm run build          # type-check + production bundle
npm run install:vault  # build, then copy into a test vault (path in gitignored .vault-path)
```

Point `.vault-path` (or the `OBSIDIAN_VAULT` env var) at a **separate dev vault** — never develop
against your main vault. Reload Obsidian to pick up a new build.

### Privacy

No vault-derived data is ever committed. Committed test fixtures are entirely synthetic; a guard
test (`test/no-private-data.test.ts`) fails CI if anything else slips in. Real-vault output stays
gitignored.

## Community catalog descriptions

Canonical copy for the [community.obsidian.md](https://obsidian.md/plugins) listing.

**Short description (community website)** — 152 / 200 characters:

> Turn a week of edits across all your notes into one LLM-ready review — like "track changes" for
> your whole vault, ready to paste into Claude or ChatGPT.

**Long description (community website)** — 783 / 1000 characters:

> Microlite reads Obsidian's File Recovery snapshots and writes one dated note that shows only the
> lines you changed this week: a per-day activity table, then heading-aware diffs, newest first. It
> handles the messy parts — bulk syncs, renamed notes, live content folded in, and notes you merely
> opened dropped.
>
> Hand that single note to Claude or ChatGPT instead of your whole vault. The model sees only what
> moved, so it connects ideas across notes on its own. Edit a project plan on Monday and a journal
> entry on Thursday, and the model surfaces the thread between them — no manual [[links]] needed.
> You skip the work of curating context and lower the cognitive load of writing, so insight arrives
> faster.
>
> No other tool does this today, apart from a cumbersome manual Python script.

## License

MIT
