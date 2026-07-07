import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MicroliteHunksSettings,
	MicroliteHunksSettingTab,
} from './settings';
import { readSnapshots } from './recovery';
import { groupByPath, mergeCurrentContent, renderReview } from './review';

export default class MicroliteHunksPlugin extends Plugin {
	settings!: MicroliteHunksSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('history', 'Microlite: generate hunks', () => {
			void this.generate(this.settings.defaultDays);
		});

		for (const days of [1, 7, 30]) {
			this.addCommand({
				id: `microlite-${days}d`,
				name: `Generate hunks (last ${days} day${days === 1 ? '' : 's'})`,
				callback: () => void this.generate(days),
			});
		}

		this.addSettingTab(new MicroliteHunksSettingTab(this.app, this));
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

	/** Read File Recovery, render the review, write & open microlite-hunks-YYYY-MM-DD.md. */
	async generate(days: number): Promise<void> {
		const notice = new Notice(`Microlite: generating hunks (last ${days}d)…`, 0);
		try {
			const records = await readSnapshots(this.app);
			if (records.length === 0) {
				notice.setMessage('Microlite: no File Recovery snapshots found. Enable the File recovery core plugin.');
				window.setTimeout(() => notice.hide(), 6000);
				return;
			}

			const byPath = groupByPath(records);
			// Fold in the live on-disk content so lagging/empty snapshots don't hide a note's
			// real current state (e.g. a note created today whose only snapshot is empty).
			const currents = new Map<string, { mtime: number; data: string }>();
			for (const path of byPath.keys()) {
				const f = this.app.vault.getAbstractFileByPath(path);
				if (f instanceof TFile) {
					currents.set(path, { mtime: f.stat.mtime, data: await this.app.vault.cachedRead(f) });
				}
			}
			mergeCurrentContent(byPath, currents);

			const md = renderReview(byPath, {
				now: Date.now(),
				sinceDays: days,
				context: this.settings.context,
				net: true,
				fullBelow: this.settings.fullBelow,
				syncThreshold: this.settings.syncThreshold,
				withMeta: true,
			});

			const file = await this.writeNote(md);
			notice.hide();
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			console.error('Microlite Hunks: generation failed', err);
			notice.setMessage('Microlite: generation failed — see console for details.');
			window.setTimeout(() => notice.hide(), 6000);
		}
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
