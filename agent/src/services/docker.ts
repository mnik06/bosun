import os from 'os';

export type DockerState = 'ready' | 'missing' | 'denied' | 'down' | 'nocompose';

// Matched against whatever printed it — `docker info` itself, or a service's
// `supabase start` that shelled out to docker — so these are the docker CLI's own
// words, which every wrapper passes through.
const SIGNALS: [Exclude<DockerState, 'ready'>, RegExp][] = [
	['missing', /docker: (command )?not found|not found on the service PATH|executable file not found in \$PATH/i],
	['denied', /permission denied[^\n]*docker\.sock/i],
	['down', /Cannot connect to the Docker daemon|Is the docker daemon running/i],
	// Without the compose plugin the CLI does not know `compose`, so it parses the
	// rest of `docker compose -p x up` as its own flags and rejects the first one.
	['nocompose', /unknown command: docker compose|'compose' is not a docker command|unknown shorthand flag: '\w' in -\w+\s+Usage:\s+docker \[OPTIONS\] COMMAND/i]
];

export function classifyDocker(output: string): Exclude<DockerState, 'ready'> | null {
	return SIGNALS.find(([, pattern]) => pattern.test(output))?.[0] ?? null;
}

// The group only reaches the agent once its user manager restarts: the unit runs
// under that manager, which kept the groups the user had when it started.
export function dockerFix(state: Exclude<DockerState, 'ready'>): string {
	const { username, uid } = os.userInfo();
	const regroup = `usermod -aG docker ${username} && systemctl restart user@${uid}`;

	switch (state) {
	case 'missing':
		return `docker is not installed — as root: apt-get install -y docker.io docker-compose-v2 && ${regroup}`;
	case 'denied':
		return `${username} cannot use docker — as root: ${regroup}`;
	case 'down':
		return 'the docker daemon is not running — as root: systemctl enable --now docker';
	case 'nocompose':
		return 'docker compose is not installed — as root: apt-get install -y docker-compose-v2';
	}
}
