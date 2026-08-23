/**
 * Regression test for `hostLoading` surviving the BUILT output.
 *
 * The bug this guards against already happened once: `src/state.ts` and `src/protocol.ts` grew
 * `hostLoading` in the commit that fixed the grey-box regression, but that commit sat unpushed while
 * `v0.3.1` was tagged and published without it. Next-il's production only had the behaviour because
 * of a local patch keyed to the exact string `@skinhub/viewer@0.3.1` - the next version bump would
 * have silently dropped it again, with nothing here to catch that.
 *
 * This runs against `dist/`, not `src/`, and rebuilds first - the same discipline `test/bundle.test.ts`
 * and `@skinhub/cdn`'s `wrapped_sticker` regression test both use. "The source has the field" is not
 * the claim that matters; a consumer's `bun install` only ever receives what `tsc` emitted.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

type DesiredStateLike = { hostLoading: boolean; [key: string]: unknown }

type StateModule = {
	resolveState: (props: Record<string, unknown>) => DesiredStateLike
	frameUrl: (origin: string, desired: DesiredStateLike) => { src: string }
	diffState: (previous: DesiredStateLike, next: DesiredStateLike) => Record<string, unknown> | undefined
}

const item = { item: { weapon: 'weapon_ak47', paintIndex: 44 } }

beforeAll(() => {
	const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
	if (!existsSync(join(DIST, 'state.js')))
		throw new Error(`build did not produce dist/state.js:\n${build.stderr.toString()}${build.stdout.toString()}`)
}, 60_000)

describe('hostLoading survives the built dist/, not only src/', () => {
	test('dist/state.js: resolveState resolves it and frameUrl writes ?hostloading=1 only when true', async () => {
		const state = (await import(join(DIST, 'state.js'))) as StateModule

		const withoutLoading = state.resolveState({ ...item })
		expect(withoutLoading.hostLoading).toBe(false)
		expect(new URL(state.frameUrl('https://skinhub.gg', withoutLoading).src).searchParams.has('hostloading')).toBe(
			false,
		)

		const withLoading = state.resolveState({ ...item, loading: 'spinner' })
		expect(withLoading.hostLoading).toBe(true)
		expect(new URL(state.frameUrl('https://skinhub.gg', withLoading).src).searchParams.get('hostloading')).toBe('1')
	})

	test('dist/state.js: diffState still patches hostLoading on its own, across both directions', async () => {
		const state = (await import(join(DIST, 'state.js'))) as StateModule
		const withLoading = state.resolveState({ ...item, loading: 'spinner' })
		const withoutLoading = state.resolveState({ ...item })

		expect(state.diffState(withLoading, withoutLoading)).toEqual({ hostLoading: false })
		expect(state.diffState(withoutLoading, withLoading)).toEqual({ hostLoading: true })
	})

	test('the built .d.ts still declares hostLoading on FrameState, FramePatch and SkinViewerProps', () => {
		const protocolDts = readFileSync(join(DIST, 'protocol.d.ts'), 'utf8')
		expect(protocolDts).toMatch(/hostLoading:\s*boolean/)
		expect(protocolDts).toMatch(/hostLoading\?:\s*boolean/)

		const typesDts = readFileSync(join(DIST, 'types.d.ts'), 'utf8')
		expect(typesDts).toMatch(/hostLoading\?:\s*boolean/)
	})
})
