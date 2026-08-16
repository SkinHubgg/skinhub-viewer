# Working on @skinhub/viewer

```bash
bun install
bun run typecheck   # tsc --noEmit, over src + test + scripts
bun test            # offline; no network, no browser
bun run build       # rm -rf dist && tsc -p tsconfig.build.json
```

One extra tier, opt-in because it needs something the repo does not carry — a running embed:

```bash
bun run test:live                                              # against https://skinhub.gg
SKINHUB_VIEWER_ORIGIN=http://localhost:3000 bun run test:live  # against a local one
bun run test:full                                              # both tiers
```

`prepare` runs the build. `dist/` is gitignored, so without it a
`bun add github:SkinHubgg/skinhub-viewer` — a normal thing to try before a package is on npm — installs
an empty package. npm runs `prepare` after installing a git dependency and never from a published
tarball, which already carries `dist`.

The build is `tsc` only, no bundler — one emitted file per source file, matching `@skinhub/cdn`.
`tsconfig.build.json` sets `noEmitOnError`, so a failed build produces no `dist` rather than a stale
one, and `types: []`, so the published declarations cannot oblige a browser consumer to install
`@types/node` in order to typecheck.

## The tests worth knowing about

`test/bundle.test.ts` is the important one. Everything else imports `../src/…`, which proves the logic
is right and proves nothing about what npm ships. That one builds `dist/` and bundles a synthetic
consumer against it, so it catches the failures that only appear on somebody else's machine: an
`exports` entry pointing at a file the build does not emit, React inlined instead of external, a
declaration that needs Node's types, the renderer leaking in, or a development-only warning that does
not leave a production build.

It is also what replaced the old `example/` app. That folder was the same idea — a tiny consumer
resolving the package through `node_modules` so the bundler had to read the `exports` map — but you
ran it and looked at a page, so it could only fail while somebody was watching. The
[quick-start repo](https://github.com/SkinHubgg/skinhub-quick-start) is the example anybody reads now;
this is the part of `example/` that was a test.

## What is not covered by tests

`SkinViewer.tsx` has no component tests — there is no DOM harness in this repo, so nothing exercises
the React effects: the message listener, the flush-on-connect, and the connection deadline that
reports `unreachable`. Everything those effects *call* is pure and is covered (`state.ts`, `item.ts`,
`protocol.ts`), and `test/bundle.test.ts` proves the built component imports and bundles. The wiring
between them is checked by hand.

Adding `happy-dom` + `react-dom` and a render harness is the obvious next test investment, and the
connection deadline is the first thing it should cover: it is the only logic here whose failure mode
is silent (a timer that never fires looks exactly like a viewer that is still loading).

## How the wire is kept in step with the embed

The other half of the protocol lives in the SkinHub app, which is a private repository — it carries the
renderer. `src/protocol.ts` here and `app/frame/protocol.ts` there describe the same wire from opposite
ends, and they are deliberately **not** shared code: merging them would mean either shipping the
renderer's types and map list into every customer's bundle, or making the specification depend on a
published package in order to describe itself.

So there are two mechanical checks, and neither of them is "we will remember":

1. **`test/wire.test.ts`, here.** Every name and field on the wire is listed, the lists are checked
   *exhaustive against the types* (`test/exhaustive.ts`), and the result is compared to a committed
   `test/wire.snapshot.json`. Adding a field to `src/protocol.ts` fails `bun run typecheck` first —
   naming the field and the list that does not mention it — and `bun test` second. The message at the
   second failure is the one that matters: go and change the frame, and bump the version integer.

2. **`app/frame/protocol.conformance.test.ts`, in the app repo** — the only place both halves exist at
   once. It runs this package's real `hostMessage()` output through the frame's real validator and
   requires zero rejected fields, runs the frame's real events through `readFrameEvent()`, and compares
   the two key sets at the type level against an explicit list of what the frame has that this package
   cannot yet express.

**The version integer is the backstop, not the check**, and the difference is the whole point. A
mismatch is terminal on both sides, so one that reaches production is loud — but it only happens if
somebody bumped the integer. The failure the two checks above exist for is the other one: a field added
to the frame, the integer left alone, both sides claiming `v: 1`, and the field silently dropped.

## Releasing

**`bun run release` with no argument is a PATCH bump.** Say what you mean:

```bash
bun run release              # 0.1.0 -> 0.1.1   (patch — the default)
bun run release minor        # 0.1.0 -> 0.2.0
bun run release major        # 0.1.0 -> 1.0.0
bun run release 0.5.0        # an explicit version
bun run release patch --dry-run   # everything except the actual publish
bun run release patch --no-git    # bump and publish, skip the commit and tag
```

It bumps the version, publishes, then commits and tags — and deliberately does **not** push; it prints
the command. It refuses to run on a dirty tree, refuses a version already on the registry, and restores
the previous version if typecheck, build or publish fails, so a failed release leaves no dangling bump
behind. `prepublishOnly` runs typecheck and a clean build, so `npm publish` by hand cannot ship a broken
package either.

npm asks for an OTP, so this is a thing a human runs.
