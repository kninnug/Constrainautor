import {terser} from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import * as path from 'path';

function build(name){
    return [
        {
            input: `${name}.ts`,
            output: {
                name,
                format: 'es',
                file: `lib/${name}.mjs`
            },
            external: ['robust-predicates'],
            plugins: [typescript()]
        },
        {
            input: `lib/${name}.mjs`, // typescript & resolve don't play well together
            output: {
                name,
                format: 'commonjs',
                file: `lib/${name}.cjs`,
                exports: 'default'
            },
            plugins: [typescript(), resolve()]
        },
        {
            input: `lib/${name}.mjs`,
            output: {
                name,
                format: 'umd',
                file: `lib/${name}.js`
            },
            plugins: [commonjs(), resolve()]
        },
        {
            input: `lib/${name}.mjs`,
            output: {
                name,
                format: 'umd',
                file: `lib/${name}.min.js`
            },
            plugins: [resolve(), commonjs(), terser()]
        }
    ];
}

function test(name){
    return [
        {
            input: `${name}.ts`,
            output: {
                name,
                format: 'es',
                file: `test/${name}.mjs`
            },
            external: ['robust-predicates', 'robust-segment-intersect', 'tape', 'delaunator'],
            plugins: [replace({
                preventAssignment: true,
                values: {
                    'import.meta.url': function(file){
                        return JSON.stringify('file://' + file.replace(path.sep, '/'));
                    }
                }
            }), typescript(), commonjs()]
        }
    ]
}

export default [
    ...build('Constrainautor'),
    ...test('test'),
    ...test('testint'),
    ...test('bench')
];
