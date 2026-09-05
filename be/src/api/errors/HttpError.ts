export class HttpError extends Error {
	public readonly statusCode: number;

	constructor(statusCode: number, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'HttpError';
		this.statusCode = statusCode;
	}
}
