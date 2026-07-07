import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupByPath, isOwnOutput, mergeCurrentContent, renderReview } from '../src/review';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

interface Fixture {
	records: Array<{ path: string; ts: number; data: string }>;
}
const fx = JSON.parse(readFileSync(join(fixtures, 'synthetic.json'), 'utf8')) as Fixture;

// Same knobs the Python oracle used to produce synthetic.expected.md.
const OPTS = {
	now: 1768478400000, // 2026-01-15T12:00:00Z
	sinceDays: 7,
	context: 3,
	net: true,
	fullBelow: 200,
	syncThreshold: 4,
	withMeta: true,
	newPaths: new Set(['lorem-ipsum.md']), // the one fixture note created within the window
};

/** Collapse the two intentionally-non-deterministic bits so difflib and jsdiff can be compared:
 *  the generated wall-clock stamp, and the numeric ranges in @@ headers (hunk boundaries may
 *  differ between diff engines; the heading annotation after @@ is preserved). */
function normalize(md: string): string {
	return md
		.replace(/_generated [^·]*· /, '_generated · ')
		.replace(/^@@ -\S+ \+\S+ @@/gm, '@@');
}

describe('renderReview', () => {
	const output = renderReview(groupByPath(fx.records), OPTS);

	it('matches the Python golden-oracle output (semantic, range-normalized)', () => {
		const expected = readFileSync(join(fixtures, 'synthetic.expected.md'), 'utf8');
		expect(normalize(output)).toBe(normalize(expected));
	});

	it('reports the right corpus size in the header', () => {
		expect(output).toContain('_generated');
		expect(output).toMatch(/9 snapshots across 7 notes/);
	});

	it('excludes the bulk-sync second from the activity table but lists it under sync events', () => {
		// 2026-01-13 03:00 is a 4-note sync burst: no activity row, no late-night flag, but a sync entry.
		expect(output).not.toMatch(/\| 2026-01-13 \|/);
		expect(output).not.toContain('⚠️');
		expect(output).toContain('2026-01-13 03:00 — 4 notes captured together');
	});

	it('records live-edit metrics for the authored day', () => {
		expect(output).toMatch(/\| 2026-01-15 \| 2 \| 3 \| 185 \| 69 \| 09:00–11:59 \|/);
	});

	it('renders a brand-new note (no pre-window baseline) as an all-additions diff', () => {
		const idx = output.indexOf('## lorem-ipsum.md');
		expect(idx).toBeGreaterThan(-1);
		const section = output.slice(idx, output.indexOf('## quotes.md'));
		expect(section).toContain('## lorem-ipsum.md — 1 edit in window');
		expect(section).toContain('--- (new file)');
		expect(section).toContain('+++ 2026-01-15 09:00:00');
		expect(section).toContain('@@ -0,0 +1,5 @@ # Lorem ipsum');
		expect(section).toContain('+# Lorem ipsum');
		expect(section).not.toContain('single snapshot in window; no diff');
	});

	it('diffs the large note with a heading-annotated hunk, newest-first', () => {
		const journalIdx = output.indexOf('## journal.md');
		const quotesIdx = output.indexOf('## quotes.md');
		expect(journalIdx).toBeGreaterThan(-1);
		expect(journalIdx).toBeLessThan(quotesIdx); // journal edited most recently → ranked first
		expect(output).toContain('```diff');
		expect(output).toMatch(/@@ .*@@ # Journal/);
		expect(output).toContain('+Started the year strong, reading more and writing more than I expected.');
	});

	it('shows short notes as full content when fullBelow is set', () => {
		expect(output).toContain('_current content:_\n\n```markdown\n# Quotes');
	});
});

describe('mergeCurrentContent', () => {
	const NO_META = {
		now: 1768100000000,
		sinceDays: 0,
		context: 3,
		net: true,
		fullBelow: 0,
		syncThreshold: 4,
		withMeta: false,
	};

	it('surfaces a note whose only snapshot is empty as an all-additions diff (fixes 0-char notes)', () => {
		const byPath = groupByPath([{ path: 'new.md', ts: 1768000000000, data: '' }]);
		mergeCurrentContent(byPath, new Map([['new.md', { mtime: 1768000600000, data: '# New\n\nHello world.\n' }]]));
		expect(byPath.get('new.md')!.length).toBe(2);
		const md = renderReview(byPath, NO_META);
		expect(md).toContain('```diff');
		expect(md).toContain('+# New');
		expect(md).toContain('+Hello world.');
		expect(md).not.toContain('_current content:_');
	});

	it('does not add a duplicate version when current content equals the newest snapshot', () => {
		const byPath = groupByPath([{ path: 'same.md', ts: 1, data: 'x' }]);
		mergeCurrentContent(byPath, new Map([['same.md', { mtime: 2, data: 'x' }]]));
		expect(byPath.get('same.md')!.length).toBe(1);
	});

	it('ignores current content for notes without snapshot history', () => {
		const byPath = groupByPath([{ path: 'a.md', ts: 1, data: 'a' }]);
		mergeCurrentContent(byPath, new Map([['b.md', { mtime: 2, data: 'b' }]]));
		expect(byPath.has('b.md')).toBe(false);
	});
});

describe('deleted notes', () => {
	it('lists gone notes in a bottom section instead of diffing them', () => {
		const byPath = groupByPath([
			{ path: 'kept.md', ts: 1768000000000, data: '# Kept\n\none\ntwo\n' },
			{ path: 'kept.md', ts: 1768000600000, data: '# Kept\n\none\ntwo\nthree\n' },
			{ path: 'gone.md', ts: 1768000300000, data: 'orphaned snapshot' },
		]);
		const md = renderReview(byPath, {
			now: 1768100000000,
			sinceDays: 0,
			context: 3,
			net: true,
			fullBelow: 0,
			syncThreshold: 4,
			withMeta: false,
			deletedPaths: new Set(['gone.md']),
		});
		expect(md).toContain('## Deleted notes');
		expect(md).toContain('- gone.md');
		// the deleted note is not rendered as its own diff section
		expect(md).not.toContain('## gone.md');
		expect(md).not.toContain('orphaned snapshot');
		// kept note still diffs normally
		expect(md).toContain('## kept.md');
		expect(md).toContain('+three');
	});

	it('omits the section when nothing is deleted', () => {
		const byPath = groupByPath([{ path: 'a.md', ts: 1768000000000, data: 'x' }]);
		const md = renderReview(byPath, {
			now: 1768100000000,
			sinceDays: 0,
			context: 3,
			net: true,
			fullBelow: 0,
			syncThreshold: 4,
			withMeta: false,
		});
		expect(md).not.toContain('## Deleted notes');
	});
});

describe('isOwnOutput', () => {
	it('excludes notes inside the configured output folder', () => {
		expect(isOwnOutput('microlite/microlite-hunks-2026-07-06.md', 'microlite')).toBe(true);
		expect(isOwnOutput('microlite/anything.md', 'microlite')).toBe(true);
		expect(isOwnOutput('microlite', 'microlite')).toBe(true);
	});

	it('excludes generated notes at the vault root (empty output folder)', () => {
		expect(isOwnOutput('microlite-hunks-2026-07-06.md', '')).toBe(true);
	});

	it('does not exclude ordinary notes or prefix look-alikes', () => {
		expect(isOwnOutput('notes/journal.md', 'microlite')).toBe(false);
		expect(isOwnOutput('microlite-stuff/note.md', 'microlite')).toBe(false);
		expect(isOwnOutput('journal.md', '')).toBe(false);
	});
});

describe('opened-but-unchanged vs genuinely new', () => {
	const base = {
		now: 1768100000000,
		sinceDays: 0,
		context: 3,
		net: true,
		fullBelow: 0,
		syncThreshold: 4,
		withMeta: false,
	};

	it('omits an old note that was opened/synced but not edited (no pre, not new, no change)', () => {
		// One in-window snapshot, no pre-window baseline, not flagged new → baseline is that same
		// snapshot → empty diff → dropped. This is the therapy-file / opened-note case.
		const byPath = groupByPath([{ path: 'opened.md', ts: 1768000000000, data: '# Old\n\nunchanged\n' }]);
		const md = renderReview(byPath, base);
		expect(md).not.toContain('## opened.md');
	});

	it('diffs an old note against its earliest in-window snapshot when it really changed', () => {
		const byPath = groupByPath([
			{ path: 'edited.md', ts: 1768000000000, data: '# Old\n\none\n' },
			{ path: 'edited.md', ts: 1768000600000, data: '# Old\n\none\ntwo\n' },
		]);
		const md = renderReview(byPath, base);
		expect(md).toContain('## edited.md');
		expect(md).toContain('+two');
		expect(md).not.toContain('(new file)'); // old file → baseline is the earliest snapshot, not empty
	});

	it('omits a note whose only change is whitespace (opened/auto-saved rewrite)', () => {
		// Every line differs by trailing whitespace → a diff exists, but it is not a real edit.
		const byPath = groupByPath([
			{ path: 'ws.md', ts: 1768000000000, data: '# Note\n\nalpha  \nbeta\t\ngamma \n' },
			{ path: 'ws.md', ts: 1768000600000, data: '# Note\n\nalpha\nbeta\ngamma\n' },
		]);
		const md = renderReview(byPath, base);
		expect(md).not.toContain('## ws.md');
	});

	it('shows a genuinely new note (flagged in newPaths) as all-additions', () => {
		const byPath = groupByPath([{ path: 'fresh.md', ts: 1768000000000, data: '# Fresh\n\nbrand new\n' }]);
		const md = renderReview(byPath, { ...base, newPaths: new Set(['fresh.md']) });
		expect(md).toContain('## fresh.md — 1 edit in window');
		expect(md).toContain('--- (new file)');
		expect(md).toContain('+# Fresh');
	});
});
