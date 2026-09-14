import { describe, expect, it } from 'vitest'

import { moveBuild } from '~/features/reorder-line/lib/move-build'

describe('moveBuild', () => {
	const order = ['a', 'b', 'c', 'd']

	it('moves a card up to the place of the one it was dropped on', () => {
		expect(moveBuild({ order, dragged: 'd', target: 'b' })).toEqual(['a', 'd', 'b', 'c'])
	})

	it('moves a card down to the place of the one it was dropped on', () => {
		expect(moveBuild({ order, dragged: 'a', target: 'c' })).toEqual(['b', 'c', 'a', 'd'])
	})

	it('changes nothing when dropped on itself', () => {
		expect(moveBuild({ order, dragged: 'b', target: 'b' })).toEqual(order)
	})

	// A card dragged in from another repository's column is not in this line, and
	// writing it into this order would put a build in a line it does not belong to.
	it('changes nothing for a build outside the line', () => {
		expect(moveBuild({ order, dragged: 'x', target: 'b' })).toEqual(order)
	})
})
