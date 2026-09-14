const GIB = 1024 ** 3

export function formatGib (bytes: number): string {
	return `${(bytes / GIB).toFixed(1)} GiB`
}
