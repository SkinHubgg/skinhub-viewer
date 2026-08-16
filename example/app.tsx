/**
 * *** THE OUTSIDER'S APP. ***
 *
 * V2's host harness was written without importing anything from the SkinHub codebase, on the
 * principle that if it needed something the docs did not say, the contract was incomplete. This is
 * the same test one level up: it imports `@skinhub/viewer` and `react` and NOTHING ELSE - no
 * the SkinHub app, no path alias into our tree, no protocol constants, no map list. `@skinhub/viewer`
 * resolves through `example/node_modules`, exactly as an installed package would, so anything this
 * file cannot reach is something a customer cannot reach either.
 *
 * It is also the measurement rig. `window.__probe` counts the two things a host can observe from
 * OUTSIDE the frame:
 *
 *   `loads`  - the iframe's own `load` event. *** IT MUST STAY AT 1 FOR THE WHOLE SESSION. *** Any
 *              increase means the document was reloaded, which means the GL context was destroyed and
 *              every model re-downloaded. That is the failure the cheap-update contract is about, and
 *              it is the one a customer would actually notice.
 *   `readys` - `onReady`, which the docs define as a LEVEL: it fires again every time the loading gate
 *              is raised and lowered. So a float sweep that produces no new `ready` produced no cover.
 *
 * Neither needs access to the frame's DOM, which an integrator on another origin does not have.
 */

import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SkinViewer, useSkinViewer, WEAPON_IDS, type SkinViewerItem } from '@skinhub/viewer'

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * THE TYPE CONTRACT, ASSERTED AT COMPILE TIME
 *
 * `bun run typecheck` in this folder fails if any of these three stops being an error, which is the
 * only way to test a type. They are the owner's requirement: "a missing or doubled item is a COMPILE
 * error, not a runtime surprise."
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

// @ts-expect-error - neither `item` nor `inspectLink`
const _noSubject = <SkinViewer />
// @ts-expect-error - both `item` and `inspectLink`
const _bothSubjects = <SkinViewer item={{ weapon: 'weapon_ak47', paintIndex: 0 }} inspectLink="steam://…" />
// @ts-expect-error - `item` naming the weapon twice
const _bothIdentities = <SkinViewer item={{ weapon: 'weapon_ak47', defindex: 7, paintIndex: 0 }} />
void [_noSubject, _bothSubjects, _bothIdentities]

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */

declare global {
	interface Window {
		__probe: {
			loads: number
			readys: number
			changes: number
			errors: { code: string; message: string }[]
			slots: number[]
			lastItem: SkinViewerItem | null
			/** Drives `float` for `frames` animation frames, resolving with what happened. */
			sweep: (frames?: number) => Promise<{ sets: number; loads: number; readys: number; ms: number }>
		}
	}
}

const probe: Window['__probe'] = {
	loads: 0,
	readys: 0,
	changes: 0,
	errors: [],
	slots: [],
	lastItem: null,
	sweep: async () => ({ sets: 0, loads: 0, readys: 0, ms: 0 }),
}
window.__probe = probe

/*
 * *** COUNTING DOCUMENT LOADS, WHICH IS THE ONLY HONEST WAY TO PROVE THE FRAME WAS NOT RELOADED. ***
 *
 * The iframe's `load` event is not on the component's surface - a wrapper that exposed its own
 * implementation would not be much of a wrapper - but the ELEMENT is in this document, so a host can
 * always watch it. A listener is attached to every iframe as it appears; the observer is what catches
 * the one `reload()` replaces, since that is a new element.
 *
 * MEASURED: a capture-phase `load` listener on `window` does NOT see an iframe's load in Chromium
 * (it reported 0 across a session with a confirmed load), which is worth knowing before trusting one.
 */
const watched = new WeakSet<HTMLIFrameElement>()
const watchFrames = () => {
	for (const frame of document.querySelectorAll('iframe')) {
		if (watched.has(frame)) continue
		watched.add(frame)
		frame.addEventListener('load', () => probe.loads++)
	}
}
new MutationObserver(watchFrames).observe(document.documentElement, { childList: true, subtree: true })
watchFrames()

const FRAME_ORIGIN = new URLSearchParams(location.search).get('origin') ?? 'http://localhost:3000'

const RIFLES = WEAPON_IDS.filter(id => id.startsWith('weapon_')).slice(0, 40)

/** A real masked inspect link, for the `inspectLink` path. AK-47 | Redline, factory new-ish. */
const SAMPLE_LINK =
	'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20180720094003056601885213696D18240000'

const App = () => {
	const viewer = useSkinViewer()

	const [weapon, setWeapon] = useState<string>('weapon_ak47')
	const [paintIndex, setPaintIndex] = useState(1449)
	const [float, setFloat] = useState(0.06)
	const [seed, setSeed] = useState(661)
	const [statTrak, setStatTrak] = useState<number | false>(false)
	const [nameTag, setNameTag] = useState<string | null>(null)
	const [view, setView] = useState<'gun' | 'hands' | 'agent'>('gun')
	const [bloom, setBloom] = useState(1)
	const [drag, setDrag] = useState(true)
	const [sticker, setSticker] = useState(true)
	const [useLink, setUseLink] = useState(false)
	/** Controlled selection - a host with its own slot rail needs this; -1 is "nothing open". */
	const [slot, setSlot] = useState(-1)
	const [log, setLog] = useState<string[]>([])

	const say = useCallback(
		(line: string) =>
			setLog(previous => [`${new Date().toISOString().slice(11, 23)}  ${line}`, ...previous].slice(0, 12)),
		[],
	)

	const item: SkinViewerItem = {
		weapon,
		paintIndex,
		float,
		seed,
		statTrak,
		nameTag,
		stickers: sticker ? [{ id: 5032, slot: 0, wear: 0 }, null, { id: 1693, slot: 2, rotation: 12 }] : [],
		charm: { id: 30, seed: 12 },
	}

	/* ── THE MEASUREMENT ──────────────────────────────────────────────────────────────────────
	 *
	 * A float slider driven from `requestAnimationFrame`, which is what a marketplace's own wear
	 * slider looks like on a fast machine. Everything that matters is counted BEFORE and AFTER.
	 */
	const floatRef = useRef(float)
	floatRef.current = float
	probe.sweep = (frames = 120) =>
		new Promise(resolve => {
			const startLoads = probe.loads
			const startReadys = probe.readys
			const started = performance.now()
			let n = 0
			const step = () => {
				n++
				setFloat(0.001 + (n / frames) * 0.6)
				setSeed(600 + n)
				if (n < frames) requestAnimationFrame(step)
				else
					requestAnimationFrame(() =>
						resolve({
							sets: n,
							loads: probe.loads - startLoads,
							readys: probe.readys - startReadys,
							ms: Math.round(performance.now() - started),
						}),
					)
			}
			requestAnimationFrame(step)
		})

	/** Pretending to be a version of this package the embed no longer speaks. */
	const breakProtocol = () => {
		const frame = document.querySelector('iframe')
		frame?.contentWindow?.postMessage(
			{ channel: 'skinhub-viewer', v: 99, from: 'host', type: 'set', patch: { item: { float: 0.5 } } },
			FRAME_ORIGIN,
		)
		say('sent a v=99 message, as a stale package would')
	}

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: '320px 1fr',
				gap: 16,
				height: '100vh',
				padding: 16,
				boxSizing: 'border-box',
				font: '13px/1.5 ui-sans-serif, system-ui, sans-serif',
			}}
		>
			<div style={{ overflowY: 'auto', display: 'grid', gap: 10, alignContent: 'start' }}>
				<h1 style={{ font: '600 15px/1.2 inherit', margin: 0 }}>@skinhub/viewer example</h1>
				<div style={{ opacity: 0.6 }}>
					status <b>{viewer.status}</b> · loads <b id="loads">{probe.loads}</b> · frame {FRAME_ORIGIN}
				</div>

				<label>
					subject
					<select
						value={useLink ? 'link' : 'item'}
						onChange={e => setUseLink(e.target.value === 'link')}
						style={S.input}
					>
						<option value="item">item (fields)</option>
						<option value="link">inspectLink</option>
					</select>
				</label>

				<label>
					weapon
					<select
						id="weapon"
						value={weapon}
						onChange={e => setWeapon(e.target.value)}
						style={S.input}
						disabled={useLink}
					>
						{RIFLES.map(id => (
							<option key={id} value={id}>
								{id}
							</option>
						))}
					</select>
				</label>

				<label>
					paintIndex
					<input
						type="number"
						value={paintIndex}
						onChange={e => setPaintIndex(Number(e.target.value))}
						style={S.input}
						disabled={useLink}
					/>
				</label>

				<label>
					float {float.toFixed(4)}
					<input
						id="float"
						type="range"
						min={0}
						max={1}
						step={0.0001}
						value={float}
						onChange={e => setFloat(Number(e.target.value))}
						style={S.input}
						disabled={useLink}
					/>
				</label>

				<label>
					seed {seed}
					<input
						type="range"
						min={0}
						max={1000}
						value={seed}
						onChange={e => setSeed(Number(e.target.value))}
						style={S.input}
						disabled={useLink}
					/>
				</label>

				<label>
					view
					<select value={view} onChange={e => setView(e.target.value as typeof view)} style={S.input}>
						<option value="gun">gun</option>
						<option value="hands">hands</option>
						<option value="agent">agent</option>
					</select>
				</label>

				<label>
					bloom {bloom}
					<input
						type="range"
						min={0}
						max={3}
						step={0.5}
						value={bloom}
						onChange={e => setBloom(Number(e.target.value))}
						style={S.input}
					/>
				</label>

				<label>
					open slot
					<select id="slot" value={slot} onChange={e => setSlot(Number(e.target.value))} style={S.input}>
						<option value={-1}>none</option>
						<option value={0}>sticker 0</option>
						<option value={1}>sticker 1</option>
						<option value={2}>sticker 2</option>
						<option value={5}>the charm</option>
					</select>
				</label>

				<label style={S.row}>
					<input
						type="checkbox"
						checked={statTrak !== false}
						onChange={e => setStatTrak(e.target.checked ? 1337 : false)}
					/>{' '}
					StatTrak
				</label>
				<label style={S.row}>
					<input
						type="checkbox"
						checked={nameTag !== null}
						onChange={e => setNameTag(e.target.checked ? 'SHAREME' : null)}
					/>{' '}
					name plate
				</label>
				<label style={S.row}>
					<input id="stickers" type="checkbox" checked={sticker} onChange={e => setSticker(e.target.checked)} />{' '}
					stickers
				</label>
				<label style={S.row}>
					<input id="drag" type="checkbox" checked={drag} onChange={e => setDrag(e.target.checked)} /> let the user drag
					them
				</label>

				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<button
						type="button"
						onClick={() =>
							probe
								.sweep()
								.then(r => say(`sweep: ${r.sets} sets in ${r.ms} ms, ${r.loads} reloads, ${r.readys} readys`))
						}
						style={S.button}
					>
						float sweep
					</button>
					<button type="button" onClick={viewer.reload} style={S.button}>
						reload()
					</button>
					<button type="button" onClick={breakProtocol} style={S.button}>
						break protocol
					</button>
				</div>

				<pre
					style={{
						background: '#111',
						color: '#ddd',
						padding: 8,
						borderRadius: 6,
						fontSize: 11,
						margin: 0,
						whiteSpace: 'pre-wrap',
						minHeight: 120,
					}}
					id="log"
				>
					{log.join('\n')}
				</pre>
			</div>

			<div style={{ background: 'linear-gradient(160deg,#1b2735,#090a0f)', borderRadius: 10, overflow: 'hidden' }}>
				{useLink ? (
					<SkinViewer
						inspectLink={SAMPLE_LINK}
						handle={viewer}
						origin={FRAME_ORIGIN}
						view={view}
						settings={{ quality: { bloom }, environment: { map: 'Mirage', background: 'transparent' } }}
						interactions={{ dragStickers: drag, dragCharm: drag }}
						onReady={() => {
							probe.readys++
							say('ready')
						}}
						onError={e => {
							probe.errors.push(e)
							say(`error ${e.code}: ${e.message}`)
						}}
						style={{ width: '100%', height: '100%' }}
					/>
				) : (
					<SkinViewer
						item={item}
						handle={viewer}
						origin={FRAME_ORIGIN}
						view={view}
						settings={{
							quality: { bloom },
							environment: { map: 'Mirage', background: 'transparent' },
							overlays: { stickerGizmo: drag, charmGizmo: drag },
						}}
						interactions={{ dragStickers: drag, dragCharm: drag }}
						loading={<div style={S.loading}>loading this customer's own skeleton…</div>}
						fallback={error => <div style={S.fallback}>{error.message}</div>}
						onReady={() => {
							probe.readys++
							say('ready')
						}}
						onError={e => {
							probe.errors.push(e)
							say(`error ${e.code}: ${e.message}`)
						}}
						onChange={next => {
							probe.changes++
							probe.lastItem = next
							say(
								`change: ${next.stickers?.length ?? 0} stickers, first at ${next.stickers?.[0]?.offsetX?.toFixed(3)},${next.stickers?.[0]?.offsetY?.toFixed(3)}`,
							)
						}}
						editingSlot={slot}
						onEditingSlotChange={next => {
							setSlot(next)
							probe.slots.push(next)
							say(`editing-slot ${next}`)
						}}
						onResize={size => say(`resize ${Math.round(size.width)}x${Math.round(size.height)} @${size.dpr}`)}
						style={{ width: '100%', height: '100%' }}
					/>
				)}
			</div>
		</div>
	)
}

const S = {
	input: { display: 'block', width: '100%', marginTop: 2 },
	row: { display: 'flex', gap: 6, alignItems: 'center' },
	button: { padding: '6px 10px', cursor: 'pointer' },
	loading: {
		position: 'absolute' as const,
		inset: 0,
		display: 'grid',
		placeItems: 'center',
		color: '#9fb',
		background: 'rgba(0,0,0,.35)',
	},
	fallback: {
		position: 'absolute' as const,
		inset: 0,
		display: 'grid',
		placeItems: 'center',
		padding: 24,
		color: '#fbb',
		background: 'rgba(40,0,0,.55)',
		textAlign: 'center' as const,
	},
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
