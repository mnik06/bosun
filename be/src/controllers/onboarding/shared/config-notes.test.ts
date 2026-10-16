import { describe, expect, it } from 'vitest';
import { parseProjectConfig } from 'src/types/ProjectConfigSchema';
import { withInstructionsAsNotes } from './config-notes';

const CONFIG = ['Install: pnpm install', '', 'Apps:', 'be:', '- Start: pnpm dev'].join('\n');
const INSTRUCTIONS = 'Generate migrations with pnpm db:migrations:generate.\nStart the database with pnpm db:up.';

describe('withInstructionsAsNotes', () => {
	it('leaves the config alone when there are no instructions', () => {
		const config = `${CONFIG}\n\nNotes:\nthe model's own note`;

		expect(withInstructionsAsNotes({ config, instructions: null })).toBe(config);
	});

	it('appends the instructions as notes to a config without any', () => {
		expect(withInstructionsAsNotes({ config: `${CONFIG}\n\n`, instructions: INSTRUCTIONS })).toBe(`${CONFIG}\n\nNotes:\n${INSTRUCTIONS}`);
	});

	it('replaces the model notes, header line to end of document', () => {
		const config = `${CONFIG}\n\nNotes:\n- one\n\nTest accounts:\n- two`;

		expect(withInstructionsAsNotes({ config, instructions: INSTRUCTIONS })).toBe(`${CONFIG}\n\nNotes:\n${INSTRUCTIONS}`);
	});

	it('replaces notes opened with an inline value', () => {
		const config = `${CONFIG}\nNotes: inline note\nmore`;

		expect(withInstructionsAsNotes({ config, instructions: INSTRUCTIONS })).toBe(`${CONFIG}\n\nNotes:\n${INSTRUCTIONS}`);
	});

	it('does not treat a line merely starting with Notes as the header', () => {
		const config = `${CONFIG}\nNotes:x`;

		expect(withInstructionsAsNotes({ config, instructions: INSTRUCTIONS })).toBe(`${config}\n\nNotes:\n${INSTRUCTIONS}`);
	});

	it('handles CRLF line endings around the header', () => {
		const config = `${CONFIG.replaceAll('\n', '\r\n')}\r\nNotes:\r\nold`;

		expect(withInstructionsAsNotes({ config, instructions: INSTRUCTIONS })).toBe(`${CONFIG.replaceAll('\n', '\r\n')}\n\nNotes:\n${INSTRUCTIONS}`);
	});

	it('produces a config whose notes the grammar reads back as the instructions', () => {
		const parsed = parseProjectConfig(withInstructionsAsNotes({ config: `${CONFIG}\nNotes:\nold`, instructions: INSTRUCTIONS }));

		expect(parsed.ok && parsed.config.notes).toBe(INSTRUCTIONS);
	});
});
