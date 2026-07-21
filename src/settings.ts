import { App, PluginSettingTab, Setting } from 'obsidian';
import type MicroliteHunksPlugin from './main';

export interface MicroliteHunksSettings {
	/** Default window (days) used by the ribbon button. */
	defaultDays: number;
	/** Vault-relative folder for generated notes ('' = vault root). */
	outputFolder: string;
	/** Context lines per diff hunk. */
	context: number;
	/** Notes whose newest version is under this many chars are shown in full instead of diffed. */
	fullBelow: number;
	/** Distinct notes sharing one second ≥ this ⇒ treated as a bulk sync, excluded from metrics. */
	syncThreshold: number;
	/** Keep the output folder in Obsidian's "Excluded files" so review notes stay out of search. */
	excludeFromSearch: boolean;
	/**
	 * The exact filter string we last wrote into `userIgnoreFilters`. Lets us remove only our own
	 * entry (never the user's) when the output folder is renamed or the toggle is turned off.
	 * Internal bookkeeping — not shown in the settings UI.
	 */
	appliedIgnoreFilter: string;
}

export const DEFAULT_SETTINGS: MicroliteHunksSettings = {
	defaultDays: 7,
	outputFolder: 'microlite',
	context: 3,
	fullBelow: 0,
	syncThreshold: 4,
	excludeFromSearch: true,
	appliedIgnoreFilter: '',
};

function intSetting(
	containerEl: HTMLElement,
	name: string,
	desc: string,
	get: () => number,
	set: (n: number) => Promise<void>,
	min: number,
): void {
	new Setting(containerEl)
		.setName(name)
		.setDesc(desc)
		.addText((text) =>
			text.setValue(String(get())).onChange(async (value) => {
				const n = Number.parseInt(value, 10);
				if (Number.isFinite(n) && n >= min) await set(n);
			}),
		);
}

export class MicroliteHunksSettingTab extends PluginSettingTab {
	plugin: MicroliteHunksPlugin;

	constructor(app: App, plugin: MicroliteHunksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		intSetting(
			containerEl,
			'Default window (days)',
			'How many days back the ribbon button includes.',
			() => s.defaultDays,
			async (n) => {
				s.defaultDays = n;
				await save();
			},
			1,
		);

		new Setting(containerEl)
			.setName('Output folder')
			.setDesc('Vault-relative folder for the generated note. Leave blank for the vault root.')
			.addText((text) =>
				text
					.setPlaceholder('Vault root')
					.setValue(s.outputFolder)
					.onChange(async (value) => {
						s.outputFolder = value.trim().replace(/^\/+|\/+$/g, '');
						await save();
						// Move the "Excluded files" filter from the old folder onto the new one.
						this.plugin.syncSearchExclusion();
					}),
			);

		new Setting(containerEl)
			.setName('Exclude output folder from search')
			.setDesc(
				'Add the output folder to Obsidian’s "Excluded files" (Settings → Files and links) so ' +
					'generated review notes stay out of Search, Quick switcher, Graph and backlinks. ' +
					'Note: files still surface when you search with an explicit path: or file: qualifier.',
			)
			.addToggle((toggle) =>
				toggle.setValue(s.excludeFromSearch).onChange(async (value) => {
					s.excludeFromSearch = value;
					await save();
					this.plugin.syncSearchExclusion();
				}),
			);

		intSetting(
			containerEl,
			'Context lines',
			'Unchanged lines shown around each change in a diff hunk.',
			() => s.context,
			async (n) => {
				s.context = n;
				await save();
			},
			0,
		);

		intSetting(
			containerEl,
			'Show full content below (chars)',
			'Notes shorter than this show their full current content instead of a diff. 0 = always show diffs (recommended).',
			() => s.fullBelow,
			async (n) => {
				s.fullBelow = n;
				await save();
			},
			0,
		);

		intSetting(
			containerEl,
			'Sync threshold',
			'Distinct notes captured in one second ≥ this count are treated as a bulk sync and excluded from metrics.',
			() => s.syncThreshold,
			async (n) => {
				s.syncThreshold = n;
				await save();
			},
			1,
		);
	}
}
