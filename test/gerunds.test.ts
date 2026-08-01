import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GERUNDS, MAX_GERUND_LEN, gerundAt } from '../src/gerunds';

describe('gerund word-bank', () => {
	it('is non-empty, unique, and every entry is an -ing gerund', () => {
		expect(GERUNDS.length).toBeGreaterThan(0);
		expect(new Set(GERUNDS).size).toBe(GERUNDS.length);
		expect(GERUNDS.every((w) => w.endsWith('ing'))).toBe(true);
	});

	it('gerundAt wraps for any integer step and returns a capitalized word', () => {
		expect(gerundAt(-1)).toBe(gerundAt(GERUNDS.length - 1));
		expect(gerundAt(GERUNDS.length)).toBe(gerundAt(0));
		const w = gerundAt(0);
		expect(w[0]).toBe(w[0]?.toUpperCase());
	});

	// The notice reserves a fixed-width slot for the rotating word so the trailing clock never
	// jitters. That width is hard-coded in styles.css (.microlite-gerund). If the bank grows a
	// longer word, the slot must grow too — this fails loudly rather than silently clipping.
	it('longest gerund still fits the reserved notice slot (word + ellipsis + 20% headroom)', () => {
		const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
		const slotCh = Number(/\.microlite-gerund\s*\{[^}]*?width:\s*(\d+(?:\.\d+)?)ch/s.exec(css)?.[1]);
		expect(Number.isFinite(slotCh)).toBe(true);
		// +1 char for the trailing ellipsis, then 20% headroom.
		expect(slotCh).toBeGreaterThanOrEqual((MAX_GERUND_LEN + 1) * 1.2);
	});
});
