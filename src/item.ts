/**
 * *** THE BRIDGE - an integrator's item into the frame's item, and back out again. ***
 *
 * This is the package's actual work. Everything else is an `<iframe>` and a message listener.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** THE TWO VOCABULARIES, AND WHY WE DO NOT JUST PICK ONE. ***
 *
 * The frame speaks the renderer's names (`weaponType`) and the GAME's names (`sticker_id`,
 * `offset_x`, `pattern`), because those are what the shader parameters, the WeaponPaints columns and
 * the inspect codec all call the same six slots. That is right for the wire and wrong for a prop: an
 * integrator writing `offset_x` in a React tree is writing protobuf into their view layer.
 *
 * So there are two, and exactly one file that knows both. A field renamed on either side breaks HERE,
 * at compile time, rather than becoming a picture that is quietly missing a sticker.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** AND THE PIECE THE FRAME CANNOT DO FOR ITSELF: AN INSPECT LINK'S IDENTITY. ***
 *
 * `?i=` carries an item's CONFIGURATION - float, seed, StatTrak, the plate, five stickers and the
 * charm - and the frame decodes all of it. What it does not carry, for the frame, is WHICH WEAPON: a
 * link says `defindex: 7` and the renderer wants `weapon_ak47`, and the app's own `SkinViewer`
 * says so in a comment naming this package as the place the table lives:
 *
 *     "the 63-row table between them lives in `@skinhub/viewer`'s `src/weapons.ts` - an in-flight file
 *      outside this app's dependency graph."
 *
 * Which makes `inspectLink` a first-class prop rather than a documented gap. This file resolves the
 * identity here, on the host, and hands the frame both halves. An integrator never decodes a link to
 * use us - That is stated as a requirement and it is the path the product exists for.
 */

import { buildInspectUrl, readInspectUrl } from '@skinhub/cdn/inspect'
import { emptyKeychain, emptySticker, makeSkinPlacement, type SkinPlacement } from '@skinhub/cdn/placement'

import type {
	FrameCharm,
	FrameCollectible,
	FrameItem,
	FrameSticker,
	FrameSubjectKind,
	PlacementSlots,
} from './protocol.js'
import type { SkinViewerCharm, SkinViewerError, SkinViewerItem, SkinViewerSticker, ViewerSubject } from './types.js'
import { defindexForWeaponId, normalizeWeaponId, weaponIdForDefindex } from './weapons.js'

/** `sticker_id === 0` is how the wire says "this slot is empty". */
const isPlaced = (placement: { sticker_id: number }) => placement.sticker_id > 0

/** Six empty slots. Rebuilt per call because the caller mutates the copy it is handed. */
const emptySlots = (): PlacementSlots => [
	emptySticker(0),
	emptySticker(1),
	emptySticker(2),
	emptySticker(3),
	emptySticker(4),
	emptyKeychain(),
]

/**
 * The public sticker list and charm as the six-slot tuple the frame validates.
 *
 * *** ARRAY POSITION IS THE SLOT UNLESS A STICKER NAMES ITS OWN, *** which is what makes
 * `stickers={[a, null, b]}` mean slots 0 and 2 - the shape a marketplace's own UI produces when a user
 * has filled two of five holders. A sticker naming a slot outside `0..4` is dropped rather than
 * wrapped, because a sixth sticker slot is the charm's and putting a sticker there would be a picture
 * nobody asked for.
 *
 * RETURNS `undefined` WHEN THERE IS NOTHING PLACED, so an item with no stickers sends no `stickers`
 * key at all and cannot disturb the frame's sticker draft. See `patch.ts`.
 */
export const toSlots = (
	stickers: readonly (SkinViewerSticker | null)[] | undefined,
	charm: SkinViewerCharm | null | undefined,
): PlacementSlots | undefined => {
	if ((!stickers || stickers.length === 0) && !charm) return undefined
	const slots = emptySlots()

	stickers?.forEach((sticker, index) => {
		if (!sticker) return
		const slot = sticker.slot ?? index
		if (slot < 0 || slot > 4) return
		slots[slot as 0 | 1 | 2 | 3 | 4] = {
			slot,
			sticker_id: sticker.id,
			wear: sticker.wear ?? 0,
			// The game treats an unset scale as 1 and an inspect link cannot carry `scale <= 0`. It is not
			// on the public surface because nothing in CS2 sets it per sticker.
			scale: 1,
			rotation: sticker.rotation ?? 0,
			offset_x: sticker.offsetX ?? 0,
			offset_y: sticker.offsetY ?? 0,
		}
	})

	if (charm)
		slots[5] = {
			slot: 0,
			sticker_id: charm.id,
			// `pattern` IS the charm's seed - the keychain message is the sticker message reused, so the
			// field it lands in is the one a sticker calls its pattern index.
			pattern: charm.seed ?? 0,
			offset_x: charm.offset?.[0] ?? 0,
			offset_y: charm.offset?.[1] ?? 0,
			offset_z: charm.offset?.[2] ?? 0,
		}

	return slots
}

/** The six-slot tuple back into the public shape - what `onChange` hands an integrator. */
export const fromSlots = (
	slots: PlacementSlots | undefined,
): { stickers: SkinViewerSticker[]; charm: SkinViewerCharm | null } => {
	if (!slots) return { stickers: [], charm: null }
	const stickers = slots.slice(0, 5).flatMap((placement): SkinViewerSticker[] => {
		const sticker = placement as PlacementSlots[0]
		if (!isPlaced(sticker)) return []
		return [
			{
				id: sticker.sticker_id,
				slot: sticker.slot as SkinViewerSticker['slot'],
				wear: sticker.wear,
				rotation: sticker.rotation,
				offsetX: sticker.offset_x,
				offsetY: sticker.offset_y,
			},
		]
	})
	const keychain = slots[5]
	const charm: SkinViewerCharm | null = isPlaced(keychain)
		? {
				id: keychain.sticker_id,
				seed: keychain.pattern,
				offset: [keychain.offset_x, keychain.offset_y, keychain.offset_z],
			}
		: null
	return { stickers, charm }
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE SUBJECT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type ResolvedSubject =
	| { item: FrameItem; inspectPayload: string | null; error: null }
	/**
	 * *** NO ITEM AND NO GUESS. *** Every failure here produces a null item, and `SkinViewer` then asks
	 * the frame for its instruction card rather than letting it fall back to our default AK - which
	 * would look exactly like a successful render of the wrong gun, and is the one outcome worth more
	 * than all the rest of this file to avoid.
	 */
	| { item: null; inspectPayload: null; error: SkinViewerError }

/**
 * A `SkinPlacement` (whatever produced it) as the frame's item.
 *
 * Every field maps 1:1 with no rescaling: `g_vStickerNOffset` is `Range2(-0.5,-0.5, 0.5,0.5)` and the
 * protobuf carries that range verbatim, so the offsets really are the same numbers.
 */
const fromPlacement = (placement: SkinPlacement, weaponType: string): FrameItem => {
	const slots = emptySlots()
	for (const sticker of placement.stickers ?? []) {
		if (!isPlaced(sticker)) continue
		const slot = sticker.slot
		if (slot < 0 || slot > 4) continue
		slots[slot as 0 | 1 | 2 | 3 | 4] = sticker
	}
	if (placement.keychain && isPlaced(placement.keychain)) slots[5] = placement.keychain

	return {
		weaponType,
		paintIndex: placement.paintindex,
		float: placement.paintwear,
		seed: placement.paintseed,
		// `stattrak` present is what makes an item StatTrak and `0` is a real count - see the prop's own
		// doc for why this collapses to one field rather than two.
		statTrak: placement.stattrak ? (placement.stattrak_count ?? 0) : false,
		nameTag: placement.nametag ?? null,
		stickers: slots,
	}
}

/**
 * *** THE ONE FUNCTION THE WHOLE PROP SURFACE FUNNELS THROUGH. *** Either arm of
 * {@link ViewerSubject}, plus the runtime cases the types were supposed to prevent, into one item.
 *
 * IT IS PURE AND SYNCHRONOUS - no fetch, no React, no catalogue - which is what lets the component
 * build the frame's URL in a `useState` initialiser and have the FIRST PAINT be the integrator's item
 * rather than ours swapped a tick later.
 */
/**
 * *** THE OTHER FOUR SUBJECTS, RESOLVED BEFORE THE WEAPON IS EVEN LOOKED FOR. ***
 *
 * Returns null when the props name none of them, which is what sends {@link resolveSubject} on to the
 * `inspectLink` / `item` pair below. The ORDER is the arm order in `types.ts` and it only matters for
 * props that bypassed the types (plain JavaScript, an `any`), where naming two subjects has to mean
 * SOMETHING - it means the first one on this list.
 *
 * *** AN ID THAT IS NOT A POSITIVE INTEGER IS `no-item`, NOT A ZERO. *** `sticker_id: 0` IS the empty
 * slot throughout the renderer, so passing it through would ask the frame to draw an item that by
 * definition does not exist; the instruction card plus an `onError` is a far better answer than an
 * empty canvas. This is the same "data had not arrived yet" case the `no-item` code exists for.
 */
export type ResolvedStandalone = {
	subject: Exclude<FrameSubjectKind, 'weapon'>
	sticker?: FrameSticker
	charm?: FrameCharm
	collectible?: FrameCollectible
	agent?: { id: number; pose?: string | null }
	error: SkinViewerError | null
}

export const resolveStandalone = (props: Partial<ViewerSubject>): ResolvedStandalone | null => {
	const bad = (subject: ResolvedStandalone['subject'], prop: string, id: unknown): ResolvedStandalone => ({
		subject,
		error: {
			code: 'no-item',
			message: `\`${prop}.id\` must be a positive integer, got ${JSON.stringify(id)}. In TypeScript that is a compile error, so this is JavaScript, an \`any\`, or data that had not arrived yet.`,
		},
	})
	const ok = (id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0

	if (props.sticker)
		return ok(props.sticker.id)
			? { subject: 'sticker', sticker: dropUndefined({ id: props.sticker.id, wear: props.sticker.wear }), error: null }
			: bad('sticker', 'sticker', props.sticker.id)

	if (props.charm)
		return ok(props.charm.id)
			? { subject: 'charm', charm: dropUndefined({ id: props.charm.id, pattern: props.charm.pattern }), error: null }
			: bad('charm', 'charm', props.charm.id)

	if (props.collectible)
		return ok(props.collectible.id)
			? { subject: 'collectible', collectible: { id: props.collectible.id }, error: null }
			: bad('collectible', 'collectible', props.collectible.id)

	/* `operator` BECOMES `agent` ON THE WIRE - see `FrameSubjectKind`. The pose rides in the same group
	   the weapon views use, because it is the same question (which performance) asked of the same row. */
	if (props.operator)
		return ok(props.operator.id)
			? { subject: 'agent', agent: dropUndefined({ id: props.operator.id, pose: props.operator.pose }), error: null }
			: bad('agent', 'operator', props.operator.id)

	return null
}

/** Drops keys the caller did not set, so "say nothing" survives into the URL and into the diff. */
const dropUndefined = <T extends object>(source: T): T => {
	const out = {} as T
	for (const key of Object.keys(source) as (keyof T)[]) if (source[key] !== undefined) out[key] = source[key]
	return out
}

export const resolveSubject = (subject: Partial<ViewerSubject>): ResolvedSubject => {
	const fail = (code: SkinViewerError['code'], message: string): ResolvedSubject => ({
		item: null,
		inspectPayload: null,
		error: { code, message },
	})

	if (typeof subject.inspectLink === 'string' && subject.inspectLink.length > 0) {
		let placement: SkinPlacement
		try {
			placement = readInspectUrl(subject.inspectLink)
		} catch (cause) {
			/*
			 * MASKED LINKS ONLY, and this is where an integrator finds that out. The `S…A…D…` / `M…`
			 * inventory and market forms carry no item data at all - they needed a Game Coordinator round
			 * trip Valve has shut down - so there is nothing in them to render and no partial answer to
			 * fall back to.
			 */
			return fail(
				'bad-inspect-link',
				`The inspect link did not decode: ${cause instanceof Error ? cause.message : String(cause)}. Only MASKED links (the long hex payload) carry item data; the S…A…D… and M… inventory forms needed a Game Coordinator round trip Valve has shut down and cannot be rendered by anyone.`,
			)
		}
		const weaponType = weaponIdForDefindex(placement.defindex)
		if (!weaponType)
			return fail(
				'unknown-weapon',
				`The inspect link decoded, but defindex ${placement.defindex} is not a weapon this build of @skinhub/viewer has an id for. Pass \`item={{ weapon: '…', paintIndex: ${placement.paintindex} }}\` instead, or update the package.`,
			)
		return {
			item: fromPlacement(placement, weaponType),
			/*
			 * THE ORIGINAL STRING IS KEPT AND FORWARDED AS `?i=` RATHER THAN RE-ENCODED. A round trip
			 * through our own encoder would be a second implementation of the codec in the URL path, free
			 * to disagree with the one the frame decodes with; forwarding the customer's own bytes means
			 * the frame reads exactly what Valve wrote.
			 */
			inspectPayload: subject.inspectLink,
			error: null,
		}
	}

	const item = subject.item
	if (!item || typeof item !== 'object')
		return fail(
			'no-item',
			'No item. <SkinViewer> needs exactly one of `inspectLink` or `item` - in TypeScript that is a compile error, so this is JavaScript, an `any`, or data that had not arrived yet.',
		)

	const weapon = item.weapon ?? (typeof item.defindex === 'number' ? weaponIdForDefindex(item.defindex) : undefined)
	if (!weapon)
		return typeof item.defindex === 'number'
			? fail(
					'unknown-weapon',
					`defindex ${item.defindex} is not a weapon this build of @skinhub/viewer has an id for. Pass \`weapon\` instead, or update the package.`,
				)
			: fail(
					'no-item',
					'`item` named no weapon. Pass either `weapon: "weapon_ak47"` (from `skin.weapon.id` on a @skinhub/cdn row) or `defindex: 7`.',
				)

	if (typeof item.paintIndex !== 'number')
		return fail(
			'no-item',
			'`item.paintIndex` is required. `0` is the correct value for a vanilla item and renders the bare model.',
		)

	return {
		item: {
			// HUD aliases folded here rather than at the frame: `skins.json` gives the twenty VANILLA knife
			// rows an `sfui_wpnhud_*` id, so `row.weapon.id` off a vanilla Bayonet is a HUD string. The
			// renderer resolves both to the same GLB; folding here also makes the value we echo back in
			// `onChange` the item id rather than the alias.
			weaponType: normalizeWeaponId(weapon),
			paintIndex: item.paintIndex,
			...(item.legacyModel !== undefined && { legacyModel: item.legacyModel }),
			...(item.float !== undefined && { float: item.float }),
			...(item.seed !== undefined && { seed: item.seed }),
			...(item.statTrak !== undefined && { statTrak: item.statTrak }),
			...(item.nameTag !== undefined && { nameTag: item.nameTag }),
			...(() => {
				const slots = toSlots(item.stickers, item.charm)
				return slots ? { stickers: slots } : {}
			})(),
		},
		inspectPayload: null,
		error: null,
	}
}

/**
 * The frame's item as the public one - what {@link SkinViewerProps.onChange} hands back.
 *
 * *** ALWAYS THE `{ weapon }` FORM, NEVER `{ defindex }`. *** The frame reports a `weaponType`, and
 * turning it back into a number is a lookup that can fail for a weapon shipped after this package
 * was built. An integrator who needs the number has `defindexForWeaponId` exported for it, where the
 * failure is theirs to see rather than ours to hide.
 */
export const toPublicItem = (item: FrameItem): SkinViewerItem => {
	const { stickers, charm } = fromSlots(item.stickers)
	return {
		weapon: item.weaponType,
		paintIndex: item.paintIndex,
		...(item.legacyModel !== undefined && { legacyModel: item.legacyModel }),
		...(item.float !== undefined && { float: item.float }),
		...(item.seed !== undefined && { seed: item.seed }),
		...(item.statTrak !== undefined && { statTrak: item.statTrak }),
		...(item.nameTag !== undefined && { nameTag: item.nameTag }),
		stickers,
		charm,
	}
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * BACK OUT AGAIN — AN ITEM AS AN INSPECT LINK
 *
 * *** THE RETURN JOURNEY, AND IT IS THE HALF THAT WAS MISSING. *** Everything above turns an
 * integrator's item INTO a picture. A skin picker is not finished when it can show you the item; it is
 * finished when it can hand you the link. Without these two functions every integrator writes the same
 * forty lines against `@skinhub/cdn`'s placement API - and writes them from the same three facts that
 * are easy to get wrong and silent when you do:
 *
 *   - `stattrak: 0` is a REAL, freshly-minted counter and `false` is no module. One boolean and one
 *     count, not one nullable number.
 *   - an unset sticker `scale` is `1`, not `0`. The WeaponPaints row default is `0` meaning "default",
 *     and an encoder rejects `scale <= 0`, so passing it through produces a link that will not build.
 *   - a charm's seed rides in `pattern`, because the keychain message is the sticker message reused.
 *
 * That list is the argument for these living here rather than in a docs snippet: they are the same
 * three facts `toSlots` already encodes, and having them written twice is how the two copies disagree.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A viewer item as a `SkinPlacement` — `@skinhub/cdn`'s decoded-inspect-link shape.
 *
 * Reach for this when you want the placement itself: to write WeaponPaints rows, to diff against a
 * link you already hold, or to hand to another `@skinhub/cdn` helper. If you just want the link, use
 * {@link toInspectLink}.
 *
 * *** THROWS ON A WEAPON WITH NO DEFINDEX, and that is the only honest answer. *** An inspect link
 * identifies its item by number, so an id this build has no row for cannot be encoded at all. Returning
 * a link with `defindex: 0` in it would produce a string that looks like a link, copies like a link and
 * opens an empty CS2 inspect screen.
 */
export const toPlacement = (item: SkinViewerItem): SkinPlacement => {
	const weapon = 'weapon' in item && item.weapon ? item.weapon : undefined
	const defindex = weapon ? defindexForWeaponId(weapon) : item.defindex
	if (typeof defindex !== 'number')
		throw new Error(
			`@skinhub/viewer: cannot build an inspect link for ${JSON.stringify(weapon)} — this build has no defindex for it. Pass \`defindex\` on the item, or update the package.`,
		)

	const slots = toSlots(item.stickers, item.charm) ?? emptySlots()
	return makeSkinPlacement({
		defindex,
		paintindex: item.paintIndex,
		paintseed: item.seed ?? 0,
		paintwear: item.float ?? 0,
		...(item.nameTag ? { nametag: item.nameTag } : {}),
		// `statTrak: 0` is a counter that has not counted yet. `false` is no module at all.
		stattrak: item.statTrak !== undefined && item.statTrak !== false,
		stattrak_count: typeof item.statTrak === 'number' ? item.statTrak : 0,
		stickers: slots.slice(0, 5) as SkinPlacement['stickers'],
		keychain: slots[5],
	} as SkinPlacement)
}

/**
 * A viewer item as a masked Steam inspect link — the string a user pastes into the game.
 *
 *     <button onClick={() => navigator.clipboard.writeText(toInspectLink(item))}>Copy inspect link</button>
 *
 * The inverse of passing `inspectLink` to `<SkinViewer>`, and it round-trips: a link built here decodes
 * back to the same item through {@link fromInspectLink}.
 */
export const toInspectLink = (item: SkinViewerItem): string => buildInspectUrl(toPlacement(item))

/**
 * A masked inspect link as a viewer item — what `<SkinViewer inspectLink={…} />` does internally,
 * exposed for a host that wants the fields rather than the picture (to seed an editor from a link, or
 * to read a float out of one).
 *
 * *** RETURNS `null` RATHER THAN THROWING ON A LINK IT CANNOT READ, *** because the input is usually
 * something a user pasted, and a paste being wrong is an ordinary event rather than an exception.
 */
export const fromInspectLink = (link: string): SkinViewerItem | null => {
	const resolved = resolveSubject({ inspectLink: link })
	return resolved.item ? toPublicItem(resolved.item) : null
}
