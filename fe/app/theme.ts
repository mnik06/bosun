import { createTheme } from '@mantine/core'

export const theme = createTheme({
	primaryColor: 'blue',
	autoContrast: true,
	fontFamily: 'var(--font-sans)',
	fontFamilyMonospace: 'var(--font-mono)',
	headings: {
		fontFamily: 'var(--font-sans)',
		fontWeight: '600'
	},
	defaultRadius: 'md'
})

export default theme
