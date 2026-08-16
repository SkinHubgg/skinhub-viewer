'use client'

/**
 * *** `useSkinViewer()` - PROPS FOR STATE, A HOOK FOR VERBS. ***
 *
 * The owner floated this shape and it is the right one. Everything the viewer SHOWS is a prop, because
 * that is what React is good at. The two or three things that are not values - "load it again", "what
 * is it doing right now" - cannot be props without inventing a boolean somebody has to toggle back,
 * so they are here.
 *
 *     const viewer = useSkinViewer()
 *     <SkinViewer item={item} handle={viewer} loading={<Skeleton />} />
 *     <button onClick={viewer.reload} disabled={viewer.status === 'connecting'}>Reload</button>
 *
 * *** THE HOOK IS OPTIONAL AND THE COMPONENT IS COMPLETE WITHOUT IT. *** `onReady`, `onError` and
 * `onChange` cover every integration that does not need a verb, and a component that only worked when
 * a hook was also mounted would be a component with a hidden second half.
 *
 * *** `reload` IS STABLE; THE HANDLE OBJECT IS NOT. *** The object is rebuilt when `status`, `error` or
 * `problems` move, because that is how a React value re-renders the tree that reads it. Put
 * `viewer.reload` in a dependency array, not `viewer`.
 */

import { useMemo, useRef, useState } from 'react'

import { LINK, type ViewerLink, type ViewerSnapshot } from './link.js'
import type { SkinViewerHandle } from './types.js'

const INITIAL: ViewerSnapshot = { status: 'connecting', error: null, problems: [] }

export const useSkinViewer = (): SkinViewerHandle => {
	const [snapshot, setSnapshot] = useState<ViewerSnapshot>(INITIAL)

	/*
	 * ONE LINK OBJECT FOR THE LIFE OF THE HOOK. `useRef` with a lazy fill rather than `useMemo`, because
	 * a memo is a cache and React is allowed to throw a cache away; this is identity, and the component
	 * writes to it.
	 */
	const link = useRef<ViewerLink | null>(null)
	if (link.current === null)
		link.current = {
			reload: () => {},
			/*
			 * *** THE EQUALITY BAIL IS LOAD-BEARING, NOT AN OPTIMISATION. *** The component publishes from
			 * an effect that runs on every render; a `setState` that always produced a new object would
			 * re-render this hook's owner, which re-renders the component, which runs the effect, which
			 * publishes again - forever.
			 *
			 * *** AND THE ERROR IS COMPARED BY VALUE, NOT IDENTITY, WHICH IS THE WHOLE REASON THIS IS NOT
			 * A ONE-LINER. *** A subject failure (`no-item`, a link that did not decode) is DERIVED from
			 * this render's props, so it is a fresh object every render even when nothing has changed.
			 * Comparing it by identity is exactly the loop above.
			 *
			 * `problems` is compared by identity on purpose: it is the array the frame sent, and a new one
			 * means a new `hello`.
			 */
			publish: next =>
				setSnapshot(current =>
					current.status === next.status &&
					current.problems === next.problems &&
					current.error?.code === next.error?.code &&
					current.error?.message === next.error?.message
						? current
						: next,
				),
		}

	const reload = useRef(() => link.current?.reload()).current

	return useMemo<SkinViewerHandle>(
		() => ({
			reload,
			status: snapshot.status,
			error: snapshot.error,
			problems: snapshot.problems,
			[LINK]: link.current as ViewerLink,
		}),
		[reload, snapshot],
	)
}
