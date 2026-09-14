import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ExecService } from './exec.service';
import {
	defaultSessionLimit,
	getMemoryService,
	memoryEventsPath,
	parseMeminfo,
	parseOomKills,
	previousExitResult,
	scopedCommand,
	scopeUnitFor,
	unitFromCgroup
} from './memory.service';

const GIB = 1024 ** 3;

const MEMINFO = [
	'MemTotal:        7932216 kB',
	'MemFree:          123456 kB',
	'MemAvailable:    6485328 kB',
	'SwapTotal:             0 kB'
].join('\n');

describe('parseMeminfo', () => {
	it('reads total, available and swap in bytes', () => {
		expect(parseMeminfo(MEMINFO)).toEqual({
			totalBytes: 7932216 * 1024,
			availableBytes: 6485328 * 1024,
			swapTotalBytes: 0
		});
	});

	it('refuses a file without the totals a budget is made from', () => {
		expect(parseMeminfo('SwapTotal:             0 kB')).toBeNull();
	});
});

describe('defaultSessionLimit', () => {
	it('keeps the reserve back and counts swap at half', () => {
		expect(defaultSessionLimit({ totalBytes: 8 * GIB, swapTotalBytes: 4 * GIB })).toBe(8.5 * GIB);
	});

	// A limit of nothing is a session the kernel kills on its first allocation,
	// which reads as a bullet that cannot start rather than a machine too small.
	it('never hands a session less than a gigabyte', () => {
		expect(defaultSessionLimit({ totalBytes: GIB, swapTotalBytes: 0 })).toBe(GIB);
	});
});

// Copied from the journal of the machine this was built for, the morning a
// verify bullet ran it out of memory.
const OOM_RESTART = [
	'Started bosun-agent.service - Bosun agent.',
	'connected to https://bosun-be.fly.dev',
	'mcp server for sr_rtt_P-KaXCk5 on 127.0.0.1:41997',
	'bosun-agent.service: The kernel OOM killer killed some processes in this unit.',
	"bosun-agent.service: Failed with result 'oom-kill'.",
	'bosun-agent.service: Consumed 55min 45.762s CPU time over 42min 16.859s wall clock time, 6.3G memory peak.',
	'bosun-agent.service: Scheduled restart job, restart counter is at 12.',
	'Started bosun-agent.service - Bosun agent.',
	'connected to https://bosun-be.fly.dev'
].join('\n');

describe('previousExitResult', () => {
	it('names the result the previous process ended with', () => {
		expect(previousExitResult(OOM_RESTART)).toBe('oom-kill');
	});

	// An old failure is not this restart's reason. Reporting it would blame every
	// later `systemctl restart` on a kill that was already accounted for.
	it('says nothing for a restart that did not fail', () => {
		const journal = [
			OOM_RESTART,
			'Stopping bosun-agent.service - Bosun agent...',
			'Stopped bosun-agent.service - Bosun agent.',
			'Started bosun-agent.service - Bosun agent.'
		].join('\n');

		expect(previousExitResult(journal)).toBeNull();
	});

	it('says nothing on a first start', () => {
		expect(previousExitResult('Started bosun-agent.service - Bosun agent.')).toBeNull();
	});
});

describe('memoryEventsPath', () => {
	it("reads the scope's own counter", () => {
		expect(
			memoryEventsPath({
				cgroup: '0::/user.slice/user-1002.slice/user@1002.service/app.slice/bosun-run-sr_1.scope\n',
				unit: 'bosun-run-sr_1'
			})
		).toBe(
			'/sys/fs/cgroup/user.slice/user-1002.slice/user@1002.service/app.slice/bosun-run-sr_1.scope/memory.events'
		);
	});

	// Read in the instant before `systemd-run` moves the process, the cgroup is the
	// agent's own unit, and caching that path would count kills from other bullets.
	it('refuses a cgroup that is not the scope yet', () => {
		expect(
			memoryEventsPath({
				cgroup: '0::/user.slice/user-1002.slice/user@1002.service/app.slice/bosun-agent.service\n',
				unit: 'bosun-run-sr_1'
			})
		).toBeNull();
	});
});

describe('parseOomKills', () => {
	it('reads the kill count and nothing that merely starts like it', () => {
		expect(parseOomKills('low 0\nhigh 0\nmax 12\noom 3\noom_kill 2\noom_group_kill 0\n')).toBe(2);
	});
});

describe('unitFromCgroup', () => {
	it('finds the service the agent runs as', () => {
		expect(
			unitFromCgroup('0::/user.slice/user-1002.slice/user@1002.service/app.slice/bosun-agent.service')
		).toBe('bosun-agent.service');
	});

	it('finds nothing for an agent run by hand in a login session', () => {
		expect(unitFromCgroup('0::/user.slice/user-501.slice/session-3.scope')).toBeNull();
	});
});

describe('scopeUnitFor', () => {
	it('keeps a run id that is already a valid unit name', () => {
		expect(scopeUnitFor('sr_rtt_P-KaXCk5')).toBe('bosun-run-sr_rtt_P-KaXCk5');
	});

	it('replaces what systemd would refuse', () => {
		expect(scopeUnitFor('sr/1 x')).toBe('bosun-run-sr_1_x');
	});
});

describe('scopedCommand', () => {
	it('runs the command under its own limit without stopping it for a child that runs out', () => {
		const { command, args } = scopedCommand({
			scope: { unit: 'bosun-run-sr_1', memoryMaxBytes: 3 * GIB },
			command: 'claude',
			args: ['--print']
		});

		expect(command).toBe('systemd-run');
		expect(args).toEqual(
			expect.arrayContaining(['--user', '--scope', '--unit=bosun-run-sr_1', `MemoryMax=${3 * GIB}`, 'OOMPolicy=continue'])
		);
		expect(args.slice(-3)).toEqual(['--', 'claude', '--print']);
	});
});

describe('getMemoryService', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function service(opts: { probeOk: boolean; platform?: NodeJS.Platform }) {
		const exec = {
			run: vi.fn().mockResolvedValue({
				ok: opts.probeOk,
				stdout: '',
				stderr: '',
				reason: 'Failed to connect to bus'
			})
		} as unknown as ExecService;

		return {
			exec,
			memory: getMemoryService({
				exec,
				env: {},
				platform: opts.platform ?? 'linux',
				readFile: () => MEMINFO
			})
		};
	}

	it('gives a bullet the limit the backend chose', async () => {
		const { memory } = service({ probeOk: true });

		await memory.load();

		expect(memory.sessionScope({ runId: 'sr_1', memoryMaxBytes: 3 * GIB })).toEqual({
			unit: 'bosun-run-sr_1',
			memoryMaxBytes: 3 * GIB
		});
	});

	// A backend older than memory budgets sends no limit. The scope is still what
	// keeps one bullet's kill from reaching the agent, so it is kept, under what
	// the machine can spare.
	it('falls back to what the machine can spare when the backend sent no limit', async () => {
		const { memory } = service({ probeOk: true });

		await memory.load();

		expect(memory.sessionScope({ runId: 'sr_1', memoryMaxBytes: null })?.memoryMaxBytes).toBe(
			defaultSessionLimit({ totalBytes: 7932216 * 1024, swapTotalBytes: 0 })
		);
	});

	it('runs a bullet unscoped where systemd cannot scope it', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { memory } = service({ probeOk: false });

		await memory.load();

		expect(memory.sessionScope({ runId: 'sr_1', memoryMaxBytes: 3 * GIB })).toBeNull();
		expect(memory.report()?.sessionLimits).toBe(false);
	});

	it('measures nothing and probes nothing off Linux', async () => {
		const { memory, exec } = service({ probeOk: true, platform: 'darwin' });

		await memory.load();

		expect(exec.run).not.toHaveBeenCalled();
		expect(memory.report()).toBeUndefined();
		expect(memory.sessionScope({ runId: 'sr_1', memoryMaxBytes: 3 * GIB })).toBeNull();
	});
});
