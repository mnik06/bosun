import { Page } from '~/shared/ui'
import { GithubSettings } from '~/widgets/github-settings'

export default function SettingsPage () {
	return (
		<Page title="Settings">
			<GithubSettings />
		</Page>
	)
}
