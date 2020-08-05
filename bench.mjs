import fs from 'fs';
import Delaunator from 'delaunator';
import Constrainautor from './Constrainautor.mjs';
import cdt2d from 'cdt2d';
import os from 'os';
import {RobustConstrainautor} from './validators.mjs';

const COUNT = 100;

function triangulateCdt2d(points, edges){
	cdt2d(points, edges);
}

function triangulateCon(points, edges){
	const del = Delaunator.from(points),
		con = new Constrainautor(del);
	con.constrainAll(edges);
}

function triangulateRobust(points, edges){
	const del = Delaunator.from(points),
		con = new RobustConstrainautor(del);
	con.constrainAll(edges);
}

function fmtTime(ns){
	return Number((ns / 1000n) | 0n);// + ' μs';
}

function median(arr){
	const half = (arr.length / 2) | 0;
	return arr.length % 2 ? (arr[half] + arr[half + 1]) / 2 : arr[half];
}

function benchOne(count, json, triangulate){
	if(json.error){
		return;
	}
	
	const points = json.points,
		edges = json.edges,
		times = [];
	
	// warmup
	triangulate(points, edges);
	triangulate(points, edges);
	
	for(let i = 0; i < count; i++){
		const start = process.hrtime.bigint();
		triangulate(points, edges);
		const end = process.hrtime.bigint();
		times.push(end - start);
	}
	
	times.sort((a, b) => a < b ? -1 : 1);
	return {
		min: fmtTime(times[0]),
		max: fmtTime(times[count - 1]),
		median: fmtTime(median(times)),
		mean: fmtTime(times.reduce((a, b) => a + b, 0n) / BigInt(times.length))
	};
}

function benchFiles(files, count, triangulate){
	const results = [];
	
	for(const file of files){
		const json = JSON.parse(fs.readFileSync(file, 'utf8'));
		if(!json.error){
			results.push({
				file,
				points: json.points.length,
				edges: json.edges.length,
				...benchOne(count, json, triangulate)
			});
		}
	}
	
	console.table(results);
}

const files = fs.readdirSync('./tests/', 'utf8').map(f => './tests/' + f)
		.concat(fs.readdirSync('./tests/ipa/', 'utf8').map(f => './tests/ipa/' + f))
		.filter(f => f.endsWith('.json'));

function main(args){
	args = args.length ? args : files;
	
	console.log("Benchmarked on", os.cpus()[0].model, "with",
			COUNT, "triangulations per file. Times in µs.");
	console.log("cdt2d");
	benchFiles(args, COUNT, triangulateCdt2d);
	console.log("Robust");
	benchFiles(args, COUNT, triangulateRobust);
	console.log("Constrainautor");
	benchFiles(args, COUNT, triangulateCon);
	
}

main(process.argv.slice(2));
