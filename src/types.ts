/**
 * *** `@skinhub/viewer` - THE PUBLIC PROP CONTRACT. ***
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** WHAT THIS PACKAGE IS, AND THE ONE SENTENCE THAT DECIDES EVERY QUESTION BELOW. ***
 *
 * The renderer is a page on our origin (`/frame`). This package renders an `<iframe>` at it and
 * speaks its message protocol. Owner, 2026-08-15: *"the package is just a lightweight helper that
 * translates the postMessages thing to actual props and state that the user can control."*
 *
 * *** SO THERE IS NO `three` HERE AND THERE NEVER WILL BE. *** The design rule is *"there is no raw
 * npm renderer, ever."* An integrator installing this installs React bindings and a URL builder. The
 * whole of the 3D - the models, the shaders, the compositing, the 19.7 GB asset export - stays on our
 * side of the frame, which is what makes the logo enforceable and what removes every peer-dependency
 * question about three.js at once.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** THE RULE THIS FILE IS WRITTEN UNDER: nothing here may require knowing how SkinHub is built. ***
 *
 * Every name is either a word the CS2 economy already uses (`paintIndex`, `float`, `seed`,
 * `defindex`, `statTrak`) or a word any 3D component uses (`view`, `camera`, `quality`, `bloom`).
 * Nothing is named after a route, a store, a shader parameter or a file in our tree. A prop that only
 * makes sense once you have read our source is a bug in this file.
 *
 * *** AND ONE COROLLARY WORTH STATING, because it is the difference between a wrapper and a leak: ***
 * this file does NOT re-export `/frame`'s own vocabulary. The wire says `weaponType` and
 * `PlacementSlots` in the game's field names (`sticker_id`, `offset_x`); an integrator says `weapon`
 * and `{ id, offsetX }`. `item.ts` is the only place the two meet, and it is not exported for the
 * public surface's sake - it is exported because a marketplace holding an inspect link needs the
 * bridge in its own server code too.
 */

import type { CSSProperties, ReactNode } from 'react'

import { LINK, type ViewerLink } from './link.js'
import type { WeaponId } from './weapons.js'

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE ITEM
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A sticker on one of the weapon's five slots.
 *
 * `offsetX`/`offsetY` are a DELTA on the slot's authored home, in the weapon's sticker UV space,
 * clamped to +/-0.5 - the game's own `g_vStickerNOffset` range. Omitted means "where the weapon puts
 * it", which is what an unmodified applied sticker looks like in game.
 */
export type SkinViewerSticker = {
	/** `sticker_id` - the id in `@skinhub/cdn`'s `stickers.json`. */
	id: number
	/**
	 * Which of the five slots, `0`..`4`. Omitted uses the sticker's position in the `stickers` array,
	 * which is what makes `stickers={[a, null, b]}` mean "slot 0 and slot 2".
	 */
	slot?: 0 | 1 | 2 | 3 | 4
	/** Scratch, `0` (mint) to `1` (scraped off). Default `0`. */
	wear?: number
	/** Degrees, any value; `370` renders as `10`. Default `0`. */
	rotation?: number
	/** -0.5..0.5. Default `0` - the slot's authored position. */
	offsetX?: number
	offsetY?: number
}

/** A charm hanging off the weapon's charm anchor. Knives have no anchor and ignore this. */
export type SkinViewerCharm = {
	/** The id in `@skinhub/cdn`'s `keychains.json`. */
	id: number
	/**
	 * The charm's template - its `pattern` on the wire. It is not a variant: it drives a
	 * hue/saturation/brightness adjust on the charm's own albedo, so two charms with the same `id` and
	 * a different `seed` are the same model in different colours. Default `0`.
	 */
	seed?: number
	/**
	 * Displacement from the weapon's charm anchor, in the game's own `offset x/y/z`. Omitted hangs it
	 * where the weapon hangs it. Values outside the authored charm region are pulled back into it by
	 * the renderer rather than rejected.
	 *
	 * *** `readonly` IS AN INPUT CONVENIENCE AND AN OUTPUT NUISANCE, so it is worth stating: *** a
	 * mutable `[number, number, number]` assigns to this fine, which is what makes passing one in easy.
	 * Reading it back off an `onChange` item gives you the readonly type, so moving one axis needs a
	 * copy - `[...charm.offset]` - rather than an index write.
	 */
	offset?: readonly [x: number, y: number, z: number]
}

/** The half of an item that is not its identity. Everything here updates IN PLACE - see {@link CHEAP_FIELDS}. */
type ItemConfiguration = {
	/**
	 * The finish. `1449` is AK-47 | AUTOEXEC, `0` is the correct value for a VANILLA item and renders
	 * the bare model rather than an error.
	 */
	paintIndex: number
	/**
	 * Which mesh variant to load. Most finishes declare it themselves and this is then ignored; pass it
	 * when they do not, from `skin.legacy_model` on the `@skinhub/cdn` row you already have.
	 *
	 * IT IS IDENTITY AND NOT A DETAIL: both the weapon-space textures and the composite scale constants
	 * are authored per variant, so the wrong one is the wrong picture rather than a slightly different
	 * one. 1,182 of 2,161 catalogue rows are legacy.
	 */
	legacyModel?: boolean
	/**
	 * Wear, `0`..`1`. `paintwear` on the wire; every marketplace calls it the float.
	 *
	 * NOT EVERY FINISH RUNS 0..1. A kit declares its own `wear_remap_min`/`wear_remap_max` and the
	 * renderer CLAMPS into that range rather than remapping, so `0.9` on a kit that stops at `0.4`
	 * renders at `0.4`. If you are drawing a float slider, take the kit's real range from
	 * `@skinhub/cdn` rather than assuming 0..1.
	 *
	 * Omitted renders at the kit's own best condition, which is the flattering example of the item.
	 */
	float?: number
	/** The paint seed - which roll of the finish this is. Default `0`. */
	seed?: number
	/**
	 * The StatTrak counter's value, or `false` for an item with no counter.
	 *
	 * ONE FIELD RATHER THAN A BOOLEAN AND A COUNT, because that is what the item is: the game has no
	 * StatTrak-with-no-count. `0` is a real, legal, freshly-minted counter and is NOT the same as
	 * `false`. Default `false`.
	 */
	statTrak?: number | false
	/** The name plate's text, or `null`/omitted for no plate. Trimmed; the game shows 20 characters. */
	nameTag?: string | null
	/**
	 * Up to five stickers. Array position is the slot unless a sticker names its own; `null` leaves a
	 * slot empty, so `[a, null, b]` is slots 0 and 2.
	 */
	stickers?: readonly (SkinViewerSticker | null)[]
	/** The charm, or `null`/omitted for none. */
	charm?: SkinViewerCharm | null
}

/**
 * *** WHICH ITEM FIELDS UPDATE IN PLACE, WRITTEN DOWN AS A VALUE. ***
 *
 * The owner's requirement, verbatim: changing `float`, `seed`, `statTrak`, `nameTag`, the stickers or
 * the charm *"must NOT reload the viewer - that's a must to make it feel just like in our website."*
 * Changing the weapon or the paint kit *"shows nothing until the model has loaded, behind the loading
 * card"*.
 *
 * This list is the FIRST half. It is here, as a value, because {@link SkinViewerProps.loading} is
 * raised off its complement - see `SkinViewer.tsx`'s `isIdentityChange` - and because a contract an
 * integrator relies on should be readable without opening the renderer.
 */
export const CHEAP_FIELDS = ['float', 'seed', 'statTrak', 'nameTag', 'stickers', 'charm'] as const

/**
 * *** WHICH WEAPON, SAID TWO WAYS, AND EXACTLY ONE OF THEM. ***
 *
 * An integrator holds a catalogue row (`weapon: 'weapon_ak47'`, which is `skin.weapon.id` on a
 * `@skinhub/cdn` row) or a decoded inspect link (`defindex: 7`). Both are the AK-47.
 *
 * `?: never` ON THE OTHER MEMBER rather than a runtime check, for the same reason the top-level
 * subject union uses it: an item naming a weapon two ways that disagree is a state with no sensible
 * precedence rule, so it is made unrepresentable instead of arbitrated.
 *
 * `weapon` IS THE ONE TO REACH FOR. It needs no lookup and therefore cannot go stale; `defindex` is
 * resolved against a checked-in 63-row table (see `weapons.ts`) and a number that table has never
 * heard of reports `unknown-weapon` rather than rendering the wrong gun.
 */
export type SkinViewerItem = ItemConfiguration &
	(
		| {
				/**
				 * `'weapon_ak47'`, or a glove id (`'sporty_gloves'`). HUD aliases are accepted: `skins.json`
				 * gives the twenty VANILLA knife rows an `sfui_wpnhud_*` id, and that renders the knife here
				 * rather than failing, so `row.weapon.id` can be passed straight through.
				 */
				weapon: WeaponId
				defindex?: never
		  }
		| {
				/** `7` - the item definition index a decoded inspect link and a Steam inventory row carry. */
				defindex: number
				weapon?: never
		  }
	)

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * PRESENTATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * What the item is being shown ON. All three are the same item under the same lighting, finish,
 * stickers and charm - the difference is the camera and what is holding the weapon.
 *
 *   `gun`     the item alone, orbitable, framed to the viewport. The default.
 *   `hands`   CS2's first-person viewmodel, driven by the game's own clips. Orbit is off here because
 *             there is nothing to orbit: the weapon is welded to the eye.
 *   `agent`   an operator holding the weapon, at conversational distance, orbitable.
 *
 * *** A VIEW CHANGE RELOADS. *** It rebuilds the rig, so it goes behind the loading card exactly as a
 * weapon change does.
 */
export type ViewerView = 'gun' | 'hands' | 'agent'

/** The person holding the weapon, in `hands` and `agent`. Ignored in `gun` - nobody is on screen. */
export type ViewerAgent = {
	/** An agent's item definition index; `5036` is the default Terrorist and the default here. */
	id?: number
	/**
	 * Which main-menu performance they play, by clip leaf name, or `null` (the default) to let the
	 * WEAPON choose it - an AK gives the AK idle, an AWP re-poses on its own.
	 */
	pose?: string | null
}

/**
 * What the operator has on their hands, or `null` for their own default pair.
 *
 * *** `null` IS NOT "BARE HANDS". *** Every agent ships a pair of their own and that is what `null`
 * gets you. There is no way to render an operator with no gloves, because the game has no such state.
 */
export type ViewerGloves = {
	/** `'sporty_gloves'`, `'specialist_gloves'`, … */
	type: string
	paintIndex: number
	/** Default `0.06`, the kit's own best condition. */
	float?: number
	seed?: number
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * SETTINGS
 *
 * *** FOUR GROUPS, EACH SHALLOW-MERGED OVER OUR DEFAULTS. *** decided
 * yes: `settings={{ quality: { bloom: 0 } }}` keeps the camera, the environment and the other four
 * quality fields. Every default is stated on the field, so a partial object is predictable rather
 * than something you discover by removing keys until the picture changes.
 *
 * *** AND THE MERGE HAPPENS IN THE FRAME, NOT HERE, *** which is the only reason it can be trusted:
 * `/frame` applies a patch through the same `applyFramePatch` that the URL goes through, so a value
 * this package has never heard of and a value it sets are written to the same field by the same code.
 * A second merge on this side would be a second set of defaults free to drift from the real ones.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * *** THE MAPS, AS A CLOSED UNION. *** The owner asked for this directly: `background` is
 * *"'transparent' or a real map id, not a free string"*.
 *
 * WHAT THAT COSTS, said out loud rather than discovered: this list is a COPY of the app's own, so a
 * map added to the export after this package was published is not typeable until the package is
 * upgraded. That is the deliberate trade - the rule is *"no back-compat
 * boilerplate, upgrade when you need to"* - and the failure is legible either way: the frame reports
 * an unknown map in its `problems` and keeps the lighting it had.
 */
export const MAP_NAMES = [
	'Ancient',
	'Anubis',
	'Baggage',
	'Cache',
	'Dust II',
	'Inferno',
	'Italy',
	'Mirage',
	'Nuke',
	'Office',
	'Overpass',
	'Train',
	'Vertigo',
	'Warehouse',
] as const

export type MapName = (typeof MAP_NAMES)[number]
export type TimeOfDay = 'Day' | 'Night'

/**
 * What is BEHIND the item.
 *
 * *** `'transparent'` IS THE DEFAULT AND IT IS THE WHOLE POINT OF AN EMBED. *** The frame paints no
 * background of its own and mounts no video element, so the canvas composites straight over your
 * page. Naming a map instead shows that map's video plate, which is a 30-60 MB download.
 *
 * TWO THINGS THAT SURPRISE PEOPLE, both stated in `EMBED.md` §9: bloom outside the item's outline is
 * additive light with no alpha, so the halo reads weaker over your page than over a map (which is why
 * {@link ViewerQualitySettings.bloomSpill} ships at `0` here); and a transparent iframe is still not
 * click-through - it takes pointer events over its whole rectangle.
 */
export type ViewerBackground = 'transparent' | MapName

export type ViewerCameraSettings = {
	/**
	 * Vertical field of view in degrees, `1`..`179`. Default `26` - a long lens, which is what keeps a
	 * rifle from looking bent. Changing it RE-FRAMES rather than zooms.
	 *
	 * Ignored in `hands`, which uses CS2's own `viewmodel_fov`. They are different quantities.
	 */
	fov?: number
	/**
	 * A MULTIPLIER on the solved fit distance, `0.05`..`20`. Default `1`; `1.2` is 20% closer.
	 *
	 * NEVER A DISTANCE, because a fixed distance cannot be right in two differently-shaped containers -
	 * the camera fits the item to the canvas aspect, so the same AK sits at a different distance in a
	 * 3:4 card than on a full-bleed page.
	 */
	defaultZoom?: number
}

export type ViewerQualitySettings = {
	/**
	 * CS2's bloom as a strength multiplier, `0`..`10`. Default `1` (the game's own look); `2` is heavy.
	 *
	 * *** `0` DISABLES IT OUTRIGHT *** - no post-processing chain is mounted and no offscreen target is
	 * allocated, so it is genuinely the cheaper path rather than the same path at zero strength. A page
	 * with a grid of viewers wants this off.
	 */
	bloom?: number
	/**
	 * How much of the bloom is allowed past the item's outline, `0`..`10`. **Default `0` in the embed**,
	 * where our own site ships `1`.
	 *
	 * The default differs on purpose: a halo spreading onto the surrounding page is a house look on a
	 * full-bleed showcase, and a product page's layout did not ask for light leaking out of the canvas
	 * box. Opt in. Ignored while {@link bloom} is `0`.
	 */
	bloomSpill?: number
	/**
	 * A CEILING on `devicePixelRatio`, `0.25`..`3`. Default `1.5`.
	 *
	 * *** THE SINGLE BIGGEST PERFORMANCE LEVER: `2` is four times the fragments of `1`. *** A page
	 * rendering a grid of viewers wants this low.
	 */
	renderScale?: number
	/**
	 * Multisampling. Default `true`.
	 *
	 * *** ONLY REACHABLE WHILE {@link bloom} IS ABOVE `0`. *** With bloom off the scene renders straight
	 * to the canvas, whose antialiasing is fixed when the WebGL context is created; so `bloom: 0` with
	 * `antialias: false` is not an error and is not ignored either - it is antialiased anyway.
	 */
	antialias?: boolean
	/**
	 * The item shadowing itself. Default `false`, which is the reference picture: the lighting rig was
	 * calibrated without it and there is no ground plane for a shadow to land on.
	 */
	shadows?: boolean
}

export type ViewerEnvironmentSettings = {
	/**
	 * WHICH MAP'S LIGHT. Default `'Ancient'`; `null` is our calibrated reference rig, which is what
	 * every fidelity measurement behind this renderer was taken against.
	 *
	 * *** THIS IS THE LIGHT, {@link background} IS THE PICTURE, AND THEY ARE SEPARATE ON PURPOSE. ***
	 * Naming a map lights your item with the probe and sun CS2 bakes into that map's own menu scene.
	 * The common embed is `{ map: 'Mirage' }` with the default transparent background: Mirage's light,
	 * your page behind it.
	 */
	map?: MapName | null
	/** Default `'Night'`. Falls back on its own for a map that has only one. */
	timeOfDay?: TimeOfDay
	/** Wet surfaces on maps whose own data says it rains. Default `true`. */
	rain?: boolean
	/** See {@link ViewerBackground}. Default `'transparent'`. */
	background?: ViewerBackground
}

/**
 * *** OVERLAYS ARE A CATEGORY, NOT ONE FLAG, and they are INDEPENDENT of dragging. ***
 *
 * The sticker outline is an editing AFFORDANCE, not part of the item. Both combinations are
 * legitimate and both are supported: dragging on with the gizmo hidden (invisible hit targets, your
 * own UI drawing the guides), and the gizmo shown with dragging off (show where a sticker sits, let
 * nobody move it). They must not be collapsed into one prop, which is why they live in different
 * groups - see {@link ViewerInteractions}.
 */
export type ViewerOverlaySettings = {
	/** The outline and handles on the OPEN sticker. Default `false`. */
	stickerGizmo?: boolean
	/** The charm's billboard handle. Default `false`. */
	charmGizmo?: boolean
	/** Colour and readability of the gizmo chrome, for a host with its own design. */
	gizmoStyle?: {
		/** Any CSS colour. */
		color?: string
		/** The dark under-stroke that keeps the chrome readable over a pale kit. */
		shadowColor?: string
	}
}

/**
 * *** THE FOUR GROUPS ARE THE FOUR THE FRAME SPEAKS, AND NO MORE. ***
 *
 * The design notes also sketch `autoRotation` and `sound`. They are deliberately absent: the
 * `/frame` protocol carries neither today, so a prop for them would be a prop that silently does
 * nothing - which is worse than a missing feature, because it is a missing feature you cannot see.
 * They arrive here in the same change that adds them to the wire, and the type is what forces that.
 */
export type ViewerSettings = {
	camera?: ViewerCameraSettings
	quality?: ViewerQualitySettings
	environment?: ViewerEnvironmentSettings
	overlays?: ViewerOverlaySettings
}

/**
 * WHAT THE USER MAY DO WITH THE MOUSE. Orbiting and zooming are on; EDITING IS OFF.
 *
 * Editing defaults to off because a viewer that silently let a visitor move a sticker would
 * desynchronise the host's own database without warning. Owner's brief: the integrator adds charms in
 * their own UI, and we let the user move stickers *"if they enabled that"*.
 */
export type ViewerInteractions = {
	/** Drag to turn the item, right-drag to pan. Default `true`. Always off in `hands`. */
	orbit?: boolean
	/** Wheel to dolly. Default `true`. */
	zoom?: boolean
	/**
	 * Let the user move and rotate a PLACED sticker. Default `false`.
	 *
	 * *** IF YOU TURN THIS ON, HANDLE {@link SkinViewerProps.onChange}, *** or you will not be able to
	 * save what your user did.
	 */
	dragStickers?: boolean
	/** The same, for the charm. Default `false`. */
	dragCharm?: boolean
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * FAILURE
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type SkinViewerErrorCode =
	/** A model, texture or index file failed to load, or the GL context was lost. UNRECOVERABLE. */
	| 'render-failed'
	/** The `inspectLink` did not decode - a bad CRC, a truncated body, or not a masked link at all. */
	| 'bad-inspect-link'
	/** `defindex` named a weapon this build has no id for. Pass `weapon` instead, or upgrade. */
	| 'unknown-weapon'
	/** Neither `inspectLink` nor `item` arrived at runtime. See {@link SkinViewerProps}. */
	| 'no-item'
	/**
	 * A field was rejected on the way in and DROPPED, naming its path. Not fatal: the field keeps its
	 * previous value and the rest of the update is applied. Nothing is ever coerced - `float: '0.3'` is
	 * rejected rather than parsed.
	 */
	| 'bad-message'
	/**
	 * *** THE ONE TERMINAL FAILURE. *** This package and the embed do not speak the same protocol
	 * version, so the frame has rendered NOTHING - no canvas, no partial picture - and will ignore
	 * every later message. The message names which side is out of date. A
	 * silently wrong render is worse than a blank frame with an explanation.
	 */
	| 'protocol-mismatch'

export type SkinViewerError = {
	code: SkinViewerErrorCode
	/** A sentence a developer can act on. Safe to show in a dev overlay; not localised. */
	message: string
}

/** The box the frame reported, on the `resize` event. See {@link SkinViewerProps.onResize}. */
export type ViewerResize = { width: number; height: number; dpr: number }

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * *** EXACTLY ONE OF `inspectLink` OR `item`, ENFORCED IN THE TYPES. ***
 *
 * Owner's requirement, and it is a TYPE requirement rather than a runtime one: *"a discriminated
 * union, so a missing or doubled item is a compile error, not a runtime surprise."*
 *
 * `?: never` on the other member is what does it. Passing both is an excess-property error at the
 * call site; passing neither is a missing-property error. An integrator holds one or the other - a
 * link out of a trade offer, or the fields already in their database - and the state where both are
 * present and disagree is one this package would have to invent a precedence rule for. There is no
 * rule; there is no such call.
 *
 * *** AND WHEN THE TYPES ARE BYPASSED, THE VIEWER TEACHES. *** Plain JavaScript, an `any`, data that
 * was still `undefined` when the component mounted: the frame renders a short instruction card rather
 * than a blank box or - worse - our default AK-47, which would look like a successful render of the
 * wrong item. `onError` fires with `no-item` at the same time. See `SkinViewer.tsx`.
 */
export type ViewerSubject = { inspectLink: string; item?: never } | { item: SkinViewerItem; inspectLink?: never }

export type SkinViewerProps = ViewerSubject & {
	/* ── Presentation ──────────────────────────────────────────────────────────────────────── */
	/** Default `'gun'`. See {@link ViewerView}. */
	view?: ViewerView
	/** Who is holding it, in the two views that have somebody holding it. See {@link ViewerAgent}. */
	agent?: ViewerAgent
	/** What they have on their hands, or `null` for their own default pair. See {@link ViewerGloves}. */
	gloves?: ViewerGloves | null
	/** Four groups, shallow-merged per group over our defaults. See {@link ViewerSettings}. */
	settings?: ViewerSettings
	/** See {@link ViewerInteractions}. Orbiting and zooming are on, editing is off. */
	interactions?: ViewerInteractions

	/* ── Selection ─────────────────────────────────────────────────────────────────────────── */
	/**
	 * Which slot (`0`..`4`, or `5` for the charm) has its handles open, or `-1` for none.
	 *
	 * CONTROLLED WHEN PASSED, UNCONTROLLED WHEN NOT. The uncontrolled case is the one most integrators
	 * want: with `interactions.dragStickers` on, a click opens the sticker and this never appears in
	 * their code. Pass it when your own UI has a slot list that has to stay in step.
	 */
	editingSlot?: number
	/** Fires when the USER opens a slot by clicking a sticker or the charm. */
	onEditingSlotChange?: (slot: number) => void

	/* ── Lifecycle ─────────────────────────────────────────────────────────────────────────── */
	/**
	 * Fires when the viewer has STOPPED LOADING - the finish has reached the GPU and the item is on
	 * screen textured.
	 *
	 * *** IT IS A LEVEL, NOT AN EDGE. *** It fires again after every reload, because a weapon change or
	 * a view change raises the loading gate and lowers it again. It also fires if the render FAILED,
	 * because that is equally the moment to take your own placeholder down; use {@link onError} to tell
	 * the two apart.
	 */
	onReady?: () => void
	/** See {@link SkinViewerError}. */
	onError?: (error: SkinViewerError) => void
	/**
	 * The user moved a sticker or the charm - which only happens with `interactions.dragStickers` or
	 * `.dragCharm`. Fires on every pointer move during a drag.
	 *
	 * *** IT HANDS BACK A COMPLETE ITEM, NOT A DIFF. *** Store it verbatim and pass it straight back in
	 * as `item`. It never fires for your own prop changes; it is only ever the user talking.
	 *
	 * The returned item is always in the `{ weapon }` form, never `{ defindex }`, because that is what
	 * the frame reports and translating it back to a number would be a lookup that can fail.
	 */
	onChange?: (item: SkinViewerItem) => void
	/**
	 * The frame's own box changed, throttled to one per animation frame.
	 *
	 * You own the box and the viewer fills it - but RESIZING CHANGES THE PICTURE, not just its scale:
	 * the camera fits the item to the canvas aspect, so animating a panel open beside the frame
	 * re-frames the item.
	 */
	onResize?: (size: ViewerResize) => void

	/* ── Box ───────────────────────────────────────────────────────────────────────────────── */
	/** On the wrapper element, which is `position: relative` and fills whatever you give it. */
	className?: string
	style?: CSSProperties
	/** The `<iframe>`'s accessible name. Default `'SkinHub viewer'`; pass the item's name. */
	title?: string
	/**
	 * *** DRAWN OVER THE IFRAME, NOT INSIDE IT, AND CLEARED ON `ready`. ***
	 *
	 * A React element cannot cross a `postMessage` boundary - there is no way to hand a node to a
	 * document on another origin - so this is composited on YOUR side, absolutely positioned over the
	 * frame. That is the honest implementation and it has one consequence worth knowing: an opaque node
	 * hides the frame's own loading card rather than replacing it.
	 *
	 * Omitted falls through to the frame's own, which is a reasonable default and is what the SkinHub
	 * app shows.
	 */
	loading?: ReactNode
	/**
	 * Shown OVER the frame when the viewer cannot render - see {@link SkinViewerError}. A function gets
	 * the error, so you can tell a stale package apart from a lost GL context.
	 *
	 * Omitted leaves the frame's own card, which names the failure.
	 */
	fallback?: ReactNode | ((error: SkinViewerError) => ReactNode)

	/* ── Escape hatches ────────────────────────────────────────────────────────────────────── */
	/**
	 * Where `/frame` is served from. Default `'https://skinhub.gg'`.
	 *
	 * *** READ ONCE, AT MOUNT. *** Changing it later does nothing, deliberately: it is the one prop that
	 * could only be applied by reloading the frame, and a prop that quietly throws away the GL context
	 * is exactly the thing this component is built not to have. Call `reload()` from
	 * {@link useSkinViewer} if you really need to move a mounted viewer to another origin.
	 */
	origin?: string
	/**
	 * The imperative handle from {@link useSkinViewer}. Props are state; the hook is verbs.
	 *
	 * A PLAIN PROP AND NOT `ref`, because `ref` on a component means "give me the DOM node" to every
	 * React developer alive, and handing them a `{ reload }` object instead of the `<div>` they asked
	 * for would be a surprise in the one place surprises are least welcome.
	 */
	handle?: SkinViewerHandle
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE HANDLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** What the viewer is doing, as {@link useSkinViewer} reports it. */
export type ViewerStatus =
	/** The frame has not announced itself yet. */
	| 'connecting'
	/** Loading an item - the first one, or a new one after an identity change. */
	| 'loading'
	/** On screen and textured. */
	| 'ready'
	/** An unrecoverable failure; `error` is set. */
	| 'error'

/**
 * *** PROPS FOR STATE, A HOOK FOR VERBS. *** See {@link useSkinViewer}.
 *
 * `reload` is stable for the life of the hook. THE HANDLE OBJECT IS NOT - it is rebuilt when
 * {@link status}, {@link error} or {@link problems} move, because that is how a React value
 * re-renders the tree reading it. Put `viewer.reload` in a dependency array, not `viewer`.
 */
export type SkinViewerHandle = {
	/** The private channel to the mounted component. See `link.ts`. */
	readonly [LINK]: ViewerLink
	/**
	 * Tear the frame down and load it again from the item that is on screen NOW.
	 *
	 * *** THE ONLY THING IN THIS PACKAGE THAT REMOUNTS THE IFRAME, AND IT IS DELIBERATELY IMPERATIVE. ***
	 * Nothing you can pass as a prop reloads the viewer - that is the whole cheap-update contract - so
	 * the escape hatch for "the GL context died" or "the assets were re-published" has to be a verb.
	 */
	reload: () => void
	/** What the viewer is doing. See {@link ViewerStatus}. */
	status: ViewerStatus
	/** The last unrecoverable failure, or `null`. */
	error: SkinViewerError | null
	/**
	 * Anything the frame could not read in the URL this package built for it.
	 *
	 * *** AN ENTRY HERE IS OUR BUG, NOT YOURS. *** You passed props; this package turned them into a
	 * query string; the frame is telling us which part of that string it did not accept. It is exposed
	 * rather than swallowed because the alternative is a picture that is quietly missing a field.
	 */
	problems: readonly string[]
}

/*
 * *** THERE IS NO `capture()`, AND THAT IS A MEASURED DECISION RATHER THAN A MISSING FEATURE. ***
 *
 * Asked for as *"yes IF IT IS CHEAP, 100% optional"*. It is not cheap. The renderer's
 * `<Canvas>` runs with `preserveDrawingBuffer: false`, so a `toDataURL` taken from outside the render
 * loop returns a blank image; shipping a real one means the renderer draws and reads inside a single
 * frame, which is a change to a shared file in the app rather than anything this package can do. The
 * frame's protocol has no `capture` verb for the same reason.
 *
 * *** AND NOTE WHAT IT WOULD NOT SOLVE EVEN IF IT WERE FREE: *** thumbnails for a listing grid and
 * preview images for shared links both need a render that happens without a browser tab open. That is
 * a server-side product and is explicitly not in scope.
 */

/*
 * *** AND THERE IS NO `apiKey`. NOT NOW, NOT LATER. ***
 *
 * Decided: *"No, never. Anyone can copy an embed URL anyway, so a key
 * buys nothing."* The viewer is free for everyone. It is recorded here, in the type surface, because
 * the cost of adding one later is a breaking change for every integrator - so the absence has to be a
 * decision somebody can read, not an omission somebody might fix.
 */
