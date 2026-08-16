/**
 * Bundle probe — run as a subprocess by `bundle.test.ts`.
 *
 * Why a subprocess rather than calling `Bun.build` from the test directly: inside a `bun test`
 * process, `Bun.build` misresolves relative specifiers that the identical build resolves fine from a
 * plain `bun run`. Reproduced on Bun 1.3.13 in `@skinhub/cdn`, whose probe this mirrors. Bundling
 * out-of-process sidesteps it and measures exactly the same artefact.
 *
 * Usage: `bun run test/bundle-probe.ts '<json spec>'`
 *
 *   spec: { cases: [{ name, module, importLine, target, external, define, minify }] }
 *   out:  { name: { ok, bytes, error, code } }
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Case = {
	name: string
	module: string
	importLine: string
	target: 'browser' | 'node' | 'bun'
	external?: string[]
	define?: Record<string, string>
	minify?: boolean
}
type Result = { ok: boolean; bytes: number; error?: string; code?: string }

const DIST = join(import.meta.dir, '..', 'dist')
const WORK = mkdtempSync(join(tmpdir(), 'skinhub-viewer-probe-'))

const spec = JSON.parse(process.argv[2] ?? '{"cases":[]}') as { cases: Case[] }
const results: Record<string, Result> = {}

let index = 0
for (const testCase of spec.cases) {
	const entry = join(WORK, `consumer-${index++}.ts`)
	// `@@` in the import line stands for the absolute path of the module under test.
	await Bun.write(entry, `${testCase.importLine.replaceAll('@@', join(DIST, testCase.module))}\n`)

	try {
		const built = await Bun.build({
			entrypoints: [entry],
			target: testCase.target,
			// React is a PEER dependency: a consumer's bundler resolves it to their copy, and a bundle
			// that inlined ours would ship two Reacts and break hooks. Marked external here so the probe
			// measures what a real consumer's build produces.
			external: testCase.external ?? ['react', 'react-dom', 'react/jsx-runtime'],
			...(testCase.define ? { define: testCase.define } : {}),
			...(testCase.minify ? { minify: true } : {}),
		})
		if (!built.success) {
			results[testCase.name] = { ok: false, bytes: 0, error: built.logs.map(String).join('\n') }
			continue
		}
		const code = (await Promise.all(built.outputs.map(output => output.text()))).join('\n')
		results[testCase.name] = { ok: true, bytes: code.length, ...(code.length < 500_000 ? { code } : {}) }
	} catch (error) {
		const message = error instanceof AggregateError ? error.errors.map(String).join('\n') : String(error)
		results[testCase.name] = { ok: false, bytes: 0, error: message }
	}
}

process.stdout.write(JSON.stringify(results))
