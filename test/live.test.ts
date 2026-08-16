/**
 * *** THE ONE TEST THAT LEAVES THE MACHINE. Opt-in, and skipped by default. ***
 *
 *     bun run test:live                                          # against the default origin
 *     SKINHUB_VIEWER_ORIGIN=http://localhost:3000 bun run test:live
 *
 * Everything else in this suite is pure: the package's whole job is to build a URL and exchange
 * messages, and both are testable with no network. What none of it can tell you is the failure that
 * actually strands an integrator - *** THE ORIGIN DOES NOT SERVE `/frame`. *** A perfectly-built URL
 * pointing at a 404 renders an empty box, and the package has no way to know: an `<iframe>` that fails
 * to load fires no error a parent page can read, cross-origin.
 *
 * *** SO THIS IS DELIBERATELY NOT A RENDER TEST. *** It does not launch a browser and it does not look
 * at pixels; that lives in the app repo, next to the renderer. It asks one question - is there a
 * document at the address this package sends people to - because that is the question whose answer
 * changes without anybody here touching a line.
 *
 * It is excluded from `bun test` rather than skipped conditionally inside the assertions, so a green
 * offline run never quietly includes a network check that silently passed on a cached 404.
 */

import { describe, expect, test } from 'bun:test'

import { DEFAULT_ORIGIN } from '../src/SkinViewer.js'
import { frameUrl, resolveState } from '../src/state.js'

const LIVE = process.env.SKINHUB_VIEWER_LIVE === '1'
const ORIGIN = process.env.SKINHUB_VIEWER_ORIGIN ?? DEFAULT_ORIGIN

describe.skipIf(!LIVE)(`the embed is actually served (${ORIGIN})`, () => {
	const { src } = frameUrl(ORIGIN, resolveState({ item: { weapon: 'weapon_ak47', paintIndex: 44 } }))

	test('GET /frame answers with an HTML document', async () => {
		const response = await fetch(src, { headers: { accept: 'text/html' } })
		expect({ url: src, status: response.status }).toEqual({ url: src, status: 200 })
		expect(response.headers.get('content-type')).toContain('text/html')
	})

	/**
	 * *** `X-Frame-Options` OR A `frame-ancestors` THAT NAMES ANYONE IS FATAL TO THE WHOLE PRODUCT ***
	 * and is a one-line change in a config file somebody else owns. The browser refuses the frame
	 * silently and the integrator sees an empty box, so it is worth one assertion here.
	 */
	test('nothing in the response forbids being framed', async () => {
		const response = await fetch(src, { headers: { accept: 'text/html' } })
		expect(response.headers.get('x-frame-options')).toBeNull()

		const csp = response.headers.get('content-security-policy') ?? ''
		const ancestors = /frame-ancestors([^;]*)/i.exec(csp)?.[1]?.trim()
		// Absent is fine. Present must be `*`, or the embed only works on origins we listed.
		if (ancestors !== undefined) expect(ancestors).toBe('*')
	})
})
