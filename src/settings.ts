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
	/** When on, {@link promptTemplate} is prepended to every generated note. */
	promptTemplateEnabled: boolean;
	/**
	 * Markdown prepended to every generated note when {@link promptTemplateEnabled} is on. Supports the
	 * placeholders {{time}}, {{date}}, {{window}} and {{window_start}}. Use it to lead the note with a
	 * journaling scaffold and an LLM system prompt so it's ready to fill in and paste.
	 */
	promptTemplate: string;
	/**
	 * The exact filter string we last wrote into `userIgnoreFilters`. Lets us remove only our own
	 * entry (never the user's) when the output folder is renamed or the toggle is turned off.
	 * Internal bookkeeping — not shown in the settings UI.
	 */
	appliedIgnoreFilter: string;
}

/**
 * Shipped default for {@link MicroliteHunksSettings.promptTemplate}: a fill-in-the-blank journaling
 * scaffold plus an ACT-therapist prompt, so a fresh install produces a note that's ready to complete
 * and paste. The leading HTML comment is hidden in reading view but carries the opt-out. Built by
 * array-join so no source-trailing-whitespace lint fights the intentional trailing spaces on the
 * answer lines. Turn off the "Prompt template" toggle in settings for the plain review note.
 */
const DEFAULT_PROMPT_TEMPLATE = [
	'<!-- Microlite prompt template. To turn this off, disable the "Prompt template" toggle in Settings → Community plugins → Microlite. -->',
	'',
	"I've attached the last {{window}} of Obsidian hunks from Microlite below, with some overlap with your previous context around {{window_start}} (it is now {{time}} on {{date}}).",
	'',
	"This upcoming week I'm ",
	'',
	'Tomorrow I hope to ',
	'',
	'Today I hope to ',
	'',
	'Emotionally, ',
	'',
	'As an expert in Acceptance and Commitment Therapy and psychometric profiling from a clinical-psychology lens, provide stances to practice for the upcoming week. Keep it irreverent where appropriate, and circumscribe what to hold loosely, how to approach what is on my mind, and logistics or operations in the upcoming days such as summarizing any open loops.',
	'',
	'---',
].join('\n');

export const DEFAULT_SETTINGS: MicroliteHunksSettings = {
	defaultDays: 7,
	outputFolder: 'microlite',
	context: 3,
	fullBelow: 0,
	syncThreshold: 4,
	excludeFromSearch: true,
	promptTemplateEnabled: true,
	promptTemplate: DEFAULT_PROMPT_TEMPLATE,
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

		new Setting(containerEl)
			.setName('Prompt template')
			.setDesc(
				'Prepend the template below to every generated note — a journaling scaffold and an LLM ' +
					'prompt, ready to fill in and paste. Turn off to generate the plain review note.',
			)
			.addToggle((toggle) =>
				toggle.setValue(s.promptTemplateEnabled).onChange(async (value) => {
					s.promptTemplateEnabled = value;
					await save();
				}),
			);

		new Setting(containerEl)
			.setName('Template')
			.setDesc(
				'Markdown prepended when "Prompt template" is on. Placeholders: {{time}}, {{date}}, ' +
					'{{window}} (e.g. "7 days"), {{window_start}} (the date the window opened).',
			)
			.addTextArea((text) => {
				text
					.setPlaceholder('I\'ve attached the last {{window}} of Obsidian hunks…')
					.setValue(s.promptTemplate)
					.onChange(async (value) => {
						s.promptTemplate = value;
						await save();
					});
				text.inputEl.rows = 8;
				text.inputEl.addClass('microlite-prompt-template-input');
			});

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
