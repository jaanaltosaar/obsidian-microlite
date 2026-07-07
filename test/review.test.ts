import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupByPath, renderReview } from '../src/review';

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
		expect(output).toMatch(/8 snapshots across 6 notes/);
	});

	it('excludes the bulk-sync second from the activity table but lists it under sync events', () => {
		// 2026-01-13 03:00 is a 4-note sync burst: no activity row, no late-night flag, but a sync entry.
		expect(output).not.toMatch(/\| 2026-01-13 \|/);
		expect(output).not.toContain('⚠️');
		expect(output).toContain('2026-01-13 03:00 — 4 notes captured together');
	});

	it('records live-edit metrics for the authored day', () => {
		expect(output).toMatch(/\| 2026-01-15 \| 1 \| 2 \| 185 \| 69 \| 10:00–11:59 \|/);
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

	it('shows short notes as full content instead of a diff', () => {
		expect(output).toContain('_current content:_\n\n```markdown\n# Quotes');
	});
});
