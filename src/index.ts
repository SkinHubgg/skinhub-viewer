/**
 * *** `@skinhub/viewer` - THE SKINHUB CS2 SKIN VIEWER, AS A REACT COMPONENT. ***
 *
 *     import { SkinViewer } from '@skinhub/viewer'
 *
 *     <SkinViewer item={{ weapon: 'weapon_ak47', paintIndex: 1449, float: 0.27 }} style={{ height: 420 }} />
 *     <SkinViewer inspectLink={tradeOffer.inspectLink} style={{ height: 420 }} />
 *
 * A weapon (or a glove) is one of SIX ways to name a subject, and each is its own prop:
 *
 *     <SkinViewer sticker={{ id: 37, wear: 0.2 }} />        one sticker, the real holo/foil shader
 *     <SkinViewer charm={{ id: 5 }} />                      one charm, off the gun
 *     <SkinViewer collectible={{ id: 874 }} />              one pin, coin, medal or trophy
 *     <SkinViewer operator={{ id: 5036 }} />                one agent, alone
 *
 * Exactly one of the six, enforced in the types - see `ViewerSubject`.
 *
 * The 3D is not in here. It is a page on our origin that this component embeds and drives over
 * `postMessage`, which is why installing this pulls in no `three`, no `@react-three/fiber` and no
 * asset bundle - the only peer dependency is React. `EMBED.md` documents the same contract for stacks
 * that are not React; this package is the React-shaped door onto it, not a second implementation.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS EXPORTED, AND WHY THE LIST IS SHORT.
 *
 *   `SkinViewer`, `useSkinViewer`  - the component and its verbs.
 *   the types                      - so a consumer can name a prop's shape in their own code.
 *   `MAP_NAMES`, `WEAPON_IDS`      - the two closed vocabularies, as values, for building a picker.
 *   the defindex table             - because an integrator with a Steam inventory has numbers.
 *
 * Nothing else FROM HERE. The URL builder and the diff are implementation: if they were public, a
 * customer could build a state this package would then have to keep working, and the whole point of
 * the version integer is that there is exactly one shape to keep working.
 *
 * *** THE WIRE TYPES ARE THE ONE EXCEPTION AND THEY ARE A SEPARATE DOOR - `@skinhub/viewer/protocol`.
 * *** Deliberately not the barrel, so they never appear in an autocomplete next to `SkinViewer` and
 * nobody reaches for them by accident. Exported at all because `EMBED.md` §6 already publishes that
 * exact shape in prose, for hosts that are not React, and because the app repo's conformance test has
 * to import both halves of the wire to prove they still agree. See `protocol.ts` for both.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * *** DO NOT ADD `"sideEffects": false` TO `package.json`. Measured, Bun 1.3.13: *** with that flag
 * set, a `bun build` bundle of this barrel tree-shakes the entire package away and emits a 248-byte
 * file that re-exports fourteen names and defines none of them. It builds, it publishes, and it fails
 * at import time in the consumer. The flag is the correct thing to want and it is not worth this.
 *
 * (The package's OWN build is `tsc`, not a bundler - one emitted file per source file, matching
 * `@skinhub/cdn` - so the flag would only ever bite a consumer's bundler. That is worse, not better:
 * it moves the failure to somebody else's build.)
 */

export { SkinViewer, DEFAULT_ORIGIN } from './SkinViewer.js'
export { useSkinViewer } from './useSkinViewer.js'

/**
 * *** ITEM OUT, LINK BACK. *** A picker is not finished when it can show the item - it is finished
 * when it can hand you the link. See `item.ts` for the three easy-to-get-wrong facts these encode.
 */
export { fromInspectLink, toInspectLink, toPlacement } from './item.js'

export type {
	MapName,
	SkinViewerCharm,
	SkinViewerError,
	SkinViewerErrorCode,
	SkinViewerHandle,
	SkinViewerItem,
	SkinViewerProps,
	SkinViewerSticker,
	TimeOfDay,
	ViewerAgent,
	ViewerBackground,
	ViewerCameraSettings,
	ViewerCharmSubject,
	ViewerCollectibleSubject,
	ViewerEnvironmentSettings,
	ViewerGloves,
	ViewerInteractions,
	ViewerLabels,
	ViewerLocaleSettings,
	ViewerOperatorSubject,
	ViewerOverlaySettings,
	ViewerQualitySettings,
	ViewerResize,
	ViewerSettings,
	ViewerStatus,
	ViewerStickerSubject,
	ViewerSubject,
	ViewerTextDirection,
	ViewerView,
} from './types.js'
export { CHEAP_FIELDS, MAP_NAMES } from './types.js'

export type { KnownWeaponId, WeaponId } from './weapons.js'
export {
	defindexForWeaponId,
	isGloveId,
	isKnownWeaponId,
	normalizeWeaponId,
	WEAPON_ID_ALIASES,
	WEAPON_ID_BY_DEFINDEX,
	WEAPON_IDS,
	weaponIdForDefindex,
} from './weapons.js'
