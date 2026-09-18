const KIB = 1024
const MIB = 1024 ** 2
const GIB = 1024 ** 3

export function formatGib (bytes: number): string {
	return `${(bytes / GIB).toFixed(1)} GiB`
}

export function formatFileSize (bytes: number): string {
	return bytes < MIB ? `${Math.max(1, Math.round(bytes / KIB))} KB` : `${(bytes / MIB).toFixed(1)} MB`
}
