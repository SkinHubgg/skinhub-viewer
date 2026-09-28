/**
 * *** 0.4.3: THE PET'S HAT IN EVERY VIEW, NO SEED AS `null`, AND THE EMOTES FROM A REACT HOST. ***
 *
 * The package's half: `pet.hat` rides the src and the wire whatever the view (alone, `view="agent"`,
 * `view="hands"`) and never raises `loading`; `petSeed: null` is the base look - left off a fresh URL
 * (never `?petseed=null`, which the frame names as a problem) and sent as `null` on the wire; and
 * `pet.emote` / `paused` / `replay` reach the frame at all (they were dropped before it resolved).
 */

import { describe, expect, test } from 'bun:test'

import { coversCanvas, diffState, frameUrl, resolveState } from '../src/state.js'

const src = (props: Parameters<typeof resolveState>[0]) =>
	new URL(frameUrl('https://skinhub.gg', resolveState(props)).src).searchParams

describe('the hat, in every pet view', () => {
	test('the src carries it alone, on a shoulder and in first person', () => {
		expect(src({ pet: { id: 3, hat: 'party' } }).get('hat')).toBe('party')
		const shoulder = src({ pet: { id: 3, hat: 'top_hat' }, view: 'agent', agent: { id: 4711, pose: null } })
		expect(shoulder.get('hat')).toBe('top_hat')
		expect(shoulder.get('view')).toBe('agent')
		const hands = src({ pet: { id: 2, hat: 'wizard_hat' }, view: 'hands', agent: { id: 5036, pose: null } })
		expect(hands.get('hat')).toBe('wizard_hat')
		expect(hands.get('view')).toBe('hands')
		expect(src({ pet: { id: 3, hat: null }, view: 'agent' }).get('hat')).toBe('none')
	})

	test('a new hat on a shoulder is a wire patch and never a reload', () => {
		const before = resolveState({ pet: { id: 3, hat: 'party' }, view: 'agent', agent: { id: 4711, pose: null } })
		const after = resolveState({ pet: { id: 3, hat: 'alien' }, view: 'agent', agent: { id: 4711, pose: null } })
		const patch = diffState(before, after)
		expect(patch?.pet).toEqual({ hat: 'alien' })
		expect(coversCanvas(patch ?? {}, after, before)).toBe(false)
		expect(diffState(after, resolveState({ pet: { id: 3, hat: null }, view: 'hands' }))?.pet).toEqual({ hat: null })
	})
})

describe('no seed is `null`', () => {
	test('a fresh src leaves it off - the base look - and never writes the word null', () => {
		expect(src({ pet: { id: 3, petSeed: null } }).has('petseed')).toBe(false)
		expect(src({ pet: { id: 3, petSeed: 0 } }).get('petseed')).toBe('0')
		expect(src({ pet: { id: 3, petSeed: 954 } }).get('petseed')).toBe('954')
	})

	test('going back to no seed is sent as null, and it is cheap', () => {
		const seeded = resolveState({ pet: { id: 3, petSeed: 954 } })
		const bare = resolveState({ pet: { id: 3, petSeed: null } })
		const patch = diffState(seeded, bare)
		expect(patch?.pet).toEqual({ petSeed: null })
		expect(coversCanvas(patch ?? {}, bare, seeded)).toBe(false)
	})
})

describe('the emotes reach the frame', () => {
	test('`emote` rides the src; `paused` and `replay` only the wire', () => {
		const params = src({ pet: { id: 3, emote: 'trick-trick03', paused: true, replay: 2 } })
		expect(params.get('emote')).toBe('trick-trick03')
		expect(params.has('paused')).toBe(false)
		expect(params.has('replay')).toBe(false)
		expect(resolveState({ pet: { id: 3, emote: 'trick', paused: true, replay: 2 } }).pet).toEqual({
			id: 3,
			emote: 'trick',
			paused: true,
			replay: 2,
		})
	})

	test('a new take, a pause and a replay are cheap patches', () => {
		const one = resolveState({ pet: { id: 3, emote: 'trick', replay: 0 } })
		const two = resolveState({ pet: { id: 3, emote: 'squat', paused: true, replay: 1 } })
		const patch = diffState(one, two)
		expect(patch?.pet).toEqual({ emote: 'squat', paused: true, replay: 1 })
		expect(coversCanvas(patch ?? {}, two, one)).toBe(false)
	})
})
