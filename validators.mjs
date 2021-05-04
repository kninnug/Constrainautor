import Constrainautor from './Constrainautor.mjs';
import robustIntersect from 'robust-segment-intersect';

class RobustConstrainautor extends Constrainautor {
	intersectSegments(p1, p2, p3, p4){
		// ignore when the segments share an end-point
		if(p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4){
			return false;
		}
		
		const pts = this.del.coords;
		
		return robustIntersect(
			[pts[p1 * 2], pts[p1 * 2 + 1]],
			[pts[p2 * 2], pts[p2 * 2 + 1]],
			[pts[p3 * 2], pts[p3 * 2 + 1]],
			[pts[p4 * 2], pts[p4 * 2 + 1]]
		);
	}
}

/**
 * Maps keys to sets of values.
 *
 * @extends Map
 */
class SetMap extends Map {
	/**
	 * Add a value to the set of `key` to the set-map. Adds a new set if the
	 * key didn't have one yet.
	 *
	 * @override
	 * @param {any} key The key.
	 * @param {any} val The value.
	 * @return {SetMap} this.
	 */
	set(key, val){
		let set = this.get(key);
		if(!set){
			set = new Set;
			super.set(key, set);
		}
		set.add(val);
		return this;
	}
	
	/**
	 * Delete a value and/or an entire key from the set-map. If `val` is not
	 * given the entire set for the key is deleted, otherwise only the value
	 * is removed from the set.
	 *
	 * @override
	 * @param {any} key The key.
	 * @param {any} val The value.
	 * @return {boolean} True if the value/key was in the set-map.
	 */
	delete(key, val = undefined){
		if(val !== undefined){
			const set = this.get(key);
			if(set){
				const ret = set.delete(val);
				if(!set.size){
					super.delete(key);
				}
				return ret;
			}
			return false;
		}
		return super.delete(key);
	}
}

/**
 * Validate the output from Delaunator:
 * - Half-edges not on the hull link back to eachother.
 * - Linked half-edges have the same end-points.
 * - Hull is convex.
 * - Sum of all triangle areas equals area of the hull.
 *
 * @source delaunator
 * @param {tape.Test} t The tape test argument.
 * @param {array:array:number} points The points to delaunate.
 * @param {Delaunator} del The Delaunator output.
 */
function validateDelaunator(t, points, del){
	// validate halfedges
	for(let edg = 0; edg < del.halfedges.length; edg++){
		const adj = del.halfedges[edg];
		if(adj === -1){
			continue;
		}
		
		if(del.halfedges[adj] !== edg){
			t.fail("invalid halfedge connection");
		}
		
		const e1 = del.triangles[edg],
			e2 = del.triangles[nextEdge(edg)],
			a1 = del.triangles[adj],
			a2 = del.triangles[nextEdge(adj)];
		
		if(e1 !== a2 && e2 !== a1){
			t.fail("halfedges do not share end-points");
		}
	}
	t.pass("halfedges are valid");

	// validate triangulation
	const hullAreas = [];
	for(let i = 0, len = del.hull.length, j = len - 1; i < len; j = i++){
		const [x0, y0] = points[del.hull[j]];
		const [x, y] = points[del.hull[i]];
		hullAreas.push((x - x0) * (y + y0));
		const c = convex(points[del.hull[j]], points[del.hull[(j + 1) % del.hull.length]],  points[del.hull[(j + 3) % del.hull.length]]);
		if(!c){
			t.fail(`hull is not convex at ${j}`);
		}
	}
	const hullArea = sum(hullAreas);

	const triangleAreas = [];
	for(let i = 0; i < del.triangles.length; i += 3){
		const [ax, ay] = points[del.triangles[i]];
		const [bx, by] = points[del.triangles[i + 1]];
		const [cx, cy] = points[del.triangles[i + 2]];
		triangleAreas.push(Math.abs((by - ay) * (cx - bx) - (bx - ax) * (cy - by)));
	}
	const trianglesArea = sum(triangleAreas);

	const err = Math.abs((hullArea - trianglesArea) / hullArea);
	if(err <= Math.pow(2, -51)){
		t.pass(`triangulation is valid: ${err} error`);
	}else{
		t.fail(`triangulation is broken: ${err} error`);
	}
}

function orient([px, py], [rx, ry], [qx, qy]){
	const l = (ry - py) * (qx - px);
	const r = (rx - px) * (qy - py);
	return Math.abs(l - r) >= 3.3306690738754716e-16 * Math.abs(l + r) ? l - r : 0;
}

function convex(r, q, p){
	return (orient(p, r, q) || orient(r, q, p) || orient(q, p, r)) >= 0;
}

// Kahan and Babuska summation, Neumaier variant; accumulates less FP error
function sum(x){
	let sum = x[0];
	let err = 0;
	for(let i = 1; i < x.length; i++){
		const k = x[i];
		const m = sum + k;
		err += Math.abs(sum) >= Math.abs(k) ? sum - m + k : k - m + sum;
		sum = m;
	}
	return sum + err;
}

function nextEdge(e){ return (e % 3 === 2) ? e - 2 : e + 1; }
function prevEdge(e){ return (e % 3 === 0) ? e + 2 : e - 1; }

/**
 * Validate the vertMap of a Constrainautor:
 * - Every point has at least one incoming edge.
 * - All incoming edges to a point can be reached by walking around the point
 *   starting at the edge in `con.vertMap`.
 *
 * @param {tape.Test} t The tape test argument.
 * @param {array:array:number} points The points of the triangulation.
 * @param {Constrainautor} con The constrainautor.
 */
function validateVertMap(t, points, con){
	const del = con.del,
		numPoints = points.length,
		numEdges = del.triangles.length,
		edgeMap = new SetMap;
	
	for(let edg = 0; edg < numEdges; edg++){
		const adj = del.halfedges[edg],
			p1 = del.triangles[edg],
			p2 = del.triangles[nextEdge(edg)];
		
		// points *to*
		edgeMap.set(p1, prevEdge(edg));
		edgeMap.set(p2, edg);
	}
	
	for(let i = 0; i < numPoints; i++){
		const inc = edgeMap.get(i);
		if(!inc){
			t.fail("point has no incoming edges");
		}
		
		const start = con.vertMap[i];
		let edg = start;
		do{
			if(!inc.has(edg)){
				t.fail("edge incorrectly marked as incoming to point");
			}
			
			inc.delete(edg);
			const nxt = nextEdge(edg),
				adj = del.halfedges[nxt];
			edg = adj;
		}while(edg !== -1 && edg !== start);
		
		if(inc.size){
			t.fail("edges missed while walking around point");
		}
		edgeMap.delete(i);
	}
	
	if(edgeMap.size){
		t.fail("invalid points in edge map");
	}
}

/**
 * Validate the flips array of a Constrainautor:
 * - All entries have either the IGND, CONSD, or FLIPD value, and no other.
 * - Linked half-edges have the same flip value.
 * - If requested, FLIPD values were cleared by delaunify.
 *
 * @param {tape.Test} t The tape test argument.
 * @param {Constrainautor} con The constrainautor.
 * @param {boolean} clear If `true`, disallow FLIPD values.
 */
function validateFlips(t, con, clear = true){
	const del = con.del,
		numEdges = del.triangles.length;
	
	for(let edg = 0; edg < numEdges; edg++){
		const flp = con.flips[edg],
			adj = del.halfedges[edg];
		
		if(flp !== Constrainautor.IGND && flp !== Constrainautor.CONSD && flp !== Constrainautor.FLIPD){
			t.fail("invalid flip value");
		}
		if(clear && flp !== Constrainautor.CONSD && flp !== Constrainautor.IGND){
			t.fail("flip not cleared");
		}
		
		if(adj === -1){
			continue;
		}
		
		if(flp !== con.flips[adj] || con.isConstrained(edg) !== con.isConstrained(adj)){
			t.fail("flip status inconsistent");
		}
	}
}

/**
 * Validate that an edge was correctly constrained:
 * - `constrainOne` returned the correct value.
 * - The constrained edge occurs exactly once.
 * - If not on the hull, the adjacent edge occurs exactly once.
 * - No edge intersects the constrained edge.
 * - The constrained edge is marked in the flips array.
 * 
 * @param {tape.Test} t The tape test argument.
 * @param {array:array:number} points The points of the triangulation.
 * @param {Constrainautor} con The constrainautor.
 * @param {number} ret The return value from `con.constrainOne(p1, p2)`.
 * @param {number} p1 The index of point 1.
 * @param {number} p2 The index of point 2.
 */
function validateConstraint(t, points, con, ret, [p1, p2]){
	const del = con.del,
		numEdges = del.triangles.length,
		[x1, y1] = points[p1],
		[x2, y2] = points[p2],
		re1 = ret < 0 ? del.triangles[nextEdge(-ret)] : del.triangles[ret],
		re2 = ret < 0 ? del.triangles[-ret] : del.triangles[nextEdge(ret)];
	
	if(ret !== undefined){
		t.assert(re1 === p1 && re2 === p2, "valid edge returned from constrainOne");
	}
	
	let found = -1,
		foundAdj = -1;
	
	for(let edg = 0; edg < numEdges; edg++){
		const e1 = del.triangles[edg],
			e2 = del.triangles[nextEdge(edg)];
		
		if(e1 === p1 && e2 === p2){
			if(found !== -1){
				t.fail("duplicate of constrained edge");
			}
			found = edg;
		}else if(e1 === p2 && e2 === p1){
			if(foundAdj !== -1){
				t.fail("duplicate of constrained edge in reverse");
			}
			foundAdj = edg;
		}
		
		if(e1 === p1 || e1 === p2 || e2 === p1 || e2 === p2){
			continue;
		}
		
		const [x3, y3] = points[e1],
			[x4, y4] = points[e2];
		
		//if(Constrainautor.intersectSegments(x1, y1, x2, y2, x3, y3, x4, y4)){
		if(robustIntersect([x1, y1], [x2, y2], [x3, y3], [x4, y4])){
			t.fail("edge intersects constrained edge");
		}
	}
	
	t.assert(found !== -1 || foundAdj !== -1, "constrained edge in triangulation");
	if(found !== -1){
		t.assert(con.isConstrained(found), "constrained edge marked");
	}
	if(foundAdj !== -1){
		t.assert(con.isConstrained(foundAdj), "reverse constrained edge marked");
	}
}

export {
	validateDelaunator,
	validateVertMap,
	validateConstraint,
	validateFlips,
	SetMap,
	RobustConstrainautor
};
