import { Notice, Plugin, TFile, addIcon, normalizePath } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MicroliteHunksSettings,
	MicroliteHunksSettingTab,
} from './settings';
import { MICROLITE_ICON_ID, MICROLITE_ICON_SVG } from './icon';
import { readSnapshots } from './recovery';
import {
	groupByPath,
	isOwnOutput,
	mergeCurrentContent,
	normalizeForCompare,
	renderReview,
	resolveRenames,
	type SnapshotsByPath,
} from './review';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A selectable look-back window for a review. */
interface ReviewWindow {
	/** Stable command-id suffix (e.g. '6h', '7d') — keep constant so user hotkeys survive. */
	id: string;
	/** Human label used in the command name and progress notice (e.g. '6 hours'). */
	label: string;
	/** Window length in milliseconds. */
	ms: number;
}

/** Command-palette windows, coarsest-recent first. Fine-grained hours for same-day review, then days. */
const REVIEW_WINDOWS: ReviewWindow[] = [
	{ id: '1h', label: '1 hour', ms: HOUR_MS },
	{ id: '6h', label: '6 hours', ms: 6 * HOUR_MS },
	{ id: '12h', label: '12 hours', ms: 12 * HOUR_MS },
	{ id: '24h', label: '24 hours', ms: DAY_MS },
	{ id: '7d', label: '7 days', ms: 7 * DAY_MS },
	{ id: '30d', label: '30 days', ms: 30 * DAY_MS },
];

export default class MicroliteHunksPlugin extends Plugin {
	settings!: MicroliteHunksSettings;

	async onload() {
		await this.loadSettings();

		addIcon(MICROLITE_ICON_ID, MICROLITE_ICON_SVG);

		this.addRibbonIcon(MICROLITE_ICON_ID, 'Microlite: generate hunks', () => {
			void this.generate(this.defaultWindow());
		});

		for (const w of REVIEW_WINDOWS) {
			this.addCommand({
				id: `microlite-${w.id}`,
				name: `Generate hunks (last ${w.label})`,
				icon: MICROLITE_ICON_ID,
				callback: () => void this.generate(w),
			});
		}

		this.addSettingTab(new MicroliteHunksSettingTab(this.app, this));

		// Keep the "Excluded files" filter in sync with the current settings on every load, so a
		// fresh install (or a vault synced without its app.json) re-applies the exclusion.
		this.syncSearchExclusion();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MicroliteHunksSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** The window the ribbon button uses, honoring the configured default (in days). */
	private defaultWindow(): ReviewWindow {
		const days = this.settings.defaultDays;
		const match = REVIEW_WINDOWS.find((w) => w.ms === days * DAY_MS);
		return match ?? { id: `${days}d`, label: `${days} day${days === 1 ? '' : 's'}`, ms: days * DAY_MS };
	}

	/** Read File Recovery, render the review, write & open microlite-hunks-YYYY-MM-DD.md. */
	async generate(reviewWindow: ReviewWindow): Promise<void> {
		// Generation is often near-instant; keep the notice on screen for a pleasant minimum with a
		// live elapsed clock (the "deliberate delay" pattern) so it reads as real work, not a flicker.
		const MIN_VISIBLE_MS = 1200;
		const started = performance.now();
		const label = `Microlite: generating hunks (last ${reviewWindow.label})…`;
		const notice = new Notice(`${label} 0.0s`, 0);
		const clock = window.setInterval(() => {
			notice.setMessage(`${label} ${((performance.now() - started) / 1000).toFixed(1)}s`);
		}, 100);
		try {
			// Always exclude our own generated review notes so hunks never feed back on themselves.
			const records = (await readSnapshots(this.app)).filter(
				(r) => !isOwnOutput(r.path, this.settings.outputFolder),
			);
			if (records.length === 0) {
				window.clearInterval(clock);
				notice.setMessage('Microlite: no File Recovery snapshots found. Enable the File recovery core plugin.');
				window.setTimeout(() => notice.hide(), 6000);
				return;
			}

			const now = Date.now();
			const cutoffMs = now - reviewWindow.ms;

			const byPath = groupByPath(records);

			// Paths with snapshots but no live file: deleted, or renamed (snapshots stay under the
			// old path). Try to re-key the renamed ones onto their current name by content.
			const deletedPaths = new Set<string>();
			for (const path of byPath.keys()) {
				if (!(this.app.vault.getAbstractFileByPath(path) instanceof TFile)) deletedPaths.add(path);
			}
			await this.resolveRenamesByContent(byPath, deletedPaths);

			// Fold in the live on-disk content so lagging/empty snapshots don't hide a note's real
			// current state, and flag genuinely-new files (created within the window).
			const currents = new Map<string, { mtime: number; data: string }>();
			const newPaths = new Set<string>();
			for (const path of byPath.keys()) {
				const f = this.app.vault.getAbstractFileByPath(path);
				if (f instanceof TFile) {
					currents.set(path, { mtime: f.stat.mtime, data: await this.app.vault.cachedRead(f) });
					// Opening an old note also creates an in-window snapshot, but its ctime predates
					// the window, so only files actually created in the window count as new.
					if (f.stat.ctime >= cutoffMs) newPaths.add(path);
				}
			}
			mergeCurrentContent(byPath, currents);

			const md = renderReview(byPath, {
				now,
				sinceDays: reviewWindow.ms / DAY_MS,
				context: this.settings.context,
				net: true,
				fullBelow: this.settings.fullBelow,
				syncThreshold: this.settings.syncThreshold,
				withMeta: true,
				deletedPaths,
				newPaths,
			});

			const file = await this.writeNote(md);
			// The folder may have just been created by writeNote — make sure it's excluded.
			this.syncSearchExclusion();
			// Let the clock reach a comfortable minimum before dismissing.
			const remaining = MIN_VISIBLE_MS - (performance.now() - started);
			if (remaining > 0) await new Promise((r) => window.setTimeout(r, remaining));
			window.clearInterval(clock);
			notice.hide();
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			window.clearInterval(clock);
			console.error('Microlite Hunks: generation failed', err);
			notice.setMessage('Microlite: generation failed — see console for details.');
			window.setTimeout(() => notice.hide(), 6000);
		}
	}

	/** Detect renames: re-key missing paths' snapshots onto the live file that holds their content.
	 *  Reads only live files whose byte size matches a missing note's newest snapshot, to bound work
	 *  (and avoid materializing every iCloud file). */
	private async resolveRenamesByContent(byPath: SnapshotsByPath, deletedPaths: Set<string>): Promise<void> {
		if (deletedPaths.size === 0) return;
		const enc = new TextEncoder();
		const wantedSizes = new Set<number>();
		for (const p of deletedPaths) {
			const vs = byPath.get(p);
			if (vs && vs.length > 0) wantedSizes.add(enc.encode(vs[vs.length - 1]!.data).length);
		}
		const byContent = new Map<string, string>();
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (!wantedSizes.has(f.stat.size)) continue;
			byContent.set(normalizeForCompare(await this.app.vault.cachedRead(f)), f.path);
		}
		resolveRenames(byPath, deletedPaths, (content) => byContent.get(normalizeForCompare(content)) ?? null);
	}

	/**
	 * Reconcile Obsidian's "Excluded files" list (`userIgnoreFilters` in `.obsidian/app.json`) with
	 * our settings. This is the same list the UI at Settings → Files and links → "Excluded files"
	 * edits, so matching notes drop out of Search, Quick switcher, Graph, backlinks and link
	 * suggestions everywhere the native feature applies.
	 *
	 * We touch only the single filter we previously added (tracked in `appliedIgnoreFilter`), so the
	 * user's own filters are never removed. When the output folder is renamed or the feature is
	 * turned off, the stale entry is pulled out before the new one (if any) is added.
	 *
	 * `getConfig`/`setConfig` are stable-but-untyped internal APIs — the only way to reach this list
	 * programmatically — so we reach them through a narrow local interface rather than `any`.
	 */
	syncSearchExclusion(): void {
		const vault = this.app.vault as unknown as VaultConfigAccess;
		if (typeof vault.getConfig !== 'function' || typeof vault.setConfig !== 'function') return;

		const current = vault.getConfig('userIgnoreFilters');
		const filters = Array.isArray(current) ? current.filter((f): f is string => typeof f === 'string') : [];

		const previous = this.settings.appliedIgnoreFilter;
		const desired = this.settings.excludeFromSearch ? this.ignoreFilterFor(this.settings.outputFolder) : '';

		// Drop our previous entry (folder was renamed, or exclusion turned off), then add the new one.
		let next = previous ? filters.filter((f) => f !== previous) : filters.slice();
		if (desired && !next.includes(desired)) next.push(desired);

		if (previous !== desired || next.length !== filters.length) {
			vault.setConfig('userIgnoreFilters', next);
			this.settings.appliedIgnoreFilter = desired;
			void this.saveSettings();
		}
	}

	/**
	 * The `userIgnoreFilters` entry that excludes the output folder. A non-empty folder is stored as
	 * a plain path (exactly what the "Excluded files" UI writes for a folder). For a root output
	 * folder we can't exclude the whole vault, so we fall back to a regex — `/…/` form — that matches
	 * only our generated `microlite-hunks-*.md` filenames.
	 */
	private ignoreFilterFor(outputFolder: string): string {
		const folder = outputFolder.replace(/^\/+|\/+$/g, '');
		return folder ? folder : String.raw`/^microlite-hunks-.*\.md$/`;
	}

	/** Create (or overwrite same-day) the dated note in the configured folder. */
	private async writeNote(contents: string): Promise<TFile> {
		const d = new Date();
		const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		const folder = this.settings.outputFolder;
		const path = normalizePath(folder ? `${folder}/microlite-hunks-${stamp}.md` : `microlite-hunks-${stamp}.md`);

		if (folder) {
			const existing = this.app.vault.getAbstractFileByPath(folder);
			if (!existing) await this.app.vault.createFolder(folder).catch(() => {});
		}

		const abstract = this.app.vault.getAbstractFileByPath(path);
		if (abstract instanceof TFile) {
			await this.app.vault.modify(abstract, contents);
			return abstract;
		}
		return this.app.vault.create(path, contents);
	}
}

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * Narrow view of the two internal `Vault` methods that read and write `.obsidian/app.json`. They are
 * not in the public `obsidian` typings but have been stable for years and back the "Excluded files"
 * settings UI; declaring them locally keeps the access type-checked without an `any` cast.
 */
interface VaultConfigAccess {
	getConfig(key: string): unknown;
	setConfig(key: string, value: unknown): void;
}
