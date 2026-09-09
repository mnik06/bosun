import { Modal, type ModalProps } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

// A centred dialog on a phone is a postage stamp with a keyboard over it. Below
// `sm` every modal takes the screen; above it nothing changes.
export function AppModal (props: ModalProps) {
	const compact = useMediaQuery('(width < 48em)', false, { getInitialValueInEffect: false })

	return <Modal centered fullScreen={compact} {...props} />
}
