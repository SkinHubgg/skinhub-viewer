/**
 * *** THE HOST HALF OF THE WIRE. *** `@skinhub/viewer/protocol`.
 *
 * The frame's half is `app/frame/protocol.ts` inside the SkinHub app, which is a PRIVATE repository -
 * it carries the renderer, the shader transcriptions and the export-fed material pipeline. That half
 * is the specification. This is the same contract written from the other end of the channel.
 *
 * *** THE TWO FILES ARE NOT SHARED CODE AND CANNOT BE - and the reason is not that they now live in
 * different repositories, it is what each one is MADE OF. *** The frame's half is typed in the
 * renderer's own prop types and validates against the renderer's map list, its view enum and its
 * placement defaults; a customer's bundle must not carry any of that. This half is typed in plain
 * data and uses no vocabulary a customer cannot find documented in `EMBED.md`. Merging them means
 * either shipping the renderer's surface to every integrator, or making the specification depend on a
 * published package in order to describe itself.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** SO THE DUPLICATION IS DELIBERATE - AND IT IS CHECKED BY A MACHINE, IN TWO PLACES. ***
 *
 *   1. `test/wire.test.ts`, HERE. Every name and every field this file puts on the wire is frozen in
 *      a literal, and the literals are checked EXHAUSTIVE against the types, so a field cannot be
 *      added to the wire without the freeze failing to compile. That is what makes an edit to this
 *      file deliberate rather than incidental, and it is the moment you are told to go and change the
 *      frame and bump {@link FRAME_PROTOCOL_VERSION}.
 *
 *   2. `app/frame/protocol.conformance.test.ts`, IN THE APP REPO - the only place both halves exist
 *      at once. It feeds this file's own `hostMessage()` output through the frame's real validator and
 *      requires ZERO rejected fields, feeds the frame's real events through {@link readFrameEvent},
 *      and compares the two key sets at the type level. That is the check that actually catches drift,
 *      because it exercises the frame's reader rather than a restatement of it.
 *
 * *** THE VERSION INTEGER IS THE BACKSTOP, NOT THE CHECK, and the difference is the whole point. ***
 * A mismatch is terminal on both sides - the frame renders nothing and names which side is stale, this
 * package stops sending - so a mismatch that HAPPENS is loud. But it only happens if somebody
 * remembered to bump the integer. The failure the two checks above exist for is the other one: a field
 * added to the frame, the integer left alone, both sides claiming `v: 1`, and the field silently
 * dropped. A silently wrong render is worse than a blank frame with an explanation, and this project
 * has been bitten by that class of failure repeatedly.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** THE VOCABULARY HERE IS THE FRAME'S, NOT THE INTEGRATOR'S. ***
 *
 * `weaponType`, `sticker_id`, `offset_x` - the renderer's own names and the game's own field names.
 * `item.ts` translates between this and `types.ts`, and that translation is the package's actual job:
 * an integrator writing `offset_x` into a React tree is writing protobuf into their view layer.
 *
 * *** WHICH IS WHY THIS IS A SEPARATE ENTRY POINT AND NOT PART OF THE BARREL. *** It is exported at
 * all because the wire is ALREADY public - `EMBED.md` §6 documents this envelope, this patch and these
 * events in full, for the PHP / Vue / plain-`<script>` hosts the URL contract exists for - so
 * withholding the TypeScript for a shape we publish in prose bought nothing, and made the conformance
 * check above impossible to write. It carries no compatibility promise beyond the integer: it moves
 * when the wire moves, which is the whole no-back-compat bargain. Reach for `SkinViewer` from the
 * barrel unless you are writing a host in something that is not React.
 */

import type { KeychainPlacement, StickerPlacement } from '@skinhub/cdn/placement'

/**
 * The discriminator on every message in both directions.
 *
 * It exists because `window.postMessage` is a shared bus: React DevTools, Next's dev overlay, HMR,
 * wallet extensions and analytics tags all post into and out of frames, and several post objects with
 * a `type` field. Anything without this key is not ours and is dropped in silence.
 */
export const FRAME_CHANNEL = 'skinhub-viewer'

/**
 * The protocol version this package speaks.
 *
 * *** AN INTEGER, NOT A SEMVER RANGE, because there is no range: *** there is no back-compat window
 * and never will be. Two integers either match or they do not, and the failure text can
 * then say which side is behind.
 *
 * *** IT IS ALSO THE PACKAGE'S EXPIRY DATE, AND THAT IS THE INTENT. *** When we change the wire, every
 * published copy of this package stops working loudly and at once. That is the cost of the no-back-compat
 * decision and it is paid deliberately, in exchange for never shipping a viewer that renders a
 * partly-understood item.
 */
export const FRAME_PROTOCOL_VERSION = 1

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE STATE, IN THE FRAME'S WORDS
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Five stickers plus the charm in slot 5. The frame validates the SHAPE of this and nothing else. */
export type PlacementSlots = [
	StickerPlacement,
	StickerPlacement,
	StickerPlacement,
	StickerPlacement,
	StickerPlacement,
	KeychainPlacement,
]

export type FrameItem = {
	/** `weapon_ak47`, or a glove id. The key the renderer's model table resolves. */
	weaponType: string
	paintIndex: number
	legacyModel?: boolean
	float?: number
	seed?: number
	statTrak?: number | false
	nameTag?: string | null
	stickers?: PlacementSlots
}

export type FrameSettings = {
	camera?: { fov?: number; defaultZoom?: number }
	quality?: { bloom?: number; bloomSpill?: number; renderScale?: number; antialias?: boolean; shadows?: boolean }
	environment?: { map?: string | null; timeOfDay?: string; rain?: boolean; background?: string }
	overlays?: {
		stickerGizmo?: boolean
		charmGizmo?: boolean
		gizmoStyle?: { color?: string; shadowColor?: string }
	}
}

export type FrameInteractions = {
	orbit?: boolean
	zoom?: boolean
	dragStickers?: boolean
	dragCharm?: boolean
}

/**
 * *** THE FRAME'S FIVE SUBJECT KINDS. *** `weapon` covers gloves too - a glove is a `weaponType`.
 *
 * NOTE THE WORD: the wire says `agent` where `types.ts` says `operator`. That is the translation this
 * package exists to do (see `item.ts`'s header): the frame's own subject vocabulary has always called
 * the person an agent, and an integrator holding a weapon-modifier prop already named `agent` needs a
 * different word for the standalone picture. One rename, in one file.
 */
export type FrameSubjectKind = 'weapon' | 'sticker' | 'charm' | 'collectible' | 'agent'

/** The three standalone item groups, in the frame's words. An id, and at most one number. */
export type FrameSticker = { id: number; wear?: number }
export type FrameCharm = { id: number; pattern?: number }
export type FrameCollectible = { id: number }

/**
 * Everything `/frame` holds. One field per prop of the renderer that a host can set.
 *
 * *** THE FIVE SUBJECTS ARE HELD AT ONCE AND `subject` PICKS ONE. *** A patch naming `sticker` does
 * NOT make the sticker the subject - only `subject` does. That matters here in particular because this
 * package restates its whole prop set on every render: if a group write switched the picture, a host
 * holding both a weapon and a pin would flip between them on any render mentioning both.
 */
export type FrameState = {
	subject: FrameSubjectKind
	item: FrameItem
	sticker: FrameSticker
	charm: FrameCharm
	collectible: FrameCollectible
	view: 'gun' | 'hands' | 'agent'
	agent: { id: number; pose?: string | null }
	gloves: { type: string; paintIndex: number; float?: number; seed?: number } | null
	settings: FrameSettings
	interactions: FrameInteractions
	editingSlot: number
}

/**
 * A partial write over {@link FrameState}.
 *
 * *** EVERY OBJECT MERGES BY FIELD AND AN ABSENT KEY MEANS "LEAVE IT ALONE". *** That rule is not a
 * convenience, it is the cheap-update contract: `{ item: { float } }` keeps `weaponType`, so the
 * frame's loading gate - which is keyed on the identity VALUES - does not move. A patch that replaced
 * rather than merged would blank the weapon on every float tick.
 */
export type FramePatch = {
	/** The subject switch, and the only one - see {@link FrameState}. An IDENTITY change in every direction. */
	subject?: FrameSubjectKind
	item?: Partial<FrameItem>
	sticker?: Partial<FrameSticker>
	charm?: Partial<FrameCharm>
	collectible?: Partial<FrameCollectible>
	view?: FrameState['view']
	agent?: Partial<FrameState['agent']>
	gloves?: FrameState['gloves']
	settings?: FrameSettings
	interactions?: FrameInteractions
	editingSlot?: number
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE MESSAGES
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type Envelope = { channel: typeof FRAME_CHANNEL; v: number; from: 'host' | 'viewer' }

export type HostMessage = (Envelope & { type: 'hello' }) | (Envelope & { type: 'set'; patch: FramePatch })

export type FrameErrorCode = 'render-failed' | 'bad-inspect-link' | 'bad-message' | 'protocol-mismatch'
export type FrameError = { code: FrameErrorCode; message: string }

export type FrameEvent =
	| (Envelope & { type: 'hello'; state: FrameState; problems: string[] })
	| (Envelope & { type: 'ready' })
	| (Envelope & { type: 'error'; error: FrameError })
	| (Envelope & { type: 'change'; item: FrameItem })
	| (Envelope & { type: 'editing-slot'; slot: number })
	| (Envelope & { type: 'resize'; width: number; height: number; dpr: number })

/** Stamps the envelope, so no call site can forget the channel, the version or the direction. */
export const hostMessage = (patch?: FramePatch): HostMessage =>
	patch
		? { channel: FRAME_CHANNEL, v: FRAME_PROTOCOL_VERSION, from: 'host', type: 'set', patch }
		: { channel: FRAME_CHANNEL, v: FRAME_PROTOCOL_VERSION, from: 'host', type: 'hello' }

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * READING WHAT COMES BACK
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type FrameEventReading =
	/** Not ours - HMR, an extension, another library, or our own message echoing. Drop it silently. */
	| { kind: 'ignore' }
	/** Ours, and the versions disagree. Terminal. */
	| { kind: 'mismatch'; error: FrameError }
	| { kind: 'event'; event: FrameEvent }

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * One arriving `MessageEvent.data`, classified.
 *
 * *** THE HOST SIDE CHECKS THE VERSION TOO, AND IT IS NOT REDUNDANT WITH THE FRAME'S CHECK. *** The
 * frame only learns about a mismatch once the host has SENT something. A host that configures the
 * viewer entirely from props and never changes them still receives `hello`, `ready` and `change` - and
 * if the frame is newer, those payloads may have moved. Reading them anyway is how a stale package
 * hands its user a `change` event with half an item in it, which is the exact failure mode
 * the no-back-compat rule forbids. So a mismatch heard here is fatal here as well.
 *
 * `from: 'viewer'` IS CHECKED because both directions share one channel and both have a `hello`.
 * Without it a host that also embeds another host's frame could read its own outbound traffic.
 */
export const readFrameEvent = (data: unknown): FrameEventReading => {
	if (!isRecord(data) || data.channel !== FRAME_CHANNEL || data.from !== 'viewer') return { kind: 'ignore' }

	if (data.v !== FRAME_PROTOCOL_VERSION)
		return { kind: 'mismatch', error: { code: 'protocol-mismatch', message: versionMessage(data.v) } }

	if (typeof data.type !== 'string') return { kind: 'ignore' }
	/*
	 * A VERB THIS BUILD DOES NOT HAVE, ON A VERSION IT DOES: only possible if the frame gained an event
	 * without bumping the integer, which is our mistake and not the integrator's. Dropped rather than
	 * reported, because there is nothing they could do about it and an error they cannot act on is
	 * noise in their console.
	 */
	if (!KNOWN_EVENTS.has(data.type)) return { kind: 'ignore' }

	return { kind: 'event', event: data as unknown as FrameEvent }
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set(['hello', 'ready', 'error', 'change', 'editing-slot', 'resize'])

/**
 * The sentence a developer reads when the versions disagree - the whole of what the no-back-compat
 * decision buys, so it names the DIRECTION rather than just the numbers.
 *
 * A PACKAGE BEHIND THE EMBED is the ordinary case and the one with an action attached: they installed
 * `@skinhub/viewer` some months ago and we have shipped a protocol change since. Updating fixes it.
 *
 * A PACKAGE AHEAD OF THE EMBED means the embedded document is stale - almost always a cached
 * `/frame` - so the action is a reload rather than an install. Telling somebody to update a package
 * that is already newer would send them to the one place that cannot help.
 */
const versionMessage = (received: unknown): string => {
	const seen = typeof received === 'number' ? received : JSON.stringify(received)
	if (typeof received === 'number' && received < FRAME_PROTOCOL_VERSION)
		return `@skinhub/viewer speaks protocol ${FRAME_PROTOCOL_VERSION} and the embed answered with ${seen}. The embedded page is out of date - it is cached, or the origin you pointed at is running an older build. Nothing has been rendered, deliberately: a partly-understood message would render a partly-correct item.`
	return `@skinhub/viewer speaks protocol ${FRAME_PROTOCOL_VERSION} and the embed answered with ${seen}. This package is out of date - update @skinhub/viewer. Nothing has been rendered, deliberately: a partly-understood message would render a partly-correct item.`
}
