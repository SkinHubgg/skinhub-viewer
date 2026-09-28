/**
 * *** 0.4.3: A PET ON AN OPERATOR'S SHOULDER - `pet` with `view="agent"`. ***
 *
 * The frame draws `agent` with the pet on the left shoulder when a pet subject is in the `agent` view.
 * The claims here are the package's half: the URL spells it the way the frame (and the pet page) reads
 * it - `?view=agent&agent=`, the bird's held clip as `?shoulder=`, and the operator's pose as
 * `?agentpose=` because `?pose=` on a pet URL is the bird's clip - and moving the operator reloads.
 */

import { describe, expect, test } from 'bun:test'

import { coversCanvas, frameUrl, resolveState } from '../src/state.js'

const src = (props: Parameters<typeof resolveState>[0]) => {
	const { src } = frameUrl('https://skinhub.gg', resolveState(props))
	return new URL(src).searchParams
}

describe('a pet on an operator', () => {
	test('the view, the operator, their pose and the held shoulder clip ride the src', () => {
		const params = src({
			pet: { id: 4, stage: 'pullet', petSeed: 954, shoulder: 3 },
			view: 'agent',
			agent: { id: 4711, pose: 'noweapon:ct_main_menu_knife_backflip' },
		})
		expect(params.get('pet')).toBe('4')
		expect(params.get('view')).toBe('agent')
		expect(params.get('agent')).toBe('4711')
		expect(params.get('shoulder')).toBe('3')
		expect(params.get('agentpose')).toBe('noweapon:ct_main_menu_knife_backflip')
		// `?pose=` on a pet URL is the bird's clip, so the operator's pose never goes there.
		expect(params.has('pose')).toBe(false)
	})

	test("the bird's own pose and the operator's pose both survive", () => {
		const params = src({ pet: { id: 3, pose: 'idle01' }, view: 'agent', agent: { id: 5036, pose: 'x' } })
		expect(params.get('pose')).toBe('idle01')
		expect(params.get('agentpose')).toBe('x')
	})

	test('null shoulder is the chain, written as the empty value; unset says nothing', () => {
		expect(src({ pet: { id: 3, shoulder: null }, view: 'agent' }).get('shoulder')).toBe('')
		expect(src({ pet: { id: 3 }, view: 'agent' }).has('shoulder')).toBe(false)
	})

	test('without a pet the operator pose is still ?pose=', () => {
		expect(src({ operator: { id: 5036, pose: 'x' } }).get('pose')).toBe('x')
	})

	test('a new carrier reloads; a new shoulder clip does not', () => {
		const next = { subject: 'pet' as const, view: 'agent' as const, pet: { id: 3 } }
		expect(coversCanvas({ agent: { id: 4711 } }, next)).toBe(true)
		expect(coversCanvas({ pet: { shoulder: 2 } }, next)).toBe(false)
	})

	/*
	 * THE BIRD STAYS IDENTITY ON THE SHOULDER. A new breed or a pullet/hen move raises `loading` under
	 * `view: 'agent'` exactly as it does for the pet alone, and the frame answers with a `ready` once the
	 * new bird is on the shoulder (its operator cover waits for the bird too). Were either side to drop
	 * that, a host's loading slot would stay up for good - these pin the package's half.
	 */
	test('a new breed and a pullet/hen move reload on the shoulder too', () => {
		const on = (pet: { id: number; stage?: 'pullet' | 'hen' }) => ({ subject: 'pet' as const, view: 'agent' as const, pet })
		expect(coversCanvas({ pet: { id: 4 } }, on({ id: 4 }), { pet: { id: 3 } })).toBe(true)
		expect(coversCanvas({ pet: { stage: 'pullet' } }, on({ id: 3, stage: 'pullet' }), { pet: { id: 3 } })).toBe(true)
		// A stage that draws the same bird is no reload here either: no `ready` would come for it.
		expect(coversCanvas({ pet: { stage: 'hen' } }, on({ id: 3, stage: 'hen' }), { pet: { id: 3 } })).toBe(false)
		// Colour, seed and look stay in place on the shoulder.
		expect(coversCanvas({ pet: { variant: 2, petSeed: 9 } }, on({ id: 3 }), { pet: { id: 3 } })).toBe(false)
		expect(coversCanvas({ agent: { pose: 'noweapon:t_main_menu_elite_bellyrub' } }, on({ id: 3 }))).toBe(false)
	})
})
