# @skinhub/viewer

The SkinHub CS2 skin viewer, as a React component. Props in, `postMessage` out.

**The 3D is not in this package.** The renderer is a page on our origin that this component embeds and
drives over `postMessage`, which is why installing it pulls in no `three`, no `@react-three/fiber` and
no asset bundle. React is the only peer dependency.

```bash
bun add @skinhub/viewer
```

```tsx
import { SkinViewer } from '@skinhub/viewer'

// From an item you already have
<SkinViewer item={{ weapon: 'weapon_ak47', paintIndex: 44, float: 0.27 }} style={{ height: 420 }} />

// Or straight from a Steam inspect link — float, seed, StatTrak, name plate, five stickers and the
// charm all come out of it, and the weapon's identity is resolved here rather than by you
<SkinViewer inspectLink={tradeOffer.inspectLink} style={{ height: 420 }} />
```

There is no API key, no account and no signup, for this package or for the embed underneath it.

> **Not using React?** The same viewer is a plain `<iframe>` with a query string, and that is a
> first-class integration rather than a fallback — a PHP or Rails template can interpolate an item
> into an `src` and be finished. See **[EMBED.md](./EMBED.md)**, which is the URL and `postMessage`
> contract in full. This package is the React-shaped door onto it, not a second implementation.

---

## Contents

- [What it renders](#what-it-renders)
- [Naming the item](#naming-the-item)
- [Stickers and charms](#stickers-and-charms)
- [Views, agents and gloves](#views-agents-and-gloves)
- [Looks and performance](#looks-and-performance)
- [Cheap vs reload](#cheap-vs-reload)
- [Events and the handle](#events-and-the-handle)
- [Loading and failure](#loading-and-failure)
- [Sizing and transparency](#sizing-and-transparency)
- [Versioning](#versioning)
- [Where the embed is served from](#where-the-embed-is-served-from)
- [API reference](#api-reference)
- [Development](#development)
- [Releasing](#releasing)

---

## What it renders

Any CS2 weapon finish, knife or glove, at any wear and any paint seed, with up to five stickers and a
charm, on one of three views. The picture is the same renderer that runs on skinhub.gg — the same
composited finish, the same wear model, the same lighting rigs.

The component is a single `<iframe>` that fills its container. It has **no intrinsic size**: give it
one, or nothing is visible.

---

## Naming the item

Exactly one of `item` or `inspectLink`. In TypeScript, passing both — or neither — is a compile error.

### `item`

```tsx
<SkinViewer item={{ weapon: 'weapon_ak47', paintIndex: 44 }} />
<SkinViewer item={{ defindex: 7, paintIndex: 44 }} />
```

`weapon` is the renderer's model key (`skin.weapon.id` on a `@skinhub/cdn` row). `defindex` is Steam's
item definition index, for data that came out of an inventory. Exactly one of the two.

`paintIndex` is required, and **`0` is a real value** — it renders the vanilla model.

| field | | |
|---|---|---|
| `weapon` / `defindex` | required, one of | which model |
| `paintIndex` | required | the finish; `0` is vanilla |
| `legacyModel` | optional | the legacy mesh variant, from your catalogue's `legacy_model` column |
| `float` | optional | wear, `0`..`1`. Omitted renders at the kit's own minimum |
| `seed` | optional | the paint seed — which roll of the finish this is |
| `statTrak` | optional | the counter's value, or `false` for no module. `0` is a real, freshly-minted counter |
| `nameTag` | optional | the plate's text, or `null` for no plate |
| `stickers`, `charm` | optional | see below |

**A field you do not pass is a field the viewer is not told about**, which is deliberate: our defaults
stay ours, so the day we improve one your picture improves with it. Passing our current default freezes
it into your embed forever.

### `inspectLink`

```tsx
<SkinViewer inspectLink="steam://rungame/730/76561202255233023/+csgo_econ_action_preview%2000180720..." />
```

Everything the link carries is applied, and the weapon's identity is resolved here from a 63-row
defindex table so you never have to decode anything.

**Masked links only** — the long hex payload. The `S…A…D…` and `M…` inventory and market forms carry no
item data at all; they needed a Game Coordinator round trip Valve has shut down, so there is nothing in
them for anyone to render. A link that does not decode reports `bad-inspect-link` through `onError` and
shows an instruction card rather than falling back to some other gun.

---

## Stickers and charms

```tsx
<SkinViewer
  item={{
    weapon: 'weapon_ak47',
    paintIndex: 44,
    stickers: [{ id: 5032, wear: 0.2, rotation: 12, offsetX: 0.05 }, null, { id: 7104 }],
    charm: { id: 30, seed: 12345 },
  }}
/>
```

**Array position is the slot**, so `[a, null, b]` fills holders 0 and 2 — the shape your own UI
produces when a user has filled two of five. A sticker may name its own `slot` (`0`..`4`) instead, and
that wins. The charm is separate because it is not a sticker: it hangs off the weapon rather than being
applied to it.

Offsets and rotation are the game's own ranges, so the values in your database go straight in.

---

## Views, agents and gloves

```tsx
<SkinViewer item={item} view="hands" agent={{ id: 5036 }} gloves={{ type: 'sporty_gloves', paintIndex: 10038 }} />
```

| `view` | |
|---|---|
| `gun` | the item alone, orbitable, framed to the viewport. The default |
| `hands` | CS2's first-person viewmodel, driven by the game's own clips |
| `agent` | an operator holding the weapon, at conversational distance, orbitable |

`agent.id` is an item definition index; `agent.pose` is a main-menu performance by clip leaf name, or
`null` (the default) to let the weapon choose it. Ignored entirely in the `gun` view.

`gloves` is what the wearer has on in the two views with hands. `null` — the default — is **the
wearer's own default pair**, which is a real answer rather than an absence.

---

## Looks and performance

```tsx
<SkinViewer
  item={item}
  settings={{
    camera: { fov: 40, defaultZoom: 1 },
    quality: { bloom: 1, bloomSpill: 0, renderScale: 1.5, antialias: true, shadows: true },
    environment: { map: 'Mirage', timeOfDay: 'Night', rain: false, background: 'transparent' },
    overlays: { stickerGizmo: false, charmGizmo: false },
  }}
  interactions={{ orbit: true, zoom: true, dragStickers: false, dragCharm: false }}
/>
```

Four groups, each **shallow-merged over our defaults per group**, so `{ quality: { bloom: 0 } }` leaves
the camera and the environment alone. A group you stop passing is not reset — there is no way to say
"unset" over the wire, and treating a dropped key as "restore the default" would make a conditional
settings object quietly destructive.

Three things worth knowing before you tune anything:

- **`background: 'transparent'` is the default and is the point of an embed.** The frame paints no
  background of its own, so the canvas composites straight over your page. Naming a map instead shows
  that map's video plate, which is a 30–60 MB download.
- **`bloomSpill` ships at `0` here** and at `1` on skinhub.gg. Bloom outside the item's outline is
  additive light with no alpha, so a halo leaking onto somebody else's product page is not something
  their layout asked for. Turn it up if you want the house look.
- **`renderScale` is a multiplier on `devicePixelRatio`**, and it is a memory cliff rather than a dial:
  `2` on a 1440p window measures 472 MB.

`MAP_NAMES` is exported as a value, so you can build a picker without hard-coding the list.

---

## Cheap vs reload

**This is the property the package is built around, and it is worth stating plainly:** changing the
float, the seed, the StatTrak counter, the name plate, the stickers or the charm updates **in place**.
Nothing reloads, nothing flickers, no loading state appears. A float slider bound straight to this
component is a supported thing to build.

Changing the **weapon**, the **paint index**, the **legacy variant** or the **view** raises a loading
cover, because the renderer genuinely has to fetch a different model and rebuild its compositors.

```ts
import { CHEAP_FIELDS } from '@skinhub/viewer'
// ['float', 'seed', 'statTrak', 'nameTag', 'stickers', 'charm']
```

One consequence, and it is the mistake most worth avoiding:

> **Do not put a `key` on `<SkinViewer>` that is derived from the item.** `key={item.weapon}` remounts
> the component on every weapon change, which throws away the WebGL context and turns a two-second
> cross-fade into a full document load. The viewer already covers itself on a change that needs it; it
> does not need help and cannot be helped this way.

---

## Events and the handle

```tsx
<SkinViewer
  item={item}
  onReady={() => setSkeletonVisible(false)}
  onError={error => console.error(error.code, error.message)}
  onChange={item => save(item)}
  onResize={({ width, height, dpr }) => {}}
  editingSlot={slot}
  onEditingSlotChange={setSlot}
/>
```

`onChange` fires when the **user** edits the item inside the viewer — dragging a sticker, moving the
charm — and hands you the item in the same shape you passed in, always in the `{ weapon }` form.

**`onReady` is a level, not an edge.** It means "stopped loading", so it fires again after every weapon
or view change, not once per page.

`useSkinViewer()` gives you the same state as values, plus `reload()`:

```tsx
const viewer = useSkinViewer()

<SkinViewer item={item} handle={viewer} />

viewer.status    // 'connecting' | 'loading' | 'ready' | 'error'
viewer.error     // SkinViewerError | null
viewer.problems  // anything the embed rejected about the URL we built — see below
viewer.reload()
```

`problems` is a debugging channel rather than an error channel: it is the embed naming any parameter it
could not read. A non-empty `problems` is our bug, not yours, and is worth reporting.

---

## Loading and failure

```tsx
<SkinViewer
  item={item}
  loading={<YourSkeleton />}
  fallback={error => <YourEmptyState message={error.message} />}
/>
```

| `error.code` | |
|---|---|
| `no-item` | the props named no renderable item — a query that had not resolved, usually |
| `bad-inspect-link` | the link did not decode |
| `unknown-weapon` | it decoded, but this build has no id for that defindex |
| `render-failed` | a model or texture failed to load, or the GL context was lost |
| `protocol-mismatch` | this package and the embed disagree about the wire — see below |
| `bad-message` | a field we sent was rejected |

`no-item`, `bad-inspect-link` and `unknown-weapon` are facts about this render's props and clear the
moment the props are good. `render-failed` and `protocol-mismatch` are sticky: the scene is gone and
nothing in the props brings it back.

**Nothing ever falls back to a different item.** A failure shows an instruction card, because a
successful-looking render of the wrong gun is the one outcome worth more than all the rest of this to
avoid.

---

## Sizing and transparency

The component fills its container and has no intrinsic size.

```tsx
<SkinViewer item={item} style={{ width: 640, height: 420 }} />
<div className="h-[420px]"><SkinViewer item={item} className="w-full h-full" /></div>
```

In development it warns to the console if it measures 0 px in either dimension, because an invisible
viewer and a broken viewer look identical.

A transparent iframe is **still not click-through**: it takes pointer events over its whole rectangle.
If it overlaps something clickable, that thing will not be clickable.

---

## Versioning

Every message in both directions carries a protocol version integer, and **a mismatch is terminal on
purpose**: the embed renders nothing, this package stops sending, and `onError` gets a sentence naming
which side is out of date and what to do about it.

There is no back-compat window and there will not be one. The trade is deliberate — when we change the
wire, every published copy of this package stops working loudly and at once, in exchange for never
shipping a viewer that renders a partly-understood item. In practice that means: **keep this package
updated**, and treat a `protocol-mismatch` as "run your installer", not as a bug to work around.

A raw `<iframe src>` with no JavaScript never sends a message and so can never mismatch.

---

## Where the embed is served from

`https://skinhub.gg` by default. Override per component:

```tsx
<SkinViewer item={item} origin="https://your-skinhub-deployment.example" />
```

**Read once, on mount.** It is the one value that could only be applied by reloading the frame, and a
prop that quietly throws away the GL context is exactly what this component is built not to have.

---

## API reference

### Components and hooks

| | |
|---|---|
| `SkinViewer` | the component |
| `useSkinViewer()` | a handle: `status`, `error`, `problems`, `reload()` |
| `DEFAULT_ORIGIN` | `'https://skinhub.gg'` |

### Values

| | |
|---|---|
| `MAP_NAMES` | the 14 environments, for building a picker |
| `CHEAP_FIELDS` | which item fields update without a reload |
| `WEAPON_IDS` | every weapon, knife and glove id this build knows |
| `WEAPON_ID_BY_DEFINDEX`, `WEAPON_ID_ALIASES` | the raw tables |
| `weaponIdForDefindex`, `defindexForWeaponId` | `7` ↔ `'weapon_ak47'` |
| `normalizeWeaponId`, `isKnownWeaponId`, `isGloveId` | id helpers; `normalizeWeaponId` folds the `sfui_wpnhud_*` aliases that `skins.json` gives the vanilla knives |

### Types

`SkinViewerProps`, `SkinViewerItem`, `SkinViewerSticker`, `SkinViewerCharm`, `SkinViewerHandle`,
`SkinViewerError`, `SkinViewerErrorCode`, `ViewerStatus`, `ViewerView`, `ViewerAgent`, `ViewerGloves`,
`ViewerSettings` and its four groups, `ViewerInteractions`, `ViewerResize`, `ViewerSubject`,
`ViewerBackground`, `MapName`, `TimeOfDay`, `WeaponId`, `KnownWeaponId`.

### `@skinhub/viewer/protocol`

The wire types, for writing a host in something that is not React: `FRAME_CHANNEL`,
`FRAME_PROTOCOL_VERSION`, `FrameState`, `FramePatch`, `HostMessage`, `FrameEvent`, `hostMessage()`,
`readFrameEvent()`.

Deliberately not on the main entry point. [EMBED.md](./EMBED.md) §6 documents this same shape in prose
and is the better place to start; these are the TypeScript for it. **It carries no compatibility
promise beyond the version integer** — it moves when the wire moves.

### `@skinhub/viewer/weapons`

The defindex tables on their own, if that is all you want.

---

## Development

```bash
bun install
bun run typecheck   # tsc --noEmit, over src + test + scripts
bun test            # offline; no network, no browser
bun run build       # rm -rf dist && tsc -p tsconfig.build.json
bun run example     # a standalone harness on http://localhost:5173
```

One extra tier, opt-in because it needs something the repo does not carry — a running embed:

```bash
bun run test:live                                              # against https://skinhub.gg
SKINHUB_VIEWER_ORIGIN=http://localhost:3000 bun run test:live  # against a local one
```

### How the wire is kept in step with the embed

The other half of the protocol lives in the SkinHub app, which is a private repository — it carries the
renderer. `src/protocol.ts` here and `app/frame/protocol.ts` there describe the same wire from opposite
ends, and they are not shared code: one would have to ship the renderer's types into a customer's
bundle, and the other would have to depend on a published package in order to specify itself.

Two mechanical checks keep them honest, and neither is "we will remember":

1. **`test/wire.test.ts`, here.** Every field on the wire is listed, the lists are checked *exhaustive
   against the types* (`test/exhaustive.ts`), and the result is compared to a committed
   `test/wire.snapshot.json`. Adding a field to `src/protocol.ts` fails `bun run typecheck` first and
   `bun test` second, and the message at the second failure tells you to go and change the frame.
2. **`app/frame/protocol.conformance.test.ts`, in the app repo** — the only place both halves exist at
   once. It runs this package's real `hostMessage()` output through the frame's real validator and
   requires zero rejected fields, runs the frame's real events through `readFrameEvent()`, and compares
   the two key sets at the type level.

The version integer is the **backstop**, not the check: it makes a mismatch that reaches production
loud, but it only fires if somebody remembered to bump it. The two checks above are what make sure
somebody does.

### Releasing

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
the previous version if typecheck, build or publish fails, so a failed release leaves no dangling bump.
`prepublishOnly` runs typecheck and a clean build, so `npm publish` by hand cannot ship a broken package
either, and `tsconfig.build.json` sets `noEmitOnError`, so a failed build produces no `dist` rather than
a stale one.

npm will ask for your OTP, so this is a thing a human runs.

## License

MIT
