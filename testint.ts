import tape from 'tape';
import Constrainautor from './Constrainautor';
const {intersectSegments} = Constrainautor;

import type {Test} from 'tape';
type P2 = [number, number];
type P2x4 = [P2, P2, P2, P2];

const ints: [boolean, string, P2, P2, P2, P2][] = [
		[true,  ' + ',  [100,50], [100,150],[50,100], [150,100]], // +
		[false, '| -',  [100,50], [100,150],[150,100],[250,100]], // | -
		[false, ' ¦ ',  [100,50], [100,150],[100,200],[100,300]], // ¦
		[false, '- -',  [100,50], [200,50], [250,50], [350,50] ], // - -
		[false, '| |',  [50,50],  [50,150], [150,50], [150,150]], // | |
		[false, ' = ',  [50,50],  [150,50], [50,150], [150,150]], // =
		[true,  '-=-',  [50,50],  [150,50], [100,50], [200,50] ], // -- (overlapping)
		[true,  ' | ',  [50,50],  [50,150], [50,100], [50,200] ], // | (overlapping)
		[true,  '-=-',  [100,50], [200,50], [50,50],  [150,50] ], // -- (overlapping, switched)
		[true,  ' | ',  [50,100], [50,200], [50,50],  [50,150] ], // | (overlapping, switched)
		[true,  ' = ',  [50,50],  [250,50], [100,50], [200,50] ], // = (2 inside 1)
		[true,  ' = ',  [100,50], [200,50], [50,50],  [250,50] ], // = (1 inside 2)
		[true,  ' × ',  [50,50],  [150,150],[150,50], [50,150] ], // ×
		[false, ' \\ ', [50,50],  [150,150],[200,200],[300,300]], // \ 
		[false, ' / ',  [50,300], [150,200],[200,150],[300,50] ], // /
		[true,  ' \\ ', [50,50],  [150,150],[100,100],[200,200]], // \ (overlapping)
		[true,  ' / ',  [50,200], [150,100],[100,150],[200,50] ], // / (overlapping)
		[true,  ' \\ ', [100,100],[200,200],[50,50],  [150,150]], // \ (overlapping, switched)
		[true,  ' / ',  [100,150],[200,50], [50,200], [150,100]], // / (overlapping, switched)
		[true,  ' T ',  [50,50],  [250,50], [150,200],[150,50] ], // T
		[true , ' ⊥ ',  [50,200], [250,200],[150,200],[150,50] ], // ⊥
		[true,  '|- ',  [50,50],  [50,250], [50,150], [200,150]], // |-
		[true,  ' -|',  [250,50], [250,250],[250,150],[50,150] ], // -|
		[true,  ' T ',  [150,200],[150,50], [50,50],  [250,50] ], // T (switched)
		[true , ' ⊥ ',  [150,200],[150,50], [50,200], [250,200]], // ⊥ (switched)
		[true,  '|- ',  [50,150], [200,150],[50,50],  [50,250] ], // |- (switched)
		[true,  ' -|',  [50,150], [250,150],[250,50], [250,250]], // -| (switched)
		[true,  '---',  [50,50],  [150,50], [150,50], [250,50] ], // -- (touching)
		[true,  ' ¦ ',  [50,50],  [50,150], [50,150], [50,250] ], // ¦ (touching)
		[true,  ' \\ ', [50,50],  [150,150],[150,150],[250,250]], // \ (touching)
		[true,  ' / ',  [50,250], [150,150],[150,150],[250,50] ], // / (touching)
	],
	mogrifiers: {[key: string]: (pts: P2x4, ret: boolean) => [P2x4, boolean]} = {
		id: (pts, ret) => [pts, ret],
		// reverse p1 <-> p2
		rev12: ([p1, p2, p3, p4], ret) => [[p2, p1, p3, p4], ret],
		// reverse p3 <-> p4
		rev34: ([p1, p2, p3, p4], ret) => [[p1, p2, p4, p3], ret],
		// reverse both
		rev: (pts, ret) => mogrifiers.rev12(...mogrifiers.rev34(pts, ret)),
		// translate to -x
		subx: (pts, ret) => [pts.map(([x, y]) => [x - 400, y]) as P2x4, ret],
		// translate to -y
		suby: (pts, ret) => [pts.map(([x, y]) => [x, y - 400]) as P2x4, ret],
		// translate both to negative
		sub: (pts, ret) => mogrifiers.subx(...mogrifiers.suby(pts, ret)),
		// translate to x across 0
		crossx: (pts, ret) => [pts.map(([x, y]) => [x - 200, y]) as P2x4, ret],
		// translate to y across 0
		crossy: (pts, ret) => [pts.map(([x, y]) => [x, y - 200]) as P2x4, ret],
		// translate both across 0
		cross: (pts, ret) => mogrifiers.crossx(...mogrifiers.crossy(pts, ret)),
		// scale both by 1/1000
		down1k: (pts, ret) => [pts.map(([x, y]) => [x / 1000, y / 1000]) as P2x4, ret],
		// scale both by 1000
		up1k: (pts, ret) => [pts.map(([x, y]) => [x * 1000, y * 1000]) as P2x4, ret],
		// scale both by 1/1000000
		down1M: (pts, ret) => [pts.map(([x, y]) => [x / 1000000, y / 1000000]) as P2x4, ret],
		// scale both by 1000000
		up1M: (pts, ret) => [pts.map(([x, y]) => [x * 1000000, y * 1000000]) as P2x4, ret],
	};

function testIntersect(t: Test, pts: P2[], should: boolean){
	const [[p1x, p1y], [p2x, p2y], [p3x, p3y], [p4x, p4y]] = pts,
		ret = intersectSegments(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y);
	t.assert(ret === should, 
		`Intersect: [(${p1x},${p1y}), (${p2x},${p2y})] x [(${p3x},${p3y}), (${p4x},${p4y})] == ${should} (${ret})`);
}

function main(args: string[]){
	const intFns = [...Object.values(mogrifiers)];
	for(const int of ints){
		const [should, name, ...pts] = int;
		tape(name, (t: Test) => {
			t.plan(intFns.length);
			for(const fn of intFns){
				testIntersect(t, ...fn(pts, should));
			}
		});
	}
}

main(process.argv.slice(2));
