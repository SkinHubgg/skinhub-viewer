/**
 * *** 0.4.4: THE `hands` VIEW'S VIEWMODEL - `viewmodel_fov` AND `viewmodel_offset_x/y/z`. ***
 *
 * The package's half: the prop rides the first `<iframe src>` as `?vmfov=`/`?vmx=`/`?vmy=`/`?vmz=` (only
 * the fields passed), and every later change is a per-field `set` patch that never raises `loading` -
 * a slider moving one value sends that value alone.
 */

import { describe, expect, test } from 'bun:test'

import { coversCanvas, diffState, frameUrl, resolveState } from '../src/state.js'

type Props = Parameters<typeof resolveState>[0]

const item = { item: { weapon: 'weapon_ak47', paintIndex: 44 } } as const

const src = (props: Props) => new URL(frameUrl('https://skinhub.gg', resolveState(props)).src).searchParams

describe('the src', () => {
	test('all four, under the frame\'s names', () => {
		const params = src({ ...item, view: 'hands', viewmodel: { fov: 68, x: 2.5, y: 0, z: -1.5 } })
		expect(params.get('vmfov')).toBe('68')
		expect(params.get('vmx')).toBe('2.5')
		expect(params.get('vmy')).toBe('0')
		expect(params.get('vmz')).toBe('-1.5')
	})

	test('only the fields passed - the rest stay the frame\'s default', () => {
		const params = src({ ...item, viewmodel: { fov: 60 } })
		expect(params.get('vmfov')).toBe('60')
		for (const key of ['vmx', 'vmy', 'vmz']) expect(params.has(key)).toBe(false)
	})

	test('no prop, or an empty one, says nothing', () => {
		for (const props of [item, { ...item, viewmodel: {} }, { ...item, viewmodel: { fov: undefined } }]) {
			const keys = [...src(props).keys()]
			expect(keys.filter(key => key.startsWith('vm'))).toEqual([])
			expect(resolveState(props).viewmodel).toBeUndefined()
		}
	})

	test('a copy, not the caller\'s object', () => {
		const viewmodel = { fov: 64, x: 1 }
		const resolved = resolveState({ ...item, viewmodel }).viewmodel
		expect(resolved).toEqual(viewmodel)
		expect(resolved).not.toBe(viewmodel)
	})
})

describe('the hand (0.4.6)', () => {
	test('left is ?vmleft=1 on the src; right, or no hand, writes nothing', () => {
		expect(src({ ...item, view: 'hands', viewmodel: { leftHanded: true } }).get('vmleft')).toBe('1')
		expect(src({ ...item, view: 'hands', viewmodel: { leftHanded: false } }).has('vmleft')).toBe(false)
		expect(src({ ...item, view: 'hands', viewmodel: { fov: 64 } }).has('vmleft')).toBe(false)
	})

	test('it travels with the numbers and on its own', () => {
		expect(resolveState({ ...item, viewmodel: { fov: 64, leftHanded: true } }).viewmodel).toEqual({
			fov: 64,
			leftHanded: true,
		})
		expect(resolveState({ ...item, viewmodel: { leftHanded: false } }).viewmodel).toEqual({ leftHanded: false })
	})

	test('switching hands is one cheap patch, the numbers left alone', () => {
		const right = resolveState({ ...item, view: 'hands', viewmodel: { fov: 68, x: 2.5, y: 0, z: -1.5, leftHanded: false } })
		const left = resolveState({ ...item, view: 'hands', viewmodel: { fov: 68, x: 2.5, y: 0, z: -1.5, leftHanded: true } })
		const patch = diffState(right, left)
		expect(patch).toEqual({ viewmodel: { leftHanded: true } })
		expect(coversCanvas(patch ?? {}, left, right)).toBe(false)
	})
})

describe('the wire', () => {
	test('a slider moving one field sends that field alone, and it is cheap', () => {
		const before = resolveState({ ...item, view: 'hands', viewmodel: { fov: 68, x: 1, y: 0, z: 0 } })
		const after = resolveState({ ...item, view: 'hands', viewmodel: { fov: 62, x: 1, y: 0, z: 0 } })
		const patch = diffState(before, after)
		expect(patch).toEqual({ viewmodel: { fov: 62 } })
		expect(coversCanvas(patch ?? {}, after, before)).toBe(false)
	})

	test('the first viewmodel after boot goes over whole', () => {
		const before = resolveState({ ...item, view: 'hands' })
		const after = resolveState({ ...item, view: 'hands', viewmodel: { x: 2, z: -1 } })
		expect(diffState(before, after)).toEqual({ viewmodel: { x: 2, z: -1 } })
	})

	test('restating the same values, in a fresh object, produces no patch', () => {
		const one = resolveState({ ...item, viewmodel: { fov: 64, x: 2, y: 0, z: -1 } })
		const two = resolveState({ ...item, viewmodel: { fov: 64, x: 2, y: 0, z: -1 } })
		expect(diffState(one, two)).toBeUndefined()
	})

	/** Same rule as a settings group: there is no "unset" on the wire. */
	test('dropping the prop sends nothing', () => {
		const tuned = resolveState({ ...item, viewmodel: { fov: 60 } })
		expect(diffState(tuned, resolveState(item))).toBeUndefined()
	})
})
