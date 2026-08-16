# Embedding the SkinHub viewer

The viewer is a page on our origin that you put in an `<iframe>`. There is nothing to install, no key,
no account, and no signup. Two ways to drive it:

| | what it needs from you | what you get |
|---|---|---|
| **The URL** | an `<iframe src>` | the complete initial picture: item, float, seed, stickers, charm, view, agent, gloves, lighting, quality |
| **`postMessage`** | ~10 lines of JavaScript | live updates on top of that, plus `ready` / `error` / `change` events |

**The URL alone is a supported, first-class integration.** If your stack is PHP, Rails, Laravel, plain
HTML or anything else that renders on a server, you can interpolate an item into an `src` attribute
and be finished. Everything on this page above the "Live updates" heading works with JavaScript
disabled.

---

## 1. The smallest thing that works

```html
<iframe
  src="https://skinhub.gg/frame?weapon=weapon_ak47&paint=1449"
  style="width: 640px; height: 420px; border: 0; background: transparent"
  title="AK-47 | AUTOEXEC"
></iframe>
```

With no parameters at all you get AK-47 | AUTOEXEC. That is the smoke test, not your item - if you see
it when you did not ask for it, your identity parameters did not resolve. See
[what the frame tells you](#8-debugging-a-url).

---

## 2. Naming the item

Three ways in. Pick whichever matches what your database already holds.

### `?weapon=` + `?paint=` - the model key and the paint index

```
?weapon=weapon_ak47&paint=1449
?weapon=weapon_awp&paint=344
?weapon=weapon_knife_karambit&paint=413
?weapon=sporty_gloves&paint=10038
?weapon=weapon_ak47&paint=0            ← vanilla, no finish
```

The fastest and the most reliable: no catalogue lookup, no name matching, nothing that can go stale.
`paint=0` is a real value and renders the bare model. Gloves are a legitimate subject and use the same
two parameters.

### `?weapon=` + `?skin=` - our own slugs

```
?weapon=ak-47&skin=asiimov
?weapon=awp&skin=dragon-lore
```

The pair from our own item URLs. Underscores mean a model key, hyphens mean a slug, so the two forms
cannot be confused.

### `?hash=` - Steam's `market_hash_name`

```
?hash=AK-47%20%7C%20Asiimov
?hash=%E2%98%85%20Karambit%20%7C%20Fade
```

Drop the exterior and any `StatTrak™` / `Souvenir` prefix; keep the `★`. For an integrator whose data
came out of a Steam inventory and has no paint index in it.

One name can be several items - the Dopplers are eight rows called `★ Karambit | Doppler`, one per
phase, and the phase lives only in the paint index. `?hash=` takes the lowest paint index of the
candidates. **If you know the phase, send `?paint=` as well; it wins.**

### `?legacy=1`

Loads the legacy mesh variant. Most finishes declare this themselves and it is ignored; pass it for
those that do not, from your catalogue's `legacy_model` column. It changes which textures apply, so
the wrong value is the wrong picture rather than a detail.

---

## 3. Configuring the item

### `?i=` - everything at once, from an inspect link

```
?weapon=weapon_ak47&paint=1449&i=001800200038D7B6C5F1034095054800...
```

`?i=` carries float, seed, StatTrak and its count, the name plate, all five stickers with their
offsets, rotation, scale and wear, and the charm with its own pattern - encoded exactly as CS2's own
inspect link encodes them. **If you hold an inspect link, this is the parameter to use.** It
round-trips exactly: what you put in is what comes back out.

A whole link is accepted, not just the hex:

```
?i=steam%3A%2F%2Frungame%2F730%2F.....%2F%2Bcsgo_econ_action_preview%20001800...
```

`?i=` does **not** name the weapon. Send `?weapon=`/`?paint=` alongside it.

### The same fields as plain values

For data that lives in your own columns:

| parameter | meaning |
|---|---|
| `float=0.2738` | wear, `0`..`1`. Omitted renders at the kit's own best condition, which is the flattering example of the item |
| `seed=661` | paint seed |
| `st=1337` | StatTrak counter. `st=0` is a real, freshly-minted counter; `st=-1` removes the module; omitted means no module |
| `nametag=SHAREME` | the name plate. Empty or whitespace removes it |

Not every finish runs `0`..`1`. A kit declares its own wear range and the renderer clamps into it, so
`float=0.9` on a kit that stops at `0.5` renders at `0.5` rather than failing.

**Order matters in exactly one place:** a plain `float=` / `seed=` / `st=` / `nametag=` beats the same
field inside `?i=`, because the explicit one is the more specific statement.

---

## 4. How it is shown

| parameter | values | default |
|---|---|---|
| `view` | `gun`, `hands`, `agent` (`viewmodel` is accepted for `hands`) | `gun` |
| `agent` | an agent id, e.g. `5203` | `5036` (Default T) |
| `pose` | a main-menu clip leaf name | matches the weapon |
| `glove` | `type:paintIndex[:float[:seed]]`, e.g. `sporty_gloves:10038:0.31:77`. `none` for the wearer's own default pair | the wearer's own pair |
| `slot` | `0`..`4` for a sticker, `5` for the charm, `-1` for none - which one opens with its handles showing | `-1` |

`agent`, `pose` and `glove` are inert in the `gun` view; there is nobody on screen to wear them.

**Omitting `glove` is not "bare hands".** Every agent ships a default pair of their own, and that is
what you get.

---

## 5. Looks and performance

### Lighting and background

| parameter | values | default |
|---|---|---|
| `map` | a map name (`Ancient`, `Mirage`, `Nuke`, ...), or `none` for our calibrated reference rig | `Ancient` |
| `time` | `Day`, `Night`. Falls back when a map has only one | `Night` |
| `rain` | `0` / `1` - wet surfaces on maps whose own data says it rains | `1` |
| `bg` | `transparent`, or a map name to show that map's video plate | `transparent` |

**`map` is the light, `bg` is the picture behind it, and they are separate on purpose.** Naming a map
lights your item with the probe and sun CS2 bakes into that map's own menu scene. The common embed is
`?map=Mirage` with the default transparent background: Mirage's light, your page behind it.

`bg=transparent` mounts no video element at all, so nobody downloads a 30-60 MB file they cannot see.

### Quality

| parameter | values | default | notes |
|---|---|---|---|
| `bloom` | `0` disables it entirely, `1` is CS2's own look, `2` is strong | `1` | `0` mounts no post-processing chain and allocates no offscreen target, so it is genuinely the cheaper path |
| `spill` | `0`..`n` - how much bloom is allowed past the item's outline | `0` | our own site ships `1`; the embed ships `0`, because a halo leaking onto your product page is not something your layout asked for |
| `scale` | `0.25`..`3`, or `Performance` / `Balanced` / `Native` | `1.5` | a **ceiling** on `devicePixelRatio`. The single biggest performance lever - `2` is four times the fragments of `1`. **A page with a grid of viewers wants this low.** |
| `aa` | `0` / `1` | `1` | only reachable while `bloom` is above `0`; with bloom off the canvas antialiases itself and cannot be changed |
| `shadows` | `0` / `1` | `0` | the item shadowing itself. Off is the reference picture |
| `fov` | `1`..`179` degrees | `26` | a long lens, which is what keeps a rifle from looking bent. Changing it re-frames rather than zooms. Ignored in `hands`, which uses CS2's own `viewmodel_fov` |
| `zoom` | `0.05`..`20` | `1` | a **multiplier** on the solved fit distance, never a distance - `1.2` is 20% closer. A fixed distance cannot be right in two differently-shaped containers |

### What the user may do

| parameter | default | |
|---|---|---|
| `orbit` | `1` | drag to turn the item, right-drag to pan. Always off in `hands` |
| `wheel` | `1` | wheel to dolly |
| `dragstickers` | `0` | let the user move and rotate a placed sticker |
| `dragcharm` | `0` | the same for the charm |
| `stickergizmo` | `0` | draw the outline and handles on the open sticker |
| `charmgizmo` | `0` | draw the charm's billboard |
| `gizmocolor` | - | any CSS colour for the gizmo chrome |
| `gizmoshadow` | - | the dark under-stroke that keeps it readable over a pale kit |

**Editing is off by default and dragging and drawing are independent.** Enabling `dragstickers`
without `stickergizmo` gives invisible hit targets, for a host drawing its own guides. Enabling
`stickergizmo` without `dragstickers` shows where a sticker sits and does not let anyone move it. Both
combinations are supported.

**If you turn dragging on, listen for the `change` event** (below), or you will not be able to save
what your user did.

---

## 6. Live updates

Everything above can also be changed at runtime, without reloading the frame.

```html
<iframe id="viewer" src="https://skinhub.gg/frame?weapon=weapon_ak47&paint=1449"></iframe>
<script>
const FRAME_ORIGIN = 'https://skinhub.gg'
const viewer = document.getElementById('viewer')

const set = patch =>
  viewer.contentWindow.postMessage(
    { channel: 'skinhub-viewer', v: 1, from: 'host', type: 'set', patch },
    FRAME_ORIGIN,
  )

window.addEventListener('message', event => {
  if (event.source !== viewer.contentWindow) return
  const message = event.data
  if (!message || message.channel !== 'skinhub-viewer' || message.from !== 'viewer') return

  switch (message.type) {
    case 'hello':  console.log('viewer listening, protocol', message.v, message.state, message.problems); break
    case 'ready':  console.log('finished loading'); break
    case 'error':  console.error(message.error.code, message.error.message); break
    case 'change': saveToYourDatabase(message.item); break
  }
})

// live, no reload:
document.querySelector('#float').oninput = e => set({ item: { float: +e.target.value } })
</script>
```

### The envelope

Every message in both directions carries these three fields:

```js
{ channel: 'skinhub-viewer', v: 1, from: 'host' | 'viewer', type: ... }
```

- `channel` - anything without it is not ours and is ignored in silence. `postMessage` is a shared bus;
  React DevTools, HMR and browser extensions all post into frames.
- `v` - the protocol version. See [versioning](#7-versioning).
- `from` - the direction. `host` for messages you send, `viewer` for messages you receive.

### Host → viewer

| type | payload | |
|---|---|---|
| `set` | `patch` | any subset of the state. See below |
| `hello` | - | optional. Asks the viewer to announce itself again. Useful if you attached your listener after the frame had already loaded |

### The patch

```js
set({
  item: { weaponType, paintIndex, legacyModel, float, seed, statTrak, nameTag, stickers },
  view: 'gun' | 'hands' | 'agent',
  agent: { id, pose },
  gloves: { type, paintIndex, float, seed } | null,
  settings: {
    camera:      { fov, defaultZoom },
    quality:     { bloom, bloomSpill, renderScale, antialias, shadows },
    environment: { map, timeOfDay, rain, background },
    overlays:    { stickerGizmo, charmGizmo, gizmoStyle: { color, shadowColor } },
  },
  interactions: { orbit, zoom, dragStickers, dragCharm },
  editingSlot: -1,
})
```

**Everything merges by field. A key you leave out is left alone.** `set({ item: { float: 0.3 } })`
keeps your weapon, your stickers and your name plate. `set({ settings: { quality: { bloom: 0 } } })`
keeps the camera and the environment. This is not just convenience - see
[cheap vs reload](#cheap-vs-reload).

**`null` is a value, not an absence**, wherever it means something: `nameTag: null` is no plate,
`statTrak: false` is no counter, `gloves: null` is the wearer's own default pair, `agent.pose: null` is
"match the weapon", `settings.environment.map: null` is our calibrated reference rig.

**Nothing is coerced.** `float: '0.3'` is rejected, not parsed. You get an `error` event naming the
field, the field keeps its previous value, and the rest of the patch is applied.

### Viewer → host

| type | payload | when |
|---|---|---|
| `hello` | `state`, `problems` | on mount, and in reply to your `hello`. `state` is everything the viewer resolved; `problems` lists any URL parameter it could not read |
| `ready` | - | the item is on screen and textured |
| `error` | `error: { code, message }` | see below |
| `change` | `item` | the user moved a sticker or the charm. Fires on every pointer move during a drag |
| `editing-slot` | `slot` | the user clicked a sticker or the charm to open it |
| `resize` | `width`, `height`, `dpr` | the frame's own box changed, throttled to one per animation frame |

`error` codes: `render-failed`, `bad-inspect-link`, `bad-message`, `protocol-mismatch`.

**`ready` fires again after every reload, not once per page.** It means "stopped loading", so a weapon
change or a view change raises the loading gate and lowers it again. Treat it as a level, not an edge.

**`hello` may arrive more than once.** It is idempotent - it carries the whole state - so read it as
"the viewer is listening", not "the viewer has just started".

**`change` hands back a complete item, not a diff.** Store it verbatim and pass it straight back in.
It does not fire for your own `set` calls; it is only ever the user talking.

### Cheap vs reload

This is the part that decides whether the embed feels like a component or like an iframe.

| changing this | |
|---|---|
| `float`, `seed`, `statTrak`, `nameTag`, stickers, the charm, **anything under `settings` or `interactions`** | **updates in place.** No loading card, no blank frame, no dropped frames. Drive it from a slider at 60 Hz |
| `item.weaponType`, `item.paintIndex`, `item.legacyModel`, `view`, and `agent.id` in the `agent` view | **reloads.** The viewer covers itself until the new model has actually drawn, and shows nothing rather than something half-built |

Measured across the frame boundary: 140 `set` messages carrying a moving float, plus seed, StatTrak,
a name plate, a bloom change and a map change, produced **zero covered frames** over 93 drawn frames
and 979 samples.

Two consequences for you:

- **Send partial patches.** `set({ item: { float } })` is cheap; a patch that restates `weaponType`
  with the same value is also cheap, but one that restates it with a *different* value reloads.
- **A patch that changes nothing costs nothing.** Re-sending an identical value does not even
  re-render.

---

## 7. Versioning

`v` is an integer. **If it does not match the version the embed speaks, the viewer renders nothing** -
no canvas, no partial picture - and sends you an `error` with code `protocol-mismatch` and a sentence
saying which side is out of date. It does not recover; later messages are ignored.

That is deliberate, and it is the one place we are strict. A viewer that half-understood a message
would render a half-correct item, and a subtly wrong picture is worse than a blank one with an
explanation.

**A raw `<iframe src>` can never hit this.** It never sends a message, so it has no version to
disagree about. Only a host that talks to the frame can be out of date.

---

## 8. Debugging a URL

A parameter the viewer cannot read is **dropped and named**; it is never repaired or guessed at, and it
never blanks the viewer. The list arrives on the `hello` event as `problems`:

```
?float=banana&view=sideways&map=Atlantis&time=Dusk&scale=99&glove=nonsense
```

```js
problems: [
  '?float=banana: expected a number in [0, 1]',
  '?view=sideways: expected gun, hands or agent',
  '?glove=nonsense: expected type:paintIndex[:float[:seed]]',
  '?scale=99: expected a number in [0.25, 3] or Performance/Balanced/Native',
  '?map=Atlantis: unknown map',
  '?time=Dusk: expected Day or Night',
]
```

Booleans follow one rule everywhere: **`0` is off, anything else present is on, absent means "leave it
alone".**

### `?help=` - ask the frame to explain itself

```
?help=1                ← "no item was passed", with the two ways to pass one
?help=bad-link         ← "that inspect link did not decode"
?help=unknown-weapon   ← "the item decoded, but its defindex is not one this build knows"
```

Renders a short instruction card **instead of the viewer** - no scene, no WebGL context - and nothing
else. It exists because a bare `/frame` renders AK-47 | AUTOEXEC, which is the right answer for
somebody typing a URL by hand and the wrong one for a program that meant to name an item and did not:
our default weapon on screen looks like a successful render of the wrong item.

**The card clears itself** on the first `set` that carries `item.weaponType` or `item.paintIndex`, so
a host whose data arrives late can boot with `?help=1` and send the item when it turns up. That is
exactly what `@skinhub/viewer` does, and you can do it by hand for the same reason.

---

## 9. Sizing, transparency and layout

**You own the box; the viewer fills it.** Size the `<iframe>` however your layout wants. There is no
aspect lock and no minimum.

**Resizing changes the picture, not just its scale.** The camera fits the item to the canvas aspect, so
the same AK is framed differently in a 3:4 card than on a full-bleed page. Animating a panel open
beside the frame re-frames the item; listen for `resize` if you need to know the box it landed on.

**Transparency works.** `bg=transparent` is the default: the embed paints no background of its own and
the canvas composites over your page. Give the `<iframe>` `background: transparent` and no border.

Two things worth knowing before you discover them:

- **Bloom outside the item's outline is additive light with no alpha.** Over a transparent background
  there is nothing for it to add to, so the halo reads weaker than it does over a map. `spill` ships at
  `0` in the embed for that reason.
- **A transparent iframe is not click-through.** The element still takes pointer events over its whole
  rectangle. If you want your own UI on top of the viewer, put it outside the frame.

---

## 10. Origins

There is no key and no allowlist. Anyone may embed the viewer.

**Inbound:** the frame acts on messages from its parent window and drops everything else, including
messages from sibling frames on the same page. This is a correctness check, not an authorisation one.

**Outbound:** the frame addresses its events to `*` until you send it something, then pins its replies
to the origin you spoke from. If you want replies pinned before you have sent anything - for a page
that configures the viewer entirely by URL and only listens - name your origin in the URL:

```
?origin=https://shop.example
```

You should still check `event.source` and `event.origin` on your side. The snippet in §6 does.

---

## 11. What an embed cannot do

Honest list, so none of it is discovered late.

- **Custom loading and error UI inside the frame.** Our React component takes `loading` and `fallback`
  slots; a React element cannot cross a `postMessage` boundary. Draw your own skeleton over the iframe
  and remove it on `ready`.
- **Click-through.** See §9.
- **Server-side rendering.** The viewer is WebGL; there is no server-rendered fallback image.
- **Render to an image.** There is no `capture()` yet. If you need a PNG per item, that is a separate
  service and is not built.
- **Resolve an inspect link on its own.** `?i=` carries the item's *configuration* — float, seed,
  StatTrak, name plate, stickers, charm — but not which weapon, so a raw-iframe integration still has
  to send `?weapon=`/`?paint=` (or `?hash=`) alongside it.
  **This limit is the frame's, not the product's:** `@skinhub/viewer` takes an `inspectLink` prop and
  handles the whole thing, because it decodes host-side and resolves the `defindex` against its own
  weapon table before building the URL. If you are in React, you never see this.
- **Show a sticker, charm, agent or collectible on its own.** The embed renders a weapon or a glove
  today. The rest of our catalogue has pages on our site but is not yet embeddable.
- **Style anything.** The frame is our document. `gizmocolor` and `gizmoshadow` are the only visual
  hooks.
- **Two viewers cheaply.** Each frame is its own WebGL context. If you need a grid of them, drop
  `scale` and turn `bloom` off, and expect a browser context limit somewhere around 8-16.
