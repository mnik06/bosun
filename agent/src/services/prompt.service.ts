import readline from 'readline';

// A secret typed at a prompt, never passed as an argument. `/proc/<pid>/cmdline`
// is world-readable and a pasted command lands in the shell's history file, so a
// token on the command line leaks twice over.
export function getPromptService(deps: {
	input?: NodeJS.ReadableStream;
	output?: NodeJS.WritableStream;
}) {
	const input = (deps.input ?? process.stdin) as NodeJS.ReadStream;
	const output = (deps.output ?? process.stdout) as NodeJS.WriteStream;
	// Terminal mode only when there is a terminal: forcing it on a pipe emits
	// cursor-control escapes into whatever is reading the output.
	const terminal = Boolean(input.isTTY);

	// Lines are queued rather than read one `question()` at a time. Over a pipe
	// readline emits every line as fast as it can read them, so a second prompt
	// registered after the first resolves has already missed its answer.
	const ready: string[] = [];
	const waiting: ((line: string) => void)[] = [];

	let rl: readline.Interface | null = null;
	let muted = false;
	let prompt = '';
	let closed = false;

	function iface(): readline.Interface {
		if (rl) {
			return rl;
		}

		rl = readline.createInterface({ input, output, terminal });

		if (terminal) {
			const mutable = rl as unknown as { _writeToOutput: (text: string) => void };
			const write = mutable._writeToOutput.bind(rl);

			mutable._writeToOutput = (text: string): void => {
				if (muted) {
					output.write(`\r${prompt}`);

					return;
				}

				write(text);
			};
		}

		rl.on('line', (line: string) => {
			const waiter = waiting.shift();

			waiter ? waiter(line) : ready.push(line);
		});

		// EOF with a prompt still outstanding resolves empty rather than hanging the
		// process on input that is never coming.
		rl.on('close', () => {
			closed = true;

			while (waiting.length > 0) {
				waiting.shift()!('');
			}
		});

		return rl;
	}

	function nextLine(): Promise<string> {
		const queued = ready.shift();

		if (queued !== undefined) {
			return Promise.resolve(queued);
		}

		if (closed) {
			return Promise.resolve('');
		}

		return new Promise((resolve) => waiting.push(resolve));
	}

	async function ask(question: string, opts?: { hidden?: boolean }): Promise<string> {
		prompt = question;
		muted = Boolean(opts?.hidden) && terminal;

		iface();
		output.write(question);

		const line = await nextLine();

		if (muted) {
			output.write('\n');
		}

		muted = false;

		return line.trim();
	}

	return {
		ask,

		async confirm(question: string): Promise<boolean> {
			return /^y(es)?$/i.test(await ask(`${question} [y/N] `));
		},

		async secret(label: string): Promise<string> {
			return ask(`${label} (input hidden): `, { hidden: true });
		},

		close(): void {
			rl?.close();
			rl = null;
		}
	};
}

export type PromptService = ReturnType<typeof getPromptService>;
