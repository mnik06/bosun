import { Badge, Button, Group, Stack, Text } from '@mantine/core'
import { useForm } from '@mantine/form'
import { randomId } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import type { Machine } from '~/entities/machine'
import { useSaveVars } from '~/features/edit-env-sets/api/use-save-vars'
import { blankPair, editorPairs } from '~/features/edit-env-sets/lib/editor-pairs'
import { toEnvSetPayload } from '~/features/edit-env-sets/lib/to-env-set-payload'
import {
	VarsFormSchema,
	type EnvPair,
	type EnvSetForm,
	type RequiredVar,
	type VarsTarget
} from '~/features/edit-env-sets/model/env-set-form'
import { pasteEnv } from '~/features/edit-env-sets/model/paste-env'
import { useConfirmDeleteEnvSet } from '~/features/edit-env-sets/model/use-confirm-delete-env-set'
import { EnvPairRow } from '~/features/edit-env-sets/ui/env-pair-row'
import { PairsActions } from '~/features/edit-env-sets/ui/pairs-actions'

function initialPairs (opts: { target: VarsTarget, required: RequiredVar[], storedKeys: string[] }): EnvPair[] {
	const pairs = editorPairs({ required: opts.required, storedKeys: opts.storedKeys, newId: randomId })

	return pairs.length === 0 && opts.target.kind === 'env' ? [blankPair(randomId())] : pairs
}

function RequirementHint ({ requirement }: { requirement: RequiredVar }) {
	return (
		<Group gap={6} wrap="nowrap" className="min-w-0">
			<Badge size="xs" variant="light" color={requirement.missing ? 'red' : 'gray'} className="shrink-0">
				required
			</Badge>
			<Text size="xs" c="dimmed" className="min-w-0 break-words">
				{requirement.why}
			</Text>
		</Group>
	)
}

export function VarsEditor ({
	machine,
	target,
	required,
	storedKeys
}: {
	machine: Pick<Machine, 'id' | 'publicKey'>,
	target: VarsTarget,
	required: RequiredVar[],
	storedKeys: string[]
}) {
	const save = useSaveVars(machine)
	const removeSet = useConfirmDeleteEnvSet(machine.id)
	const form = useForm<EnvSetForm>({
		mode: 'uncontrolled',
		initialValues: {
			path: target.kind === 'env' ? target.path : '',
			pairs: initialPairs({ target, required, storedKeys })
		},
		validate: zod4Resolver(VarsFormSchema)
	})
	const pairs = form.getValues().pairs
	const requirements = new Map(required.map((requirement) => [requirement.key, requirement]))

	const submit = (values: EnvSetForm) => {
		const { vars } = toEnvSetPayload(values)

		// An env set is a file; one with no variables is a delete, which has its
		// own button and its own confirmation.
		if (target.kind === 'env' && vars.length === 0) {
			notifications.show({ color: 'yellow', title: 'Nothing to save', message: 'Type a value or add a variable first.' })

			return
		}

		save.mutate({ target, vars }, {
			onSuccess: () => {
				form.reset()
			}
		})
	}

	return (
		<form onSubmit={form.onSubmit(submit)}>
			<Stack gap="sm">
				{pairs.length === 0 ? (
					<Text size="sm" c="dimmed">
						Nothing stored yet.
					</Text>
				) : null}

				{pairs.map((pair, index) => {
					const requirement = pair.required ? requirements.get(pair.key) : undefined

					return (
						<Stack key={pair.id} gap={4}>
							<EnvPairRow
								form={form}
								pair={pair}
								index={index}
								removable={!pair.required}
								onPasteEnv={(text) => pasteEnv({ form, text })}
							/>
							{requirement === undefined ? null : <RequirementHint requirement={requirement} />}
						</Stack>
					)
				})}

				<PairsActions form={form} />

				<Text size="xs" c="dimmed">
					Sealed in this browser to the machine&apos;s key — bosun keeps only the key names. Leave a
					stored value empty to keep it.
				</Text>

				<Group justify="flex-end" gap="sm">
					{target.kind === 'env' && storedKeys.length > 0 && required.length === 0 ? (
						<Button
							variant="subtle"
							color="red"
							size="xs"
							loading={removeSet.isPending}
							onClick={() => {
								removeSet.confirm(target.path)
							}}
						>
							Remove this set
						</Button>
					) : null}
					<Button type="submit" size="xs" loading={save.isPending} disabled={machine.publicKey == null}>
						Save
					</Button>
				</Group>
			</Stack>
		</form>
	)
}
