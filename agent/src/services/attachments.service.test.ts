import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentFileName, getAttachmentsService } from './attachments.service';

describe('attachmentFileName', () => {
	it.each([
		['shot.png', 'att_1-shot.png'],
		['../../etc/passwd', 'att_1-_.._etc_passwd'],
		['C:\\Users\\me\\log.txt', 'att_1-C_Users_me_log.txt'],
		['.env', 'att_1-env'],
		['...', 'att_1-file'],
		['', 'att_1-file'],
		['знімок екрана.png', 'att_1-_.png']
	])('%j -> %j', (name, expected) => {
		expect(attachmentFileName({ id: 'att_1', name })).toBe(expected);
	});

	it('cannot be steered out of its directory by the id either', () => {
		expect(attachmentFileName({ id: '../../att_1', name: 'x' })).toBe('att_1-x');
	});

	it('keeps the end of a long name, where the extension is', () => {
		const name = `${'a'.repeat(300)}.log`;

		expect(attachmentFileName({ id: 'att_1', name })).toBe(`att_1-${'a'.repeat(96)}.log`);
	});
});

describe('stageTurn', () => {
	let home: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-attachments-'));
	});

	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	const files: Record<string, Buffer> = {
		att_small: Buffer.from('small png'),
		att_big: Buffer.alloc(4 * 1024 * 1024, 1),
		att_pdf: Buffer.from('%PDF-1.7')
	};

	const service = () =>
		getAttachmentsService({
			homeDir: home,
			downloadAttachment: async (id) => {
				const file = files[id];

				if (!file) {
					throw new Error('Attachment not found');
				}

				return file;
			}
		});

	it('hands a turn without files through untouched and writes nothing', async () => {
		const turn = await service().stageTurn({ key: 'p_1', text: 'hello', attachments: [] });

		expect(turn).toEqual({ text: 'hello', images: [] });
		expect(fs.existsSync(path.join(home, '.bosun', 'attachments', 'p_1'))).toBe(false);
	});

	it('saves every file under the session, shows only the images the API accepts, and names what failed', async () => {
		const turn = await service().stageTurn({
			key: 'p_1',
			text: 'see these',
			attachments: [
				{ id: 'att_small', name: 'small.png', mediaType: 'image/png', size: 9 },
				{ id: 'att_big', name: 'big.png', mediaType: 'image/png', size: 4 * 1024 * 1024 },
				{ id: 'att_pdf', name: 'spec.pdf', mediaType: 'application/pdf', size: 8 },
				{ id: 'att_gone', name: 'gone.txt', mediaType: 'text/plain', size: 1 }
			]
		});
		const dir = path.join(home, '.bosun', 'attachments', 'p_1');

		expect(fs.readdirSync(dir).sort()).toEqual(['att_big-big.png', 'att_pdf-spec.pdf', 'att_small-small.png']);
		expect(fs.readFileSync(path.join(dir, 'att_pdf-spec.pdf'))).toEqual(files.att_pdf);
		expect(turn.images).toEqual([{ mediaType: 'image/png', data: files.att_small!.toString('base64') }]);
		expect(turn.text).toContain('see these');
		expect(turn.text).toContain(path.join(dir, 'att_big-big.png'));
		expect(turn.text).toContain('gone.txt: Attachment not found');
	});

	it('still delivers the turn when not one file could be fetched', async () => {
		const turn = await service().stageTurn({
			key: 'p_1',
			text: '',
			attachments: [{ id: 'att_gone', name: 'gone.txt', mediaType: 'text/plain', size: 1 }]
		});

		expect(turn.images).toEqual([]);
		expect(turn.text).toContain('without writing anything');
		expect(turn.text).toContain('gone.txt: Attachment not found');
	});
});
