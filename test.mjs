import tape from 'tape';
import Constrainautor from './Constrainautor.mjs';
import Delaunator from 'delaunator';
import {validateDelaunator, validateVertMap, validateConstraint, validateFlips} from './validators.mjs';
import {loadTests} from './delaunaytests/loader.mjs';
	
const testFiles = loadTests(true);

function testFile(t, test){
	const {points, edges, error} = test,
		del = Delaunator.from(points),
		con = new Constrainautor(del);
	
	t.comment(`pre-constrainment`);
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, true);
	
	let caught = null;
	for(const [p1, p2] of edges){
		let ret = undefined;
		try{
			ret = con.constrainOne(p1, p2);
		}catch(ex){
			if(!error){
				throw ex;
			}
			caught = ex;
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
	
	t.end();
}

function testConstructor(t){
	t.throws(() => new Constrainautor(), /Expected an object with Delaunator output/, "throws on no argument");
	t.throws(() => new Constrainautor({}), /Expected an object with Delaunator output/, "throws on empty object");
	t.throws(() => new Constrainautor({foo: 12}), /Expected an object with Delaunator output/, "throws on invalid object");
	t.throws(() => new Constrainautor({triangles: [1], halfedges: [1], coords: [1, 2]}),
			/Delaunator output appears inconsistent/, "throws on inconsistent Delaunation");
	t.throws(() => new Constrainautor({triangles: [1, 2, 3], halfedges: [1], coords: [1, 2]}),
			/Delaunator output appears inconsistent/, "throws on inconsistent Delaunation");
	t.throws(() => new Constrainautor({triangles: [1, 2, 3], halfedges: [0, 1, 2], coords: [1]}),
			/Delaunator output appears inconsistent/, "throws on inconsistent Delaunation");
	t.throws(() => new Constrainautor({triangles: [], halfedges: [], coords: [1, 2]}),
			/No edges in triangulation/, "throws on empty Delaunation");
	t.end();
}

function testExample(t){
	const points = [[150, 50], [50, 200], [150, 350], [250, 200]],
		del = Delaunator.from(points),
		con = new Constrainautor(del);
	
	con.constrainAll([[0, 2]]);
	
	validateConstraint(t, points, con, undefined, 0, 2);
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, true);
	t.end();
}

function main(args){
	if(!args.length){
		tape.test("Example", testExample);
		tape.test("Constructor", testConstructor);
	}

	for(const test of testFiles){
		tape.test(test.name, (t) => testFile(t, test));
	}
}

main(process.argv.slice(2));
