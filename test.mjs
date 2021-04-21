import fs from 'fs';
import tape from 'tape';
import Constrainautor from './Constrainautor.mjs';
import Delaunator from 'delaunator';
import {validateDelaunator, validateVertMap, validateConstraint, validateFlips, RobustConstrainautor} from './validators.mjs';

function testFile(t, json, impl = Constrainautor){
	const points = json.points,
		edges = json.edges,
		error = json.error,
		del = Delaunator.from(points),
		con = new (impl)(del);
	
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
			validateConstraint(t, points, con, ret, [p1, p2]);
		}
	}
	
	if(error){
		t.equal(caught && caught.message, error, `threw expected error: ${error}`);
	}else{
		t.assert(!caught, "did not throw");
	}
	
	// The internal structures must be consistent, even in case of an error
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, false);
	con.delaunify();
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
	
	validateConstraint(t, points, con, undefined, [0, 2]);
	validateDelaunator(t, points, con.del);
	validateVertMap(t, points, con);
	validateFlips(t, con, true);
	t.end();
}

function testIssue2(t){
	const obj = JSON.parse(fs.readFileSync('./tests/issue2.json'), 'utf8');
	obj.error = null;
	return testFile(t, obj, RobustConstrainautor);
}

const files = fs.readdirSync('./tests/', 'utf8').map(f => './tests/' + f)
		.concat(fs.readdirSync('./tests/ipa/', 'utf8').map(f => './tests/ipa/' + f))
		.filter(f => f.endsWith('.json'));

function main(args){
	if(!args.length){
		tape.test("Example", testExample);
		tape.test("Constructor", testConstructor);
		tape.test("issue #2", testIssue2);
	}
	
	args = args.length ? args : files;

	for(const file of args){
		const json = JSON.parse(fs.readFileSync(file, 'utf8'));
		tape.test(file, (t) => testFile(t, json));
	}
}

main(process.argv.slice(2));
