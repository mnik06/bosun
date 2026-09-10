import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { AskArgsSchema } from './ask';
import { PlanAnswerSchema, type PlanAnswer, type PlanQuestion } from '../protocol';

const JSON_RPC = '2.0';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const MAX_BODY_BYTES = 1_000_000;

export interface PendingQuestion {
	questionId: string;
	resolve: (answers: PlanAnswer[]) => void;
}

export interface SessionMcpServer {
	configPath: string;
	answer(opts: { questionId: string; answers: PlanAnswer[] }): boolean;
	close(): Promise<void>;
}

function textResult(text: string, isError = false) {
	return { content: [{ type: 'text', text }], isError };
}

function describeAnswers(opts: { questions: PlanQuestion[]; answers: PlanAnswer[] }): string {
	return opts.questions
		.map((question, index) => `${question.header}: ${(opts.answers[index]?.selected ?? []).join(', ')}`)
		.join('\n');
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';

		req.on('data', (chunk: Buffer) => {
			body += chunk.toString('utf8');

			if (body.length > MAX_BODY_BYTES) {
				reject(new Error('request body too large'));
				req.destroy();
			}
		});
		req.on('end', () => {
			resolve(body);
		});
		req.on('error', reject);
	});
}

// The session is told to put its recommendation first, so the first option is
// the one it would have argued for. An empty option list is not a shape the
// prompt asks for, but a tool that threw on it would kill the whole session over
// a malformed question.
function recommendedAnswers(questions: PlanQuestion[]): PlanAnswer[] {
	return questions.map((question) => ({
		selected: [question.options[0]?.label ?? 'Proceed with whatever you recommend.']
	}));
}

// Compared with case, punctuation and spacing taken out. A model that re-asks
// rarely retypes the question byte for byte, and a repeat that slips through on a
// comma is a second prompt to the person for a decision they already made.
function normalize(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

// The decision a question is about: its header and its own wording. Two asks that
// read the same are the same decision however their options are worded — so
// whatever makes one question different from another, the pair, the plan numbers,
// the piece, belongs in the question text. The prompts say so, and this is what
// holds them to it.
function topic(questions: PlanQuestion[]): string {
	return JSON.stringify(
		questions.map((question) => [normalize(question.header), normalize(question.question)])
	);
}

// The same question down to the choices it offered, order-insensitive: an exact
// repeat, which is answered without a word about it.
function fingerprint(questions: PlanQuestion[]): string {
	return JSON.stringify(
		questions.map((question) => [
			normalize(question.header),
			normalize(question.question),
			question.options.map((option) => normalize(option.label)).sort()
		])
	);
}

// The one tool the transport owns, because answering it is the only thing that
// needs the socket: everything else a session can call is the caller's business.
//
// `auto` answers the question with the session's own recommendation instead of
// waiting for a person. The question is still formed and still emitted, so the
// grill and the transcript are unchanged — only the wait is gone.
//
// Asking the same thing twice is answered from what the session was already told
// rather than put to the person again. A model that re-asks has lost the tool
// result — a context compaction, a dropped frame, a turn that restarted — and a
// second prompt for a decision already made reads as the grill going in circles.
// Sameness is judged on the header and the question, not on the options: a repeat
// is rarely retyped exactly, and matching only the exact wording let every
// reworded one through. Called once per session, so the two maps below are that
// session's memory.
export function createAskTool(opts: {
	pending: Map<string, PendingQuestion>;
	onQuestion: (payload: {
		questionId: string;
		questions: PlanQuestion[];
		autoAnswers?: PlanAnswer[];
	}) => void;
	auto?: boolean;
	onAnswered?: () => void;
}) {
	const settled = new Map<
		string,
		{ questions: PlanQuestion[]; answers: PlanAnswer[]; fingerprint: string }
	>();
	const inFlight = new Map<string, Promise<PlanAnswer[]>>();

	const emit = async (questions: PlanQuestion[]): Promise<PlanAnswer[]> => {
		const questionId = `q_${crypto.randomBytes(9).toString('base64url')}`;

		if (opts.auto) {
			const autoAnswers = recommendedAnswers(questions);

			opts.onQuestion({ questionId, questions, autoAnswers });

			return autoAnswers;
		}

		return new Promise<PlanAnswer[]>((resolve) => {
			opts.pending.set(questionId, { questionId, resolve });
			opts.onQuestion({ questionId, questions });
		});
	};

	return async function ask(args: unknown) {
		const { questions } = AskArgsSchema.parse(args);
		const key = topic(questions);
		const print = fingerprint(questions);
		const already = settled.get(key);

		if (already) {
			// A repeat with the options reworded is still the same decision, and the
			// person must not be asked it twice. Said back with the way out, because
			// the one case this gets wrong is a model that wrote two genuinely
			// different questions with identical text and put the difference only in
			// the options — it can re-ask, once the question itself says which.
			const reworded =
				already.fingerprint === print
					? 'Do not ask it again — carry on from here.'
					: 'The options differ this time but the question reads the same, so it is the same decision and the answer stands. If you meant a different one, ask again with what makes it different written into the question text itself — the pair, the plan numbers, the piece — not only in the options.';

			return textResult(
				`You already asked this and it was answered. The answer stands:\n${describeAnswers(
					already
				)}\n${reworded}`
			);
		}

		// Two calls for the same question in one turn are one question. Emitting the
		// second would put a duplicate prompt on the screen whose answer the model
		// never waits for, because the first tool call is the one it is blocked on.
		let waiting = inFlight.get(key);

		if (!waiting) {
			waiting = emit(questions);
			inFlight.set(key, waiting);
		}

		const answers = await waiting;

		inFlight.delete(key);

		// An empty answer is the MCP server closing over a question nobody could
		// answer, not a ruling. Remembering it would answer every later ask with
		// silence.
		if (answers.length > 0) {
			settled.set(key, { questions, answers, fingerprint: print });
			opts.onAnswered?.();
		}

		if (opts.auto) {
			// Said back to the session rather than left implicit: it has to know the
			// ruling was its own, because those are the ones the plan records as
			// decisions taken on the person's behalf.
			return textResult(
				`Auto mode: nobody was asked. Your own recommended option was taken as the answer.\n${describeAnswers(
					{ questions, answers }
				)}\nRecord it in the plan's key decisions as a call you made for them.`
			);
		}

		return textResult(describeAnswers({ questions, answers }));
	};
}

export function textToolResult(text: string, isError = false) {
	return textResult(text, isError);
}

async function handleRpc(opts: {
	message: {
		method?: string;
		params?: { name?: string; arguments?: unknown; protocolVersion?: string };
	};
	definitions: unknown[];
	dispatch: (name: string, args: unknown) => Promise<unknown>;
}): Promise<unknown> {
	const { message } = opts;

	if (message.method === 'initialize') {
		return {
			protocolVersion: message.params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
			capabilities: { tools: {} },
			serverInfo: { name: 'bosun', version: '1.0.0' }
		};
	}

	if (message.method === 'tools/list') {
		return { tools: opts.definitions };
	}

	if (message.method === 'tools/call') {
		try {
			return await opts.dispatch(message.params?.name ?? '', message.params?.arguments ?? {});
		} catch (error) {
			// Returned as a tool error rather than thrown as a protocol error, so the
			// model can read what went wrong and correct itself instead of the whole
			// session dying on a rejected write.
			return textResult(error instanceof Error ? error.message : 'tool failed', true);
		}
	}

	throw new Error(`unsupported method ${message.method}`);
}

// The config is written to a private file rather than passed on the command line.
// `/proc/<pid>/cmdline` is world-readable, so an inline `--mcp-config` would hand
// this session's bearer token — and any token in the user's own server config —
// to every other account on the box, which is exactly what the token exists to
// prevent.
function writeConfigFile(opts: { sessionId: string; config: unknown }): string {
	const configPath = path.join(
		os.tmpdir(),
		`bosun-mcp-${opts.sessionId}-${crypto.randomBytes(6).toString('hex')}.json`
	);

	fs.writeFileSync(configPath, JSON.stringify(opts.config), { mode: 0o600 });
	fs.chmodSync(configPath, 0o600);

	return configPath;
}

export interface PendingQuestions {
	pending: Map<string, PendingQuestion>;
}

// Built by the caller from `pending`, which is why the map is handed in rather
// than owned here: `bosun_ask` is a tool only some sessions are given.
export type SessionDispatchFactory = (
	pending: Map<string, PendingQuestion>
) => (name: string, args: unknown) => Promise<unknown>;

export async function startSessionMcpServer(opts: {
	sessionId: string;
	definitions: unknown[];
	createDispatch: SessionDispatchFactory;
	userServers?: Record<string, unknown>;
	log: (message: string) => void;
}): Promise<SessionMcpServer> {
	const pending = new Map<string, PendingQuestion>();
	const dispatch = opts.createDispatch(pending);
	// Loopback keeps this off the network, but every process on the box shares
	// loopback: without a secret, any local user could drive the session's tools.
	const token = crypto.randomBytes(24).toString('base64url');

	const server = http.createServer((req, res) => {
		void (async () => {
			if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${token}`) {
				res.writeHead(req.method === 'POST' ? 401 : 405).end();

				return;
			}

			let message: { jsonrpc?: string; id?: unknown; method?: string; params?: never };

			try {
				message = JSON.parse(await readBody(req)) as typeof message;
			} catch {
				res.writeHead(400).end();

				return;
			}

			// A notification carries no id and expects no response body.
			if (message.id === undefined) {
				res.writeHead(202).end();

				return;
			}

			let payload: unknown;

			try {
				payload = {
					jsonrpc: JSON_RPC,
					id: message.id,
					result: await handleRpc({ message, definitions: opts.definitions, dispatch })
				};
			} catch (error) {
				payload = {
					jsonrpc: JSON_RPC,
					id: message.id,
					error: { code: -32601, message: error instanceof Error ? error.message : 'error' }
				};
			}

			const json = JSON.stringify(payload);

			res.writeHead(200, {
				'content-type': 'application/json',
				'content-length': Buffer.byteLength(json)
			}).end(json);
		})();
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	opts.log(`mcp server for ${opts.sessionId} on 127.0.0.1:${port}`);

	const configPath = writeConfigFile({
		sessionId: opts.sessionId,
		config: {
			mcpServers: {
				...opts.userServers,
				bosun: {
					type: 'http',
					url: `http://127.0.0.1:${port}/mcp`,
					headers: { authorization: `Bearer ${token}` }
				}
			}
		}
	});

	return {
		configPath,

		answer(payload): boolean {
			const question = pending.get(payload.questionId);

			if (!question) {
				return false;
			}

			pending.delete(payload.questionId);
			question.resolve(z.array(PlanAnswerSchema).parse(payload.answers));

			return true;
		},

		async close(): Promise<void> {
			// The file holds this session's bearer token and whatever credentials the
			// user's own servers carry, so it does not outlive the session.
			fs.rmSync(configPath, { force: true });

			// A question still waiting has to be released or the `claude` process
			// blocks on a promise that can no longer be resolved and never exits.
			for (const [questionId, question] of pending) {
				pending.delete(questionId);
				question.resolve([]);
			}

			await new Promise<void>((resolve) => {
				server.close(() => {
					resolve();
				});
			});
		}
	};
}
