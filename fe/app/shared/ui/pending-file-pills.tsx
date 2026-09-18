import { Pill } from '@mantine/core'

import { formatFileSize } from '~/shared/lib'

export function PendingFilePills ({ files, onRemove }: { files: File[], onRemove: (index: number) => void }) {
	return (
		<Pill.Group>
			{files.map((file, index) => (
				<Pill
					key={`${file.name}-${file.size}-${file.lastModified}`}
					withRemoveButton
					removeButtonProps={{ 'aria-label': `Remove ${file.name}` }}
					onRemove={() => {
						onRemove(index)
					}}
				>
					{file.name} · {formatFileSize(file.size)}
				</Pill>
			))}
		</Pill.Group>
	)
}
