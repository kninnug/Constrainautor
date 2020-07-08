import tape from 'tape';
import Constrainautor from './Constrainautor.mjs';
const {intersectSegments, segPointDistSq} = Constrainautor;

const ints = [
		[true,  ' + ',  [100,50],[100,150],[50,100], [150,100]], // +
		[false, '| -',  [100,50],[100,150],[150,100],[250,100]], // | -
		[false, ' ¦ ',  [100,50],[100,150],[100,200],[100,300]], // ¦
		[false, '- -',  [100,50],[200,50], [250,50], [350,50]],  // - -
		[false, '| |',  [50,50], [50,150], [150,50], [150,150]], // | |
		[false, ' = ',  [50,50], [150,50], [50,150], [150,150]], // =
		[true,  '-=-',  [50,50], [150,50], [100,50], [200,50]],  // -- (overlapping)
		[true,  ' | ',  [50,50], [50,150], [50,100], [50,200]],  // | (overlapping)
		[true,  ' × ',  [50,50], [150,150],[150,50], [50,150]],  // ×
		[false, ' \\ ', [50,50], [150,150],[200,200],[300,300]], // \ 
		[false, ' / ',  [50,300],[150,200],[200,150],[300,50]],  // /
		[true,  ' \\ ', [50,50], [150,150],[100,100],[200,200]], // \ (overlapping)
		[true,  ' / ',  [50,200],[150,100],[100,150],[200,50]],  // / (overlapping)
		[true,  ' T ',  [50,50], [250,50], [150,200],[150,50]],  // T
		[true,  ' ⊥ ',  [50,200],[250,200],[150,200],[150,50]],  // ⊥
		[true,  '|- ',  [50,50], [50,250], [50,150], [200,150]], // |-
		[true,  ' -|',  [250,50],[250,250],[250,150],[50,150]],  // -|
		[true,  '---',  [50,50], [150,50], [150,50], [250,50]],  // -- (touching)
		[true,  ' ¦ ',  [50,50], [50,150], [50,150], [50,250]],  // ¦ (touching)
		[true,  ' \\ ', [50,50], [150,150],[150,150],[250,250]], // \ (touching)
		[true,  ' / ',  [50,250],[150,150],[150,150],[250,50]],  // / (touching)
	],
	mogrifiers = {
		// reverse p1 <-> p2
		rev12: ([p1, p2, p3, p4]) => [p2, p1, p3, p4],
		// reverse p3 <-> p4
		rev34: ([p1, p2, p3, p4]) => [p1, p2, p4, p3],
		// reverse both
		rev: (pts) => mogrifiers.rev12(mogrifiers.rev34(pts)),
		// translate to -x
		subx: (pts) => pts.map(([x, y]) => [x - 400, y]),
		// translate to -y
		suby: (pts) => pts.map(([x, y]) => [x, y - 400]),
		// translate both to negative
		sub: (pts) => mogrifiers.subx(mogrifiers.suby(pts)),
		// translate to x across 0
		crossx: (pts) => pts.map(([x, y]) => [x - 200, y]),
		// translate to y across 0
		crossy: (pts) => pts.map(([x, y]) => [x, y - 200]),
		// translate both across 0
		cross: (pts) => mogrifiers.crossx(mogrifiers.crossy(pts)),
		// scale both by 1/1000
		down10k: (pts) => pts.map(([x, y]) => [x / 1000, y / 1000]),
		// scale both by 1000
		up10k: (pts) => pts.map(([x, y]) => [x * 1000, y * 1000]),
		// scale both by 1/100000
		down1M: (pts) => pts.map(([x, y]) => [x / 100000, y / 100000]),
		// scale both by 100000
		up1M: (pts) => pts.map(([x, y]) => [x * 100000, y * 100000]),
	},
	nears = [
		[0, [100, 50], [100, 50], [100, 150]],
		[0, [100, 150], [100, 50], [100, 150]],
		[0, [50, 100], [50, 100], [150, 100]],
		[0, [150, 100], [50, 100], [150, 100]],
		[10, [100, 40], [100, 50], [100, 150]],
		[10, [100, 160], [100, 50], [100, 150]],
		[10, [40, 100], [50, 100], [150, 100]],
		[10, [160, 100], [50, 100], [150, 100]],
		[0, [100, 60], [100, 50], [100, 150]],
		[0, [100, 140], [100, 50], [100, 150]],
		[0, [60, 100], [50, 100], [150, 100]],
		[0, [140, 100], [50, 100], [150, 100]],
		[20, [80, 50], [100, 50], [100, 150]],
		[20, [80, 150], [100, 50], [100, 150]],
		[20, [50, 80], [50, 100], [150, 100]],
		[20, [150, 80], [50, 100], [150, 100]],
		[30, [130, 50], [100, 50], [100, 150]],
		[30, [130, 150], [100, 50], [100, 150]],
		[30, [50, 130], [50, 100], [150, 100]],
		[30, [150, 130], [50, 100], [150, 100]],
		[40, [140, 90], [100, 50], [100, 150]],
		[40, [140, 110], [100, 50], [100, 150]],
		[40, [90, 140], [50, 100], [150, 100]],
		[40, [110, 140], [50, 100], [150, 100]],
		[50, [50, 90], [100, 50], [100, 150]],
		[50, [50, 110], [100, 50], [100, 150]],
		[50, [90, 50], [50, 100], [150, 100]],
		[50, [110, 50], [50, 100], [150, 100]],
	];

function testIntersect(t, pts, should){
	const [[p1x, p1y], [p2x, p2y], [p3x, p3y], [p4x, p4y]] = pts;
	t.equal(intersectSegments(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y), should, 
		`Intersect: [(${p1x},${p1y}), (${p2x},${p2y})] x [(${p3x},${p3y}), (${p4x},${p4y})] == ${should}`);
}

function testNearPoint(t, pts, dist){
	const [[px, py], [p1x, p1y], [p2x, p2y]] = pts;
	t.equal(segPointDistSq(p1x, p1y, p2x, p2y, px, py), dist,
		`Dist²: (${px}, ${py}) - [(${p1x}, ${p1y}), (${p2x}, ${p2y})] == ${dist}`);
}

function main(args){
	const intFns = [...Object.values(mogrifiers)];
	for(const int of ints){
		const [should, name, ...pts] = int;
		tape.test(name, (t) => {
			t.plan(intFns.length);
			for(const fn of intFns){
				testIntersect(t, fn(pts), should);
			}
		});
	}
	
	tape.test('Distance to nearest point on segment', (t) => {
		t.plan(nears.length);
		for(const near of nears){
			const [dist, ...pts] = near;
			testNearPoint(t, pts, dist * dist);
		}
	});
}

main(process.argv.slice(2));
