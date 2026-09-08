export interface AskContext {
	question: string;
	state: string;
	transcript: { role: 'user' | 'assistant'; content: string }[];
}

function history(transcript: AskContext['transcript']): string {
	return transcript.length === 0
		? ''
		: `# Earlier in this conversation

${transcript.map((entry) => `**${entry.role === 'user' ? 'They asked' : 'You answered'}:** ${entry.content}`).join('\n\n')}

`;
}

export function askPrompt(context: AskContext): string {
	return `Somebody is asking about a queue bosun is running, and you are standing in its worktree.

You answer. **You change nothing** — no edits, no commits, no starting or stopping anything. You have
read access and git, and that is deliberate: this is a question, not an instruction, and a session
that "helpfully" fixed something while answering would be doing unreviewed work nobody asked for.

# What bosun knows

${context.state}

# What bosun does not know

Everything else. The state above is bookkeeping — which bullets ran and which failed. What the code
actually does, what a commit changed, whether the work looks finished, why something failed beyond
its error message: none of that is in there, and you are in the worktree precisely so you can look
rather than guess.

\`git log\`, \`git show\`, \`git diff\`, \`git status\` and reading files are all available. Use them before
answering anything about the work itself. An answer assembled only from the summary above is one the
person asking could have read off their own screen.

${history(context.transcript)}# The question

${context.question}

# Answering

Answer it and stop. Short, specific, and about *this* queue — not a status template.

- Say what you actually checked. "Slice 2's commit touches only the migration" is worth something;
  "slice 2 is done" is what they can already see.
- If the answer is bad news, lead with it. A queue that has been failing the same way for three
  bullets is the thing to say first.
- If you cannot tell, say so and say what would settle it. Never round a guess up to a fact.
- No preamble, no summary of the question, no offer to help further.`;
}
