/**
 * The 63-row table between a Steam defindex and the renderer's model key.
 *
 * *** THIS IS THE ONE PIECE OF DATA THE PACKAGE CARRIES RATHER THAN FETCHES, *** and the reason is in
 * `item.ts`: an inspect link says `defindex: 7` and the renderer wants `weapon_ak47`. Being a table
 * rather than a lookup is what lets `resolveSubject` stay pure and synchronous, which is what lets the
 * first paint be the integrator's item instead of ours corrected a tick later.
 *
 * A table that is wrong in one row is a viewer that renders the wrong gun for one item and is right
 * about every other, which is the hardest kind of bug to notice. So it is checked structurally rather
 * than by spot-checking the rows somebody happened to think of.
 */

import { describe, expect, test } from 'bun:test'

import {
	defindexForWeaponId,
	isGloveId,
	isKnownWeaponId,
	normalizeWeaponId,
	WEAPON_ID_ALIASES,
	WEAPON_ID_BY_DEFINDEX,
	WEAPON_IDS,
	weaponIdForDefindex,
} from '../src/weapons.js'

describe('the table', () => {
	test('every id is unique', () => {
		expect(new Set(WEAPON_IDS).size).toBe(WEAPON_IDS.length)
	})

	/**
	 * *** THE INVERSE MAP IS BUILT BY `Object.fromEntries`, WHICH SILENTLY KEEPS THE LAST WRITE. *** Two
	 * defindexes mapping to one id would therefore produce an inverse that is quietly wrong for one of
	 * them, with nothing anywhere to say so. This is the check that would catch it.
	 */
	test('no two defindexes claim the same weapon id', () => {
		const ids = Object.values(WEAPON_ID_BY_DEFINDEX)
		expect(new Set(ids).size).toBe(ids.length)
	})

	test('every defindex maps to an id the package actually knows', () => {
		for (const [defindex, id] of Object.entries(WEAPON_ID_BY_DEFINDEX))
			expect({ defindex, known: WEAPON_IDS.includes(id) }).toEqual({ defindex, known: true })
	})

	test('defindex → id → defindex round-trips for every row', () => {
		for (const key of Object.keys(WEAPON_ID_BY_DEFINDEX)) {
			const defindex = Number(key)
			const id = weaponIdForDefindex(defindex)
			expect(id).toBeDefined()
			expect(defindexForWeaponId(id as string)).toBe(defindex)
		}
	})

	test('the rows everybody checks first', () => {
		expect(weaponIdForDefindex(7)).toBe('weapon_ak47')
		expect(weaponIdForDefindex(9)).toBe('weapon_awp')
		expect(defindexForWeaponId('weapon_ak47')).toBe(7)
	})

	test('an unknown defindex is undefined rather than a guess', () => {
		expect(weaponIdForDefindex(999_999)).toBeUndefined()
		expect(defindexForWeaponId('weapon_not_a_gun')).toBeUndefined()
	})
})

describe('HUD aliases', () => {
	/**
	 * *** `skins.json` GIVES THE TWENTY VANILLA KNIFE ROWS AN `sfui_wpnhud_*` ID, *** so an integrator
	 * reading `row.weapon.id` off a vanilla Bayonet gets a HUD string rather than an item id. Folding it
	 * here rather than at the frame also means the value echoed back through `onChange` is the item id.
	 */
	test('every alias resolves to a known id', () => {
		for (const [alias, id] of Object.entries(WEAPON_ID_ALIASES)) {
			expect(normalizeWeaponId(alias)).toBe(id)
			expect(isKnownWeaponId(alias)).toBe(true)
		}
	})

	test('an alias never resolves to another alias', () => {
		for (const id of Object.values(WEAPON_ID_ALIASES)) expect(WEAPON_ID_ALIASES[id]).toBeUndefined()
	})

	/**
	 * `weaponIdForDefindex` NEVER RETURNS AN ALIAS - the table is keyed on `weapon_id`, which is the
	 * whole reason to build it that way rather than off the first `weapon.id` a scan happened to hit.
	 */
	test('the defindex table is free of aliases', () => {
		for (const id of Object.values(WEAPON_ID_BY_DEFINDEX)) expect(WEAPON_ID_ALIASES[id]).toBeUndefined()
	})

	test('a vanilla Bayonet round-trips to 500 rather than to nothing', () => {
		expect(defindexForWeaponId('sfui_wpnhud_knifebayonet')).toBe(defindexForWeaponId('weapon_bayonet'))
	})

	/** An id this build has never heard of passes through untouched - see `WeaponId`. */
	test('an unknown id is passed through, not rejected', () => {
		expect(normalizeWeaponId('weapon_shipped_after_this_build')).toBe('weapon_shipped_after_this_build')
		expect(isKnownWeaponId('weapon_shipped_after_this_build')).toBe(false)
	})
})

describe('gloves', () => {
	test('the glove ids in the table are recognised as gloves', () => {
		const gloves = WEAPON_IDS.filter(isGloveId)
		expect(gloves.length).toBeGreaterThan(0)
		for (const id of gloves) expect(isGloveId(id)).toBe(true)
	})

	/** `leather_handwraps` is the one pair that does not end in `_gloves`. */
	test('leather_handwraps is a glove despite the name', () => {
		expect(isGloveId('leather_handwraps')).toBe(true)
	})

	test('a weapon is not a glove', () => {
		expect(isGloveId('weapon_ak47')).toBe(false)
		expect(isGloveId('weapon_knife_karambit')).toBe(false)
	})
})
