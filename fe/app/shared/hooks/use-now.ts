import { useEffect, useState } from 'react'

// A clock the render can depend on. An elapsed time computed from `Date.now()`
// alone freezes: nothing re-renders when time passes, so it would show whatever
// it said when the last frame arrived.
export function useNow (intervalMs = 1000): number {
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		const timer = setInterval(() => {
			setNow(Date.now())
		}, intervalMs)

		return () => {
			clearInterval(timer)
		}
	}, [intervalMs])

	return now
}
