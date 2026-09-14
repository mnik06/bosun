const DEFINITION = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

export interface ParsedEnv {
	vars: { key: string, value: string }[]
	skippedLines: number[]
}

// A quote left open is a value that continues on the next line, which bosun
// cannot store: the line is reported rather than half a secret being kept.
function unquote (raw: string): string | null {
	const trimmed = raw.trim()
	const quote = trimmed[0]

	if (quote !== '"' && quote !== '\'') {
		return trimmed.replace(/\s+#.*$/, '')
	}

	for (let index = 1; index < trimmed.length; index += 1) {
		const closes = trimmed[index] === quote && (quote === '\'' || trimmed[index - 1] !== '\\')

		if (closes) {
			const inner = trimmed.slice(1, index)

			return quote === '"' ? inner.replaceAll('\\"', '"') : inner
		}
	}

	return null
}

// Later definitions win, as they do for dotenv, so a pasted file means what it
// meant where it came from.
export function parseEnvText (text: string): ParsedEnv {
	const byKey = new Map<string, string>()
	const skippedLines: number[] = []

	text.replace(/^﻿/, '').split(/\r?\n/).forEach((line, index) => {
		if (/^\s*(?:#|$)/.test(line)) {
			return
		}

		const match = DEFINITION.exec(line)
		const value = match ? unquote(match[2] ?? '') : null

		if (match?.[1] === undefined || value === null) {
			skippedLines.push(index + 1)

			return
		}

		byKey.set(match[1], value)
	})

	return { vars: [...byKey].map(([key, value]) => ({ key, value })), skippedLines }
}
