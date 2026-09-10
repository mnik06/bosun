// Plans are referred to by number everywhere — in prompts, in blocker lists and
// out loud — because a nanoid is not something anyone can read back to you.
export function planLabel (plan: { number: number, title: string | null }): string {
	return plan.title === null ? `#${plan.number}` : `#${plan.number} ${plan.title}`
}
