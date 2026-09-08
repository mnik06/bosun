import { useCallback, useRef, useState, type ReactNode } from 'react'

const MIN_FRACTION = 0.2
const MAX_FRACTION = 0.8

// Sized by a fraction rather than pixels so the divider survives a window
// resize, and dragged on the container rather than the handle so the pointer
// keeps working when it runs ahead of the divider mid-drag.
export function SplitPane ({
	left,
	right,
	initial = 0.5
}: {
	left: ReactNode,
	right: ReactNode,
	initial?: number
}) {
	const container = useRef<HTMLDivElement>(null)
	const [fraction, setFraction] = useState(initial)
	const [dragging, setDragging] = useState(false)

	const resize = useCallback((clientX: number) => {
		const box = container.current?.getBoundingClientRect()

		if (!box || box.width === 0) {
			return
		}

		const next = (clientX - box.left) / box.width

		setFraction(Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, next)))
	}, [])

	return (
		<div
			ref={container}
			className="flex min-h-0 grow"
			onPointerMove={(event) => {
				if (dragging) {
					resize(event.clientX)
				}
			}}
			onPointerUp={() => {
				setDragging(false)
			}}
			onPointerLeave={() => {
				setDragging(false)
			}}
		>
			<div className="flex min-h-0 min-w-0 flex-col" style={{ flexBasis: `${fraction * 100}%` }}>
				{left}
			</div>

			{/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a focusable `separator` with a value is the ARIA window-splitter pattern; the rule does not model it, and a button here would announce the wrong thing */}
			<div role="separator" tabIndex={0}
				aria-label="Resize the panes"
				aria-orientation="vertical"
				aria-valuenow={Math.round(fraction * 100)}
				aria-valuemin={Math.round(MIN_FRACTION * 100)}
				aria-valuemax={Math.round(MAX_FRACTION * 100)}
				className="mx-1 w-1 shrink-0 cursor-col-resize rounded bg-[var(--mantine-color-default-border)] hover:bg-[var(--mantine-color-blue-filled)]"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId)
					setDragging(true)
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
						event.preventDefault()
						setFraction((previous) =>
							Math.min(
								MAX_FRACTION,
								Math.max(MIN_FRACTION, previous + (event.key === 'ArrowLeft' ? -0.05 : 0.05))
							)
						)
					}
				}}
			/>

			<div className="flex min-h-0 min-w-0 grow flex-col">{right}</div>
		</div>
	)
}
