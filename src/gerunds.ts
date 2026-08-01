/**
 * The gerund word-bank for the deliberate-delay progress notice — a "reticulating splines"
 * homage built entirely from the esoteric writing- and calculating-verbs of Webster's Revised
 * Unabridged Dictionary (1913). Every headword from that list appears here forced into an `-ing`
 * gerund; nouns and adjectives are lobotomized into verbs on purpose, for flavor.
 *
 * The notice cycles through these while the review is generated, so a near-instant computation
 * reads as arcane, deliberate scholarly labor. Grouped by the source taxonomy so the bank stays
 * legible and easy to extend. Order within the flattened array is irrelevant — the spinner picks
 * a random start offset each run and steps forward, so any given generation shows a different slice.
 */

// I. Writing
const WRITING = [
	// Verbs — the act itself
	'admarginating', 'bescribbling', 'circumscribing', 'enfacing', 'enlimning', 'epistolizing',
	'exscribing', 'manifolding', 'miniating', 'miswriting', 'obelizing', 'outwriting',
	'philippizing', 'postillating', 'postscribing', 'rescribing', 'scholying', 'subsigning',
	'superscribing', 'exarating',
	// The urge, the skill, the affliction
	'scribending', 'metromaniing', 'scribatiousing', 'writabiliting', 'scribabling',
	'scribblementing', 'commatisming', 'cacographing', 'pencrafting',
	// Arts, systems & manners of writing
	'aurigraphing', 'chrysographing', 'brachygraphing', 'cerographing', 'chirographing',
	'choregraphing', 'diplomaticking', 'epistolographing', 'lexigraphing', 'logographing',
	'metagraphing', 'neographing', 'oghamming', 'opisthographing', 'pasigraphing', 'plastographing',
	'polygraphing', 'pseudographing', 'psalmographing', 'sphenographing', 'stelographing',
	'stichometrying', 'stylographing', 'tachygraphing', 'tironianing',
	// The writers
	'alluminoring', 'brachygraphering', 'briefmanning', 'chirographering', 'decadisting',
	'decipheressing', 'elegiographering', 'glossographering', 'hierogrammatisting', 'lexiconisting',
	'mirabilarying', 'paramiographering', 'postilering', 'prosering', 'prothonotarying',
	'punctatoring', 'quilldriving', 'scholiasting', 'tabellioning', 'tachygraphering',
	'transcribbling', 'versemongering', 'volumisting',
	// Marks, documents & the writing desk
	'adversariing', 'antigraphing', 'apostilling', 'asterisming', 'breviating', 'chronogramming',
	'crisscrossing', 'diesising', 'grammaloguing', 'holographing', 'majusculing', 'obelusing',
	'onomasticking', 'papeterying', 'paraphing', 'pilcrowing', 'pothooking', 'pouncing',
	'scotographing', 'scribbetting', 'scriptoriuming', 'scriptorying', 'siglaing', 'standishing',
	'syngraphing', 'transumpting', 'virguling',
	// Copying machines of 1913
	'chromographing', 'copygraphing', 'cyclostyling', 'hectographing', 'mechanographing',
	'papyrographing', 'transferographing',
];

// II. Calculating
const CALCULATING = [
	// Verbs — the act itself
	'annumerating', 'indigitating', 'miscomputing', 'misreckoning', 'outreckoning', 'outtelling',
	'overreckoning', 'underreckoning', 'rekning', 'renumerating', 'subducing', 'subducting',
	'supputing', 'unciphering',
	// Acts of enumeration
	'aparithmesing', 'calculing', 'compting', 'connumerating', 'dinumerating', 'epilogisming',
	// Arts, rules & methods
	'algorisming', 'arsmetriking', 'augrimming', 'alligating', 'arithmancing', 'cossicking',
	'dactylonomying', 'duodecimalling', 'fluxioning', 'genethliacking', 'logisticking',
	'mesologarithming', 'positioning', 'practicing', 'rabdologying', 'repetending',
	'ruleofthreeing', 'sexagesimalling', 'stratarithmetrying',
	// Time-reckoning
	'epacting', 'dominicallettering', 'goldennumbering', 'indictioning',
	// The reckoners
	'abacisting', 'comptering', 'computing', 'computisting', 'countercasting', 'numeristing',
	// Instruments & apparatus
	'arithmometering', 'comptographing', 'comptometering', 'countouring', 'gunterslining',
	'jettoning', 'napiersboning', 'swanpanning',
	// The bridge word
	'quipuing',
];

// III. Familiar words, forgotten senses
const FORGOTTEN = [
	'casting', 'ciphering', 'countering', 'engrossing', 'footing', 'posting', 'taling', 'telling',
];

/** The flattened, de-duplicated bank the progress spinner draws from. Frozen — read-only at runtime. */
export const GERUNDS: readonly string[] = Object.freeze([
	...new Set([...WRITING, ...CALCULATING, ...FORGOTTEN]),
]);

/**
 * The gerund shown at a given rotation step, capitalized for the head of a notice line.
 * `step` may be any integer (including a random start offset) — it wraps around the bank.
 */
export function gerundAt(step: number): string {
	const word = GERUNDS[((step % GERUNDS.length) + GERUNDS.length) % GERUNDS.length] ?? '';
	return word.charAt(0).toUpperCase() + word.slice(1);
}
