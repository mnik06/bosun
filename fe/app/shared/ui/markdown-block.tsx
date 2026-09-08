import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Rendered rather than shown as source: a plan body is a document somebody reads
// to decide whether to build it, and reading it as raw markdown puts every hash
// and backtick between them and the sentence. `remark-gfm` is here for the
// tables and task lists plans routinely carry, and both they and code blocks
// scroll inside themselves so a long line cannot widen the pane.
const PROSE = [
	'text-sm leading-relaxed',
	'[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold',
	'[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold',
	'[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-base [&_h3]:font-semibold',
	'[&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:font-semibold',
	'[&_p]:my-2',
	'[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
	'[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
	'[&_li]:my-1',
	'[&_code]:font-mono [&_code]:text-[0.85em]',
	'[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--mantine-color-default)] [&_pre]:p-3',
	'[&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto',
	'[&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold',
	'[&_td]:pr-4 [&_td]:align-top',
	'[&_a]:text-[var(--mantine-color-anchor)] [&_a]:underline',
	'[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--mantine-color-default-border)] [&_blockquote]:pl-3',
	'[&_hr]:my-4 [&_hr]:border-[var(--mantine-color-default-border)]',
	'[&_strong]:font-semibold'
].join(' ')

export function MarkdownBlock ({ source }: { source: string }) {
	return (
		<div className={PROSE}>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
		</div>
	)
}
