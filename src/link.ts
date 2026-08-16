/**
 * *** THE PRIVATE CHANNEL BETWEEN THE HOOK AND THE COMPONENT. ***
 *
 * `useSkinViewer()` returns a handle; `<SkinViewer handle={…} />` fills it in. Something has to carry
 * `reload` from the component that can do it to the object that exposes it, and carry `status` back
 * the other way.
 *
 * *** A SYMBOL KEY RATHER THAN `__internal`, *** for one practical reason: a symbol does not appear in
 * an editor's autocomplete on the handle, so the only members an integrator ever sees are the four
 * documented ones. It is not hiding - anyone can reach it - it is keeping the public surface exactly
 * as large as the documentation says it is.
 *
 * *** AND IT IS A MUTABLE OBJECT RATHER THAN A CALLBACK PROP, *** because the identity of the thing
 * passed as `handle` must never change: it is a plain prop on a component that re-renders on every
 * frame of a float drag, and a fresh object there would be one more thing to compare per frame.
 */

import type { SkinViewerError, ViewerStatus } from './types.js'

export const LINK: unique symbol = Symbol('@skinhub/viewer/link')

export type ViewerSnapshot = {
	status: ViewerStatus
	error: SkinViewerError | null
	problems: readonly string[]
}

export type ViewerLink = {
	/** Replaced by the mounted component; a no-op before mount and after unmount. */
	reload: () => void
	/** The component pushing its state up. Bails when nothing moved - see `useSkinViewer`. */
	publish: (snapshot: ViewerSnapshot) => void
}
