/**
 * *** THE BRIDGE - `item.ts` - which is the package's actual work. ***
 *
 * Everything else here is an `<iframe>` and a message listener. This is the file that turns an
 * integrator's item into the frame's item, and the one place that knows both vocabularies: the
 * public one (`offsetX`, `charm`, `weapon`) and the game's (`offset_x`, slot 5, `weaponType`).
 *
 * *** THE INSPECT LINKS BELOW ARE BUILT RATHER THAN PASTED. *** A committed corpus of hex strings
 * would be a fixture whose provenance nobody can check a year from now; `buildInspectUrl` is
 * `@skinhub/cdn`'s own encoder and is the same one Valve's format is implemented against, so a link
 * built here is a link the frame would decode identically. It also means these tests exercise the real
 * codec rather than a string that happens to still parse.
 */

import { describe, expect, test } from 'bun:test'

import { buildInspectUrl, makeSkinPlacement } from '@skinhub/cdn/inspect'
import { emptyKeychain, emptySticker } from '@skinhub/cdn/placement'

import { fromInspectLink, fromSlots, resolveSubject, toInspectLink, toPublicItem, toSlots } from '../src/item.js'
import type { PlacementSlots } from '../src/protocol.js'

/**
 * *** THE TYPES ARE BYPASSED ON PURPOSE WHEREVER THIS APPEARS, AND THAT IS THE SCENARIO UNDER TEST. ***
 *
 * `resolveSubject` and `toSlots` both take a `Partial<>` of their own prop type deliberately: in
 * TypeScript a missing `paintIndex` or a sticker in slot 5 is a compile error, so the only way to
 * reach those branches is the way a real integrator reaches them - plain JavaScript, an `any`, a
 * `JSON.parse`, or a query that had not resolved yet. Their whole value is having an ANSWER for that
 * case rather than a `TypeError` somewhere inside a render.
 *
 * Written as one named helper rather than a scattering of `as any` so that the intent is legible and
 * so that a cast cannot creep into a test that was supposed to be type-checked.
 */
const asJavaScript = <T>(value: unknown): T => value as T

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE SIX SLOTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('toSlots', () => {
	/**
	 * *** RETURNS `undefined` WHEN NOTHING IS PLACED, and that is not an optimisation. *** An item with
	 * no stickers must send no `stickers` key at all: the renderer holds its sticker draft against that
	 * array BY IDENTITY, so a fresh six-slot tuple arriving on every tick of somebody's float slider
	 * would re-seed the draft sixty times a second and fight the user's own drag.
	 */
	test('nothing placed sends no key at all', () => {
		expect(toSlots(undefined, undefined)).toBeUndefined()
		expect(toSlots([], null)).toBeUndefined()
	})

	/**
	 * *** ARRAY POSITION IS THE SLOT UNLESS A STICKER NAMES ITS OWN. *** `[a, null, b]` is what a
	 * marketplace's own UI produces when a user has filled two of five holders, and it must mean slots
	 * 0 and 2 rather than 0 and 1.
	 */
	test('array position is the slot, and holes are preserved', () => {
		const slots = toSlots([{ id: 1 }, null, { id: 3 }], null)
		expect(slots).toBeDefined()
		expect(slots?.map(slot => slot.sticker_id)).toEqual([1, 0, 3, 0, 0, 0])
	})

	test('an explicit slot beats the array position', () => {
		const slots = toSlots([{ id: 1, slot: 4 }], null)
		expect(slots?.map(slot => slot.sticker_id)).toEqual([0, 0, 0, 0, 1, 0])
	})

	/**
	 * *** A STICKER OUTSIDE 0..4 IS DROPPED RATHER THAN WRAPPED, *** because slot 5 is the charm's and
	 * putting a sticker there would be a picture nobody asked for.
	 */
	test('a sticker outside the five holders is dropped, never wrapped into the charm slot', () => {
		expect(toSlots(asJavaScript([{ id: 9, slot: 5 }]), null)?.map(s => s.sticker_id)).toEqual([0, 0, 0, 0, 0, 0])
		expect(toSlots(asJavaScript([{ id: 9, slot: -1 }]), null)?.map(s => s.sticker_id)).toEqual([0, 0, 0, 0, 0, 0])
	})

	test('the charm lands in slot 5 with its seed in `pattern`', () => {
		// `pattern` IS the charm's seed - the keychain message is the sticker message reused.
		const slots = toSlots(undefined, { id: 30, seed: 12_345, offset: [0.1, 0.2, 0.3] })
		expect(slots?.[5]).toMatchObject({ sticker_id: 30, pattern: 12_345, offset_x: 0.1, offset_y: 0.2, offset_z: 0.3 })
	})

	test('a charm alone is enough to produce slots', () => {
		expect(toSlots(undefined, { id: 30 })).toBeDefined()
	})

	/** Rebuilt per call, because the caller mutates the copy it is handed. */
	test('two calls do not share slot objects', () => {
		const a = toSlots([{ id: 1 }], null)
		const b = toSlots([{ id: 1 }], null)
		expect(a?.[0]).not.toBe(b?.[0])
	})
})

describe('fromSlots', () => {
	/** `sticker_id === 0` is how the wire says "this slot is empty" - it must not become a sticker. */
	test('empty slots do not come back as stickers', () => {
		const { stickers, charm } = fromSlots(undefined)
		expect(stickers).toEqual([])
		expect(charm).toBeNull()

		const empty: PlacementSlots = [
			emptySticker(0),
			emptySticker(1),
			emptySticker(2),
			emptySticker(3),
			emptySticker(4),
			emptyKeychain(),
		]
		expect(fromSlots(empty)).toEqual({ stickers: [], charm: null })
	})

	test('round-trips the public shape through the wire shape and back', () => {
		const stickers = [
			{ id: 5, slot: 0 as const, wear: 0.25, rotation: 12, offsetX: 0.1, offsetY: -0.2 },
			{ id: 7, slot: 3 as const, wear: 0, rotation: 0, offsetX: 0, offsetY: 0 },
		]
		const charm = { id: 30, seed: 99, offset: [0.01, 0.02, 0.03] as [number, number, number] }
		const slots = toSlots(stickers, charm)
		expect(slots).toBeDefined()
		expect(fromSlots(slots)).toEqual({ stickers, charm })
	})
})

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE SUBJECT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('resolveSubject: the `item` prop', () => {
	test('a weapon and a paint index is the whole minimum', () => {
		const resolved = resolveSubject({ item: { weapon: 'weapon_ak47', paintIndex: 44 } })
		expect(resolved.error).toBeNull()
		expect(resolved.item).toEqual({ weaponType: 'weapon_ak47', paintIndex: 44 })
	})

	/** `0` is a real value and renders the bare model - it must not be read as "no paint index". */
	test('paintIndex 0 is vanilla, not missing', () => {
		expect(resolveSubject({ item: { weapon: 'weapon_ak47', paintIndex: 0 } }).item).toEqual({
			weaponType: 'weapon_ak47',
			paintIndex: 0,
		})
	})

	/**
	 * *** ABSENT MEANS "SAY NOTHING", NOT "USE THE DEFAULT". *** An integrator who never passes `float`
	 * must not have a float written into their URL, or our default is frozen into their embed and the
	 * day we change it their picture does not move.
	 */
	test('a field the caller did not mention is not invented', () => {
		const item = resolveSubject({ item: { weapon: 'weapon_ak47', paintIndex: 44 } }).item
		expect(Object.keys(item ?? {}).sort()).toEqual(['paintIndex', 'weaponType'])
	})

	test('a HUD alias is folded to the item id', () => {
		expect(resolveSubject({ item: { weapon: 'sfui_wpnhud_knifebayonet', paintIndex: 0 } }).item?.weaponType).toBe(
			'weapon_bayonet',
		)
	})

	test('a defindex resolves through the table', () => {
		expect(resolveSubject({ item: { defindex: 7, paintIndex: 44 } }).item?.weaponType).toBe('weapon_ak47')
	})

	/* ── THE FAILURES, WHICH ALL PRODUCE NO ITEM AND NO GUESS ─────────────────────────────────── */

	/**
	 * *** EVERY FAILURE HERE PRODUCES A NULL ITEM. *** `SkinViewer` then asks the frame for its
	 * instruction card rather than letting it fall back to our default AK - which would look exactly
	 * like a successful render of the wrong gun, and is the one outcome worth more than all the rest of
	 * this file to avoid.
	 */
	test('every failure yields a null item rather than a fallback', () => {
		for (const subject of [
			{},
			{ item: undefined },
			{ item: {} },
			{ item: { paintIndex: 44 } },
			{ item: { weapon: 'weapon_ak47' } },
			{ item: { defindex: 999_999, paintIndex: 44 } },
		]) {
			const resolved = resolveSubject(asJavaScript(subject))
			expect(resolved.item).toBeNull()
			expect(resolved.inspectPayload).toBeNull()
			expect(resolved.error).not.toBeNull()
		}
	})

	test('an unknown defindex says so, rather than saying no item', () => {
		expect(resolveSubject({ item: { defindex: 999_999, paintIndex: 44 } }).error?.code).toBe('unknown-weapon')
		expect(resolveSubject(asJavaScript({ item: { paintIndex: 44 } })).error?.code).toBe('no-item')
	})

	test('a missing paintIndex is named as such, since 0 would have been valid', () => {
		const error = resolveSubject(asJavaScript({ item: { weapon: 'weapon_ak47' } })).error
		expect(error?.code).toBe('no-item')
		expect(error?.message).toContain('paintIndex')
	})
})

describe('resolveSubject: the `inspectLink` prop', () => {
	const link = (over: Partial<Parameters<typeof makeSkinPlacement>[0]> = {}) =>
		buildInspectUrl(
			makeSkinPlacement({
				defindex: 7,
				paintindex: 44,
				paintseed: 661,
				paintwear: 0.1234,
				rarity: 5,
				...over,
			} as Parameters<typeof makeSkinPlacement>[0]),
		)

	test('a masked link decodes into an item with its identity resolved', () => {
		const resolved = resolveSubject({ inspectLink: link() })
		expect(resolved.error).toBeNull()
		expect(resolved.item?.weaponType).toBe('weapon_ak47')
		expect(resolved.item?.paintIndex).toBe(44)
		expect(resolved.item?.seed).toBe(661)
	})

	/**
	 * *** THE ORIGINAL STRING IS FORWARDED VERBATIM AS `?i=` RATHER THAN RE-ENCODED. *** A round trip
	 * through our own encoder would be a second implementation of the codec in the URL path, free to
	 * disagree with the one the frame decodes with. Forwarding the customer's own bytes means the frame
	 * reads exactly what Valve wrote.
	 */
	test('the caller’s own bytes are forwarded, not re-encoded', () => {
		const url = link()
		expect(resolveSubject({ inspectLink: url }).inspectPayload).toBe(url)
	})

	test('StatTrak collapses to one field, and 0 is a real count', () => {
		expect(resolveSubject({ inspectLink: link({ stattrak: true, stattrak_count: 0 }) }).item?.statTrak).toBe(0)
		expect(resolveSubject({ inspectLink: link({ stattrak: true, stattrak_count: 1337 }) }).item?.statTrak).toBe(1337)
		expect(resolveSubject({ inspectLink: link() }).item?.statTrak).toBe(false)
	})

	test('a link that does not decode is reported, never rendered as something else', () => {
		const resolved = resolveSubject({ inspectLink: 'steam://rungame/730/nonsense' })
		expect(resolved.item).toBeNull()
		expect(resolved.error?.code).toBe('bad-inspect-link')
		// The S…A…D… and M… forms needed a Game Coordinator round trip Valve has shut down, so an
		// integrator who pastes one has to be told that rather than left guessing.
		expect(resolved.error?.message).toContain('MASKED')
	})

	test('a decoded link for a weapon this build cannot name says which defindex', () => {
		const resolved = resolveSubject({ inspectLink: link({ defindex: 60_000 }) })
		expect(resolved.error?.code).toBe('unknown-weapon')
		expect(resolved.error?.message).toContain('60000')
	})

	/** `inspectLink` wins: the types make passing both a compile error, so this is the JavaScript case. */
	test('an empty inspect link falls through to `item` rather than failing', () => {
		const resolved = resolveSubject(asJavaScript({ inspectLink: '', item: { weapon: 'weapon_awp', paintIndex: 344 } }))
		expect(resolved.item?.weaponType).toBe('weapon_awp')
	})
})

describe('toPublicItem', () => {
	/**
	 * *** ALWAYS THE `{ weapon }` FORM, NEVER `{ defindex }`. *** Turning the id back into a number is a
	 * lookup that can fail for a weapon shipped after this package was built, and `onChange` is not a
	 * place to hand somebody a silent `undefined`.
	 */
	test('reports the weapon id, not a defindex', () => {
		const item = toPublicItem({ weaponType: 'weapon_ak47', paintIndex: 44 })
		expect(item.weapon).toBe('weapon_ak47')
		expect('defindex' in item).toBe(false)
	})

	test('unset fields stay unset', () => {
		expect(toPublicItem({ weaponType: 'weapon_ak47', paintIndex: 44 })).toEqual({
			weapon: 'weapon_ak47',
			paintIndex: 44,
			stickers: [],
			charm: null,
		})
	})

	test('an item survives the whole round trip out and back', () => {
		const resolved = resolveSubject({
			item: {
				weapon: 'weapon_ak47',
				paintIndex: 44,
				float: 0.2,
				seed: 5,
				statTrak: 0,
				nameTag: 'hello',
				stickers: [{ id: 1, slot: 2, wear: 0.5, rotation: 10, offsetX: 0.1, offsetY: 0.2 }],
				charm: { id: 30, seed: 7, offset: [0, 0, 0] },
			},
		})
		expect(resolved.item).not.toBeNull()
		const back = toPublicItem(resolved.item as NonNullable<typeof resolved.item>)
		expect(back).toMatchObject({
			weapon: 'weapon_ak47',
			paintIndex: 44,
			float: 0.2,
			seed: 5,
			statTrak: 0,
			nameTag: 'hello',
			charm: { id: 30, seed: 7 },
		})
		expect(back.stickers).toEqual([{ id: 1, slot: 2, wear: 0.5, rotation: 10, offsetX: 0.1, offsetY: 0.2 }])
	})
})

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * BACK OUT AGAIN
 *
 * The half a picker actually ships on: the user configures an item and wants the link. Every one of
 * these encodes a fact that is silent when you get it wrong, which is why the functions exist in the
 * package rather than in a snippet in the README.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('toInspectLink / fromInspectLink', () => {
	const item = {
		weapon: 'weapon_ak47',
		paintIndex: 44,
		float: 0.1234,
		seed: 661,
		statTrak: 1337,
		nameTag: 'hello',
		stickers: [{ id: 5032, slot: 0 as const, wear: 0.25, rotation: 12, offsetX: 0.1, offsetY: -0.2 }],
		charm: { id: 30, seed: 99, offset: [0.01, 0.02, 0.03] as [number, number, number] },
	}

	test('an item round-trips through a real inspect link', () => {
		const back = fromInspectLink(toInspectLink(item))
		expect(back).not.toBeNull()
		expect(back).toMatchObject({ weapon: 'weapon_ak47', paintIndex: 44, seed: 661, statTrak: 1337, nameTag: 'hello' })
		expect(back?.float).toBeCloseTo(0.1234, 5)
		expect(back?.charm).toMatchObject({ id: 30, seed: 99 })
		expect(back?.stickers?.[0]).toMatchObject({ id: 5032, slot: 0, rotation: 12 })
	})

	/** `0` is a freshly-minted counter and `false` is no module. One boolean and one count, not one number. */
	test('StatTrak 0 survives as 0, and false survives as false', () => {
		expect(fromInspectLink(toInspectLink({ ...item, statTrak: 0 }))?.statTrak).toBe(0)
		expect(fromInspectLink(toInspectLink({ ...item, statTrak: false }))?.statTrak).toBe(false)
	})

	/** An encoder rejects `scale <= 0`, and the WeaponPaints row default of `0` means "default". */
	test('a sticker with no scale still produces a link that builds', () => {
		expect(() => toInspectLink({ weapon: 'weapon_awp', paintIndex: 344, stickers: [{ id: 1 }] })).not.toThrow()
	})

	test('the minimum item is enough', () => {
		const back = fromInspectLink(toInspectLink({ weapon: 'weapon_awp', paintIndex: 344 }))
		expect(back).toMatchObject({ weapon: 'weapon_awp', paintIndex: 344 })
	})

	test('a HUD alias resolves rather than encoding a zero defindex', () => {
		expect(fromInspectLink(toInspectLink({ weapon: 'sfui_wpnhud_knifebayonet', paintIndex: 0 }))?.weapon).toBe(
			'weapon_bayonet',
		)
	})

	/** A link with `defindex: 0` in it looks like a link and opens an empty inspect screen. */
	test('a weapon with no defindex throws rather than producing a plausible-looking dud', () => {
		expect(() => toInspectLink({ weapon: 'weapon_from_the_future', paintIndex: 1 })).toThrow(/no defindex/)
	})

	test('a link a user mistyped is null, not an exception', () => {
		expect(fromInspectLink('steam://rungame/730/nonsense')).toBeNull()
	})
})
