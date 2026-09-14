export class HttpError extends Error {
	public readonly statusCode: number;
	// Extra fields sent beside the message, for a refusal the client acts on field
	// by field — a config that failed validation names every issue, not the first.
	public readonly details: Record<string, unknown> | undefined;

	constructor(
		statusCode: number,
		message: string,
		options?: { cause?: unknown; details?: Record<string, unknown> }
	) {
		super(message, options);
		this.name = 'HttpError';
		this.statusCode = statusCode;
		this.details = options?.details;
	}
}
