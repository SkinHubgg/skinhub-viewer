/**
 * *** THE WIRE FREEZE. This test's job is to make a change to `src/protocol.ts` IMPOSSIBLE TO MAKE BY
 * ACCIDENT. ***
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** IF THIS TEST IS FAILING, READ THIS BEFORE UPDATING THE SNAPSHOT. ***
 *
 * You changed the shape of the wire. The frame - `app/frame/protocol.ts`, in the SkinHub app repo -
 * is the other half of it, and it has not changed. Until it does, this package and the embed disagree
 * about what a message means, and every published copy of this package will keep speaking the old
 * shape under the same version integer.
 *
 * In order:
 *
 *   1. Make the matching change in the frame's `protocol.ts`, INCLUDING its validator. A field the
 *      frame's type allows but its `readPatch` does not read is a field that arrives and is silently
 *      dropped, which is the failure this whole arrangement exists to prevent.
 *   2. Bump `FRAME_PROTOCOL_VERSION` in BOTH files. There is no back-compat window: an old package
 *      talking to a new frame must fail loudly rather than half-work.
 *   3. Run the app repo's `bun test app/frame/protocol.conformance.test.ts`. That is the only check
 *      that sees both halves at once, and it is the one that proves the new field survives the frame's
 *      real reader rather than merely appearing in two type declarations.
 *   4. Only then update `test/wire.snapshot.json` here - `bun test --update-snapshots` will not do it,
 *      it is a plain committed file, on purpose, so the change shows up in a diff a human reviews.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** WHY A COMMITTED JSON FILE RATHER THAN A HASH. *** A fingerprint would catch the same drift and
 * would say nothing about what moved. The point of the artifact is that a reviewer looking at the
 * commit sees `"autoRotation"` appear in a list of settings groups and asks whether the frame got it
 * too. A hash makes that a number that changed.
 */

import { describe, expect, test } from 'bun:test'

import snapshot from './wire.snapshot.json'

import {
	FRAME_CHANNEL,
	FRAME_PROTOCOL_VERSION,
	type FrameErrorCode,
	type FrameEvent,
	type FrameInteractions,
	type FrameItem,
	type FramePatch,
	type FrameSettings,
	type FrameState,
	type HostMessage,
	type PlacementSlots,
} from '../src/protocol.js'
import { type AssertTrue, type Exact, keysOf, membersOf } from './exhaustive.js'

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE WIRE, DESCRIBED FROM THE TYPES
 *
 * Every list below is checked exhaustive against the type it names - see `keysOf`. Adding a field
 * anywhere in `src/protocol.ts` breaks the compile HERE first.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type Settings = NonNullable<FrameSettings>
type Overlays = NonNullable<Settings['overlays']>

const wire = () => ({
	channel: FRAME_CHANNEL,
	version: FRAME_PROTOCOL_VERSION,

	envelope: keysOf<Omit<Extract<HostMessage, { type: 'hello' }>, 'type'>>()(['channel', 'v', 'from']),

	hostVerbs: membersOf<HostMessage['type']>()(['hello', 'set']),
	eventVerbs: membersOf<FrameEvent['type']>()(['hello', 'ready', 'error', 'change', 'editing-slot', 'resize']),
	errorCodes: membersOf<FrameErrorCode>()(['render-failed', 'bad-inspect-link', 'bad-message', 'protocol-mismatch']),

	state: keysOf<FrameState>()(['item', 'view', 'agent', 'gloves', 'settings', 'interactions', 'editingSlot']),
	patch: keysOf<FramePatch>()(['item', 'view', 'agent', 'gloves', 'settings', 'interactions', 'editingSlot']),

	item: keysOf<FrameItem>()([
		'weaponType',
		'paintIndex',
		'legacyModel',
		'float',
		'seed',
		'statTrak',
		'nameTag',
		'stickers',
	]),
	views: membersOf<FrameState['view']>()(['gun', 'hands', 'agent']),
	agent: keysOf<FrameState['agent']>()(['id', 'pose']),
	gloves: keysOf<NonNullable<FrameState['gloves']>>()(['type', 'paintIndex', 'float', 'seed']),

	settingsGroups: keysOf<Settings>()(['camera', 'quality', 'environment', 'overlays']),
	camera: keysOf<NonNullable<Settings['camera']>>()(['fov', 'defaultZoom']),
	quality: keysOf<NonNullable<Settings['quality']>>()(['bloom', 'bloomSpill', 'renderScale', 'antialias', 'shadows']),
	environment: keysOf<NonNullable<Settings['environment']>>()(['map', 'timeOfDay', 'rain', 'background']),
	overlays: keysOf<Overlays>()(['stickerGizmo', 'charmGizmo', 'gizmoStyle']),
	gizmoStyle: keysOf<NonNullable<Overlays['gizmoStyle']>>()(['color', 'shadowColor']),

	interactions: keysOf<FrameInteractions>()(['orbit', 'zoom', 'dragStickers', 'dragCharm']),
})

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * TYPE-LEVEL INVARIANTS THAT A KEY LIST CANNOT EXPRESS
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * *** THE PATCH MUST BE KEY-FOR-KEY THE STATE. *** Not a subset and not a superset: a state field with
 * no patch key is a field an integrator can never change after the first paint, and a patch key with
 * no state field is one the frame has nowhere to put.
 */
type _PatchCoversState = AssertTrue<Exact<keyof FrameState, keyof FramePatch>>

/**
 * *** SIX SLOTS, NOT `StickerPlacement[]`. *** The frame reads `[5]` as the charm on every message and
 * the renderer reads `sticker_id` on every slot every frame, so a variable-length array here would be
 * an index-out-of-bounds in a render loop rather than a validation error at the boundary.
 */
type _SlotsAreSix = AssertTrue<Exact<PlacementSlots['length'], 6>>

/** `statTrak: 0` is a real, freshly-minted counter and `false` is no module. Collapsing that to a
 * boolean, or widening it to `number`, loses one of the two states the game actually has. */
type _StatTrakKeepsFalse = AssertTrue<Exact<FrameItem['statTrak'], number | false | undefined>>

/** `null` is "no plate", not "leave it alone" - the distinction the whole patch merge rests on. */
type _NameTagKeepsNull = AssertTrue<Exact<FrameItem['nameTag'], string | null | undefined>>

/** `gloves: null` is the wearer's own default pair, which is why the patch takes the whole object. */
type _GlovesAreWholesale = AssertTrue<Exact<FramePatch['gloves'], FrameState['gloves'] | undefined>>

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE SNAPSHOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the wire is frozen', () => {
	test('matches test/wire.snapshot.json — see the header of this file before changing it', () => {
		expect(wire()).toEqual(snapshot)
	})

	/**
	 * *** THE SNAPSHOT CARRIES THE VERSION INTEGER ON PURPOSE. *** It means a wire change and a version
	 * bump land in the same commit and the same diff, rather than the bump being a thing somebody does
	 * later, from memory, having already shipped.
	 */
	test('the version integer is part of what is frozen', () => {
		expect(snapshot.version).toBe(FRAME_PROTOCOL_VERSION)
		expect(Number.isInteger(FRAME_PROTOCOL_VERSION)).toBe(true)
	})

	/**
	 * *** `unreachable` IS THE PACKAGE'S OWN WORD AND MUST NEVER REACH THE WIRE. ***
	 *
	 * It means "nothing at the origin answered", which is a conclusion only the HOST can draw - the
	 * frame cannot report that it failed to load, because a frame that failed to load reports nothing.
	 * Adding it to {@link FrameErrorCode} would therefore create a code the frame can never legitimately
	 * send and the host would have to treat as impossible, which is how a validator grows a branch
	 * nobody tests.
	 */
	test('the host-only error codes are not on the wire', () => {
		for (const hostOnly of ['unreachable', 'no-item', 'unknown-weapon'])
			expect({ hostOnly, onTheWire: snapshot.errorCodes.includes(hostOnly) }).toEqual({ hostOnly, onTheWire: false })
	})

	/**
	 * A NEGATIVE CONTROL FOR THE FREEZE ITSELF. `toEqual` on two objects built by the same expression
	 * is a test that can be made vacuous by a refactor - point both sides at the same value and it
	 * passes forever. This asserts the comparison can still fail.
	 */
	test('the comparison would notice a changed field', () => {
		expect({ ...wire(), version: FRAME_PROTOCOL_VERSION + 1 }).not.toEqual(snapshot)
		expect({ ...wire(), item: [...wire().item, 'sharpness'] }).not.toEqual(snapshot)
	})
})
