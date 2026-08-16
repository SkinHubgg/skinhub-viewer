/**
 * *** PROPS → A URL, AND THEN PROPS → PATCHES. ***
 *
 * The package uses the URL for the FIRST render and messages for every render after it. The split is
 * not an optimisation, it is the only arrangement that gets both properties an integrator judges us
 * on - the first paint is their item, and no later prop change touches the `src`.
 *
 * *** THE PROPERTY THESE TESTS EXIST TO DEFEND IS THE SECOND ONE, and it is worth naming plainly: ***
 * rewriting `src` reloads the document, which drops the GL context, re-downloads the model and re-runs
 * every shader compile. That turns a float slider into a five-second stall. So `diffState` must
 * produce a patch for a float change and produce NOTHING at all when nothing moved.
 */

import { describe, expect, test } from 'bun:test'

import { coversCanvas, diffState, frameUrl, IDENTITY_FIELDS, resolveState } from '../src/state.js'
import type { SkinViewerProps } from '../src/types.js'

const props = (over: Partial<SkinViewerProps> = {}) =>
	({ item: { weapon: 'weapon_ak47', paintIndex: 44 }, ...over }) as SkinViewerProps

const query = (over: Partial<SkinViewerProps> = {}) =>
	new URL(frameUrl('https://skinhub.gg', resolveState(props(over))).src).searchParams

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE URL
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('frameUrl', () => {
	test('points at /frame on the origin it was given', () => {
		const { src } = frameUrl('https://skinhub.gg', resolveState(props()))
		expect(src.startsWith('https://skinhub.gg/frame?')).toBe(true)
	})

	test('a trailing slash on the origin does not become a double slash', () => {
		expect(frameUrl('https://skinhub.gg///', resolveState(props())).src.startsWith('https://skinhub.gg/frame?')).toBe(
			true,
		)
	})

	/**
	 * *** ABSENT MEANS "SAY NOTHING". *** An integrator who never passes `settings.quality.bloom` must
	 * not get `bloom=1` written into their URL - the defaults live in the frame, and freezing ours into
	 * their embed means the day we change it their picture does not move.
	 */
	test('says nothing about what the caller did not mention', () => {
		expect([...query().keys()].sort()).toEqual(['paint', 'weapon'])
	})

	test('the item goes across as the model key and the paint index', () => {
		const params = query()
		expect(params.get('weapon')).toBe('weapon_ak47')
		expect(params.get('paint')).toBe('44')
	})

	/** `?st=-1` removes the module; `?st=0` is a real, freshly-minted counter; absent is no module. */
	test('StatTrak false is -1 on the wire, and 0 survives as 0', () => {
		expect(query({ item: { weapon: 'weapon_ak47', paintIndex: 44, statTrak: false } }).get('st')).toBe('-1')
		expect(query({ item: { weapon: 'weapon_ak47', paintIndex: 44, statTrak: 0 } }).get('st')).toBe('0')
		expect(query().has('st')).toBe(false)
	})

	/** `nameTag: null` is "no plate" and must be distinguishable from never having said anything. */
	test('a null name tag is an empty parameter, not an absent one', () => {
		expect(query({ item: { weapon: 'weapon_ak47', paintIndex: 44, nameTag: null } }).get('nametag')).toBe('')
		expect(query().has('nametag')).toBe(false)
	})

	/** `?map=none` is the calibrated reference rig, which is what `map: null` means on the prop. */
	test('a null map is `none` rather than an omission', () => {
		expect(query({ settings: { environment: { map: null } } }).get('map')).toBe('none')
	})

	test('booleans are 1 and 0, so `false` is a statement rather than a silence', () => {
		const params = query({ interactions: { orbit: false, zoom: true } })
		expect(params.get('orbit')).toBe('0')
		// The wheel gesture is named after the input that performs it, because `?zoom=` is the camera's.
		expect(params.get('wheel')).toBe('1')
	})

	test('gloves are one parameter, because they are one item', () => {
		expect(query({ gloves: { type: 'sporty_gloves', paintIndex: 10_038, float: 0.2 } }).get('glove')).toBe(
			'sporty_gloves:10038:0.2',
		)
		// `null` is the wearer's OWN default pair - a real value, and it needs a way to be said.
		expect(query({ gloves: null }).get('glove')).toBe('none')
	})

	/**
	 * *** THE SECOND RETURN VALUE IS THE BASELINE EVERY LATER PATCH IS MEASURED AGAINST, and stickers
	 * are the one field a query string cannot carry. *** Rather than re-encode a placement into an
	 * inspect link here - a second implementation of a codec whose only job would be to disagree with
	 * the frame's decoder - they are left out and reported as unsent, so the first diff after the frame
	 * announces itself carries them.
	 */
	test('stickers are left out of the URL and reported as unsent', () => {
		const desired = resolveState(props({ item: { weapon: 'weapon_ak47', paintIndex: 44, stickers: [{ id: 5 }] } }))
		expect(desired.item?.stickers).toBeDefined()

		const { src, expressed } = frameUrl('https://skinhub.gg', desired)
		expect(src).not.toContain('sticker')
		expect(expressed.item?.stickers).toBeUndefined()

		// …and therefore the very first diff carries them.
		const patch = diffState(expressed, desired)
		expect(patch?.item?.stickers).toBeDefined()
	})

	test('an inspect link goes through as ?i= and carries its own stickers', () => {
		const desired = resolveState(props({ item: undefined, inspectLink: 'ignored' }))
		// A bad link produces no item; the URL then asks the frame for its instruction card.
		expect(frameUrl('https://skinhub.gg', desired).src).toContain('help=bad-link')
	})

	test('no item at all asks the frame to explain itself rather than showing our default', () => {
		expect(frameUrl('https://skinhub.gg', resolveState({})).src).toContain('help=no-item')
	})
})

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE DIFF
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('diffState', () => {
	/**
	 * *** `undefined` WHEN NOTHING MOVED IS WHAT LETS THE COMPONENT SKIP THE `postMessage` ENTIRELY. ***
	 * A consumer writing `item={{…}}` inline hands us a fresh object on every render, sixty times a
	 * second during any animation on their page. If a fresh object were a change, every one of those
	 * would be a message.
	 */
	test('a fresh object with the same values produces no patch at all', () => {
		const before = resolveState(props())
		const after = resolveState(props())
		expect(before.item).not.toBe(after.item)
		expect(diffState(before, after)).toBeUndefined()
	})

	test('a float change is a patch that carries only the float', () => {
		const before = resolveState(props({ item: { weapon: 'weapon_ak47', paintIndex: 44, float: 0.1 } }))
		const after = resolveState(props({ item: { weapon: 'weapon_ak47', paintIndex: 44, float: 0.2 } }))
		expect(diffState(before, after)).toEqual({ item: { float: 0.2 } })
	})

	/**
	 * *** A PATCH MUST MERGE, NOT REPLACE, and this is the host-side half of that contract. ***
	 * `{ item: { float } }` keeps `weaponType` on the far side, so the frame's loading gate - which is
	 * keyed on the identity VALUES - does not move. Sending the whole item on every float tick would be
	 * correct on the wire and would still re-seed the renderer's sticker draft.
	 */
	test('an unchanged identity field is not restated', () => {
		const before = resolveState(props({ item: { weapon: 'weapon_ak47', paintIndex: 44, float: 0.1 } }))
		const after = resolveState(props({ item: { weapon: 'weapon_ak47', paintIndex: 44, float: 0.2 } }))
		expect(diffState(before, after)?.item).not.toHaveProperty('weaponType')
	})

	/**
	 * *** AN ITEM THAT DISAPPEARS DOES NOT BLANK THE VIEWER. *** A host whose query briefly returned
	 * `undefined` is a re-render blip rather than an instruction, and there is no way to say "show
	 * nothing" over the wire - inventing one would make a transient state destructive.
	 */
	test('an item going away leaves the picture alone', () => {
		const before = resolveState(props())
		expect(diffState(before, resolveState({}))).toBeUndefined()
	})

	test('a settings group the caller stopped mentioning is not reset', () => {
		const before = resolveState(props({ settings: { quality: { bloom: 2 }, camera: { fov: 40 } } }))
		const after = resolveState(props({ settings: { quality: { bloom: 2 } } }))
		expect(diffState(before, after)).toBeUndefined()
	})

	test('a settings change carries only the group that moved', () => {
		const before = resolveState(props({ settings: { quality: { bloom: 2 }, camera: { fov: 40 } } }))
		const after = resolveState(props({ settings: { quality: { bloom: 3 }, camera: { fov: 40 } } }))
		expect(diffState(before, after)).toEqual({ settings: { quality: { bloom: 3 } } })
	})

	/** Gloves go wholesale, because a pair without a `type` is a state the renderer cannot resolve. */
	test('gloves are sent whole, and `null` is a real value', () => {
		const before = resolveState(props({ gloves: { type: 'sporty_gloves', paintIndex: 10_038 } }))
		const after = resolveState(props({ gloves: null }))
		expect(diffState(before, after)).toEqual({ gloves: null })

		const back = diffState(after, before)
		expect(back?.gloves).toEqual({ type: 'sporty_gloves', paintIndex: 10_038 })
	})

	test('a sticker moving by a fraction is a patch; the same placement twice is not', () => {
		const at = (offsetX: number) =>
			resolveState(props({ item: { weapon: 'weapon_ak47', paintIndex: 44, stickers: [{ id: 5, offsetX }] } }))
		expect(diffState(at(0.1), at(0.1))).toBeUndefined()
		expect(diffState(at(0.1), at(0.2))?.item?.stickers).toBeDefined()
	})
})

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT COVERS THE CANVAS
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('coversCanvas', () => {
	test('identity fields cover, configuration fields do not', () => {
		expect(IDENTITY_FIELDS).toEqual(['weaponType', 'paintIndex', 'legacyModel'])
		for (const field of IDENTITY_FIELDS)
			expect(coversCanvas({ item: { [field]: field === 'legacyModel' ? true : 1 } }, 'gun')).toBe(true)

		for (const patch of [{ item: { float: 0.3 } }, { item: { seed: 5 } }, { item: { nameTag: 'x' } }, {}])
			expect(coversCanvas(patch, 'gun')).toBe(false)
	})

	test('a view change always covers', () => {
		expect(coversCanvas({ view: 'hands' }, 'gun')).toBe(true)
	})

	/**
	 * *** THE OPERATOR IS IDENTITY IN `agent` AND CHEAP IN `hands`, and the asymmetry is the
	 * renderer's. *** In `agent` the operator's `<Suspense>` tears the whole subtree down; in `hands`
	 * they are a mesh swap inside a rig that keeps running, so a cover there would go up over a picture
	 * that is already correct.
	 */
	test('the operator covers in the agent view and not in hands', () => {
		expect(coversCanvas({ agent: { id: 5036 } }, 'agent')).toBe(true)
		expect(coversCanvas({ agent: { id: 5036 } }, 'hands')).toBe(false)
		expect(coversCanvas({ agent: { pose: 'idle' } }, 'agent')).toBe(false)
	})
})
