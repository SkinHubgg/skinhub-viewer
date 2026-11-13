/**
 * *** A SERVER RENDER HAS NO IFRAME (0.4.5). ***
 *
 *   bun test test/ssr.test.tsx
 *
 * The frame posts `hello` once, as its script runs, and never again. Up to 0.4.4 the iframe was in a
 * server-rendered page's HTML, so it loaded with the page and - on anything that hydrated slower than
 * the frame booted, a dev build every time - said `hello` before `<SkinViewer>` had a listener. The
 * viewer never connected: `unreachable` after 15s, the fallback over a working scene, and no prop change
 * ever sent. Found on cs2il.com's viewmodel page, where the sliders moved nothing.
 *
 * Checked against `src/` and the built `dist/`, since `dist/` is what a consumer's bundler resolves.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'

import { SkinViewer as SourceViewer } from '../src/SkinViewer'
import type { SkinViewerProps } from '../src/types'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

beforeAll(() => {
	const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
	if (!existsSync(join(DIST, 'SkinViewer.js')))
		throw new Error(`build did not produce dist/SkinViewer.js:\n${build.stderr.toString()}${build.stdout.toString()}`)
}, 60_000)

const props: SkinViewerProps = {
	item: { weapon: 'weapon_ak47', paintIndex: 44 },
	loading: <span id="host-loading" />,
}

const cases: [string, () => Promise<ComponentType<SkinViewerProps>>][] = [
	['src', async () => SourceViewer],
	['dist', async () => ((await import(join(DIST, 'SkinViewer.js'))) as { SkinViewer: ComponentType<SkinViewerProps> }).SkinViewer],
]

describe.each(cases)('%s: the server never renders the iframe', (_, load) => {
	test('no <iframe> in the HTML, so nothing can say hello before the listener exists', async () => {
		const Viewer = await load()
		expect(renderToString(<Viewer {...props} />)).not.toContain('<iframe')
	})

	test("the host's loading overlay is there instead, so the box is not empty until hydration", async () => {
		const Viewer = await load()
		expect(renderToString(<Viewer {...props} />)).toContain('id="host-loading"')
	})
})
