/**
 * *** PROPS → A URL, AND THEN PROPS → PATCHES. ***
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** THE TWO DOORS, AND WHY THIS PACKAGE USES BOTH RATHER THAN PICKING ONE. ***
 *
 * `/frame` can be driven by a query string or by `set` messages, and both go through the same
 * applier on the far side. This package uses the URL for the FIRST render and messages for every
 * render after it, and the split is not an optimisation - it is the only arrangement that gets both
 * properties an integrator will judge us on:
 *
 *   THE FIRST PAINT IS THEIR ITEM, not ours swapped a tick later. A frame that booted on our default
 *   AK and was corrected by a message would show the wrong gun for one round trip, on a product page.
 *
 *   NO LATER PROP CHANGE TOUCHES THE `src`. *** THIS IS THE LOAD-BEARING ONE. *** Rewriting `src`
 *   reloads the document, which throws away the GL context, re-downloads the model and re-runs every
 *   shader compile - i.e. it turns a float slider into a five-second stall. So the URL is built once,
 *   frozen, and everything after it is a patch. See `SkinViewer.tsx`, where the same rule is enforced
 *   on the element.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** AND THE REASON {@link diffState} IS A DIFF RATHER THAN "SEND THE WHOLE STATE EVERY TIME". ***
 *
 * Sending everything would be correct - the frame's merge returns the SAME OBJECT when the values it
 * is handed are the values it already has, so a restated `weaponType` costs nothing and does not
 * reload. It would still be wrong, for one reason: `stickers` is an ARRAY WE REBUILD ON EVERY RENDER.
 * The renderer holds its sticker draft against that array BY IDENTITY, so a fresh six-slot tuple
 * arriving on every tick of somebody's float slider would re-seed the draft sixty times a second and
 * fight the user's own drag. The frame's own protocol file warns about exactly this.
 *
 * So the diff is structural: a field is in the patch only if its VALUE moved.
 */

import type {
	FrameCharm,
	FrameCollectible,
	FrameInteractions,
	FrameItem,
	FrameLabels,
	FramePatch,
	FrameSettings,
	FrameSticker,
	FrameSubjectKind,
	PlacementSlots,
} from './protocol.js'
import { resolveStandalone, resolveSubject } from './item.js'
import type { SkinViewerError, SkinViewerProps, ViewerGloves, ViewerView } from './types.js'

/**
 * Why the frame is showing its instruction card instead of an item. See `SkinViewer.tsx` and the
 * `?help=` note in `EMBED.md`.
 */
export type HelpReason = 'no-item' | 'bad-link' | 'unknown-weapon'

/**
 * Everything this package can tell the frame, resolved from one render's props.
 *
 * *** ABSENT MEANS "SAY NOTHING", NOT "USE THE DEFAULT", *** all the way down. An integrator who never
 * passes `settings.quality.bloom` must not have `bloom=1` written into their URL, because then OUR
 * default is frozen into THEIR embed and the day we change it their picture does not move. The
 * defaults live in one place - the frame - and this file's job is to be quiet about everything the
 * caller did not mention.
 */
export type DesiredState = {
	/**
	 * WHICH OF THE FIVE IS ON SCREEN.
	 *
	 * *** THE ONE FIELD HERE THAT IS ALWAYS SET, AND THE EXCEPTION IS EARNED. *** Everything else in
	 * this type obeys "absent means say nothing", because our defaults must not be frozen into somebody
	 * else's URL. The subject cannot: going BACK to a weapon from a sticker has to be expressible, and a
	 * diff can only express it if there is a value to compare against. So it is always resolved - and
	 * {@link frameUrl} then declines to write `?subject=weapon`, which keeps the same promise in the one
	 * place it can be kept.
	 */
	subject: FrameSubjectKind
	/** `null` when the props named no renderable item, or named a subject that is not a weapon. */
	item: FrameItem | null
	/** Set only when {@link subject} names it. Same rule as `item`, one per standalone subject. */
	sticker?: FrameSticker
	charm?: FrameCharm
	collectible?: FrameCollectible
	/** The integrator's own inspect link, forwarded verbatim as `?i=`. See `item.ts`. */
	inspectPayload: string | null
	help: HelpReason | null
	subjectError: SkinViewerError | null
	view?: ViewerView
	agent?: { id?: number; pose?: string | null }
	/** `undefined` says nothing; `null` is the wearer's OWN default pair, which is a real value. */
	gloves?: ViewerGloves | null
	settings?: FrameSettings
	interactions?: FrameInteractions
	editingSlot?: number
}

const HELP_FOR: Record<SkinViewerError['code'], HelpReason | null> = {
	'no-item': 'no-item',
	'bad-inspect-link': 'bad-link',
	'unknown-weapon': 'unknown-weapon',
	'render-failed': null,
	'bad-message': null,
	'protocol-mismatch': null,
	// There is no help card for an embed that never loaded: the card is drawn BY the frame, and the
	// frame is the thing that did not arrive.
	unreachable: null,
}

/**
 * One render's props as {@link DesiredState}. Pure, synchronous, no React - so it can run in a
 * `useState` initialiser during SSR as well as on every subsequent render.
 *
 * *** IT TAKES A `Partial<>` OF ITS OWN PROP TYPE ON PURPOSE. *** The types make a missing item a
 * compile error; this function is what happens when the types were bypassed - plain JavaScript, an
 * `any`, a query that had not resolved - and its whole value is that it has an answer for that case
 * rather than a `TypeError`.
 */
export const resolveState = (props: Partial<SkinViewerProps>): DesiredState => {
	const settings = toFrameSettings(props.settings)
	/* Everything true of every subject. Hoisted so the two returns below cannot drift apart. */
	const common = {
		...(props.view !== undefined && { view: props.view }),
		...(props.agent !== undefined && { agent: props.agent }),
		...(props.gloves !== undefined && { gloves: props.gloves }),
		...(settings !== undefined && { settings }),
		...(props.interactions !== undefined && { interactions: { ...props.interactions } }),
		...(props.editingSlot !== undefined && { editingSlot: props.editingSlot }),
	}

	/*
	 * THE OTHER FOUR SUBJECTS FIRST, because each is named by its own prop and the weapon is the
	 * fall-through. `item` stays null for them: there IS no weapon, and inventing one would put a rifle
	 * into this package's URL that the frame would then hold behind a subject nobody is looking at.
	 *
	 * `agent` IS WRITTEN LAST for the operator, so `operator={{ pose }}` beats an `agent={{ pose }}` a
	 * host also happened to pass. Two props answering one question is only reachable through the types'
	 * back door, and the subject arm is the more specific statement.
	 */
	const standalone = resolveStandalone(props)
	if (standalone)
		return {
			subject: standalone.subject,
			item: null,
			...(standalone.sticker && { sticker: standalone.sticker }),
			...(standalone.charm && { charm: standalone.charm }),
			...(standalone.collectible && { collectible: standalone.collectible }),
			inspectPayload: null,
			help: standalone.error ? HELP_FOR[standalone.error.code] : null,
			subjectError: standalone.error,
			...common,
			...(standalone.agent && { agent: standalone.agent }),
		}

	const subject = resolveSubject(props)
	return {
		subject: 'weapon',
		item: subject.item,
		inspectPayload: subject.inspectPayload,
		help: subject.error ? HELP_FOR[subject.error.code] : null,
		subjectError: subject.error,
		...common,
	}
}

/**
 * The public settings as the wire's.
 *
 * A STRUCTURAL COPY RATHER THAN A PASS-THROUGH, so the object that goes on the wire is one this
 * package built: a caller who mutates the object they passed us cannot change what a later diff
 * compares against, and a field we do not know about cannot ride along into a `postMessage` where the
 * frame would name it in `problems`.
 */
const toFrameSettings = (settings: SkinViewerProps['settings']): FrameSettings | undefined => {
	if (!settings) return undefined
	const out: FrameSettings = {}
	if (settings.camera) out.camera = { ...settings.camera }
	if (settings.quality) out.quality = { ...settings.quality }
	if (settings.environment) out.environment = { ...settings.environment }
	if (settings.overlays)
		out.overlays = {
			...settings.overlays,
			...(settings.overlays.gizmoStyle && { gizmoStyle: { ...settings.overlays.gizmoStyle } }),
		}
	// The labels are copied one level down for the same reason `gizmoStyle` is: they are the one group a
	// host is likely to hold in a memo of their own and rebuild in place from a message catalogue.
	if (settings.locale)
		out.locale = {
			...settings.locale,
			...(settings.locale.labels && { labels: { ...settings.locale.labels } }),
		}
	return out
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE URL
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `EMBED.md` §8: `0` is off, anything else present is on, absent leaves the field alone. */
const flag = (params: URLSearchParams, key: string, value: boolean | undefined) => {
	if (value !== undefined) params.set(key, value ? '1' : '0')
}

const num = (params: URLSearchParams, key: string, value: number | undefined) => {
	if (value !== undefined) params.set(key, String(value))
}

/**
 * One query param per label.
 *
 * *** A `Record` OVER THE KEY UNION AND NOT AN ARRAY OF PAIRS, so it is EXHAUSTIVE: *** a label added
 * to {@link FrameLabels} that is not spelled here fails to compile. Without that, the next label would
 * reach the message door and silently miss the URL one - i.e. it would work on every render except the
 * first, which is the hardest kind of gap to see.
 */
const LABEL_PARAMS: Record<keyof FrameLabels, string> = {
	confirm: 'labelconfirm',
	cancel: 'labelcancel',
	wear: 'labelwear',
	seed: 'labelseed',
	loading: 'labelloading',
	loadingView: 'labelloadingview',
	noModel: 'labelnomodel',
}

/**
 * The initial `<iframe src>`, and the state that URL actually expressed.
 *
 * *** THE SECOND RETURN VALUE IS NOT BOOKKEEPING - IT IS THE BASELINE EVERY LATER PATCH IS MEASURED
 * AGAINST. *** One field is deliberately NOT encodable: the stickers, which the query string can only
 * carry inside an `?i=` payload. Rather than re-encode a placement into an inspect link here - a
 * second implementation of a codec whose only job would be to disagree with the frame's decoder - the
 * stickers are simply left out of the URL and reported as unsent, so the first diff after the frame
 * announces itself carries them. They are a CHEAP field, so they arrive without a loading card, and
 * in practice they arrive long before the model has finished downloading.
 *
 * When the integrator gave us an inspect link there is nothing to encode: their own payload goes
 * through as `?i=` and carries the stickers with it.
 */
export const frameUrl = (origin: string, desired: DesiredState): { src: string; expressed: DesiredState } => {
	const params = new URLSearchParams()
	const item = desired.item

	if (desired.help) params.set('help', desired.help)

	/*
	 * ── THE SUBJECT ──────────────────────────────────────────────────────────────────────────
	 *
	 * `?subject=` IS WRITTEN FOR EVERY NON-WEAPON AND NEVER FOR A WEAPON. Not writing it for the weapon
	 * keeps this file's promise about defaults: `?subject=weapon` in a customer's `<iframe src>` would
	 * be OUR default frozen into THEIR embed. Writing it for the other four is not the same thing - it
	 * is the caller's own statement, and for the operator it is the only way to say it, because
	 * `?agent=` on its own has always meant "who holds the weapon".
	 *
	 * The id params are what the frame reads back; `?sticker=`/`?charm=`/`?collectible=` each imply the
	 * subject on their own, so the pair is redundant by design rather than by accident - a URL that says
	 * the same thing twice cannot be half-copied into meaning something else.
	 */
	if (desired.subject !== 'weapon') params.set('subject', desired.subject)
	if (desired.sticker) {
		params.set('sticker', String(desired.sticker.id))
		num(params, 'wear', desired.sticker.wear)
	}
	if (desired.charm) {
		params.set('charm', String(desired.charm.id))
		// `?pattern=` and not `?seed=` - on this URL `seed` is already the WEAPON's paint seed.
		num(params, 'pattern', desired.charm.pattern)
	}
	if (desired.collectible) params.set('collectible', String(desired.collectible.id))

	if (item) {
		params.set('weapon', item.weaponType)
		params.set('paint', String(item.paintIndex))
		if (item.legacyModel !== undefined) flag(params, 'legacy', item.legacyModel)

		if (desired.inspectPayload) params.set('i', desired.inspectPayload)

		/*
		 * WRITTEN AFTER `?i=` AND THAT ORDER IS THE CONTRACT: a plain `float=`/`seed=`/`st=`/`nametag=`
		 * beats the same field inside `?i=`, because the explicit one is the more specific statement.
		 * Here they carry the same values anyway - both came out of the same decode - so the ordering
		 * only matters for a host that passes both, and it matters that we agree with the documented rule
		 * rather than relying on them not to.
		 */
		num(params, 'float', item.float)
		num(params, 'seed', item.seed)
		// `st=0` is a real, freshly-minted counter; `st=-1` removes the module; absent means no module.
		if (item.statTrak !== undefined) params.set('st', item.statTrak === false ? '-1' : String(item.statTrak))
		if (item.nameTag !== undefined) params.set('nametag', item.nameTag ?? '')
	}

	if (desired.view) params.set('view', desired.view)
	if (desired.agent?.id !== undefined) params.set('agent', String(desired.agent.id))
	if (desired.agent?.pose) params.set('pose', desired.agent.pose)
	if (desired.gloves !== undefined) params.set('glove', desired.gloves ? gloveParam(desired.gloves) : 'none')

	const s = desired.settings
	num(params, 'fov', s?.camera?.fov)
	num(params, 'zoom', s?.camera?.defaultZoom)
	num(params, 'bloom', s?.quality?.bloom)
	num(params, 'spill', s?.quality?.bloomSpill)
	num(params, 'scale', s?.quality?.renderScale)
	flag(params, 'aa', s?.quality?.antialias)
	flag(params, 'shadows', s?.quality?.shadows)
	// `?map=none` is the calibrated reference rig, which is what `map: null` means on the prop.
	if (s?.environment?.map !== undefined) params.set('map', s.environment.map ?? 'none')
	if (s?.environment?.timeOfDay) params.set('time', s.environment.timeOfDay)
	flag(params, 'rain', s?.environment?.rain)
	if (s?.environment?.background) params.set('bg', s.environment.background)
	flag(params, 'stickergizmo', s?.overlays?.stickerGizmo)
	flag(params, 'charmgizmo', s?.overlays?.charmGizmo)
	if (s?.overlays?.gizmoStyle?.color) params.set('gizmocolor', s.overlays.gizmoStyle.color)
	if (s?.overlays?.gizmoStyle?.shadowColor) params.set('gizmoshadow', s.overlays.gizmoStyle.shadowColor)

	/*
	 * ── THE COPY, AND WHICH WAY IT READS ─────────────────────────────────────────────────────
	 *
	 * *** IN THE URL AND NOT ONLY IN A MESSAGE, AND THAT IS THE POINT OF PUTTING THEM HERE. *** The
	 * labels have to be on the FIRST paint: a gizmo that spells Confirm in English for one round trip
	 * and in Hebrew after it is a flicker on somebody's product page, and the whole reason this file
	 * builds a URL at all is that the first picture must be the host's own. It is also what gives the
	 * raw-`<iframe>` integrator - a PHP shop with a Hebrew page, which is exactly the customer this
	 * feature exists for - the same capability with no JavaScript.
	 *
	 * ONE PARAM PER LABEL, PREFIXED. `?wear=` is already the sticker subject's scratch and `?seed=` is
	 * already the weapon's paint seed, so the words cannot be reused bare; `label…` is the same
	 * noun-first shape `?gizmocolor=` uses.
	 */
	if (s?.locale?.dir) params.set('dir', s.locale.dir)
	const labels = s?.locale?.labels
	if (labels)
		for (const key of Object.keys(LABEL_PARAMS) as (keyof FrameLabels)[]) {
			const label = labels[key]
			if (label) params.set(LABEL_PARAMS[key], label)
		}

	flag(params, 'orbit', desired.interactions?.orbit)
	// The wheel gesture is named after the input that performs it, because `?zoom=` is the camera's.
	flag(params, 'wheel', desired.interactions?.zoom)
	flag(params, 'dragstickers', desired.interactions?.dragStickers)
	flag(params, 'dragcharm', desired.interactions?.dragCharm)
	if (desired.editingSlot !== undefined) params.set('slot', String(desired.editingSlot))

	const expressed: DesiredState =
		item && !desired.inspectPayload && item.stickers ? { ...desired, item: { ...item, stickers: undefined } } : desired

	return { src: `${origin.replace(/\/+$/, '')}/frame?${params.toString()}`, expressed }
}

/** `type:paintIndex[:float[:seed]]` - one param and not four, because they are one item. */
const gloveParam = (gloves: ViewerGloves) =>
	[gloves.type, gloves.paintIndex, gloves.float, gloves.seed].filter(part => part !== undefined).join(':')

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE DIFF
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * *** WHICH FIELDS RELOAD THE FRAME. *** `EMBED.md`'s cheap-vs-reload table, as a value.
 *
 * The component reads this to decide when to raise a caller's `loading` slot, so the slot is raised
 * on exactly the changes that actually cover the canvas rather than on a guess. `view` and the agent
 * are the same class but are not fields of the item, so they are handled beside it.
 */
export const IDENTITY_FIELDS = [
	'weaponType',
	'paintIndex',
	'legacyModel',
] as const satisfies readonly (keyof FrameItem)[]

const shallowEqual = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	const keys = new Set([...Object.keys(a), ...Object.keys(b)])
	for (const key of keys) if (!Object.is(a[key], b[key])) return false
	return true
}

/** The six slots, field by field. The only deep comparison in this package, and it is fixed-size. */
const slotsEqual = (a: PlacementSlots | undefined, b: PlacementSlots | undefined): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	for (let i = 0; i < 6; i++)
		if (!shallowEqual(a[i] as unknown as Record<string, unknown>, b[i] as unknown as Record<string, unknown>))
			return false
	return true
}

/** `undefined` when nothing moved, which is what lets the component skip the `postMessage` entirely. */
export const diffState = (previous: DesiredState, next: DesiredState): FramePatch | undefined => {
	const patch: FramePatch = {}
	let changed = false

	/* ── THE ITEM ─────────────────────────────────────────────────────────────────────────────
	 *
	 * *** AN ITEM THAT DISAPPEARS DOES NOT BLANK THE VIEWER. *** `next.item === null` means this render
	 * had no renderable item - a host whose query briefly returned `undefined`, which in a real app is
	 * a re-render blip rather than an instruction. The picture is left alone and the component reports
	 * `no-item` through `onError`; there is no way to say "show nothing" over the wire and inventing one
	 * would make a transient state destructive.
	 */
	if (next.item) {
		const item: Partial<FrameItem> = {}
		const before = previous.item
		if (!before) {
			Object.assign(item, next.item)
			changed = true
		} else {
			for (const key of ['weaponType', 'paintIndex', 'legacyModel', 'float', 'seed', 'statTrak', 'nameTag'] as const)
				if (!Object.is(before[key], next.item[key])) {
					// `as never` narrows the union of value types down to the one this key holds; the loop is
					// over a literal tuple so the pairing is checked, but TypeScript cannot see it per key.
					item[key] = next.item[key] as never
					changed = true
				}
			if (!slotsEqual(before.stickers, next.item.stickers) && next.item.stickers) {
				item.stickers = next.item.stickers
				changed = true
			}
		}
		if (Object.keys(item).length > 0) patch.item = item
	}

	/*
	 * ── THE OTHER FOUR SUBJECTS ───────────────────────────────────────────────────────────────
	 *
	 * A GROUP IS DIFFED EVEN WHEN THE SUBJECT DID NOT MOVE, so a `wear` drag on a sticker is one small
	 * patch per tick and nothing else - the identical shape a `float` drag on a rifle has, and cheap for
	 * the identical reason: the id is not in the patch, so nothing keyed on the id can move.
	 *
	 * THE SUBJECT IS DIFFED SEPARATELY AND CARRIES NO GROUP WITH IT. Switching to a sticker whose id has
	 * not changed sends `{ subject: 'sticker' }` alone, because the frame still holds the id it was given
	 * before - which is what makes flipping between two subjects cost one field.
	 */
	if (next.subject !== previous.subject) {
		patch.subject = next.subject
		changed = true
	}
	/*
	 * *** FIELD BY FIELD, NOT WHOLE-GROUP, AND THE TEST BELOW IS WHY. *** Sending the whole group would
	 * be correct on the wire - the frame merges by field either way - and would still break the
	 * contract, because `coversCanvas` reads `sticker.id !== undefined` to decide whether to raise the
	 * caller's `loading` slot. A `wear` drag that restated the id would raise it sixty times a second
	 * over a picture the frame never covered, which from outside is indistinguishable from a reload.
	 * The item above is diffed per field for the same reason; gloves are the one group sent wholesale,
	 * and that is because a partial pair is a state the renderer cannot resolve.
	 */
	const sticker = diffGroup(previous.sticker, next.sticker)
	if (sticker) {
		patch.sticker = sticker
		changed = true
	}
	const charm = diffGroup(previous.charm, next.charm)
	if (charm) {
		patch.charm = charm
		changed = true
	}
	const collectible = diffGroup(previous.collectible, next.collectible)
	if (collectible) {
		patch.collectible = collectible
		changed = true
	}

	if (next.view !== undefined && next.view !== previous.view) {
		patch.view = next.view
		changed = true
	}

	if (next.agent && !shallowEqual(previous.agent, next.agent)) {
		patch.agent = next.agent
		changed = true
	}

	/*
	 * GLOVES ARE THE ONE FIELD SENT WHOLESALE. `null` there is not an absence - it is "the wearer's own
	 * default pair" - and a partial glove patch that left the pair without a `type` is a state the
	 * renderer cannot resolve, so the frame rejects it. Sending the whole pair keeps that impossible.
	 */
	if (next.gloves !== undefined && !glovesEqual(previous.gloves, next.gloves)) {
		patch.gloves = next.gloves ?? null
		changed = true
	}

	const settings = diffSettings(previous.settings, next.settings)
	if (settings) {
		patch.settings = settings
		changed = true
	}

	if (next.interactions && !shallowEqual(previous.interactions, next.interactions)) {
		patch.interactions = next.interactions
		changed = true
	}

	if (next.editingSlot !== undefined && next.editingSlot !== previous.editingSlot) {
		patch.editingSlot = next.editingSlot
		changed = true
	}

	return changed ? patch : undefined
}

/**
 * One flat group, per field. `undefined` when nothing moved, so the caller can skip the key entirely.
 *
 * A KEY THE NEXT RENDER DID NOT MENTION IS NOT DIFFED AWAY - there is no way to say "unset" over the
 * wire, and the alternative reading would make a conditional prop destructive. Same rule as
 * {@link diffSettings} one level in.
 */
const diffGroup = <T extends object>(previous: T | undefined, next: T | undefined): Partial<T> | undefined => {
	if (!next) return undefined
	if (!previous) return { ...next }
	const out: Partial<T> = {}
	let changed = false
	for (const key of Object.keys(next) as (keyof T)[])
		if (!Object.is(previous[key], next[key])) {
			out[key] = next[key]
			changed = true
		}
	return changed ? out : undefined
}

const glovesEqual = (a: ViewerGloves | null | undefined, b: ViewerGloves | null | undefined) => {
	if (a === b) return true
	if (!a || !b) return false
	return a.type === b.type && a.paintIndex === b.paintIndex && a.float === b.float && a.seed === b.seed
}

/**
 * Per group, per field - which is the same rule the frame merges by, one level in.
 *
 * A GROUP THE CALLER DID NOT MENTION THIS RENDER IS NOT DIFFED AWAY. `settings={{ quality: {…} }}`
 * after `settings={{ quality: {…}, camera: {…} }}` does not reset the camera: there is no way to say
 * "unset" over the wire, and the alternative reading - that dropping a key means restore the default -
 * would make a conditional `settings` object destructive in a way React developers do not expect.
 */
const diffSettings = (
	previous: FrameSettings | undefined,
	next: FrameSettings | undefined,
): FrameSettings | undefined => {
	if (!next) return undefined
	const out: FrameSettings = {}
	let changed = false

	if (next.camera && !shallowEqual(previous?.camera, next.camera)) {
		out.camera = next.camera
		changed = true
	}
	if (next.quality && !shallowEqual(previous?.quality, next.quality)) {
		out.quality = next.quality
		changed = true
	}
	if (next.environment && !shallowEqual(previous?.environment, next.environment)) {
		out.environment = next.environment
		changed = true
	}
	if (next.overlays && !overlaysEqual(previous?.overlays, next.overlays)) {
		out.overlays = next.overlays
		changed = true
	}
	if (next.locale && !localeEqual(previous?.locale, next.locale)) {
		out.locale = next.locale
		changed = true
	}

	return changed ? out : undefined
}

const overlaysEqual = (a: FrameSettings['overlays'], b: FrameSettings['overlays']) => {
	if (a === b) return true
	if (!a || !b) return false
	return a.stickerGizmo === b.stickerGizmo && a.charmGizmo === b.charmGizmo && shallowEqual(a.gizmoStyle, b.gizmoStyle)
}

/**
 * *** COMPARED BY VALUE AND NOT BY IDENTITY, WHICH IS THE WHOLE REASON THIS FUNCTION EXISTS. *** A host
 * resolving labels from a message catalogue - `{ confirm: t('confirm') }` - builds a fresh object on
 * every render, and `t()` returns the same string every time. Identity alone would therefore post a
 * `set` per render for ever, and the labels reach a gizmo the user may be mid-drag inside.
 */
const localeEqual = (a: FrameSettings['locale'], b: FrameSettings['locale']) => {
	if (a === b) return true
	if (!a || !b) return false
	return a.dir === b.dir && shallowEqual(a.labels, b.labels)
}

/**
 * True when a patch would cover the canvas - see {@link IDENTITY_FIELDS} and `CHEAP_FIELDS`.
 *
 * IT TAKES THE WHOLE NEXT STATE rather than just the view, because one of the answers depends on which
 * SUBJECT the patch lands on: an operator's id covers under `subject: 'agent'` for the same reason it
 * covers under `view: 'agent'`, and does not under `hands`.
 */
export const coversCanvas = (patch: FramePatch, next: Pick<DesiredState, 'subject' | 'view'>): boolean => {
	// A different KIND of subject is a different renderer. Always a reload, in every direction.
	if (patch.subject !== undefined) return true
	if (patch.view !== undefined) return true
	if (patch.item && IDENTITY_FIELDS.some(field => patch.item?.[field] !== undefined)) return true
	// An id is identity for all four standalone subjects; their second field (`wear`, `pattern`) is not.
	if (patch.sticker?.id !== undefined || patch.charm?.id !== undefined || patch.collectible?.id !== undefined)
		return true
	// The operator is identity when they ARE the subject, and in the `agent` view, where their
	// `<Suspense>` tears the subtree down; cheap in `hands`, where the arms are already mounted. The
	// asymmetry is the renderer's, not ours.
	if (patch.agent?.id !== undefined && (next.subject === 'agent' || next.view === 'agent')) return true
	return false
}
