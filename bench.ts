import Delaunator from 'delaunator';
import Constrainautor from './Constrainautor';
import cdt2d from 'cdt2d';
import os from 'os';
import {loadTests} from './delaunaytests/loader';

const COUNT = 100;

type P2 = [number, number];
type Triangulator = (points: P2[], edges: P2[]) => void

function triangulateCdt2d(points: P2[], edges: P2[]){
	cdt2d(points, edges);
}

function triangulateCon(points: P2[], edges: P2[]){
	const del = Delaunator.from(points),
		con = new Constrainautor(del);
	con.constrainAll(edges);
}

export function fmtTime(ns: number | bigint){
	return Number((BigInt(ns) / 1000n) | 0n);// + ' μs';
}

export function median(arr: number[] | bigint[]){
	const half = (arr.length / 2) | 0;
	return arr.length % 2 ? (BigInt(arr[half]) + BigInt(arr[half + 1])) / 2n : arr[half];
}

export function summarizeTimes(times: bigint[]){
	times.sort((a, b) => a < b ? -1 : 1);
	return {
		min: fmtTime(times[0]),
		max: fmtTime(times[times.length - 1]),
		median: fmtTime(median(times)),
		mean: fmtTime(times.reduce((a, b) => a + b, 0n) / BigInt(times.length))
	};
}

function benchOne(count: number, json: {points: P2[], edges: P2[], error?: string}, triangulate: Triangulator){
	if(json.error){
		return;
	}
	
	const points = json.points,
		edges = json.edges,
		times: bigint[] = [];
	
	// warmup
	triangulate(points, edges);
	triangulate(points, edges);
	
	for(let i = 0; i < count; i++){
		const start = process.hrtime.bigint();
		triangulate(points, edges);
		const end = process.hrtime.bigint();
		times.push(end - start);
	}
	
	return summarizeTimes(times);
}

function benchFiles(files: ReturnType<typeof loadTests>, count: number, triangulate: Triangulator){
	const results = [];
	
	for(const json of files){
		//const json = JSON.parse(fs.readFileSync(file, 'utf8'));
		if(!json.error){
			results.push({
				name: json.name,
				points: json.points.length,
				edges: json.edges.length,
				...benchOne(count, json, triangulate)
			});
		}
	}
	
	console.table(results);
}

function main(args: string[]){
	const files = loadTests(false);

	//args = args.length ? args : files;
	
	console.log("Benchmarked on", os.cpus()[0].model, "with",
			COUNT, "triangulations per file. Times in µs.");
	//console.log("cdt2d");
	//benchFiles(files, COUNT, triangulateCdt2d);
	console.log("Constrainautor");
	benchFiles(files, COUNT, triangulateCon);
	
}

main(process.argv.slice(2));
