import { Page } from '~/shared/ui'
import { GithubSettings } from '~/widgets/github-settings'
import { NotificationSettings } from '~/widgets/notification-settings'

export default function SettingsPage () {
	return (
		<Page title="Settings">
			<GithubSettings />
			<NotificationSettings />
		</Page>
	)
}
