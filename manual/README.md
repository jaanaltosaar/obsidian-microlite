# Manual usage (no plugin required)

The Obsidian plugin at the repo root is just a convenient button. Everything it does, you can
do yourself with the `hunking_obsidian.py` script here — it reads Obsidian's **File Recovery**
snapshots straight from disk and writes unified diffs. This script is also the **golden oracle**
the plugin's TypeScript port is tested against.

**Requires:** macOS, Obsidian with File Recovery enabled (Settings → File recovery),
Python 3.10+, [uv](https://docs.astral.sh/uv/). Works while Obsidian is open.

## Generate a markdown review (paste into an LLM)

```sh
./hunking_obsidian.py --since 7 --net --out week.md
# or:  just review week.md 7
```

Then attach `week.md` to your LLM with a prompt like:

> Take the attached diff hunks from my Obsidian vault. Summarize what has been on my mind this
> past week, any reliable psychometrics you can glean (edit volume, active hours, context
> switching across notes), and a list of open loops that look unresolved or stalled.

## Review the hunks in `hunk`

[`hunk`](https://github.com/modem-dev/hunk) is a review-first terminal diff viewer. The script
emits a git-style patch you can pipe straight in — no version control needed:

```sh
./hunking_obsidian.py --since 7 --format patch --out - | hunk patch -
# or:  just view 7
```

## Useful flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--since N` | 0 (all) | Last N days. File Recovery keeps ~7 days by default. |
| `--net` | off | One first→last diff per note (implicit for `--format patch`). |
| `--format` | md | `md` (review), `json` (data), `patch` (for hunk). |
| `--full-below N` | 4000 | Notes under N chars are shown in full instead of diffed. |
| `--context N` | 3 | Context lines per hunk. |
| `--sync-threshold N` | 4 | Notes sharing one timestamp ≥ N ⇒ bulk sync, excluded from metrics. |

Run `./hunking_obsidian.py --help` for the rest.
