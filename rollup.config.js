import {terser} from 'rollup-plugin-terser';

function config(name){
	return [
		{
			input: name + '.mjs',
			output: {
				name,
				format: 'umd',
				file: name + '.js'
			}
		},
		{
			input: name + '.mjs',
			output: {
				name,
				format: 'umd',
				file: name + '.min.js'
			},
			plugins: [terser()]
		}
	];
}

export default [
    ...config('Constrainautor')
];