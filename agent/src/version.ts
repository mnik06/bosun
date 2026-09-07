import pkg from '../package.json';

// The published version is `package.json`, full stop. A hand-kept constant beside
// it is a second answer that goes stale the first time somebody bumps one and not
// the other — which is exactly what the machines then report.
export const AGENT_VERSION: string = pkg.version;
