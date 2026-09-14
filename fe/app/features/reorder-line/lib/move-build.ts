// The line's new order after one card is dropped on another: the dragged build
// takes the target's place and everything between shifts by one. Dropping a card
// on itself, or on a card from another repository's line, changes nothing.
export function moveBuild (opts: { order: string[], dragged: string, target: string }): string[] {
	const { order, dragged, target } = opts

	if (dragged === target || !order.includes(dragged) || !order.includes(target)) {
		return order
	}

	const without = order.filter((id) => id !== dragged)
	const from = order.indexOf(dragged)
	const at = without.indexOf(target)
	const index = from < order.indexOf(target) ? at + 1 : at

	return [...without.slice(0, index), dragged, ...without.slice(index)]
}
