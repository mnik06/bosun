import crypto from 'crypto';
import http from 'http';
import { z } from 'zod';
import { type AgentConfig } from '../config';
import { PlanAnswerSchema, PlanQuestionSchema, type PlanAnswer, type PlanQuestion } from '../protocol';

const JSON_RPC = '2.0';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const MAX_BODY_BYTES = 1_000_000;

const AskArgsSchema = z.object({ questions: z.array(PlanQuestionSchema).min(1) });

const CreatePlanArgsSchema = z.object({ title: z.string().min(1), bodyMd: z.string().min(1) });

const AddAcArgsSchema = z.object({ code: z.string().min(1), text: z.string().min(1) });

const CreateSliceArgsSchema = z.object({
	ordinal: z.number().int().min(1),
	kind: z.enum(['build', 'verify']),
	title: z.string().min(1),
	bodyMd: z.string().optional(),
	acCodes: z.array(z.string().min(1))
});

const TOOL_DEFINITIONS = [
	{
		name: 'bosun_ask',
		description:
			'Ask the user one or more multiple-choice questions and block until they answer in the browser. This is the only way to ask the user anything — there is no terminal and no other channel. Every question needs a short header, the question itself, and 2-4 options with a one-line description each. The user may also type a free-text answer instead of picking an option.',
		inputSchema: {
			type: 'object',
			properties: {
				questions: {
					type: 'array',
					minItems: 1,
					items: {
						type: 'object',
						properties: {
							header: { type: 'string', description: 'Short label, max 12 characters' },
							question: { type: 'string' },
							options: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										label: { type: 'string' },
										description: { type: 'string' }
									},
									required: ['label', 'description']
								}
							},
							multiSelect: { type: 'boolean' }
						},
						required: ['header', 'question', 'options', 'multiSelect']
					}
				}
			},
			required: ['questions']
		}
	},
	{
		name: 'create_plan',
		description:
			'Publish the plan title and its markdown body. Call this once, before add_ac, and only after every question is resolved.',
		inputSchema: {
			type: 'object',
			properties: { title: { type: 'string' }, bodyMd: { type: 'string' } },
			required: ['title', 'bodyMd']
		}
	},
	{
		name: 'add_ac',
		description:
			'Add one acceptance criterion. Codes are AC-1, AC-2, ... in order. Every AC must later be claimed by exactly one tracer bullet.',
		inputSchema: {
			type: 'object',
			properties: { code: { type: 'string' }, text: { type: 'string' } },
			required: ['code', 'text']
		}
	},
	{
		name: 'create_slice',
		description:
			'Create one tracer bullet and claim the acceptance criteria it delivers. acCodes must name ACs that exist and that no other bullet has claimed.',
		inputSchema: {
			type: 'object',
			properties: {
				ordinal: { type: 'number' },
				kind: { type: 'string', enum: ['build', 'verify'] },
				title: { type: 'string' },
				bodyMd: { type: 'string' },
				acCodes: { type: 'array', items: { type: 'string' } }
			},
			required: ['ordinal', 'kind', 'title', 'acCodes']
		}
	}
];

interface PendingQuestion {
	questionId: string;
	resolve: (answers: PlanAnswer[]) => void;
}

export interface SessionMcpServer {
	config: string;
	answer(opts: { questionId: string; answers: PlanAnswer[] }): boolean;
	close(): Promise<void>;
}

function textResult(text: string, isError = false) {
	return { content: [{ type: 'text', text }], isError };
}

function describeAnswers(opts: { questions: PlanQuestion[]; answers: PlanAnswer[] }): string {
	return opts.questions
		.map((question, index) => {
			const selected = opts.answers[index]?.selected ?? [];

			return `${question.header}: ${selected.join(', ')}`;
		})
		.join('\n');
}

async function postToBosun(opts: {
	config: AgentConfig;
	path: string;
	body: unknown;
}): Promise<unknown> {
	const response = await fetch(new URL(opts.path, opts.config.serverUrl), {
		method: 'POST',
		headers: {
			authorization: `Bearer ${opts.config.machineKey}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(opts.body)
	});
	const payload: unknown = await response.json().catch(() => null);

	if (!response.ok) {
		const message = (payload as { message?: string } | null)?.message ?? `HTTP ${response.status}`;

		throw new Error(message);
	}

	return payload;
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

function createToolDispatcher(opts: {
	planId: string;
	config: AgentConfig;
	pending: Map<string, PendingQuestion>;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
}) {
	const base = `/agent/plans/${opts.planId}`;

	const ask = async (args: unknown) => {
		const { questions } = AskArgsSchema.parse(args);
		const questionId = `q_${crypto.randomBytes(9).toString('base64url')}`;
		const answers = await new Promise<PlanAnswer[]>((resolve) => {
			opts.pending.set(questionId, { questionId, resolve });
			opts.onQuestion({ questionId, questions });
		});

		return textResult(describeAnswers({ questions, answers }));
	};

	return async function dispatch(name: string, args: unknown) {
		if (name === 'bosun_ask') {
			return ask(args);
		}

		if (name === 'create_plan') {
			await postToBosun({ config: opts.config, path: `${base}/title`, body: CreatePlanArgsSchema.parse(args) });

			return textResult(opts.planId);
		}

		if (name === 'add_ac') {
			const created = await postToBosun({
				config: opts.config,
				path: `${base}/acs`,
				body: AddAcArgsSchema.parse(args)
			});

			return textResult(JSON.stringify(created));
		}

		if (name === 'create_slice') {
			const created = await postToBosun({
				config: opts.config,
				path: `${base}/slices`,
				body: CreateSliceArgsSchema.parse(args)
			});

			return textResult(JSON.stringify(created));
		}

		throw new Error(`unknown tool ${name}`);
	};
}

async function handleRpc(opts: {
	message: { method?: string; id?: unknown; params?: { name?: string; arguments?: unknown; protocolVersion?: string } };
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
		return { tools: TOOL_DEFINITIONS };
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

export async function startSessionMcpServer(opts: {
	planId: string;
	config: AgentConfig;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
	log: (message: string) => void;
}): Promise<SessionMcpServer> {
	const pending = new Map<string, PendingQuestion>();
	const dispatch = createToolDispatcher({ ...opts, pending });
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
				payload = { jsonrpc: JSON_RPC, id: message.id, result: await handleRpc({ message, dispatch }) };
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

	opts.log(`mcp server for ${opts.planId} on 127.0.0.1:${port}`);

	return {
		config: JSON.stringify({
			mcpServers: {
				bosun: {
					type: 'http',
					url: `http://127.0.0.1:${port}/mcp`,
					headers: { authorization: `Bearer ${token}` }
				}
			}
		}),

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
