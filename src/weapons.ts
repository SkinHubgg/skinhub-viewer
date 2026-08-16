/**
 * WHICH WEAPON, said two ways — and the table that makes them the same question.
 *
 * An integrator holds one of two things. Either a row out of `@skinhub/cdn`'s `skins.json`, whose
 * `weapon.id` is `'weapon_ak47'`, or a decoded inspect link, whose `defindex` is `7`. Both are the
 * AK-47. `<SkinViewer>` takes either — {@link WeaponId} on the `weapon` prop, or the number on
 * `defindex` — and this is the only place the two are reconciled.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS TABLE IS CHECKED IN AND NOT FETCHED, when the whole premise of `@skinhub/cdn` is that
 * data derived from the CDN has to be derived at runtime.
 *
 * That rule is about data that CHANGES — a new finish, a new sticker capsule, a new agent. This is
 * not that. A defindex is Valve's item definition index: `weapon_ak47` has been 7 since 2013 and
 * cannot become anything else without breaking every inventory in the game. The table is 63 rows and
 * it is derived from the export itself (`data/skins.json`, `weapon.weapon_id` → `weapon.id`,
 * generated 2026-08-15, verified: 63 distinct defindexes, no defindex mapping to two DIFFERENT
 * weapons — the 20 knives each carry a second `sfui_wpnhud_*` alias for their vanilla row, which
 * `getWeaponModelPath` already resolves to the same model).
 *
 * The alternative is fetching a 4.4 MB `skins.json` to answer "what is 7", which would make the
 * inspect-link path — the one the product exists for — cost four megabytes before the first frame.
 *
 * WHAT GOING STALE LOOKS LIKE, stated rather than discovered: Valve ships a new weapon, an integrator
 * passes its defindex, and {@link weaponIdForDefindex} returns `undefined`. `<SkinViewer>` then
 * reports `unknown-weapon` through `onError` and renders its error state, naming the number it could
 * not resolve. That is a legible failure with an obvious fix (pass `weapon` instead, or upgrade), not
 * a blank canvas.
 */

/**
 * Every weapon the viewer can render, as the CS2 econ item id.
 *
 * This is `skin.weapon.id` in `@skinhub/cdn`'s `skins.json` rows, verbatim — so
 * `<SkinViewer weapon={row.weapon.id} paintIndex={…} />` typechecks against a catalogue row with no
 * conversion. Type it into an editor and autocomplete lists all 71.
 */
export const WEAPON_IDS = [
	// Pistols
	'weapon_cz75a',
	'weapon_deagle',
	'weapon_elite',
	'weapon_fiveseven',
	'weapon_glock',
	'weapon_hkp2000',
	'weapon_p250',
	'weapon_revolver',
	'weapon_tec9',
	'weapon_usp_silencer',
	// SMGs
	'weapon_bizon',
	'weapon_mac10',
	'weapon_mp5sd',
	'weapon_mp7',
	'weapon_mp9',
	'weapon_p90',
	'weapon_ump45',
	// Rifles
	'weapon_ak47',
	'weapon_aug',
	'weapon_famas',
	'weapon_galilar',
	'weapon_m4a1',
	'weapon_m4a1_silencer',
	'weapon_sg556',
	// Snipers
	'weapon_awp',
	'weapon_g3sg1',
	'weapon_scar20',
	'weapon_ssg08',
	// Heavy
	'weapon_m249',
	'weapon_mag7',
	'weapon_negev',
	'weapon_nova',
	'weapon_sawedoff',
	'weapon_xm1014',
	// Other
	'weapon_taser',
	// Knives
	'weapon_bayonet',
	'weapon_knife_butterfly',
	'weapon_knife_canis',
	'weapon_knife_cord',
	'weapon_knife_css',
	'weapon_knife_falchion',
	'weapon_knife_flip',
	'weapon_knife_gut',
	'weapon_knife_gypsy_jackknife',
	'weapon_knife_karambit',
	'weapon_knife_kukri',
	'weapon_knife_m9_bayonet',
	'weapon_knife_outdoor',
	'weapon_knife_push',
	'weapon_knife_skeleton',
	'weapon_knife_stiletto',
	'weapon_knife_survival_bowie',
	'weapon_knife_tactical',
	'weapon_knife_ursus',
	'weapon_knife_widowmaker',
	// Gloves. A pair of gloves is the SUBJECT here — the thing on screen, framed and orbitable.
	// Putting a pair ON an operator in the `operator`/`firstPerson` views is not supported; see
	// `SkinViewerProps.operator`.
	'leather_handwraps',
	'motorcycle_gloves',
	'slick_gloves',
	'specialist_gloves',
	'sporty_gloves',
	'studded_bloodhound_gloves',
	'studded_brokenfang_gloves',
	'studded_hydra_gloves',
] as const

export type KnownWeaponId = (typeof WEAPON_IDS)[number]

/**
 * `'weapon_ak47'`.
 *
 * The `(string & {})` arm is deliberate and is not a widening mistake: it keeps autocomplete listing
 * the 71 known ids while still ACCEPTING an id this build has never heard of, so a new weapon in a
 * fresh export renders the day it ships rather than the day the package is upgraded. An unknown id
 * that the asset export also does not know resolves to no model, which surfaces as `unknown-weapon`.
 */
export type WeaponId = KnownWeaponId | (string & {})

/**
 * Item definition index → econ item id. See the file header for why this is checked in.
 *
 * The 20 knives are listed under their `weapon_*` id rather than the `sfui_wpnhud_*` alias that also
 * appears on their vanilla row; both resolve to the same GLB.
 */
export const WEAPON_ID_BY_DEFINDEX: Readonly<Record<number, KnownWeaponId>> = {
	1: 'weapon_deagle',
	2: 'weapon_elite',
	3: 'weapon_fiveseven',
	4: 'weapon_glock',
	7: 'weapon_ak47',
	8: 'weapon_aug',
	9: 'weapon_awp',
	10: 'weapon_famas',
	11: 'weapon_g3sg1',
	13: 'weapon_galilar',
	14: 'weapon_m249',
	16: 'weapon_m4a1',
	17: 'weapon_mac10',
	19: 'weapon_p90',
	23: 'weapon_mp5sd',
	24: 'weapon_ump45',
	25: 'weapon_xm1014',
	26: 'weapon_bizon',
	27: 'weapon_mag7',
	28: 'weapon_negev',
	29: 'weapon_sawedoff',
	30: 'weapon_tec9',
	31: 'weapon_taser',
	32: 'weapon_hkp2000',
	33: 'weapon_mp7',
	34: 'weapon_mp9',
	35: 'weapon_nova',
	36: 'weapon_p250',
	38: 'weapon_scar20',
	39: 'weapon_sg556',
	40: 'weapon_ssg08',
	60: 'weapon_m4a1_silencer',
	61: 'weapon_usp_silencer',
	63: 'weapon_cz75a',
	64: 'weapon_revolver',
	500: 'weapon_bayonet',
	503: 'weapon_knife_css',
	505: 'weapon_knife_flip',
	506: 'weapon_knife_gut',
	507: 'weapon_knife_karambit',
	508: 'weapon_knife_m9_bayonet',
	509: 'weapon_knife_tactical',
	512: 'weapon_knife_falchion',
	514: 'weapon_knife_survival_bowie',
	515: 'weapon_knife_butterfly',
	516: 'weapon_knife_push',
	517: 'weapon_knife_cord',
	518: 'weapon_knife_canis',
	519: 'weapon_knife_ursus',
	520: 'weapon_knife_gypsy_jackknife',
	521: 'weapon_knife_outdoor',
	522: 'weapon_knife_stiletto',
	523: 'weapon_knife_widowmaker',
	525: 'weapon_knife_skeleton',
	526: 'weapon_knife_kukri',
	4725: 'studded_brokenfang_gloves',
	5027: 'studded_bloodhound_gloves',
	5030: 'sporty_gloves',
	5031: 'slick_gloves',
	5032: 'leather_handwraps',
	5033: 'motorcycle_gloves',
	5034: 'specialist_gloves',
	5035: 'studded_hydra_gloves',
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * *** THE HUD ALIASES — the difference between a knife and an empty canvas. ***
 *
 * `@skinhub/cdn`'s `skins.json` carries TWO ids for every knife. The painted rows say
 * `weapon.id === 'weapon_bayonet'`; the ONE vanilla row per knife says
 * `weapon.id === 'sfui_wpnhud_knifebayonet'` — the HUD string, not the item name. Both share
 * `weapon.weapon_id === 500`. There are 83 distinct `weapon.id` values across 63 defindexes, and the
 * 20 extras are exactly this.
 *
 * So an integrator doing the most natural thing there is —
 *
 *     const row = findSkin(skins, { defindex, paintindex })
 *     <SkinViewer weaponId={row.weapon.id} … />
 *
 * — hands this component a HUD string for all twenty vanilla knives and nothing else.
 *
 * *** THE ALIAS IS ACCEPTED AND FOLDED, NOT REJECTED. *** The mapping is 1:1 and unambiguous, the
 * renderer's own model table already resolves the same twenty strings, and failing on a value the data
 * package hands you from its documented API would only mean the two packages disagree about what a
 * Bayonet is called. Folding it here additionally makes {@link defindexForWeaponId} answer for those
 * rows, so an inspect link built back out of a vanilla knife carries 500 rather than 0.
 *
 * An id that is neither a known weapon nor a known alias still fails VISIBLY — `<SkinViewer>` reports
 * `unknown-weapon` and renders its error state naming the string it could not resolve. Rendering
 * nothing, silently, is the one outcome this table exists to prevent.
 *
 * Deliberately NOT in {@link WEAPON_IDS}: these are accepted, not recommended, and an editor should
 * not offer `sfui_wpnhud_knifekaram` to somebody typing a weapon id.
 */
export const WEAPON_ID_ALIASES: Readonly<Record<string, KnownWeaponId>> = {
	sfui_wpnhud_knifebayonet: 'weapon_bayonet',
	sfui_wpnhud_knife_butterfly: 'weapon_knife_butterfly',
	sfui_wpnhud_knife_canis: 'weapon_knife_canis',
	sfui_wpnhud_knife_cord: 'weapon_knife_cord',
	sfui_wpnhud_knifecss: 'weapon_knife_css',
	sfui_wpnhud_knife_falchion_advanced: 'weapon_knife_falchion',
	sfui_wpnhud_knifeflip: 'weapon_knife_flip',
	sfui_wpnhud_knifegut: 'weapon_knife_gut',
	sfui_wpnhud_knife_gypsy_jackknife: 'weapon_knife_gypsy_jackknife',
	sfui_wpnhud_knifekaram: 'weapon_knife_karambit',
	sfui_wpnhud_knife_kukri: 'weapon_knife_kukri',
	sfui_wpnhud_knifem9: 'weapon_knife_m9_bayonet',
	sfui_wpnhud_knife_outdoor: 'weapon_knife_outdoor',
	sfui_wpnhud_knife_push: 'weapon_knife_push',
	sfui_wpnhud_knife_skeleton: 'weapon_knife_skeleton',
	sfui_wpnhud_knife_stiletto: 'weapon_knife_stiletto',
	sfui_wpnhud_knife_survival_bowie: 'weapon_knife_survival_bowie',
	sfui_wpnhud_knifetactical: 'weapon_knife_tactical',
	sfui_wpnhud_knife_ursus: 'weapon_knife_ursus',
	sfui_wpnhud_knife_widowmaker: 'weapon_knife_widowmaker',
}

const KNOWN_WEAPON_IDS: ReadonlySet<string> = new Set<string>(WEAPON_IDS)

/**
 * Fold a HUD alias onto the item id. Everything else passes through untouched, including ids this
 * build has never heard of — see {@link WeaponId} for why an unknown id is not an error here.
 */
export const normalizeWeaponId = (weapon: WeaponId): WeaponId => WEAPON_ID_ALIASES[weapon] ?? weapon

/** True for an id this build can name. `false` is what makes `<SkinViewer>` report `unknown-weapon`. */
export const isKnownWeaponId = (weapon: WeaponId): boolean => KNOWN_WEAPON_IDS.has(normalizeWeaponId(weapon))

const DEFINDEX_BY_WEAPON_ID: Readonly<Record<string, number>> = Object.fromEntries(
	Object.entries(WEAPON_ID_BY_DEFINDEX).map(([defindex, id]) => [id, Number(defindex)]),
)

/**
 * `7` → `'weapon_ak47'`, or `undefined` for a defindex this build does not know.
 *
 * NEVER RETURNS AN ALIAS — the table is keyed on `weapon_id`, which is the whole reason to build it
 * that way rather than off the first `weapon.id` a scan happens to hit.
 */
export const weaponIdForDefindex = (defindex: number): KnownWeaponId | undefined => WEAPON_ID_BY_DEFINDEX[defindex]

/**
 * `'weapon_ak47'` → `7`, or `undefined`.
 *
 * The inverse, for building an inspect link back out of what the viewer is showing — see
 * {@link toPlacement}, exported from the package root. Resolves HUD aliases, so a vanilla Bayonet round-trips to 500 rather than to 0.
 */
export const defindexForWeaponId = (weapon: WeaponId): number | undefined =>
	DEFINDEX_BY_WEAPON_ID[normalizeWeaponId(weapon)]

/** Gloves take a different renderer and carry no stickers, charm, counter or name plate. */
export const isGloveId = (weapon: WeaponId): boolean => weapon.endsWith('_gloves') || weapon === 'leather_handwraps'
