import { createTheme, type MantineColorsTuple } from '@mantine/core'

// Mantine's stock dark scheme puts the page at #242424 and surfaces at #2e2e2e,
// which reads as charcoal rather than dark. Shades 4-9 are pulled down so the
// page is near-black and a card separates from it by shade alone; 0-3 stay
// bright enough that body text and `c="dimmed"` survive the darker ground.
const dark: MantineColorsTuple = [
	'#c9c9c9',
	'#b8b8b8',
	'#8d8e94',
	'#5f6066',
	'#33343a',
	'#26272c',
	'#1b1c20',
	'#141518',
	'#0f1013',
	'#0a0a0c'
]

export const theme = createTheme({
	primaryColor: 'blue',
	autoContrast: true,
	colors: { dark },
	fontFamily: 'var(--font-sans)',
	fontFamilyMonospace: 'var(--font-mono)',
	headings: {
		fontFamily: 'var(--font-sans)',
		fontWeight: '600'
	},
	defaultRadius: 'md'
})

export default theme
