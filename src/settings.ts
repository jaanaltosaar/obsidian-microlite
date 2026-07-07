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
}

export const DEFAULT_SETTINGS: MicroliteHunksSettings = {
	defaultDays: 7,
	outputFolder: '',
	context: 3,
	fullBelow: 4000,
	syncThreshold: 4,
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
			'Notes whose newest version is shorter than this are shown in full instead of diffed.',
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
