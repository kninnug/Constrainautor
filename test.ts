import tape from 'tape';
import Constrainautor from './Constrainautor';
import Delaunator from 'delaunator';
import {validateDelaunator, validateVertMap, validateConstraint, validateFlips, validateAllConstraints, validateDelaunay} from './validators';
import {loadTests} from './delaunaytests/loader';

import type {Test} from 'tape';
import type {TestFile} from './delaunaytests/loader';

const testFiles = loadTests(true);

type P2 = [number, number];

function testFile(t: Test, test: TestFile){
	const {points, edges, error} = test,
		del = Delaunator.from(points),
		con = new Constrainautor(del);
	
	t.comment(`pre-constrainment`);
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, true);
    // pre-delaunify since Delaunator may miss some edge cases
    con.delaunify(true, true);
    //validateDelaunay(t, con);
	
	let caught: Error | null = null;
	for(const [p1, p2] of edges){
		let ret: number | undefined = undefined;
		try{
			ret = con.constrainOne(p1, p2);
		}catch(ex){
			if(!error){
				throw ex;
			}
			caught = ex as Error;
		}
		
		if(ret !== undefined){
			validateConstraint(t, points, con, ret, p1, p2);
		}
	}
	
	if(error){
		t.equal(caught && caught.message, error, `threw expected error: ${error}`);
	}else{
		t.assert(!caught, "did not throw");
	}
	
	t.comment(`post-constrainment, pre-delaunify`);
	// The internal structures must be consistent, even in case of an error
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, false);
	
	t.comment(`shallow delaunify`);
	con.delaunify();
	validateFlips(t, con, false);
	
	t.comment(`deep delaunify`);
	con.delaunify(true);
	validateFlips(t, con, true);
    validateDelaunay(t, con);
	
	if(!error){
		t.comment(`post delaunify constraints`);
		validateAllConstraints(t, points, edges, con);
	}
	
	t.end();
}

function testConstructor(t: Test){
	// @ts-ignore
	t.throws(() => new Constrainautor(), /Expected an object with Delaunator output/, "throws on no argument");
	// @ts-ignore
	t.throws(() => new Constrainautor({}), /Expected an object with Delaunator output/, "throws on empty object");
	// @ts-ignore
	t.throws(() => new Constrainautor({foo: 12}), /Expected an object with Delaunator output/, "throws on invalid object");
	// @ts-ignore
	t.throws(() => new Constrainautor({triangles: [1], halfedges: [1], coords: [1, 2]}),
			/Delaunator output appears inconsistent/, "throws on inconsistent Delaunation");
	// @ts-ignore
	t.throws(() => new Constrainautor({triangles: [1, 2, 3], halfedges: [1], coords: [1, 2]}),
			/Delaunator output appears inconsistent/, "throws on inconsistent Delaunation");
	// @ts-ignore
	t.throws(() => new Constrainautor({triangles: [1, 2, 3], halfedges: [0, 1, 2], coords: [1]}),
			/Delaunator output appears inconsistent/, "throws on inconsistent Delaunation");
	// @ts-ignore
	t.throws(() => new Constrainautor({triangles: [], halfedges: [], coords: [1, 2]}),
			/No edges in triangulation/, "throws on empty Delaunation");
	t.end();
}

function testExample(t: Test){
	const points: P2[] = [[150, 50], [50, 200], [150, 350], [250, 200]],
		del = Delaunator.from(points),
		con = new Constrainautor(del);
	
	con.constrainAll([[0, 2]]);
	
	validateConstraint(t, points, con, undefined, 0, 2);
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, true);
	t.end();
}

function main(args: string[]){
	if(!args.length){
		tape("Example", testExample);
		tape("Constructor", testConstructor);
	}

	for(const test of testFiles){
		tape(test.name, (t) => testFile(t, test));
	}
}

main(process.argv.slice(2));
