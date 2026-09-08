import { GripVertical } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const MIN_FRACTION = 0.2
const MAX_FRACTION = 0.8

// Sized by a fraction rather than pixels, so the divider survives a window
// resize, and dragged on `window` rather than on this subtree. A drag that
// crosses text — a published plan is full of it — starts a selection, and the
// pointer stream is then torn between the two: the pointerup can land on the
// selection instead of here, leaving the divider stuck to the cursor. Listening
// on the window and suppressing selection for the length of the drag is what
// makes an empty pane and a full one behave the same.
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

	useEffect(() => {
		if (!dragging) {
			return
		}

		const move = (event: PointerEvent) => {
			resize(event.clientX)
		}
		const stop = () => {
			setDragging(false)
		}

		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
		document.body.style.userSelect = 'none'
		document.body.style.cursor = 'col-resize'

		return () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', stop)
			window.removeEventListener('pointercancel', stop)
			document.body.style.userSelect = ''
			document.body.style.cursor = ''
		}
	}, [dragging, resize])

	return (
		<div ref={container} className="flex min-h-0 grow">
			{/* `shrink-0` is load-bearing: without it the basis is only a suggestion,
			    and a right pane full of long lines squeezes this one to nothing —
			    which also makes the divider look stuck, because the fraction moves
			    and the layout ignores it. */}
			<div
				className="flex min-h-0 min-w-0 shrink-0 flex-col"
				style={{ flexBasis: `${fraction * 100}%` }}
			>
				{left}
			</div>

			{/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a focusable `separator` with a value is the ARIA window-splitter pattern; the rule does not model it, and a button here would announce the wrong thing */}
			<div role="separator" tabIndex={0}
				aria-label="Resize the panes"
				aria-orientation="vertical"
				aria-valuenow={Math.round(fraction * 100)}
				aria-valuemin={Math.round(MIN_FRACTION * 100)}
				aria-valuemax={Math.round(MAX_FRACTION * 100)}
				className="group relative mx-1 w-1 shrink-0 touch-none cursor-col-resize rounded bg-[var(--mantine-color-default-border)] hover:bg-[var(--mantine-color-blue-filled)]"
				onPointerDown={(event) => {
					event.preventDefault()
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
			>
				{/* Four pixels is a hard target with a mouse; the grab zone is wider than
				    the bar and sits over both panes' padding, which is empty space. */}
				<span className="absolute inset-y-0 -left-2 w-5" />

				{/* The bar alone reads as a border. The grip is what says it moves. */}
				<span className="pointer-events-none absolute top-1/2 left-1/2 flex h-7 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-[var(--mantine-color-default-border)] bg-[var(--mantine-color-default)] text-[var(--mantine-color-dimmed)] group-hover:text-[var(--mantine-color-blue-filled)]">
					<GripVertical size={12} />
				</span>
			</div>

			<div className="flex min-h-0 min-w-0 grow flex-col">{right}</div>
		</div>
	)
}
