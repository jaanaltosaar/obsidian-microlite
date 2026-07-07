import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Privacy guard (hard constraint): nothing vault-derived may ever be committed. This runs on
 * every `npm test` / CI push and fails if any tracked path looks like private data or if
 * test/fixtures/ contains anything other than the known synthetic files.
 */
function trackedFiles(): string[] {
	return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
}

const FORBIDDEN: Array<[RegExp, string]> = [
	[/(^|\/)test\/fixtures\/local\//, 'real-vault fixtures under test/fixtures/local/'],
	[/(^|\/)microlite-hunks-.*\.md$/, 'a generated review note'],
	[/\.local\./, 'a *.local.* file'],
];

const FIXTURE_ALLOWLIST = new Set(['test/fixtures/synthetic.json', 'test/fixtures/synthetic.expected.md']);

describe('privacy guard', () => {
	const files = trackedFiles();

	it('tracks no vault-derived / private paths', () => {
		const hits: string[] = [];
		for (const f of files) {
			for (const [re, why] of FORBIDDEN) if (re.test(f)) hits.push(`${f} (${why})`);
		}
		expect(hits, `Forbidden tracked files:\n${hits.join('\n')}`).toEqual([]);
	});

	it('only commits synthetic fixtures under test/fixtures/', () => {
		const stray = files.filter((f) => f.startsWith('test/fixtures/') && !FIXTURE_ALLOWLIST.has(f));
		expect(stray, `Unexpected files under test/fixtures/:\n${stray.join('\n')}`).toEqual([]);
	});
});
