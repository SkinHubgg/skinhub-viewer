'use client'

/**
 * *** `<SkinViewer />` - THE EMBED AS A REACT COMPONENT. ***
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** THE ONE PROPERTY THIS FILE EXISTS TO PROTECT: A CHEAP PROP MUST NOT RELOAD THE FRAME. ***
 *
 * Owner's requirement: `float`, `seed`, `statTrak`, `nameTag`, the stickers and the charm update in
 * place *"to make it feel just like in our website"*; only the weapon, the paint kit and the view go
 * behind a loading card. The renderer guarantees it for a prop change, and `/frame`'s
 * identity-preserving merge guarantees it across the wire - measured there at 140 float messages, 137
 * animation frames, 769 timer samples and ZERO covered frames.
 *
 * *** THIS COMPONENT CAN STILL THROW IT ALL AWAY IN THREE LINES, AND HERE THEY ARE, GUARDED: ***
 *
 *   1. THE `src` IS BUILT ONCE AND NEVER REWRITTEN. Assigning `src` reloads the document, which drops
 *      the GL context, re-downloads the model and re-runs every shader compile. Every prop change
 *      after mount is a `postMessage`, without exception. `boot` is state that only `reload()` writes.
 *
 *   2. THE `<iframe>` HAS A `key`, AND IT IS DELIBERATELY NOT DERIVED FROM ANY PROP. It is a counter
 *      that only `reload()` increments. *** A `key={item.weapon}` HERE - OR ON THIS COMPONENT, IN A
 *      CONSUMER'S TREE - WOULD REMOUNT THE FRAME ON EVERY WEAPON CHANGE *** and turn a two-second
 *      cross-fade into a full document load. The frame already covers itself on an identity change;
 *      it does not need help and cannot be helped this way. The same warning is written into
 *      `/frame`'s own file, because the mistake is available at both ends.
 *
 *   3. THE MESSAGE IS A DIFF. See `state.ts`: sending the whole state every tick would be correct on
 *      the wire and would still re-seed the renderer's sticker draft sixty times a second.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * *** AND THE SECOND: A STALE PACKAGE FAILS LOUDLY, NEVER PARTIALLY. ***
 *
 * No back-compat, no version window - decided policy, and the README's *Versioning* section is its public statement. A protocol mismatch in
 * either direction is terminal: the frame renders nothing, this component stops sending, `onError`
 * carries the sentence naming which side is out of date, and `fallback` gets it too. Nothing is
 * half-applied, because a subtly wrong picture is worse than a blank one with an explanation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { hostMessage, readFrameEvent, type FrameEvent } from './protocol.js'
import { toPublicItem } from './item.js'
import { coversCanvas, diffState, frameUrl, resolveState, type DesiredState } from './state.js'
import { LINK, type ViewerLink } from './link.js'
import type { SkinViewerError, SkinViewerProps, ViewerStatus } from './types.js'

/** Where the embed is served from. Overridable per component - see {@link SkinViewerProps.origin}. */
export const DEFAULT_ORIGIN = 'https://skinhub.gg'

/**
 * *** THE TWO DEVELOPMENT-ONLY WARNINGS BELOW ARE GUARDED BY THE LITERAL `process.env.NODE_ENV`
 * EXPRESSION, WRITTEN OUT IN FULL AT EACH SITE, AND IT HAS TO STAY THAT WAY. ***
 *
 * Every bundler - webpack, Vite, Next, esbuild, Rollup - substitutes that exact member expression and
 * nothing else. *** ANY INDIRECTION AT ALL DEFEATS IT: *** a helper function, a hoisted `const`, or -
 * measured, and the reason this note exists - optional chaining. `process?.env?.NODE_ENV` is a
 * different AST node, no bundler substitutes it, so it stays a live runtime lookup and both warnings
 * plus their message strings ship inside every customer's production bundle. Written plainly it folds
 * to a constant at build time and the minifier deletes the blocks outright.
 *
 * `test/bundle.test.ts` asserts the literal survives into a real bundle of `dist/`, which is exactly
 * what caught the optional-chained version of this.
 *
 * *** WHICH IS ALSO WHY THERE IS NO `typeof process` GUARD. *** It would let an unbundled browser
 * import this without a `ReferenceError`, and it would cost the substitution to do it. There is no
 * such consumer: this is a React component, React's own development build reads the same bare global,
 * and nobody reaches either without a bundler.
 *
 * `process` IS DECLARED HERE, MODULE-SCOPED, rather than pulled in from `@types/node`.
 * `tsconfig.build.json` compiles with `"types": []` precisely so the published `.d.ts` cannot oblige a
 * browser consumer to install Node's globals in order to typecheck, and a bare `process.env` is a
 * compile error under it. A `declare const` INSIDE a module shadows the ambient one rather than
 * colliding with it, so `bun run typecheck` - which does load bun's globals - and the build agree.
 */
declare const process: { env: { NODE_ENV?: string } }

/**
 * *** THE TWO KINDS OF FAILURE, AND THEY ARE HELD DIFFERENTLY ON PURPOSE. ***
 *
 * A FRAME FAILURE (`protocol-mismatch`, `render-failed`) arrives as an event and is STICKY state: the
 * scene is gone and nothing in the props can bring it back, so it stays until a reload or - for a lost
 * render - until the next identity change gives the frame something new to try.
 *
 * A SUBJECT FAILURE (`no-item`, `bad-inspect-link`, `unknown-weapon`) is DERIVED FROM THE PROPS and is
 * never sticky. It is a fact about this render's arguments, so the moment the arguments are good it is
 * over. That distinction is the difference between a viewer that recovers when a query resolves and
 * one an integrator has to remount.
 */
const isFatal = (code: SkinViewerError['code']) =>
	code === 'protocol-mismatch' || code === 'render-failed' || code === 'unreachable'

/**
 * *** HOW LONG THE EMBED HAS TO ANNOUNCE ITSELF BEFORE WE CALL IT UNREACHABLE. ***
 *
 * The frame posts `hello` as soon as its script runs, so this is a document fetch plus a parse - a few
 * hundred milliseconds on a warm connection. Fifteen seconds is therefore not a performance budget, it
 * is the point past which "still loading" stops being a credible explanation for an empty box.
 *
 * *** DELIBERATELY GENEROUS, BECAUSE A FALSE POSITIVE HERE IS SELF-HEALING AND A FALSE NEGATIVE IS
 * NOT. *** The iframe stays mounted under the `fallback`, so a slow connection that lands at sixteen
 * seconds clears the error and renders. A timer too short would flash an error at people on bad
 * networks; no timer at all leaves them with a blank rectangle and nothing to search for.
 */
export const CONNECT_TIMEOUT_MS = 15_000

export const SkinViewer = (props: SkinViewerProps) => {
	const { className, style, title = 'SkinHub viewer', loading, fallback, handle } = props

	/*
	 * RESOLVED ON EVERY RENDER, NOT MEMOISED, AND THAT IS THE CHEAPER OPTION HERE.
	 *
	 * A memo would need a dependency array over props a consumer writes INLINE - `item={{…}}`,
	 * `settings={{…}}` - so its identity changes every render anyway and the memo would only add a
	 * comparison to the work it fails to skip. Everything downstream compares by VALUE for the same
	 * reason (see `diffState`), so a fresh object here costs nothing: it produces no patch, no message
	 * and no render in the frame.
	 */
	const desired = resolveState(props)
	const desiredRef = useRef(desired)
	desiredRef.current = desired

	/*
	 * THE ORIGIN IS READ ONCE. See the prop's own doc: it is the single value that could only be applied
	 * by reloading the frame, and a prop that quietly throws away the GL context is the thing this
	 * component is built not to have.
	 */
	const originRef = useRef(props.origin ?? DEFAULT_ORIGIN)

	/**
	 * *** THE `src`, AND THE STATE THAT `src` EXPRESSED. ***
	 *
	 * Built in a `useState` INITIALISER rather than an effect, so the first frame anyone sees is the
	 * integrator's item and not ours corrected a tick later - and so a server render emits the same
	 * attribute the browser will, with no hydration mismatch to paper over.
	 *
	 * `nonce` is the `<iframe>`'s key and only `reload()` moves it. See point 2 in the header.
	 */
	const [boot, setBoot] = useState(() => {
		const { src, expressed } = frameUrl(originRef.current, desired)
		return { src, expressed, nonce: 0 }
	})

	/** What the frame has been told so far. The baseline every later diff is measured against. */
	const sent = useRef<DesiredState>(boot.expressed)
	/** No `set` may be sent before the frame has announced itself; until then it has no listener. */
	const connected = useRef(false)
	const frame = useRef<HTMLIFrameElement>(null)
	/** Cancelled the moment the frame speaks; see {@link CONNECT_TIMEOUT_MS}. */
	const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const [status, setStatus] = useState<ViewerStatus>('connecting')
	const [error, setError] = useState<SkinViewerError | null>(null)
	const [problems, setProblems] = useState<readonly string[]>([])

	/*
	 * THE CALLBACKS, THROUGH A REF.
	 *
	 * `onChange` fires on every pointer move of a sticker drag. Putting the handler itself in a
	 * dependency array would re-attach the window listener on every render of a consumer who writes
	 * `onChange={item => setItem(item)}` inline - which is all of them. One ref, updated during render,
	 * and the listener effect below has no dependencies at all.
	 */
	const handlers = useRef(props)
	handlers.current = props

	const post = useCallback((message: unknown) => {
		const target = frame.current?.contentWindow
		if (!target) return
		// TARGETED AT THE FRAME'S ORIGIN AND NEVER `'*'`. We know it - we built the URL - so there is no
		// reason to broadcast a customer's item state to whatever document happens to be there.
		target.postMessage(message, originRef.current)
	}, [])

	const report = useCallback((next: SkinViewerError) => {
		handlers.current.onError?.(next)
		if (!isFatal(next.code)) return
		setError(next)
		setStatus('error')
		// A MISMATCH IS ONE-WAY. There is no path back: a frame that has answered one message this
		// package cannot read is a frame whose next answer it also cannot trust.
		if (next.code === 'protocol-mismatch') connected.current = false
	}, [])

	/**
	 * *** THE FLUSH. Every prop change in this package leaves through this function. ***
	 *
	 * Called after every render and again the moment the frame connects, because a prop can change
	 * before the iframe's document exists and that update must not be lost - it has to wait, not
	 * evaporate.
	 */
	const flush = useCallback(() => {
		if (!connected.current) return
		const next = desiredRef.current
		const patch = diffState(sent.current, next)
		if (!patch) return

		/*
		 * THE BASELINE KEEPS THE LAST ITEM WE ACTUALLY SENT. A render whose `item` was null - a host
		 * whose query briefly returned `undefined` - must not record "no item" as the thing the frame is
		 * showing, or the next real item would be diffed against a hole and sent in full for no reason.
		 */
		sent.current = { ...next, item: next.item ?? sent.current.item }
		if (coversCanvas(patch, next)) {
			setStatus('loading')
			// A NEW ITEM IS A NEW CHANCE. A lost GL context or a 404 on one model says nothing about the
			// next one, so the fallback comes down and the frame is allowed to try. A protocol mismatch is
			// not cleared here: that one is about the conversation, not the item.
			setError(current => (current?.code === 'render-failed' ? null : current))
		}
		post(hostMessage(patch))
	}, [post])

	useEffect(flush)

	/* ── THE CONNECTION DEADLINE ──────────────────────────────────────────────────────────────── */
	/**
	 * *** THE ONLY THING STANDING BETWEEN AN UNREACHABLE ORIGIN AND A SILENT EMPTY BOX. ***
	 *
	 * Keyed on `boot.nonce`, so `reload()` genuinely retries rather than inheriting a spent deadline.
	 * See {@link CONNECT_TIMEOUT_MS} and the `unreachable` code for why the browser gives us nothing
	 * else to go on.
	 */
	useEffect(() => {
		connectTimer.current = setTimeout(() => {
			connectTimer.current = null
			if (connected.current) return
			report({
				code: 'unreachable',
				message: `The SkinHub viewer embed at ${boot.src} did not respond within ${Math.round(
					CONNECT_TIMEOUT_MS / 1000,
				)}s. Nothing has rendered. Check that the origin is reachable from this browser, that it serves /frame, and that your page's Content-Security-Policy allows framing it (frame-src).`,
			})
		}, CONNECT_TIMEOUT_MS)

		return () => {
			if (connectTimer.current !== null) clearTimeout(connectTimer.current)
			connectTimer.current = null
		}
	}, [boot.nonce, boot.src, report])

	/* ── THE CHANNEL ──────────────────────────────────────────────────────────────────────────── */
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			/*
			 * BOTH CHECKS, AND THEY ARE NOT THE SAME CHECK. `event.source` is the sending WINDOW and
			 * cannot be spoofed, so it is what stops a sibling frame or an ad tag on the host page from
			 * driving this component. `event.origin` is what stops a frame that has been navigated
			 * somewhere else from continuing to talk to us. `EMBED.md` §10 tells hand-rolled hosts to do
			 * exactly this, and a package that told them to and did not would be worth nothing.
			 */
			if (event.source !== frame.current?.contentWindow) return
			if (event.origin !== originRef.current) return

			const reading = readFrameEvent(event.data)
			if (reading.kind === 'ignore') return
			if (reading.kind === 'mismatch') {
				report(reading.error)
				return
			}
			receive(reading.event)
		}

		/* Shadowing the `handle` PROP here would be a trap, so the reader is named for what it does. */
		const receive = (event: FrameEvent) => {
			switch (event.type) {
				case 'hello': {
					connected.current = true
					if (connectTimer.current !== null) {
						clearTimeout(connectTimer.current)
						connectTimer.current = null
					}
					/*
					 * *** A LATE ARRIVAL UNDOES `unreachable`, AND ONLY THAT ONE. *** The iframe is never
					 * unmounted - the `fallback` is drawn OVER it - so a connection that lands after the timer
					 * is a working viewer sitting under an error card, which is worse than the blank box the
					 * timer was added to prevent. Cleared here rather than in the timer because this is the
					 * only place we learn the embed is really there.
					 */
					setError(current => (current?.code === 'unreachable' ? null : current))
					setStatus(current => (current === 'connecting' || current === 'error' ? 'loading' : current))
					setProblems(event.problems)
					/*
					 * A PROBLEM IN `hello` IS OUR BUG AND NOT THE INTEGRATOR'S. They passed props; this
					 * package turned them into a query string; the frame is naming the part of that string it
					 * could not read. It is surfaced on the hook and warned about in development rather than
					 * routed to `onError`, which is for failures they can act on.
					 */
					if (event.problems.length > 0 && process.env.NODE_ENV !== 'production')
						console.warn('[@skinhub/viewer] the embed rejected part of the URL this package built:', event.problems)
					// Anything that changed while the document was still loading goes now.
					flush()
					return
				}
				case 'ready':
					// A LEVEL, NOT AN EDGE - it fires again after every identity change. And it fires after a
					// FAILED load too, which is why a fatal error is not cleared here.
					setStatus(current => (current === 'error' ? current : 'ready'))
					handlers.current.onReady?.()
					return
				case 'error':
					report(event.error)
					return
				case 'change': {
					/*
					 * *** THE USER'S EDIT, AND IT IS ALSO WRITTEN INTO OUR BASELINE. ***
					 *
					 * The second half is the one that is easy to miss: without it, the next patch we send
					 * would be diffed against an item that never learned about the drag, so the very next
					 * float tick would restate the OLD sticker offsets and yank the sticker back under the
					 * user's cursor. The frame is the authority on what the user did; we follow it.
					 */
					sent.current = { ...sent.current, item: event.item }
					handlers.current.onChange?.(toPublicItem(event.item))
					return
				}
				case 'editing-slot':
					handlers.current.onEditingSlotChange?.(event.slot)
					return
				case 'resize':
					handlers.current.onResize?.({ width: event.width, height: event.height, dpr: event.dpr })
					return
			}
		}

		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [flush, report])

	/* ── THE SUBJECT'S OWN FAILURES ───────────────────────────────────────────────────────────── */
	/*
	 * `no-item`, `bad-inspect-link` and `unknown-weapon` happen HERE rather than in the frame - they are
	 * decided while resolving props, before a message is sent. Reported once per distinct message, not
	 * once per render, because a host re-rendering at 60 Hz with a bad link would otherwise fill their
	 * console and their error reporter.
	 */
	const reported = useRef<string | null>(null)
	useEffect(() => {
		const subjectError = desiredRef.current.subjectError
		if (!subjectError) {
			reported.current = null
			return
		}
		if (reported.current === subjectError.message) return
		reported.current = subjectError.message
		handlers.current.onError?.(subjectError)
	})

	/* ── THE HANDLE ───────────────────────────────────────────────────────────────────────────── */
	const link: ViewerLink | undefined = handle?.[LINK]
	useEffect(() => {
		if (!link) return
		link.reload = () => {
			/*
			 * REBUILT FROM WHAT IS ON SCREEN NOW, not from the props this component mounted with - a reload
			 * that reverted the item to its first value would be a surprise, not a refresh.
			 *
			 * AND IT FALLS BACK TO THE LAST ITEM WE SENT, for the case where this render happens to have no
			 * item: a `reload()` fired from a button while the host's query is momentarily `undefined` must
			 * bring the item back, not the instruction card.
			 */
			const current = desiredRef.current
			const next: DesiredState = current.item
				? current
				: { ...current, item: sent.current.item, help: sent.current.item ? null : current.help }
			const { src, expressed } = frameUrl(originRef.current, next)
			sent.current = expressed
			connected.current = false
			setStatus('connecting')
			setError(null)
			setProblems([])
			setBoot(previous => ({ src, expressed, nonce: previous.nonce + 1 }))
		}
		return () => {
			link.reload = () => {}
		}
	}, [link])

	/*
	 * WHAT THE HOOK IS TOLD IS THE RESOLVED VIEW OF BOTH FAILURE KINDS, not the raw event state - so a
	 * consumer rendering `viewer.status` sees `'error'` for a link that did not decode, without this
	 * component having to make a prop-derived fact sticky to get it there.
	 */
	const publicError = error ?? desired.subjectError
	const publicStatus = publicError ? 'error' : status
	useEffect(() => {
		link?.publish({ status: publicStatus, error: publicError, problems })
	}, [link, publicStatus, publicError, problems])

	/* ── THE BOX ──────────────────────────────────────────────────────────────────────────────── */
	const box = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (process.env.NODE_ENV === 'production') return
		const element = box.current
		if (!element || (element.offsetWidth > 0 && element.offsetHeight > 0)) return
		console.warn(
			'[@skinhub/viewer] <SkinViewer> measured 0 px in one dimension, so nothing will be visible. ' +
				'The viewer fills its container and has no intrinsic size - give it one with `style` or `className` ' +
				'(e.g. style={{ width: 640, height: 420 }}), or size the element you put it in.',
		)
	}, [])

	/*
	 * ── WHAT IS DRAWN OVER THE FRAME, IN ORDER ────────────────────────────────────────────────
	 *
	 * 1. A FATAL FAILURE takes the `fallback` slot. The scene is gone underneath it.
	 *
	 * 2. A SUBJECT FAILURE takes it too WHEN THE CALLER PROVIDED ONE - they said what they want shown
	 *    for a bad item and that beats anything we would draw. *** WITH NO `fallback` IT DRAWS NOTHING,
	 *    AND THAT IS THE POINT: *** the frame is showing the instruction card, and covering it with a
	 *    skeleton would replace the one screen in this product whose whole job is to teach.
	 *
	 * 3. OTHERWISE `loading`, until the frame says `ready`.
	 */
	const overlay = error
		? renderFallback(fallback, error)
		: desired.subjectError
			? (renderFallback(fallback, desired.subjectError) ?? null)
			: status === 'ready'
				? null
				: loading

	return (
		<div ref={box} className={className} style={{ position: 'relative', ...style }}>
			<iframe
				/* Point 2 in the header. Nothing but `reload()` may move this. */
				key={boot.nonce}
				ref={frame}
				src={boot.src}
				title={title}
				/*
				 * *** NO `referrerPolicy`, AND THAT IS A DECISION. *** The embed reads the framing origin
				 * from this request's `Referer` header. Setting `no-referrer` here - which looks like good
				 * hygiene - would make every embed anonymous to us, which is not a privacy win for the host
				 * (we already know the URL they asked for) and does break the one thing that header decides.
				 */
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					border: 0,
					// The frame paints nothing of its own, so the canvas composites over the host's page.
					// Without this a browser's default white iframe background would sit in between.
					background: 'transparent',
					/*
					 * *** AND `background: transparent` IS NOT ENOUGH ON ITS OWN. *** A dark-themed host is
					 * the common case, and it defeats the line above through a rule almost nobody has read.
					 *
					 * `color-scheme` INHERITS. A host that sets `color-scheme: dark` anywhere above this
					 * element - and every Tailwind, NextUI, MUI or shadcn dark theme does, usually on
					 * `<html>` - passes it down to this iframe. The frame's own document computes `normal`.
					 * CSS Color Adjust says that when an iframe's used colour scheme differs from its
					 * embedder's, the UA must render the iframe OPAQUE in its own scheme's canvas colour,
					 * and for `normal` that colour is white.
					 *
					 * The result is a white plate behind the item THAT NEITHER DOCUMENT CAN SEE, because the
					 * browser paints it between them: every element on both sides still computes
					 * `rgba(0, 0, 0, 0)`, so a host debugging it finds nothing. One integrator lost most of a
					 * day to it, walking the whole ancestor chain twice before instrumenting the UA rule.
					 *
					 * Pinning `normal` matches what the frame computes, which is the entire requirement, and
					 * it is deterministic: `normal` resolves light on both sides whatever the visitor's OS is
					 * set to. A host that wants a plate behind the item still puts one on the element it
					 * wraps this in.
					 */
					colorScheme: 'normal',
					display: 'block',
				}}
			/>
			{overlay === null || overlay === undefined ? null : (
				/*
				 * DRAWN OVER THE FRAME, NEVER INSIDE IT - a React element cannot be structured-cloned across
				 * a `postMessage` boundary, so this is the only place a consumer's node can live.
				 *
				 * `pointerEvents: 'none'` so a spinner does not eat the orbit drag underneath it. A consumer
				 * whose overlay is interactive turns it back on in their own node, which is the right way
				 * round: the common case costs them nothing and the rare one is one line.
				 */
				<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{overlay}</div>
			)}
		</div>
	)
}

const renderFallback = (fallback: SkinViewerProps['fallback'], error: SkinViewerError) =>
	typeof fallback === 'function' ? fallback(error) : fallback
