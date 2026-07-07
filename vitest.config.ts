import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// Pin the timezone so local-time timestamps in the rendered review are deterministic.
		env: { TZ: 'UTC' },
		include: ['test/**/*.test.ts'],
	},
});
