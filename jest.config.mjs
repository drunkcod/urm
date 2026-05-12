const ignorePatterns = (...paths) => ({
	testPathIgnorePatterns: ['lib', ...paths],
	transformIgnorePatterns: ['node_modules', ...paths],
});

export default {
	verbose: true,
	...ignorePatterns(),
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^(\\.\\.?\\/.+)\\.js$': '$1',
	},
	transform: {
		'^.+\\.[tj]s$': '@swc/jest',
	},
};
