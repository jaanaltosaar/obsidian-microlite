import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'vitest.config.ts',
		'test',
		'scripts',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// getSettingDefinitions() is an Obsidian 1.13+ API and is not yet in the published
			// `obsidian` typings (npm latest = 1.12.3). Our minAppVersion is 1.6.0 and
			// PluginSettingTab.display() is supported indefinitely, so we keep the imperative
			// settings tab for now. Revisit once the 1.13 declarative-settings types ship on npm.
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
		},
	},
);
