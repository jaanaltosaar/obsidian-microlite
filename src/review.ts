/*
 * review.ts — PURE port of tools/hunking_obsidian.py's markdown renderer.
 *
 * No Obsidian imports: this module takes already-grouped File Recovery snapshots and
 * returns the LLM-ready weekly-review markdown. Keeping it Obsidian-free lets it run in
 * Node for parity tests against the Python "golden oracle" (see test/review.test.ts).
 *
 * Ported 1:1 from hunking_obsidian.py: sync_seconds, pair_volume, activity_table,
 * sync_summary, heading_aware_diff, render. Diffs use jsdiff (structuredPatch) instead of
 * Python difflib; hunk boundaries may differ slightly but +/- content is equivalent.
 */
import { structuredPatch } from 'diff';

/** One File Recovery snapshot. `ts` is epoch milliseconds. */
export interface Snapshot {
	ts: number;
	data: string;
}

export interface RenderOptions {
	/** "now" in epoch ms — drives the window cutoff and the generated stamp (injectable for tests). */
	now: number;
	/** Only the last N days (0 = all). */
	sinceDays: number;
	/** Context lines per hunk. */
	context?: number;
	/** One first→last diff per note (true) vs every consecutive pair (false). */
	net?: boolean;
	/** Notes whose newest version is under this many chars are shown in full instead of diffed. */
	fullBelow?: number;
	/** Distinct notes sharing one second ≥ this ⇒ treated as a bulk sync, excluded from metrics. */
	syncThreshold?: number;
	/** Include the per-day activity table + sync summary. */
	withMeta?: boolean;
	/** Paths that have snapshots but no longer exist in the vault — listed separately, not diffed. */
	deletedPaths?: Set<string>;
	/** Paths whose file was created within the window — genuinely new, so diffed against empty. */
	newPaths?: Set<string>;
}

/** path → snapshots sorted ascending by ts. */
export type SnapshotsByPath = Map<string, Snapshot[]>;

const HEADING = /^\s{0,3}#{1,6}\s/;
const DAY_MS = 86_400_000;

const p2 = (n: number): string => String(n).padStart(2, '0');

/** Local-time "YYYY-MM-DD HH:MM:SS" (matches Python iso(); tests pin TZ for determinism). */
function iso(ms: number): string {
	const d = new Date(ms);
	return (
		`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
		`${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
	);
}

function dateKey(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Python str.splitlines(): split on line boundaries, drop a single trailing newline's empty tail. */
function splitlines(s: string): string[] {
	if (s === '') return [];
	const parts = s.split(/\r\n|\r|\n/);
	if (parts.length > 0 && parts[parts.length - 1] === '' && /[\r\n]$/.test(s)) parts.pop();
	return parts;
}

const rstrip = (s: string): string => s.replace(/\s+$/, '');

/**
 * Collapse the differences editors/sync introduce without real authoring — trailing whitespace
 * per line, trailing blank lines, line-ending style, and Unicode form — so a genuine edit can be
 * told apart from an opened/auto-saved/synced note. Used only for change detection, never for the
 * rendered diff. (Opening a note can rewrite trailing whitespace on every line, which otherwise
 * shows as a full delete-then-readd of identical-looking text.)
 */
function normalizeForCompare(s: string): string {
	return s
		.normalize('NFC')
		.split(/\r\n|\r|\n/)
		.map((l) => l.replace(/[ \t]+$/, ''))
		.join('\n')
		.replace(/\n+$/, '');
}

/** Seconds where ≥ threshold distinct notes were captured — bulk sync, not live authoring. */
function syncSeconds(byPath: SnapshotsByPath, threshold: number): Set<number> {
	const bySec = new Map<number, Set<string>>();
	for (const [path, versions] of byPath) {
		for (const s of versions) {
			const sec = Math.floor(s.ts / 1000);
			let set = bySec.get(sec);
			if (!set) bySec.set(sec, (set = new Set()));
			set.add(path);
		}
	}
	const out = new Set<number>();
	for (const [sec, paths] of bySec) if (paths.size >= threshold) out.add(sec);
	return out;
}

/** [added chars, removed chars] between two texts (line-based, matches pair_volume). */
function pairVolume(a: string, b: string): [number, number] {
	const patch = structuredPatch('a', 'b', a, b, '', '', { context: 0 });
	let add = 0;
	let rem = 0;
	for (const h of patch.hunks) {
		for (const ln of h.lines) {
			if (ln.startsWith('+')) add += ln.length - 1;
			else if (ln.startsWith('-')) rem += ln.length - 1;
		}
	}
	return [add, rem];
}

interface Day {
	notes: Set<string>;
	edits: number;
	add: number;
	rem: number;
	hours: number[];
}

function activityTable(byPath: SnapshotsByPath, cutoffMs: number, syncSecs: Set<number>): string {
	const days = new Map<string, Day>();
	for (const versions of byPath.values()) {
		versions.forEach((s, i) => {
			if (s.ts < cutoffMs || syncSecs.has(Math.floor(s.ts / 1000))) return;
			const key = dateKey(s.ts);
			let d = days.get(key);
			if (!d) days.set(key, (d = { notes: new Set(), edits: 0, add: 0, rem: 0, hours: [] }));
			d.edits += 1;
			d.hours.push(new Date(s.ts).getHours());
			// note path lives on the outer entry; add it below via the Map key loop instead.
			if (i > 0) {
				const prev = versions[i - 1]!;
				const [a, r] = pairVolume(prev.data, s.data);
				d.add += a;
				d.rem += r;
			}
		});
	}
	// notes-per-day needs the path; recompute the note set in a second pass keyed by path.
	for (const [path, versions] of byPath) {
		for (const s of versions) {
			if (s.ts < cutoffMs || syncSecs.has(Math.floor(s.ts / 1000))) continue;
			days.get(dateKey(s.ts))!.notes.add(path);
		}
	}
	if (days.size === 0) return '## Activity by day\n\n_no live (non-sync) edits in window._\n';
	const rows = [
		'| Date | Notes | Edits | +chars | −chars | Active hrs | Late-night |',
		'|------|------:|------:|-------:|-------:|------------|:----------:|',
	];
	for (const date of [...days.keys()].sort()) {
		const d = days.get(date)!;
		const hrs = [...d.hours].sort((x, y) => x - y);
		const span = `${p2(hrs[0]!)}:00–${p2(hrs[hrs.length - 1]!)}:59`;
		const late = hrs.some((h) => h >= 0 && h < 6) ? '⚠️' : '';
		rows.push(
			`| ${date} | ${d.notes.size} | ${d.edits} | ${d.add} | ${d.rem} | ${span} | ${late} |`,
		);
	}
	return (
		'## Activity by day\n\n_(live edits only; bulk syncs excluded — see below)_\n\n' +
		rows.join('\n') +
		'\n'
	);
}

function syncSummary(byPath: SnapshotsByPath, cutoffMs: number, syncSecs: Set<number>): string {
	const bursts = new Map<number, Set<string>>();
	for (const [path, versions] of byPath) {
		for (const s of versions) {
			const sec = Math.floor(s.ts / 1000);
			if (s.ts >= cutoffMs && syncSecs.has(sec)) {
				let set = bursts.get(sec);
				if (!set) bursts.set(sec, (set = new Set()));
				set.add(path);
			}
		}
	}
	if (bursts.size === 0) return '';
	const lines = [...bursts.keys()]
		.sort((a, b) => a - b)
		.map((sec) => `- ${iso(sec * 1000).slice(0, 16)} — ${bursts.get(sec)!.size} notes captured together`);
	return (
		'## Sync events (bulk captures — excluded from metrics)\n\n' +
		'_These notes changed elsewhere and synced in at one timestamp; their diffs ' +
		'still appear below but their timing is not real-time activity._\n\n' +
		lines.join('\n') +
		'\n'
	);
}

/** difflib-style range: omit count when 1; empty range begins one line earlier. */
function fmtRange(start: number, len: number): string {
	if (len === 1) return `${start}`;
	if (len === 0) return `${start - 1},0`;
	return `${start},${len}`;
}

/** Unified diff annotated with the nearest Markdown heading on each @@ line. '' if no change. */
function headingAwareDiff(
	textA: string,
	textB: string,
	context: number,
	fromLabel: string,
	toLabel: string,
): string {
	const patch = structuredPatch(fromLabel, toLabel, textA, textB, '', '', { context });
	if (patch.hunks.length === 0) return '';
	const linesB = splitlines(textB);
	const out: string[] = [`--- ${fromLabel}`, `+++ ${toLabel}`];
	for (const h of patch.hunks) {
		let header = `@@ -${fmtRange(h.oldStart, h.oldLines)} +${fmtRange(h.newStart, h.newLines)} @@`;
		const start = Math.max(h.newStart - 1, 0);
		let heading = '';
		for (let i = Math.min(start, linesB.length - 1); i >= 0; i--) {
			if (HEADING.test(linesB[i]!)) {
				heading = linesB[i]!.trim();
				break;
			}
		}
		if (heading) header += ` ${heading}`;
		out.push(header);
		for (const ln of h.lines) {
			if (ln.startsWith('\\')) continue; // "\ No newline at end of file"
			out.push(ln);
		}
	}
	return out.join('\n');
}

/** Render the full LLM-ready weekly review. Mirrors hunking_obsidian.py render() (md format). */
export function renderReview(byPath: SnapshotsByPath, opts: RenderOptions): string {
	const context = opts.context ?? 3;
	const net = opts.net ?? true;
	const fullBelow = opts.fullBelow ?? 4000;
	const syncThreshold = opts.syncThreshold ?? 4;
	const withMeta = opts.withMeta ?? true;
	const cutoffMs = opts.sinceDays ? opts.now - opts.sinceDays * DAY_MS : 0;
	const syncSecs = syncSeconds(byPath, syncThreshold);

	const parts: string[] = [];
	let total = 0;
	for (const v of byPath.values()) total += v.length;
	parts.push(
		`# Hunking Obsidian\n\n_generated ${iso(opts.now)} · ${total} snapshots across ${byPath.size} notes_\n`,
	);
	if (withMeta) {
		parts.push(activityTable(byPath, cutoffMs, syncSecs));
		parts.push(syncSummary(byPath, cutoffMs, syncSecs));
	}

	const ranked = [...byPath.entries()]
		.filter(([, v]) => v[v.length - 1]!.ts >= cutoffMs)
		.sort((a, b) => b[1][b[1].length - 1]!.ts - a[1][a[1].length - 1]!.ts);

	const deleted = opts.deletedPaths ?? new Set<string>();
	const newPaths = opts.newPaths ?? new Set<string>();
	const deletedInWindow: string[] = [];

	for (const [path, versions] of ranked) {
		if (deleted.has(path)) {
			deletedInWindow.push(path); // collect for the bottom section; don't diff a gone note
			continue;
		}
		const inWin = versions.filter((s) => s.ts >= cutoffMs);
		let pre: Snapshot | null = null;
		for (let i = versions.length - 1; i >= 0; i--) {
			if (versions[i]!.ts < cutoffMs) {
				pre = versions[i]!;
				break;
			}
		}
		const head = inWin[inWin.length - 1]!;
		const meta = `\n## ${path}\n\n_${inWin.length} edit(s) in window · newest ${iso(head.ts)} · ${head.data.length} chars_\n`;

		if (head.data.length < fullBelow) {
			parts.push(meta);
			parts.push('_current content:_\n\n```markdown\n' + rstrip(head.data) + '\n```\n');
			continue;
		}

		// Baseline: the last pre-window snapshot if we have one; otherwise the earliest in-window
		// snapshot — UNLESS the file was created within the window (newPaths), in which case it is
		// genuinely new and we diff against empty so its whole body shows as additions. Opening,
		// auto-saving, or syncing an old note creates an in-window snapshot with no real change;
		// those resolve to an empty diff and are dropped below.
		const NEW = '(new file)';
		type Side = { label: string; data: string };
		const base: Side = pre
			? { label: iso(pre.ts), data: pre.data }
			: newPaths.has(path)
				? { label: NEW, data: '' }
				: { label: iso(inWin[0]!.ts), data: inWin[0]!.data };
		let spans: Array<[Side, Side]>;
		if (net) {
			spans = [[base, { label: iso(head.ts), data: head.data }]];
		} else {
			// walk consecutive snapshots, prefixed by the baseline (don't re-list the earliest
			// in-window snapshot when it already *is* the baseline).
			const tail = pre || newPaths.has(path) ? inWin : inWin.slice(1);
			const chain: Side[] = [base, ...tail.map((s) => ({ label: iso(s.ts), data: s.data }))];
			spans = chain.slice(0, -1).map((s, i) => [s, chain[i + 1]!]);
		}

		const body: string[] = [];
		let changed = false;
		for (const [from, to] of spans) {
			const diff = headingAwareDiff(from.data, to.data, context, from.label, to.label);
			// A change only counts if it survives whitespace/encoding normalization — a pure
			// whitespace rewrite (full delete + identical readd) is not a real edit.
			if (diff && normalizeForCompare(from.data) !== normalizeForCompare(to.data)) changed = true;
			body.push(`### ${from.label} → ${to.label}\n\n\`\`\`diff\n${diff || '(no textual change)'}\n\`\`\`\n`);
		}
		if (!changed) continue; // opened / auto-saved / synced but not actually edited → omit
		parts.push(meta, ...body);
	}

	if (deletedInWindow.length > 0) {
		parts.push(
			'\n## Deleted notes\n\n_Edited in the window but no longer in the vault (deleted or renamed)._\n\n' +
				deletedInWindow.map((p) => `- ${p}`).join('\n') +
				'\n',
		);
	}

	return parts.join('\n');
}

/**
 * Fold each note's *current on-disk* content in as the newest version.
 *
 * File Recovery snapshots lag the live file — a freshly created note often has only an empty
 * snapshot captured at creation, so the newest snapshot can be 0 chars while the file is full.
 * The current content is what the user actually wants to review, so we append it (matching what
 * kometenstaub/obsidian-version-history-diff does). Only augments notes that already have snapshot
 * history; skips when the content equals the newest snapshot (no real change since it was taken).
 */
export function mergeCurrentContent(
	byPath: SnapshotsByPath,
	currents: Map<string, { mtime: number; data: string }>,
): SnapshotsByPath {
	for (const [path, cur] of currents) {
		const versions = byPath.get(path);
		if (!versions || versions.length === 0) continue;
		const newest = versions[versions.length - 1]!;
		if (newest.data !== cur.data) {
			// Guard against clock/iCloud mtime skew so the live content always sorts last.
			versions.push({ ts: Math.max(cur.mtime, newest.ts + 1), data: cur.data });
		}
	}
	return byPath;
}

/**
 * True if a note path is one of Microlite's own generated outputs, so we never fold our own
 * review notes back into future hunks. Matches anything inside the configured output folder, plus
 * the generated `microlite-hunks-*.md` filename anywhere (covers a root output folder or a
 * renamed folder).
 */
export function isOwnOutput(path: string, outputFolder: string): boolean {
	const folder = outputFolder.replace(/^\/+|\/+$/g, '');
	if (folder && (path === folder || path.startsWith(`${folder}/`))) return true;
	const base = path.split('/').pop() ?? path;
	return /^microlite-hunks-.*\.md$/.test(base);
}

/** Group a flat list of File Recovery records into path → snapshots (asc by ts). */
export function groupByPath(records: Array<{ path: string; ts: number; data: string }>): SnapshotsByPath {
	const byPath: SnapshotsByPath = new Map();
	for (const r of records) {
		let arr = byPath.get(r.path);
		if (!arr) byPath.set(r.path, (arr = []));
		arr.push({ ts: r.ts, data: r.data });
	}
	for (const arr of byPath.values()) arr.sort((a, b) => a.ts - b.ts);
	return byPath;
}
