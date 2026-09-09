import { Alert, Button, Stack, Text } from '@mantine/core'

import type { CreatedMember } from '~/entities/project'
import { CopyableCommand } from '~/shared/ui'

export function NewMemberCredentials (props: { created: CreatedMember, onDone: () => void }) {
	// The password is in this response and nowhere else, ever. Closing the dialog
	// without copying it means removing the member and adding them again.
	return (
		<Stack gap="md">
			<Text size="sm">
				{props.created.password === null
					? `${props.created.member.email} already had an account and has been added to this project. They sign in with their existing password.`
					: `${props.created.member.email} can sign in with this password. It is shown once and cannot be recovered.`}
			</Text>

			{props.created.password !== null ? <>
				<CopyableCommand label="Password" command={props.created.password} />
				<Alert color="yellow" variant="light">
						Copy it now — closing this dialog is the last time it exists.
				</Alert>
			</> : null}

			<Button onClick={props.onDone}>Done</Button>
		</Stack>
	)
}
