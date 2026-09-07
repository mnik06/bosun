// The body is markdown source, rendered as preformatted prose rather than parsed.
// Parsing it would mean a markdown dependency and an HTML sanitiser for text an
// agent wrote, and neither buys anything the reader of a plan actually needs.
export function MarkdownBlock ({ source }: { source: string }) {
	return <div className="whitespace-pre-wrap text-sm leading-relaxed">{source}</div>
}
