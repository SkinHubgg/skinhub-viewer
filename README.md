# @skinhub/viewer

The SkinHub CS2 skin viewer as a React component - any weapon, knife or glove, at any wear and seed,
with stickers and a charm, or a sticker, charm, collectible or agent on its own. The 3D runs in an
iframe on our origin, so installing this pulls in no `three` and no assets. React is the only peer
dependency.

```bash
bun add @skinhub/viewer @skinhub/cdn
```

## Quick start

```tsx
'use client'
import { SkinViewer } from '@skinhub/viewer'

export default function Page() {
  return (
    <SkinViewer item={{ weapon: 'weapon_ak47', paintIndex: 44, float: 0.27 }} style={{ width: 640, height: 420 }} />
  )
}
```

Or straight from a Steam inspect link - float, seed, StatTrak, name plate, stickers and charm all come
out of it:

```tsx
<SkinViewer inspectLink={item.inspectLink} style={{ width: 640, height: 420 }} />
```

A weapon is one of five things the viewer draws, and each of the other four is its own prop. They are
drawn on their own, with no gun in the picture:

```tsx
<SkinViewer sticker={{ id: 37, wear: 0.2 }} />   // the real holo/foil shader, not an image on a plane
<SkinViewer charm={{ id: 5 }} />
<SkinViewer collectible={{ id: 874 }} />         // a pin, coin, medal or trophy
<SkinViewer operator={{ id: 5036 }} />           // an agent, alone
```

Two things worth knowing up front:

- **Give it a size.** It fills its container and has no intrinsic size; at 0 px you see nothing.
- **No `key` derived from the item.** `key={item.weapon}` remounts the iframe on every change and turns
  a cross-fade into a full document load. It already handles that itself.

## Props

Exactly one subject is required - `item`, `inspectLink`, `sticker`, `charm`, `collectible` or
`operator`. Passing two, or none, is a type error. Everything else is optional.

| prop | type | default | |
|---|---|---|---|
| `item` | `{ weapon \| defindex, paintIndex, float?, seed?, statTrak?, nameTag?, legacyModel?, stickers?, charm? }` | - | the item. `paintIndex: 0` is vanilla |
| `inspectLink` | `string` | - | a masked Steam inspect link, instead of `item` |
| `sticker` | `{ id, wear? }` | - | one sticker on nothing. `wear` is `0` (mint) to `1` |
| `charm` | `{ id, pattern? }` | - | one charm. `pattern` is its colour template, not a different model |
| `collectible` | `{ id }` | - | one pin, coin, medal or trophy. It has no other field |
| `operator` | `{ id, pose? }` | - | one agent alone. `pose` is a main-menu clip name, `null` for their idle |
| `origin` | `string` | `https://skinhub.gg` | where the embed is served. Read once, on mount |
| `view` | `'gun' \| 'hands' \| 'agent'` | `'gun'` | item alone, first-person, or held by an operator |
| `agent` | `{ id, pose? }` | default T | who is *holding* the weapon, in `hands` and `agent`. `operator` is the agent shown alone |
| `gloves` | `{ type, paintIndex, float?, seed? } \| null` | `null` | `null` is the wearer's own pair |
| `settings` | `{ camera?, quality?, environment?, overlays?, locale? }` | see below | shallow-merged per group |
| `interactions` | `{ orbit?, zoom?, dragStickers?, dragCharm? }` | orbit + zoom on | what the user may do |
| `editingSlot` | `number` | `-1` | which sticker slot is open; `5` is the charm |
| `onReady` | `() => void` | - | stopped loading - **a level, not an edge**: it fires again after every weapon or view change |
| `onError` | `(error) => void` | - | `no-item`, `bad-inspect-link`, `unknown-weapon`, `unreachable`, `render-failed`, `protocol-mismatch`, `bad-message` |
| `onChange` | `(item) => void` | - | the user dragged a sticker or the charm - **carries ids, not names**, see below |
| `onResize` | `({ width, height, dpr }) => void` | - | the canvas box changed |
| `onEditingSlotChange` | `(slot) => void` | - | |
| `loading` / `fallback` | `ReactNode` | - | your skeleton, and your empty state on error |
| `className` / `style` / `title` | | | on the wrapper |
| `handle` | `SkinViewerHandle` | - | from `useSkinViewer()` |

`settings.environment.background` defaults to `'transparent'`, so the canvas composites over your page.
`quality.bloomSpill` ships at `0` here. `MAP_NAMES` and `WEAPON_IDS` are exported as values for
building pickers.

`view`, `agent`, `gloves` and `editingSlot` describe a weapon, and the other four subjects ignore them.
`settings` and `interactions` apply to all six.

### If your product is not in English

The viewer draws a few strings of its own - confirm and cancel on a gizmo, the words on its number
fields, the loading card. **They live in our document, so your `dir`, your `lang` and your message
catalogue all stop at the iframe boundary.** Send them:

```tsx
const t = useTranslations('viewer')

<SkinViewer
  item={item}
  settings={{
    overlays: { stickerGizmo: true, charmGizmo: true },
    locale: {
      dir: 'rtl',
      labels: { confirm: t('confirm'), cancel: t('cancel'), wear: t('wear'), seed: t('seed') },
    },
  }}
/>
```

Seven labels - `confirm`, `cancel`, `wear`, `seed`, `loading`, `loadingView`, `noModel` - and every one
is optional: **anything you leave out stays English**, so translating two does not lose the other five.
There is no language tag and there will not be one; we ship no translations, and passing `'he'` would
mean us guessing at your product's voice out of a catalogue we cannot read.

`dir` is the **text**, not the layout: the gizmo's pill stays left-to-right in both directions (it holds
a number and a button pair, and it positions itself in canvas pixels against the item), while every
sentence the viewer draws follows your direction.

A label is capped at 64 characters and may not be empty or carry control characters; one that breaks a
rule is dropped, reported through `onError` as `bad-message`, and the English one is used - it is never
truncated. The instruction card, the protocol-mismatch card and `onError` messages stay English on
purpose: they are addressed to you, not to your user.

Changing `float`, `seed`, `statTrak`, `nameTag`, `stickers` or `charm` updates **in place** - no
reload, no flicker. Changing the weapon, paint index, legacy variant or view shows a loading cover. On
the other four subjects `sticker.wear`, `charm.pattern` and `operator.pose` are the in-place ones; the
id, and switching which subject you pass, reloads.

### Copying the item back out

```tsx
import { toInspectLink } from '@skinhub/viewer'

<button onClick={() => navigator.clipboard.writeText(toInspectLink(item))}>Copy inspect link</button>
```

`fromInspectLink(link)` is the inverse, for seeding an editor from a link. `toPlacement(item)` gives
the decoded `@skinhub/cdn` placement if you want to write database rows instead.

### `onChange` gives you ids, not names

The embed has never seen the sticker catalogue, so the item it hands back has `stickers: [{ id: 5032,
… }]` and no name or image. **`setItem(changed)` will therefore blank those out of your own UI** - a
silent data loss in your state, with nothing to catch. Merge it into what you already hold instead:

```tsx
onChange={next =>
  setItem(prev => ({
    ...prev,
    float: next.float,
    seed: next.seed,
    // keep your own row, take the viewer's placement
    stickers: next.stickers.map(s => ({ ...myCatalogue[s.id], ...s })),
    charm: next.charm && { ...prev.charm, ...next.charm },
  }))
}
```

### Pointing at your own instance

`origin` defaults to `https://skinhub.gg`. Override it to run against a mirror, a proxy, or a local
instance while developing:

```tsx
<SkinViewer item={item} origin="http://localhost:3000" />
```

It is read once, at mount - it is the one prop that could only be applied by reloading the frame.

## useSkinViewer()

```tsx
const viewer = useSkinViewer()

<SkinViewer item={item} handle={viewer} />

viewer.status    // 'connecting' | 'loading' | 'ready' | 'error'
viewer.error     // SkinViewerError | null
viewer.problems  // anything the embed rejected about the URL we built
viewer.reload()
```

## Commercial use

The viewer is free to use. The embed draws a small SkinHub logo in the top-left corner of the frame.

If a company wants to use it with no credit and no logo, that is a monthly fee. Email
contact@skinhub.gg and we will put a price offer together.

## Troubleshooting

**A CORS error fetching the catalogue.** `cdn.skinhub.gg` does not send
`access-control-allow-origin`, so a **browser** `fetch` for `data/skins.json` is blocked by the
browser before your code sees it - it surfaces as a CORS failure rather than a status, so you cannot
even catch it. Call `@skinhub/cdn` from your **server** (a route handler, `getServerSideProps`, an RSC)
and pass the rows down. The files are 4–6 MB each, so you want them server-side regardless.

**Nothing renders.** If the container is 0 px in one dimension you get an empty box; the component
warns about that in development. Otherwise `onError` reports `unreachable` after 15 seconds, naming the
URL it could not reach - that means the embed never answered, so check the origin is reachable from
this browser and that your page's `Content-Security-Policy` allows framing it (`frame-src`).

**`onReady` fired but the picture is still covered.** `onReady` means "stopped loading" for the current
identity, and it fires again after every weapon or view change. Treat it as a level, not an edge.

**`protocol-mismatch`.** This package and the embed disagree about the wire. There is no back-compat
window by design: update `@skinhub/viewer`, or reload the embed if it is the stale one - the error
message says which.

## More

- **[Quick-start app](https://github.com/SkinHubgg/viewer-quick-start)** - a working skin picker built
  on this and `@skinhub/cdn`, ending in an inspect link. The full example.
- **[EMBED.md](./EMBED.md)** - the raw `<iframe>` URL and `postMessage` contract, for stacks that are
  not React. A PHP, Rails or plain-HTML page can interpolate an item into an `src` and be done; that
  path is first-class, not a fallback.
- **[@skinhub/cdn](https://github.com/SkinHubgg/skinhub-cdn)** - the CS2 catalogue this pairs with:
  skins, stickers, gloves, agents, and the inspect-link codec.
- [Development and releasing](./CONTRIBUTING.md) - how the wire is kept in step with the embed.

MIT
