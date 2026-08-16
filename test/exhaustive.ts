/**
 * *** THE TYPE-LEVEL HALF OF THE WIRE FREEZE. ***
 *
 * `wire.test.ts` compares a JSON description of the protocol against a committed snapshot. That alone
 * would be a snapshot test, and a snapshot test of a hand-written list is worth very little: the list
 * and the snapshot would both be prose, free to agree with each other while disagreeing with the
 * types. What makes it a real ratchet is {@link keysOf} - the lists are checked EXHAUSTIVE against the
 * types they claim to describe, so a field added to `FrameItem` is a COMPILE error in the list before
 * it is ever a snapshot failure.
 *
 * The two failures are deliberately different and arrive in order:
 *
 *   1. `bun run typecheck` fails, naming the field you added and the list that does not mention it.
 *   2. You add it to the list. Now `bun test` fails, because the snapshot does not have it either -
 *      and the message at that failure is the one that matters: go and change the frame, and bump the
 *      version integer.
 *
 * There is no path from "field added" to "green" that does not pass through both.
 */

/**
 * True only when `A` and `B` are the same type.
 *
 * *** NOT `A extends B ? B extends A`, and the difference is the entire reason this file exists. ***
 * Mutual assignability is too weak for optional properties, which is nearly everything on this wire:
 * `{ a?: number; b?: number }` and `{ a?: number }` are mutually assignable, because an absent
 * optional property satisfies the other side in both directions. So the obvious check would pass
 * through exactly the drift we are trying to catch - a new optional setting on one half and not the
 * other.
 *
 * The identity-of-conditional-types trick below compares the types themselves rather than their
 * assignability, so it distinguishes those two. It is the standard `IsEqual`, and it is standard
 * because nothing simpler works.
 */
export type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/** Fails to compile unless the argument is exactly `true`. Used as `type _ = AssertTrue<…>`. */
export type AssertTrue<T extends true> = T

/**
 * The keys of `T`, as a runtime array that CANNOT omit one or invent one.
 *
 *     const ITEM_KEYS = keysOf<FrameItem>()(['weaponType', 'paintIndex', …])
 *
 * Curried because TypeScript has no partial inference: `T` has to be given explicitly while `K` is
 * inferred from the literal, and one type parameter list cannot do both. When the list drifts from the
 * type, the argument no longer matches and the error names what is missing and what is extra, which is
 * why the failure branch is an object of diagnostics rather than `never` - `never` compiles into a
 * message nobody can act on.
 */
export const keysOf =
	<T>() =>
	<const K extends readonly (keyof T & string)[]>(
		keys: Exact<K[number], keyof T> extends true
			? K
			: {
					ERROR: 'this key list no longer matches the type it describes'
					missingFromTheList: Exclude<keyof T, K[number]>
					notOnTheType: Exclude<K[number], keyof T>
				},
	): readonly string[] => [...(keys as readonly string[])].sort()

/**
 * The members of a string-literal union, as a runtime array with the same guarantee as {@link keysOf}.
 * Used for the message verbs and the error codes, which are unions rather than object keys.
 */
export const membersOf =
	<T extends string>() =>
	<const K extends readonly T[]>(
		members: Exact<K[number], T> extends true
			? K
			: {
					ERROR: 'this list no longer matches the union it describes'
					missingFromTheList: Exclude<T, K[number]>
					notInTheUnion: Exclude<K[number], T>
				},
	): readonly string[] => [...(members as readonly string[])].sort()
