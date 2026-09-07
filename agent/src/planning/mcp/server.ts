import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import {
	AddAcArgsSchema,
	AskArgsSchema,
	CreatePlanArgsSchema,
	CreateSliceArgsSchema,
	TOOL_DEFINITIONS
} from './tools';
import { PlanAnswerSchema, type PlanAnswer, type PlanQuestion } from '../../protocol';
import { type BosunApiService } from '../../services/bosun-api.service';

const JSON_RPC = '2.0';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const MAX_BODY_BYTES = 1_000_000;

interface PendingQuestion {
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

function createToolDispatcher(opts: {
	planId: string;
	bosunApi: BosunApiService;
	pending: Map<string, PendingQuestion>;
	onQuestion: (payload: { questionId: string; questions: PlanQuestion[] }) => void;
}) {
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
			await opts.bosunApi.savePlanTitle({ planId: opts.planId, ...CreatePlanArgsSchema.parse(args) });

			return textResult(opts.planId);
		}

		if (name === 'add_ac') {
			const created = await opts.bosunApi.addPlanAc({
				planId: opts.planId,
				...AddAcArgsSchema.parse(args)
			});

			return textResult(JSON.stringify(created));
		}

		if (name === 'create_slice') {
			const created = await opts.bosunApi.createPlanSlice({
				planId: opts.planId,
				slice: CreateSliceArgsSchema.parse(args)
			});

			return textResult(JSON.stringify(created));
		}

		throw new Error(`unknown tool ${name}`);
	};
}

async function handleRpc(opts: {
	message: {
		method?: string;
		params?: { name?: string; arguments?: unknown; protocolVersion?: string };
	};
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

// The config is written to a private file rather than passed on the command line.
// `/proc/<pid>/cmdline` is world-readable, so an inline `--mcp-config` would hand
// this session's bearer token — and any token in the user's own server config —
// to every other account on the box, which is exactly what the token exists to
// prevent.
function writeConfigFile(opts: { planId: string; config: unknown }): string {
	const configPath = path.join(
		os.tmpdir(),
		`bosun-mcp-${opts.planId}-${crypto.randomBytes(6).toString('hex')}.json`
	);

	fs.writeFileSync(configPath, JSON.stringify(opts.config), { mode: 0o600 });
	fs.chmodSync(configPath, 0o600);

	return configPath;
}

export async function startSessionMcpServer(opts: {
	planId: string;
	bosunApi: BosunApiService;
	userServers?: Record<string, unknown>;
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
				payload = {
					jsonrpc: JSON_RPC,
					id: message.id,
					result: await handleRpc({ message, dispatch })
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

	opts.log(`mcp server for ${opts.planId} on 127.0.0.1:${port}`);

	const configPath = writeConfigFile({
		planId: opts.planId,
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
