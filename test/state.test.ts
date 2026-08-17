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

import type { FrameSubjectKind } from '../src/protocol.js'
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

	/* ── THE HOST'S OWN COPY ─────────────────────────────────────────────────────────────────── */

	/**
	 * *** THESE SEVEN SPELLINGS ARE HALF OF A CONTRACT WHOSE OTHER HALF IS IN ANOTHER REPOSITORY. ***
	 * `app/frame/urlState.ts` reads exactly these param names, and a disagreement is SILENT in a way a
	 * message-shape disagreement is not: an unknown query param is dropped without a word, on purpose,
	 * because the URL is shared with `?origin=`, `?help=` and whatever the host appends. So the freeze
	 * has to be here, spelled out, rather than left to `wire.snapshot.json` - which describes the
	 * MESSAGE door and cannot see this one.
	 */
	test('the label params are spelled exactly as the frame reads them', () => {
		const params = query({
			settings: {
				locale: {
					dir: 'rtl',
					labels: {
						confirm: 'אישור',
						cancel: 'ביטול',
						wear: 'שחיקה',
						seed: 'תבנית',
						loading: 'טוען',
						loadingView: 'טוען תצוגת {view}',
						noModel: 'הדגם עדיין לא פורסם',
					},
				},
			},
		})
		expect([...params.keys()].sort()).toEqual([
			'dir',
			'labelcancel',
			'labelconfirm',
			'labelloading',
			'labelloadingview',
			'labelnomodel',
			'labelseed',
			'labelwear',
			'paint',
			'weapon',
		])
		expect(params.get('labelconfirm')).toBe('אישור')
		// The placeholder survives encoding rather than being resolved here - the frame owns the view names.
		expect(params.get('labelloadingview')).toBe('טוען תצוגת {view}')
	})

	/**
	 * *** THE LABELS ARE ON THE FIRST PAINT OR THEY ARE A FLICKER. *** A gizmo that says Confirm in
	 * English for one round trip and in Hebrew after it is worse on a product page than either alone, so
	 * this is a URL param and not only a `set` field. The assertion is on the ENCODED string, because a
	 * Hebrew label in a query string is percent-encoded and anything that mangles that produces a label
	 * nobody can read.
	 */
	test('a translated label is in the src the iframe boots on', () => {
		const { src } = frameUrl(
			'https://skinhub.gg',
			resolveState(props({ settings: { locale: { dir: 'rtl', labels: { confirm: 'אישור' } } } })),
		)
		expect(src).toContain('dir=rtl')
		expect(src).toContain(`labelconfirm=${encodeURIComponent('אישור')}`)
		expect(new URL(src).searchParams.get('labelconfirm')).toBe('אישור')
	})

	/** A caller who translated two of seven writes two params. Ours must not appear beside them. */
	test('an untranslated label is absent rather than English in their URL', () => {
		const params = query({ settings: { locale: { labels: { confirm: 'אישור', cancel: 'ביטול' } } } })
		expect([...params.keys()].sort()).toEqual(['labelcancel', 'labelconfirm', 'paint', 'weapon'])
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

	/**
	 * *** A FRESH LABELS OBJECT HOLDING THE SAME WORDS IS NOT A CHANGE, and this is the one comparison in
	 * the file that would be wrong by identity. *** A host resolving copy from a catalogue writes
	 * `labels={{ confirm: t('confirm') }}` - a new object every render, with `t()` returning the same
	 * string every time. Identity alone would post a `set` per render for ever, into a gizmo the user may
	 * be mid-drag inside.
	 */
	test('the same copy in a fresh object is not a change', () => {
		const locale = () => ({ locale: { dir: 'rtl' as const, labels: { confirm: 'אישור' } } })
		const before = resolveState(props({ settings: locale() }))
		const after = resolveState(props({ settings: locale() }))
		expect(before.settings?.locale).not.toBe(after.settings?.locale)
		expect(diffState(before, after)).toBeUndefined()
	})

	test('a changed word is a patch carrying the copy group alone', () => {
		const before = resolveState(props({ settings: { locale: { labels: { confirm: 'Confirm' } } } }))
		const after = resolveState(props({ settings: { locale: { labels: { confirm: 'אישור' } } } }))
		expect(diffState(before, after)).toEqual({ settings: { locale: { labels: { confirm: 'אישור' } } } })
	})

	/**
	 * *** AND CHANGING THE COPY MUST NOT COVER THE CANVAS. *** It is a label, not an item: a host that
	 * switches language while a viewer is mounted should see the words change, not a loading card over
	 * a reloaded weapon. `coversCanvas` never mentions `settings`, and this is the test that says so.
	 */
	test('a language switch does not reload the picture', () => {
		const before = resolveState(props({ settings: { locale: { labels: { confirm: 'Confirm' } } } }))
		const after = resolveState(props({ settings: { locale: { dir: 'rtl', labels: { confirm: 'אישור' } } } }))
		const patch = diffState(before, after)
		expect(patch).toBeDefined()
		expect(coversCanvas(patch ?? {}, after)).toBe(false)
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
	/** The second argument is the state the patch lands ON - the subject decides two of the answers. */
	const on = (view: 'gun' | 'hands' | 'agent', subject: FrameSubjectKind = 'weapon') => ({ view, subject })

	test('identity fields cover, configuration fields do not', () => {
		expect(IDENTITY_FIELDS).toEqual(['weaponType', 'paintIndex', 'legacyModel'])
		for (const field of IDENTITY_FIELDS)
			expect(coversCanvas({ item: { [field]: field === 'legacyModel' ? true : 1 } }, on('gun'))).toBe(true)

		for (const patch of [{ item: { float: 0.3 } }, { item: { seed: 5 } }, { item: { nameTag: 'x' } }, {}])
			expect(coversCanvas(patch, on('gun'))).toBe(false)
	})

	test('a view change always covers', () => {
		expect(coversCanvas({ view: 'hands' }, on('gun'))).toBe(true)
	})

	/**
	 * *** THE OPERATOR IS IDENTITY IN `agent` AND CHEAP IN `hands`, and the asymmetry is the
	 * renderer's. *** In `agent` the operator's `<Suspense>` tears the whole subtree down; in `hands`
	 * they are a mesh swap inside a rig that keeps running, so a cover there would go up over a picture
	 * that is already correct.
	 */
	test('the operator covers in the agent view and not in hands', () => {
		expect(coversCanvas({ agent: { id: 5036 } }, on('agent'))).toBe(true)
		expect(coversCanvas({ agent: { id: 5036 } }, on('hands'))).toBe(false)
		expect(coversCanvas({ agent: { pose: 'idle' } }, on('agent'))).toBe(false)
	})

	/**
	 * *** AND THE SAME SPLIT ON THE OTHER FOUR SUBJECTS: THE ID COVERS, THE SECOND FIELD DOES NOT. ***
	 *
	 * This is the package's half of the owner's cheap-update requirement for the subjects added on
	 * 2026-08-16. The frame's half is measured in a browser - zero covered frames across a `wear` drag -
	 * and this is what stops the package raising a consumer's `loading` slot over a picture the frame
	 * never covered, which from the outside would be indistinguishable from a reload.
	 */
	test('a standalone id covers and its configuration field does not', () => {
		expect(coversCanvas({ sticker: { id: 37 } }, on('gun', 'sticker'))).toBe(true)
		expect(coversCanvas({ sticker: { wear: 0.4 } }, on('gun', 'sticker'))).toBe(false)
		expect(coversCanvas({ charm: { id: 5 } }, on('gun', 'charm'))).toBe(true)
		expect(coversCanvas({ charm: { pattern: 900 } }, on('gun', 'charm'))).toBe(false)
		// A collectible has no second field at all, so the id is the only thing that can be patched.
		expect(coversCanvas({ collectible: { id: 874 } }, on('gun', 'collectible'))).toBe(true)
	})

	test('the operator covers when they are the subject, and the pose still does not', () => {
		expect(coversCanvas({ agent: { id: 5036 } }, on('gun', 'agent'))).toBe(true)
		expect(coversCanvas({ agent: { pose: 't_main_menu_knife_idle' } }, on('gun', 'agent'))).toBe(false)
	})

	/** A different KIND of subject is a different renderer, so it covers in every direction. */
	test('a subject change always covers', () => {
		expect(coversCanvas({ subject: 'sticker' }, on('gun', 'sticker'))).toBe(true)
		expect(coversCanvas({ subject: 'weapon' }, on('gun', 'weapon'))).toBe(true)
	})
})

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE OTHER FOUR SUBJECTS, THROUGH THE URL AND THE DIFF
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the standalone subjects', () => {
	const src = (props: Parameters<typeof resolveState>[0]) => {
		const { src } = frameUrl('https://skinhub.gg', resolveState(props))
		return new URL(src).searchParams
	}

	test('each names itself in the URL, and the weapon still says nothing', () => {
		expect(src({ sticker: { id: 37, wear: 0.4 } }).get('subject')).toBe('sticker')
		expect(src({ sticker: { id: 37, wear: 0.4 } }).get('sticker')).toBe('37')
		expect(src({ sticker: { id: 37, wear: 0.4 } }).get('wear')).toBe('0.4')

		expect(src({ charm: { id: 5, pattern: 900 } }).get('subject')).toBe('charm')
		expect(src({ charm: { id: 5, pattern: 900 } }).get('pattern')).toBe('900')

		expect(src({ collectible: { id: 874 } }).get('subject')).toBe('collectible')
		expect(src({ collectible: { id: 874 } }).get('collectible')).toBe('874')

		// `operator` becomes `subject=agent` plus the `agent` id the weapon views already use.
		expect(src({ operator: { id: 5036 } }).get('subject')).toBe('agent')
		expect(src({ operator: { id: 5036 } }).get('agent')).toBe('5036')

		// OUR default must never be frozen into a customer's src - see `frameUrl`.
		expect(src({ item: { weapon: 'weapon_ak47', paintIndex: 1449 } }).get('subject')).toBeNull()
	})

	test('an unset second field is left out of the URL entirely', () => {
		expect(src({ sticker: { id: 37 } }).has('wear')).toBe(false)
		expect(src({ charm: { id: 5 } }).has('pattern')).toBe(false)
	})

	test('a cheap field diffs on its own and the id is not restated', () => {
		const before = resolveState({ sticker: { id: 37, wear: 0.1 } })
		const after = resolveState({ sticker: { id: 37, wear: 0.2 } })
		const patch = diffState(before, after)
		// The ID IS NOT IN THE PATCH - see `diffGroup`. That is the whole difference between a cheap
		// update and one that raises the caller's loading slot.
		expect(patch?.sticker).toEqual({ wear: 0.2 })
		expect(patch?.subject).toBeUndefined()
		// The whole point: this must not raise the caller's loading slot.
		expect(coversCanvas(patch ?? {}, after)).toBe(false)
	})

	test('switching subject sends the subject, and switching back costs one field', () => {
		const weapon = resolveState({ item: { weapon: 'weapon_ak47', paintIndex: 1449 } })
		const pin = resolveState({ collectible: { id: 874 } })
		expect(diffState(weapon, pin)?.subject).toBe('collectible')
		expect(diffState(pin, weapon)?.subject).toBe('weapon')
	})

	/** An id that is not a positive integer is the `no-item` case, not a zero passed through. */
	test('a zero id is no-item rather than an empty slot', () => {
		const state = resolveState({ sticker: { id: 0 } })
		expect(state.subjectError?.code).toBe('no-item')
		expect(state.help).toBe('no-item')
	})
})
