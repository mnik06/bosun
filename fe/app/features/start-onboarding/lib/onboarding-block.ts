import { repositoryCloning, type Machine } from '~/entities/machine'

// The same checks the backend refuses on, said before the click: a run needs the
// agent to hold it, a clone that has landed to read, and a Claude credential to run on.
export function onboardingBlock (
	machine: Pick<Machine, 'status' | 'repositoryId' | 'clonedRepositoryId' | 'capabilities'>
): string | null {
	if (machine.status !== 'online') {
		return 'The machine must be online.'
	}

	if (machine.repositoryId == null) {
		return 'Attach a repository first.'
	}

	if (repositoryCloning(machine)) {
		return 'The repository is still cloning on the machine.'
	}

	const claude = machine.capabilities?.find((check) => check.name === 'claude')

	return claude?.ok === true
		? null
		: 'The claude check must be green — run bosun-agent setup on the machine.'
}
