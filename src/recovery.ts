/*
 * recovery.ts — read Obsidian's File Recovery snapshots from inside the plugin.
 *
 * Primary path uses the core "file-recovery" plugin's own idb-wrapped handle (the same
 * approach as kometenstaub/obsidian-version-history-diff, which ships isDesktopOnly:false, so
 * this works on desktop and mobile). Falls back to opening the raw IndexedDB by name.
 *
 * These are internal, undocumented Obsidian APIs; both paths are defensive and the caller
 * surfaces a Notice if neither yields data.
 */
import type { App } from 'obsidian';

export interface RecoveryRecord {
	path: string;
	ts: number;
	data: string;
}

/** Minimal shapes for the undocumented internals we touch (typed so we avoid `any`). */
interface IdbLikeStore {
	getAll(): Promise<unknown[]>;
}
interface IdbLikeTransaction {
	store: IdbLikeStore;
}
interface FileRecoveryDb {
	transaction(store: string, mode: 'readonly'): IdbLikeTransaction;
}
interface AppInternals {
	appId?: string;
	internalPlugins?: {
		plugins?: Record<string, { instance?: { db?: FileRecoveryDb } } | undefined>;
	};
}
const internals = (app: App): AppInternals => app as unknown as AppInternals;

function isRecord(v: unknown): v is RecoveryRecord {
	return (
		typeof v === 'object' &&
		v !== null &&
		typeof (v as RecoveryRecord).path === 'string' &&
		typeof (v as RecoveryRecord).data === 'string' &&
		typeof (v as RecoveryRecord).ts === 'number'
	);
}

/** Read every File Recovery snapshot as {path, ts, data}. Empty array if File Recovery is off. */
export async function readSnapshots(app: App): Promise<RecoveryRecord[]> {
	const viaPlugin = await readViaInternalPlugin(app);
	if (viaPlugin && viaPlugin.length > 0) return viaPlugin;
	return readViaRawIndexedDB(app);
}

async function readViaInternalPlugin(app: App): Promise<RecoveryRecord[] | null> {
	try {
		const db = internals(app).internalPlugins?.plugins?.['file-recovery']?.instance?.db;
		if (!db) return null;
		const all = await db.transaction('backups', 'readonly').store.getAll();
		return all.filter(isRecord);
	} catch {
		return null;
	}
}

function readViaRawIndexedDB(app: App): Promise<RecoveryRecord[]> {
	const appId = internals(app).appId;
	if (!appId) return Promise.resolve([]);
	const dbName = `${appId}-backup`;
	return new Promise<RecoveryRecord[]>((resolve) => {
		let open: IDBOpenDBRequest;
		try {
			open = indexedDB.open(dbName);
		} catch {
			resolve([]);
			return;
		}
		open.onerror = () => resolve([]);
		open.onsuccess = () => {
			const db = open.result;
			try {
				if (!db.objectStoreNames.contains('backups')) {
					db.close();
					resolve([]);
					return;
				}
				const req = db.transaction('backups', 'readonly').objectStore('backups').getAll();
				req.onerror = () => {
					db.close();
					resolve([]);
				};
				req.onsuccess = () => {
					db.close();
					resolve((req.result as unknown[]).filter(isRecord));
				};
			} catch {
				db.close();
				resolve([]);
			}
		};
	});
}
