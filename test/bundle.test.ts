/**
 * *** THE BLIND CONSUMER. This is the most valuable check performed on this package, and it is the
 * only one that looks at what npm actually ships. ***
 *
 * Everything else here imports `../src/…` — a compile of the source, in this repo, with this repo's
 * tsconfig. That proves the logic is right and proves nothing about the artefact. The failures this
 * catches are the ones that only appear on somebody else's machine:
 *
 *   - an `exports` map pointing at a file the build does not emit,
 *   - a declaration that quietly needs `@types/node`, so a browser consumer cannot typecheck,
 *   - React inlined instead of external, which ships two Reacts and breaks every hook,
 *   - and the headline claim of the whole package: **no `three`, no renderer, no asset bundle.**
 *
 * *** THIS REPLACES THE `example/` APP, DELIBERATELY. *** That folder was the same idea driven by
 * hand: a tiny app resolving `@skinhub/viewer` through `node_modules` so the bundler had to read the
 * `exports` map, which is a customer's install with the registry taken out of the middle. The idea was
 * right and the mechanism was a demo — you ran it and looked at a page, so it could only fail while
 * somebody was watching. The quick-start repo is now the example anybody reads; this is the part of
 * `example/` that was a TEST, kept and automated.
 *
 * Three deliberate choices, all inherited from `@skinhub/cdn`'s equivalent:
 *
 *   - **Against `dist/`, not `src/`** — `dist` is what a consumer's bundler resolves.
 *   - **A synthetic consumer, not the barrel itself.** Bundling a pure re-export file proves nothing:
 *     with no used bindings a tree-shaker correctly drops every body and emits a list of names.
 *   - **Out of process** (`bundle-probe.ts`) — `Bun.build` misresolves inside a `bun test` process.
 */

import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

type Case = {
	name: string
	module: string
	importLine: string
	target: 'browser' | 'node'
	external?: string[]
	define?: Record<string, string>
	minify?: boolean
}
type Result = { ok: boolean; bytes: number; error?: string; code?: string }

const uses = (name: string) => `import { ${name} } from '@@'\nglobalThis.keep = ${name}`
const usesAll = `import * as viewer from '@@'\nglobalThis.keep = viewer`

const CASES: Case[] = [
	{ name: 'component', module: 'index.js', importLine: uses('SkinViewer'), target: 'browser' },
	{ name: 'barrel', module: 'index.js', importLine: usesAll, target: 'browser' },
	{ name: 'hook', module: 'index.js', importLine: uses('useSkinViewer'), target: 'browser' },
	{ name: 'weapons', module: 'weapons.js', importLine: uses('weaponIdForDefindex'), target: 'browser' },
	{ name: 'protocol', module: 'protocol.js', importLine: uses('readFrameEvent'), target: 'browser' },
	{ name: 'protocol-all', module: 'protocol.js', importLine: usesAll, target: 'browser' },
	// A server render is a real path: the component builds its `src` in a `useState` initialiser so
	// that SSR emits the same attribute the browser will, with no hydration mismatch to paper over.
	{ name: 'component-node', module: 'index.js', importLine: uses('SkinViewer'), target: 'node' },
	/*
	 * *** A CONSUMER'S PRODUCTION BUILD. *** `define` is exactly what webpack, Vite, Next and esbuild
	 * do to `process.env.NODE_ENV`, and this is the case that proves the development-only code
	 * actually leaves rather than merely being guarded.
	 */
	{
		name: 'component-prod',
		module: 'index.js',
		importLine: uses('SkinViewer'),
		target: 'browser',
		define: { 'process.env.NODE_ENV': '"production"' },
		// Minified too, because that is what a production build is. `define` alone folds the CONDITION;
		// it takes the minifier to drop the branch behind it, which is where the message strings live.
		minify: true,
	},
]

let results: Record<string, Result> = {}

const codeOf = (name: string): string => {
	const result = results[name]
	if (!result) throw new Error(`no probe result for "${name}"`)
	if (!result.ok) throw new Error(`bundling "${name}" failed:\n${result.error}`)
	if (result.code === undefined) throw new Error(`"${name}" was too large to return (${result.bytes} bytes)`)
	return result.code
}

beforeAll(async () => {
	const build = Bun.spawnSync(['bun', 'run', 'build'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
	if (!existsSync(join(DIST, 'index.js')))
		throw new Error(`build did not produce dist/index.js:\n${build.stderr.toString()}${build.stdout.toString()}`)

	const probe = Bun.spawnSync(['bun', 'run', join(ROOT, 'test', 'bundle-probe.ts'), JSON.stringify({ cases: CASES })], {
		cwd: ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const stdout = probe.stdout.toString()
	if (!stdout) throw new Error(`bundle probe produced no output:\n${probe.stderr.toString()}`)
	results = JSON.parse(stdout) as Record<string, Result>
}, 120_000)

describe('the renderer is not in here', () => {
	/**
	 * *** THE CLAIM THE PACKAGE IS SOLD ON. *** "Installing this pulls in no `three`, no
	 * `@react-three/fiber` and no asset bundle." A grep of the source would pass on a comment and miss
	 * a re-export chain; this looks at what survived a real bundle of the shipped files.
	 */
	test('no bundle carries three, r3f, drei or a GLB loader', () => {
		const forbidden = ['three', '@react-three/fiber', '@react-three/drei', 'three-stdlib', 'GLTFLoader', 'WebGLRenderer']
		for (const name of Object.keys(results)) {
			const result = results[name]
			if (!result?.ok || result.code === undefined) continue
			for (const marker of forbidden)
				expect({ name, marker, present: result.code.includes(marker) }).toEqual({ name, marker, present: false })
		}
	})

	test('package.json declares no renderer dependency and only React as a peer', async () => {
		const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as {
			dependencies?: Record<string, string>
			peerDependencies?: Record<string, string>
		}
		// The one runtime dependency: the inspect codec and the placement types.
		expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@skinhub/cdn'])
		expect(Object.keys(pkg.peerDependencies ?? {})).toEqual(['react'])
	})

	/**
	 * The whole package is small enough that an integrator never has to think about it. Not a byte
	 * budget to defend to the last hundred — a tripwire for the day something large is imported by
	 * accident, which for this package would mean the renderer.
	 */
	test('the whole surface is a few tens of KB, not a few hundred', () => {
		expect(results['barrel']?.bytes).toBeLessThan(120_000)
		expect(results['protocol-all']?.bytes).toBeLessThan(20_000)
	})
})

describe('React stays external', () => {
	/**
	 * *** A BUNDLED REACT IS TWO REACTS, AND TWO REACTS IS "INVALID HOOK CALL" ON EVERY RENDER. ***
	 * The probe marks React external exactly as a consumer's bundler would; what this asserts is that
	 * the built files still *import* it rather than having inlined a copy at build time.
	 */
	test('the component imports React rather than carrying it', () => {
		const code = codeOf('component')
		expect(code).toMatch(/from\s*["']react["']|require\(["']react["']\)/)
		expect(code).not.toContain('react-dom/client')
		// The unmistakable fingerprint of an inlined React.
		expect(code).not.toContain('__SECRET_INTERNALS')
	})

	test("the 'use client' directive survives into the shipped file", async () => {
		// Next's App Router reads this off the module. Without it, `<SkinViewer>` is a server component
		// and every hook in it is a build error in the consumer's app rather than in ours.
		const source = await Bun.file(join(DIST, 'SkinViewer.js')).text()
		expect(source.trimStart().startsWith("'use client'")).toBe(true)
	})

	test('the wire and the weapon tables need no React at all', () => {
		// Their value to a non-React host depends on it: `@skinhub/viewer/protocol` is documented as the
		// door for a Vue or plain-`<script>` integrator.
		for (const probe of ['protocol', 'protocol-all', 'weapons']) {
			const code = codeOf(probe)
			expect({ probe, react: /from\s*["']react["']/.test(code) }).toEqual({ probe, react: false })
		}
	})
})

describe('it survives a bundler that is not ours', () => {
	test('every entry point builds for a browser', () => {
		for (const name of ['component', 'barrel', 'hook', 'weapons', 'protocol']) {
			const result = results[name]
			expect({ name, ok: result?.ok, error: result?.error }).toEqual({ name, ok: true, error: undefined })
		}
	})

	/** A server render must not reach for a browser-only global at module scope. */
	test('and for node, so a server render does not crash on import', () => {
		expect(results['component-node']?.ok).toBe(true)
	})

	test('nothing reaches for a node builtin or require()', () => {
		const code = codeOf('barrel')
		expect(code).not.toContain('node:')
		expect(code).not.toContain('require(')
	})

	/**
	 * *** THE DEVELOPMENT-ONLY CODE MUST ACTUALLY LEAVE A PRODUCTION BUILD, NOT MERELY BE GUARDED. ***
	 *
	 * `SkinViewer.tsx` writes the literal `process.env.NODE_ENV` expression out in full at each site
	 * precisely so a bundler can substitute it and the dead branch can be dropped. Every equivalent-
	 * looking form is a different AST node that no bundler substitutes, which turns the guard into a
	 * live runtime lookup and ships both warnings AND their long message strings to every customer.
	 *
	 * *** THE OPTIONAL-CHAINED FORM IS NOT HYPOTHETICAL - it was written here during the extraction,
	 * and these two assertions are what caught it. ***
	 */
	test('the shipped source hands a bundler the exact expression it can substitute', async () => {
		// Asserted on `dist/`, not on a bundle: by the time it is bundled the substitution has already
		// happened, so the bundle is the wrong place to look for the thing being substituted.
		const shipped = await Bun.file(join(DIST, 'SkinViewer.js')).text()
		expect(shipped).toMatch(/process\.env\.NODE_ENV\s*!==\s*["']production["']/)
		expect(shipped).toMatch(/process\.env\.NODE_ENV\s*===\s*["']production["']/)

		for (const unsubstitutable of ['process?.env', 'globalThis.process'])
			expect({ unsubstitutable, present: shipped.includes(unsubstitutable) }).toEqual({
				unsubstitutable,
				present: false,
			})
		expect(shipped).not.toMatch(/process\.env\[/)
	})

	test('and a production build then contains no NODE_ENV lookup and no warning text at all', () => {
		const code = codeOf('component-prod')
		// Nothing left to read at runtime: every guard folded to a constant.
		expect(code).not.toContain('NODE_ENV')
		// And the branches behind them went with it, message strings included.
		expect(code).not.toContain('measured 0 px')
		expect(code).not.toContain('rejected part of the URL')
	})

	test('a development build keeps them — otherwise the test above proves nothing', () => {
		// The negative control. If the warnings were deleted unconditionally, `component-prod` would be
		// clean for the wrong reason and this whole pair would be vacuous.
		expect(codeOf('component')).toContain('measured 0 px')
	})
})

describe('the published artefact', () => {
	test('dist ships JS and declarations for every source file', () => {
		for (const file of ['index', 'SkinViewer', 'useSkinViewer', 'protocol', 'state', 'item', 'link', 'types', 'weapons']) {
			expect({ file, js: existsSync(join(DIST, `${file}.js`)) }).toEqual({ file, js: true })
			expect({ file, dts: existsSync(join(DIST, `${file}.d.ts`)) }).toEqual({ file, dts: true })
		}
	})

	test('every subpath in the exports map resolves to a file that exists', async () => {
		const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as {
			exports: Record<string, Record<string, string> | string>
		}
		for (const [subpath, entry] of Object.entries(pkg.exports)) {
			if (typeof entry === 'string') {
				expect({ subpath, exists: existsSync(join(ROOT, entry)) }).toEqual({ subpath, exists: true })
				continue
			}
			for (const [condition, target] of Object.entries(entry))
				expect({ subpath, condition, exists: existsSync(join(ROOT, target)) }).toEqual({
					subpath,
					condition,
					exists: true,
				})
		}
	})

	test('every path in `files` exists, so the tarball is not missing a documented door', async () => {
		const pkg = (await Bun.file(join(ROOT, 'package.json')).json()) as { files: string[] }
		for (const entry of pkg.files) expect({ entry, exists: existsSync(join(ROOT, entry)) }).toEqual({ entry, exists: true })
	})

	/**
	 * `tsconfig.build.json` sets `types: []` so this is enforced at build time; asserted here too
	 * because it is the property a browser consumer actually depends on, and a build config is easier
	 * to loosen than a test is to delete.
	 */
	test('the declarations do not require @types/node or bun-types', async () => {
		for (const file of ['index', 'SkinViewer', 'protocol', 'types']) {
			const declaration = await Bun.file(join(DIST, `${file}.d.ts`)).text()
			expect({ file, node: declaration.includes('NodeJS') }).toEqual({ file, node: false })
			expect({ file, bun: declaration.includes('bun-types') }).toEqual({ file, bun: false })
		}
	})

	test('the declarations reference React, which is the one thing a consumer already has', async () => {
		// React is a peer dependency, so `@types/react` is present in any consumer that can use this at
		// all. It is the only external name the public types are allowed to mention.
		expect(await Bun.file(join(DIST, 'types.d.ts')).text()).toContain("from 'react'")
	})
})
