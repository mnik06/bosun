import { Page } from '~/shared/ui'
import { RepositoriesPanel } from '~/widgets/repositories-panel'

export default function RepositoriesPage () {
	return (
		<Page title="Repositories">
			<RepositoriesPanel />
		</Page>
	)
}
