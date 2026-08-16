/**
 * The example app's whole build system: `Bun.build` on request, `Bun.serve` in front of it.
 *
 * NO VITE, NO NEXT, NO INSTALL - not out of minimalism but because the point of this app is that it
 * has nothing of ours in reach, and every extra tool is another config file where an alias into
 * a workspace link could hide. `@skinhub/viewer` resolves through `example/node_modules/@skinhub/viewer`,
 * which is a symlink to the package root, so the bundler reads its `exports` map and gets `dist/`.
 * That is a customer's install with the registry taken out of the middle.
 *
 *     bun run build               # from the repo root
 *     mkdir -p example/node_modules/@skinhub && ln -sfn ../../.. example/node_modules/@skinhub/viewer
 *     bun run example             # from the repo root
 *     PORT=4173 bun run example/serve.ts
 *
 * The link is made by hand rather than by `bun install` on purpose. `file:..` would resolve fine, but
 * installing it writes a second lockfile inside `example/` and materialises a tree of per-file
 * symlinks that some bundlers refuse to read - a `ln -s` is the same result with none of that, and it
 * keeps the example a thing you can run one minute after cloning.
 *
 * *** NEVER PORT 3000. *** That is where the app - and therefore `/frame` - is already running, and
 * this page has to be a DIFFERENT ORIGIN or the `postMessage` boundary being tested is not one.
 */

const port = Number(process.env.PORT ?? 4173)
const root = import.meta.dir

const bundle = async () => {
	const built = await Bun.build({
		entrypoints: [`${root}/app.tsx`],
		target: 'browser',
		format: 'esm',
		define: { 'process.env.NODE_ENV': JSON.stringify('development') },
	})
	if (!built.success) throw new AggregateError(built.logs, 'the example did not build')
	return built.outputs[0]?.text() ?? ''
}

Bun.serve({
	port,
	async fetch(request) {
		const { pathname } = new URL(request.url)
		if (pathname === '/app.js')
			return new Response(await bundle(), { headers: { 'content-type': 'text/javascript; charset=utf-8' } })
		return new Response(Bun.file(`${root}/index.html`))
	},
})

console.log(`example on http://localhost:${port} (frame origin overridable with ?origin=…)`)
