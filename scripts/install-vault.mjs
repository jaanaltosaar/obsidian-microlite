// Copy the built plugin into a local Obsidian vault for testing.
//
// Vault location comes from the OBSIDIAN_VAULT env var, or a gitignored `.vault-path`
// file at the repo root (one line: the absolute path to your vault). We deliberately do
// NOT commit any vault path — this repo is public-bound.
//
// Usage:  npm run install:vault   (runs the build first)
import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function resolveVault() {
	const fromEnv = process.env.OBSIDIAN_VAULT?.trim();
	if (fromEnv) return fromEnv;
	const pathFile = join(repoRoot, '.vault-path');
	if (existsSync(pathFile)) {
		const p = readFileSync(pathFile, 'utf8').trim();
		if (p) return p;
	}
	console.error(
		'No vault configured. Set OBSIDIAN_VAULT=/path/to/vault, or create a .vault-path\n' +
			'file at the repo root containing the absolute path to your vault.',
	);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(repoRoot, 'manifest.json'), 'utf8'));
const vault = resolveVault();
if (!existsSync(join(vault, '.obsidian'))) {
	console.error(`Not an Obsidian vault (no .obsidian folder): ${vault}`);
	process.exit(1);
}

const dest = join(vault, '.obsidian', 'plugins', manifest.id);
mkdirSync(dest, { recursive: true });
for (const file of ['manifest.json', 'main.js', 'styles.css']) {
	copyFileSync(join(repoRoot, file), join(dest, file));
}
console.log(`Installed "${manifest.name}" (${manifest.id}) → ${dest}`);
console.log('Reload Obsidian (or "Reload app without saving") to pick up the change.');
