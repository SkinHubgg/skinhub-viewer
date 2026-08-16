/**
 * The host half of the wire, as behaviour rather than as shape.
 *
 * `wire.test.ts` freezes what the protocol IS. This covers what it DOES on the way in - which is
 * mostly about what it refuses, because a `postMessage` listener is attached to a bus the whole page
 * shares and almost everything arriving on it belongs to somebody else.
 */

import { describe, expect, test } from 'bun:test'

import {
	FRAME_CHANNEL,
	FRAME_PROTOCOL_VERSION,
	type FrameEvent,
	hostMessage,
	readFrameEvent,
} from '../src/protocol.js'

/** What the frame puts on the wire, built here so these tests do not depend on the frame's helper. */
const fromFrame = (rest: Record<string, unknown>, v: number = FRAME_PROTOCOL_VERSION) => ({
	channel: FRAME_CHANNEL,
	v,
	from: 'viewer',
	...rest,
})

describe('hostMessage', () => {
	test('stamps the envelope on both verbs, so no call site can forget it', () => {
		expect(hostMessage()).toEqual({
			channel: FRAME_CHANNEL,
			v: FRAME_PROTOCOL_VERSION,
			from: 'host',
			type: 'hello',
		})
		expect(hostMessage({ item: { float: 0.3 } })).toEqual({
			channel: FRAME_CHANNEL,
			v: FRAME_PROTOCOL_VERSION,
			from: 'host',
			type: 'set',
			patch: { item: { float: 0.3 } },
		})
	})

	/** An empty patch is still a `set`. Only `undefined` means "no patch, say hello". */
	test('an empty patch is a set, not a hello', () => {
		expect(hostMessage({}).type).toBe('set')
	})

	/**
	 * *** EVERYTHING IT PRODUCES MUST SURVIVE A STRUCTURED CLONE, *** because `postMessage` does not
	 * throw a friendly error on an un-cloneable field - it throws a `DataCloneError` and takes the whole
	 * message with it. A patch built from props a consumer wrote inline is the likeliest place for a
	 * function or a class instance to sneak in, so the shape this file emits is checked to be plain.
	 */
	test('what it produces is structured-cloneable', () => {
		const message = hostMessage({
			item: { weaponType: 'weapon_ak47', paintIndex: 44, nameTag: null, statTrak: false },
			gloves: null,
			settings: { environment: { map: null } },
		})
		expect(structuredClone(message)).toEqual(message)
	})
})

describe('readFrameEvent', () => {
	test('accepts every event verb the frame can send', () => {
		const verbs: FrameEvent['type'][] = ['hello', 'ready', 'error', 'change', 'editing-slot', 'resize']
		for (const type of verbs) {
			const reading = readFrameEvent(fromFrame({ type }))
			expect(reading.kind).toBe('event')
		}
	})

	/* ── WHAT IT DROPS IN SILENCE ─────────────────────────────────────────────────────────────── */

	test('ignores traffic that is not ours', () => {
		// The realistic neighbours on the bus: HMR, an extension, a wallet, React DevTools.
		for (const data of [
			undefined,
			null,
			'a string',
			42,
			[],
			{ type: 'ready' },
			{ source: 'react-devtools-bridge', type: 'ready' },
			{ channel: 'someone-elses-viewer', v: 1, from: 'viewer', type: 'ready' },
		])
			expect(readFrameEvent(data).kind).toBe('ignore')
	})

	/**
	 * *** OUR OWN OUTBOUND TRAFFIC IS IGNORED, AND `from` IS WHAT DOES IT. *** Both directions share one
	 * channel and both have a `hello`, so without the direction check a host that also embeds another
	 * host's frame would read its own messages back.
	 */
	test('ignores our own host messages echoing back', () => {
		expect(readFrameEvent(hostMessage()).kind).toBe('ignore')
		expect(readFrameEvent(hostMessage({ view: 'hands' })).kind).toBe('ignore')
	})

	/**
	 * A verb on a matching version that this build does not have can only be our own mistake - the frame
	 * gained an event without bumping the integer. Dropped rather than reported: there is nothing the
	 * integrator could do with it.
	 */
	test('ignores an unknown verb on a matching version', () => {
		expect(readFrameEvent(fromFrame({ type: 'capture' })).kind).toBe('ignore')
		expect(readFrameEvent(fromFrame({ type: 42 })).kind).toBe('ignore')
	})

	/* ── THE ONE THING IT REFUSES LOUDLY ──────────────────────────────────────────────────────── */

	/**
	 * *** THE BACKSTOP, AND THE REASON THIS TEST EXISTS AT ALL. *** Everything else about drift is caught
	 * at build time by `wire.test.ts` and by the app repo's conformance test. This is what happens when
	 * a build that shipped months ago meets a frame that moved: it must be terminal, and it must say
	 * which side is stale. A version check that quietly stopped checking would leave both halves
	 * half-understanding each other, which is the failure the integer was introduced to make impossible.
	 */
	test('a version mismatch is terminal in both directions', () => {
		const behind = readFrameEvent(fromFrame({ type: 'ready' }, FRAME_PROTOCOL_VERSION - 1))
		expect(behind.kind).toBe('mismatch')
		if (behind.kind !== 'mismatch') throw new Error('unreachable')
		expect(behind.error.code).toBe('protocol-mismatch')
		// The embed is behind us, so the action is a reload - NOT "update your package", which would
		// send somebody to the one place that cannot help.
		expect(behind.error.message).toContain('embedded page is out of date')

		const ahead = readFrameEvent(fromFrame({ type: 'ready' }, FRAME_PROTOCOL_VERSION + 1))
		expect(ahead.kind).toBe('mismatch')
		if (ahead.kind !== 'mismatch') throw new Error('unreachable')
		expect(ahead.error.message).toContain('This package is out of date')
	})

	test('a missing or non-numeric version is a mismatch, not an ignore', () => {
		for (const v of [undefined, null, '1', Number.NaN])
			expect(readFrameEvent({ channel: FRAME_CHANNEL, v, from: 'viewer', type: 'ready' }).kind).toBe('mismatch')
	})

	/**
	 * *** THE VERSION IS CHECKED BEFORE THE VERB. *** An out-of-date frame is exactly the frame most
	 * likely to send a shape this build cannot parse, and "the embed is out of date" is a far more
	 * useful sentence than silence about a verb we do not recognise.
	 */
	test('the version is checked before the verb', () => {
		expect(readFrameEvent(fromFrame({ type: 'a-verb-from-the-future' }, 99)).kind).toBe('mismatch')
	})
})
