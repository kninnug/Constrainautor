import {terser} from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';

function config(name){
	return [
		{
			input: name + '.mjs',
			output: {
				name,
				format: 'umd',
				file: name + '.js'
			},
			plugins: [resolve()]
		},
		{
			input: name + '.mjs',
			output: {
				name,
				format: 'umd',
				file: name + '.min.js'
			},
			plugins: [resolve(), terser()]
		}
	];
}

export default [
    ...config('Constrainautor')
];