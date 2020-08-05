const U32NIL = 2**32 - 1, // Max value of a Uint32Array
	EPSILON = 2**-51, // Minimum distance between a point and constraining edge
	IGND = 0, // edge was not changed
	CONSD = 1, // edge was constrained
	FLIPD = 2; // edge was flipped

/**
 * Constrain a triangulation from Delaunator, using (parts of) the algorithm
 * in "A fast algorithm for generating constrained Delaunay triangulations" by
 * S. W. Sloan.
 */
class Constrainautor {
	/**
	 * Make a Constrainautor.
	 *
	 * @param {Delaunator} del The triangulation output from Delaunator.
	 */
	constructor(del){
		if(!del || typeof del !== 'object' || !del.triangles || !del.halfedges || !del.coords){
			throw new Error("Expected an object with Delaunator output");
		}
		if(del.triangles.length % 3 || del.halfedges.length !== del.triangles.length || del.coords % 2){
			throw new Error("Delaunator output appears inconsistent");
		}
		if(del.triangles.length < 3){
			throw new Error("No edges in triangulation");
		}
		
		this.del = del;
		
		const numPoints = del.coords.length >> 1,
			numEdges = del.triangles.length;
		
		// Map every vertex id to the left-most edge that points to that vertex.
		this.vertMap = new Uint32Array(numPoints).fill(U32NIL);
		// Keep track of edges flipped while constraining
		this.flips = new Uint8Array(numEdges).fill(IGND);
		
		for(let e = 0; e < numEdges; e++){
			const v = del.triangles[e];
			if(this.vertMap[v] === U32NIL){
				this.updateVert(e);
			}
		}
	}
	
	/**
	 * Constrain the triangulation such that there is an edge between p1 and p2.
	 *
	 * @param {number} segP1 The index of one segment end-point in the coords array.
	 * @param {number} segP2 The index of the other segment end-point in the coords array.
	 * @return {number} The id of the edge that points from p1 to p2. If the 
	 *         constrained edge lies on the hull and points in the opposite 
	 *         direction (p2 to p1), the negative of its id is returned.
	 */
	constrainOne(segP1, segP2){
		const del = this.del,
			pts = this.coords,
			vm = this.vertMap,
			start = vm[segP1];
		
		// Loop over the edges touching segP1
		let edg = start;
		do{
			// edg points toward segP1, so its start-point is opposite it
			const p4 = del.triangles[edg],
				nxt = nextEdge(edg);
			
			// already constrained, but in reverse order
			if(p4 === segP2){
				return this.protect(edg);
			}
			// The edge opposite segP1
			const opp = prevEdge(edg),
				p3 = del.triangles[opp];
			
			// already constrained
			if(p3 === segP2){
				this.protect(nxt);
				return nxt;
			}
			
			// edge opposite segP1 intersects constraint
			if(this.intersectSegments(segP1, segP2, p3, p4)){
				edg = opp;
				break;
			}
			
			const adj = del.halfedges[nxt];
			// The next edge pointing to segP1
			edg = adj;
		}while(edg !== -1 && edg !== start);
		
		let conEdge = edg;
		// Walk through the triangulation looking for further intersecting
		// edges and flip them. If an intersecting edge cannot be flipped,
		// assign its id to `rescan` and restart from there, until there are
		// no more intersects.
		let rescan = -1;
		while(edg !== -1){
			// edg is the intersecting half-edge in the triangle we came from
			// adj is now the opposite half-edge in the adjacent triangle, which
			// is away from segP1.
			const adj = del.halfedges[edg],
				// cross diagonal
				bot = prevEdge(edg),
				top = prevEdge(adj),
				rgt = nextEdge(adj);
			
			if(adj === -1){
				throw new Error("Constraining edge exited the hull");
			}
			
			if(this.flips[edg] === CONSD || this.flips[adj] === CONSD){
				throw new Error("Edge intersects already constrained edge");
			}
			
			const thruPoint = Math.min(
				this.segPointDistSq(segP1, segP2, del.triangles[edg]),
				this.segPointDistSq(segP1, segP2, del.triangles[adj])
			);
			
			if(thruPoint <= EPSILON){
				throw new Error("Constraining edge intersects point");
			}
			
			const convex = this.intersectSegments(
				del.triangles[edg],
				del.triangles[adj],
				del.triangles[bot],
				del.triangles[top]
			);
			
			// The quadrilateral formed by the two triangles adjoing edg is not
			// convex, so the edge can't be flipped. Continue looking for the
			// next intersecting edge and restart at this one later.
			if(!convex){
				if(rescan === -1){
					rescan = edg;
				}
				
				if(del.triangles[top] === segP2){
					if(edg === rescan){
						throw new Error("Infinite loop: non-convex quadrilateral");
					}
					edg = rescan;
					rescan = -1;
					continue;
				}
				
				// Look for the next intersect
				if(this.intersectSegments(segP1, segP2, del.triangles[top], del.triangles[adj])){
					edg = top;
				}else if(this.intersectSegments(segP1, segP2, del.triangles[rgt], del.triangles[top])){
					edg = rgt;
				}else if(rescan === edg){
					throw new Error("Infinite loop: no further intersect after non-convex");
				}
				
				continue;
			}
			
			const flp = this.flipDiagonal(edg);
			this.flips[flp] = FLIPD;
			this.flips[del.halfedges[flp]] = FLIPD;
			
			// The new edge might still intersect, which will be fixed in the
			// next rescan.
			if(this.intersectSegments(segP1, segP2, del.triangles[bot], del.triangles[top])){
				if(rescan === -1){
					rescan = bot;
				}
				if(rescan === bot){
					throw new Error("Infinite loop: flipped diagonal still intersects");
				}
			}
			
			// Reached the other segment end-point? Start the rescan.
			if(del.triangles[top] === segP2){
				conEdge = top;
				edg = rescan;
				rescan = -1;
			// Otherwise, for the next edge that intersects. Because we just
			// flipped, it's either edg again, or rgt.
			}else if(this.intersectSegments(segP1, segP2, del.triangles[rgt], del.triangles[top])){
				edg = rgt;
			}
		}
		
		return this.protect(conEdge);
	}
	
	/**
	 * Fix the Delaunay condition after constraining edges.
	 *
	 * @param {boolean} force Check all non-constrained edges, not just those
	 *        that were recently flipped.
	 * @return {object} The triangulation object.
	 */
	delaunify(force = false){
		const del = this.del,
			flips = this.flips,
			len = flips.length;
		for(let edg = 0; edg < len; edg++){
			const adj = del.halfedges[edg];
			if(adj === -1){
				continue;
			}
			
			if(force){
				if(flips[edg] === CONSD || flips[adj] === CONSD){
					continue;
				}
			}else if(flips[edg] !== FLIPD || flips[adj] !== FLIPD){
				continue;
			}
			
			if(!this.isDelaunay(edg)){
				const flp = this.flipDiagonal(edg);
				this.flips[flp] = IGND;
				this.flips[del.halfedges[flp]] = IGND;
			}else{
				this.flips[edg] = IGND;
				this.flips[adj] = IGND;
			}
		}
		
		return this.del;
	}
	
	/**
	 * Call constrainOne on each edge, and delaunify afterwards.
	 *
	 * @param {array:array:number} edges The edges to constrain: each element is
	 *        an array with [p1, p2] which are indices into the points array 
	 *        originally supplied to Delaunator.
	 * @return {object} The triangulation object.
	 */
	constrainAll(edges){
		const len = edges.length;
		for(let i = 0; i < len; i++){
			const e = edges[i];
			this.constrainOne(e[0], e[1]);
		}
		
		return this.delaunify();
	}
	
	/**
	 * Mark an edge as constrained, i.e. should not be touched by `delaunify`.
	 *
	 * @private
	 * @param {number} edg The edge id.
	 * @return {number} If edg has an adjacent, returns that, otherwise -edg.
	 */
	protect(edg){
		const adj = this.del.halfedges[edg];
		this.flips[edg] = CONSD;
		
		if(adj !== -1){
			this.flips[adj] = CONSD;
			return adj;
		}
		
		return -edg;
	}
	
	/**
	 * Flip the edge shared by two triangles.
	 *
	 * @private
	 * @param {number} edg The edge shared by the two triangles, must have an
	 *        adjacent half-edge.
	 * @return {number} The new diagonal.
	 */
	flipDiagonal(edg){
		// Flip a diagonal
		//                top                     edg  
		//          o  <----- o            o <------- o 
		//         | ^ \      ^           |       ^ / ^
		//      lft|  \ \     |        lft|      / /  |
		//         |   \ \adj |           |  bot/ /   |
		//         | edg\ \   |           |    / /top |
		//         |     \ \  |rgt        |   / /     |rgt
		//         v      \ v |           v  / v      |
		//         o ----->  o            o  -------> o 
		//           bot                     adj    
		const del = this.del,
			adj = del.halfedges[edg],
			bot = prevEdge(edg),
			lft = nextEdge(edg),
			top = prevEdge(adj),
			rgt = nextEdge(adj),
			adjBot = del.halfedges[bot],
			adjTop = del.halfedges[top];
		
		if(this.flips[edg] === CONSD || this.flips[adj] === CONSD){
			throw new Error("Trying to flip a constrained edge");
		}
		
		del.triangles[edg] = del.triangles[top];
		del.halfedges[edg] = adjTop;
		if(adjTop !== -1){
			del.halfedges[adjTop] = edg;
			this.flips[edg] = this.flips[adjTop];
		}
		del.halfedges[bot] = top;
		
		del.triangles[adj] = del.triangles[bot];
		del.halfedges[adj] = adjBot;
		if(adjBot !== -1){
			del.halfedges[adjBot] = adj;
			this.flips[adj] = this.flips[adjBot];
		}
		del.halfedges[top] = bot;
		
		// Update vertex->edge map
		this.updateVert(edg);
		this.updateVert(lft);
		this.updateVert(adj);
		this.updateVert(rgt);
		
		this.flips[edg] = this.flips[top];
		this.flips[adj] = this.flips[bot];
		
		return bot;
	}
	
	/**
	 * Whether the two triangles sharing edg conform to the Delaunay condition.
	 * As a shortcut, if the given edge has no adjacent (is on the hull), it is
	 * certainly Delaunay.
	 *
	 * @private
	 * @param {number} edg The edge shared by the triangles to test.
	 * @return {boolean} True if they are Delaunay.
	 */
	isDelaunay(edg){
		const del = this.del,
			adj = del.halfedges[edg];
		if(adj === -1){
			return true;
		}
		
		const p1 = del.triangles[prevEdge(edg)],
			p2 = del.triangles[edg],
			p3 = del.triangles[nextEdge(edg)],
			px = del.triangles[prevEdge(adj)];
		
		return !this.inCircle(p1, p2, p3, px);
	}
	
	/**
	 * Update the vertex -> incoming edge map.
	 *
	 * @private
	 * @param {number} start The id of an *outgoing* edge.
	 * @return {number} The id of the right-most incoming edge.
	 */
	updateVert(start){
		const del = this.del,
			vm = this.vertMap,
			v = del.triangles[start];
		
		// When iterating over incoming edges around a vertex, we do so in
		// clockwise order ('going left'). If the vertex lies on the hull, two
		// of the edges will have no opposite, leaving a gap. If the starting
		// incoming edge is not the right-most, we will miss edges between it
		// and the gap. So walk counter-clockwise until we find an edge on the
		// hull, or get back to where we started.
		
		let inc = prevEdge(start),
			adj = del.halfedges[inc];
		while(adj !== -1 && adj !== start){
			inc = prevEdge(adj);
			adj = del.halfedges[inc];
		}
		
		vm[v] = inc;
		return inc;
	}
	
	/**
	 * Whether the segment between [p1, p2] intersects with [p3, p4].
	 *
	 * @param {number} p1 The index of point 1 into this.del.coords.
	 * @param {number} p2 The index of point 2 into this.del.coords.
	 * @param {number} p3 The index of point 3 into this.del.coords.
	 * @param {number} p4 The index of point 4 into this.del.coords.
	 * @return {boolean} True if the segments intersect.
	 */
	intersectSegments(p1, p2, p3, p4){
		const pts = this.del.coords;
		// If the segments share one of the end-points, they cannot intersect
		// (provided the input is properly segmented, and the triangulation is
		// correct), but intersectSegments will say that they do. We can catch
		// it here already.
		if(p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4){
			return false;
		}
		return intersectSegments(
			pts[p1 * 2], pts[p1 * 2 + 1],
			pts[p2 * 2], pts[p2 * 2 + 1],
			pts[p3 * 2], pts[p3 * 2 + 1],
			pts[p4 * 2], pts[p4 * 2 + 1]
		);
	}
	
	/**
	 * Whether point px is in the circumcircle of the triangle formed by p1, p2,
	 * and p3.
	 *
	 * @param {number} p1 The index of point 1 into this.del.coords.
	 * @param {number} p2 The index of point 2 into this.del.coords.
	 * @param {number} p3 The index of point 3 into this.del.coords.
	 * @param {number} px The index of point x into this.del.coords.
	 */
	inCircle(p1, p2, p3, px){
		const pts = this.del.coords;
		return inCircle(
			pts[p1 * 2], pts[p1 * 2 + 1],
			pts[p2 * 2], pts[p2 * 2 + 1],
			pts[p3 * 2], pts[p3 * 2 + 1],
			pts[px * 2], pts[px * 2 + 1]
		);
	}
	
	/**
	 * Distance between a point and the nearest point to it on a segment, squared.
	 *
	 * @param {number} p1 The index of segment point 1 into this.del.coords.
	 * @param {number} p2 The index of segment point 2 into this.del.coords.
	 * @param {number} p The index of the point into this.del.coords.
	 * @return {number} The distance squared.
	 */
	segPointDistSq(p1, p2, p){
		const pts = this.del.coords;
		return segPointDistSq(
			pts[p1 * 2], pts[p1 * 2 + 1],
			pts[p2 * 2], pts[p2 * 2 + 1],
			pts[p * 2], pts[p * 2 + 1]
		);
	}
}

function nextEdge(e){ return (e % 3 === 2) ? e - 2 : e + 1; }
function prevEdge(e){ return (e % 3 === 0) ? e + 2 : e - 1; }

/**
 * Compute if two line segments [p1, p2] and [p3, p4] intersect.
 *
 * @name Constrainautor.intersectSegments
 * @source https://stackoverflow.com/a/565282
 * @param {number} p1x The x coordinate of point 1 of the first segment.
 * @param {number} p1y The y coordinate of point 1 of the first segment.
 * @param {number} p2x The x coordinate of point 2 of the first segment.
 * @param {number} p2y The y coordinate of point 2 of the first segment.
 * @param {number} p3x The x coordinate of point 1 of the second segment.
 * @param {number} p3y The y coordinate of point 1 of the second segment.
 * @param {number} p4x The x coordinate of point 2 of the second segment.
 * @param {number} p4y The y coordinate of point 2 of the second segment.
 * @return {boolean} True if the line segments intersect.
 */
function intersectSegments(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y){
	const rx = p2x - p1x,
		ry = p2y - p1y,
		sx = p4x - p3x,
		sy = p4y - p3y,
		mx = p3x - p1x,
		my = p3y - p1y,
		n = mx * ry - rx * my,
		d = rx * sy - sx * ry;
	
	if(d === 0.0){
		// collinear
		if(n === 0.0){
			const rr = rx * rx + ry * ry,
				t0 = (mx * rx + my * ry) / rr,
				t1 = t0 + (sx * rx + sy * ry) / rr;
			
			if(!((t0 < 0 && t1 < 0) || (t0 > 1 && t1 > 1))){
				// collinear & overlapping
				return true;
			}
		}
		
		return false;
	}
	
	const u = n / d,
		t = (mx * sy - sx * my) / d;
	
	if(t < 0.0 || t > 1.0 || u < 0.0 || u > 1.0){
		return false;
	}
	
	return true;
}

/**
 * Test whether point (px, py) is in the circumcircle of the triangle formed by
 * (ax, ay), (bx, by), and (cx, cy).
 *
 * @name Constrainautor.inCircle
 * @source npm:delaunator
 * @param {number} ax The x coordinate of triangle point a.
 * @param {number} ay The y coordinate of triangle point a.
 * @param {number} bx The x coordinate of triangle point b.
 * @param {number} by The y coordinate of triangle point b.
 * @param {number} cx The x coordinate of triangle point c.
 * @param {number} cy The y coordinate of triangle point c.
 * @param {number} px The x coordinate of the point to test.
 * @param {number} py The y coordinate of the point to test.
 * @return {boolean} True if it's in the circumcircle.
 */
function inCircle(ax, ay, bx, by, cx, cy, px, py) {
	const dx = ax - px,
		dy = ay - py,
		ex = bx - px,
		ey = by - py,
		fx = cx - px,
		fy = cy - py,
	
		ap = dx * dx + dy * dy,
		bp = ex * ex + ey * ey,
		cp = fx * fx + fy * fy;
	
	return dx * (ey * cp - bp * fy) -
		dy * (ex * cp - bp * fx) +
		ap * (ex * fy - ey * fx) < 0;
}

/**
 * Distance between a point and the nearest point to it on a segment, squared.
 *
 * @source https://stackoverflow.com/a/6853926
 * @param {number} x1 The segment point 1 x-coordinate.
 * @param {number} y1 The segment point 1 y-coordinate.
 * @param {number} x2 The segment point 2 x-coordinate.
 * @param {number} y2 The segment point 2 y-coordinate.
 * @param {number} x The point x-coordinate.
 * @param {number} y The point y-coordinate.
 * @return {number} The distance squared.
 */
function segPointDistSq(x1, y1, x2, y2, x, y){
	const A = x - x1,
		B = y - y1,
		C = x2 - x1,
		D = y2 - y1,

		dot = A * C + B * D,
		lenSq = C * C + D * D,
		param = lenSq === 0 ? -1 : dot / lenSq;

	let xx, yy;

	if(param < 0){
		xx = x1;
		yy = y1;
	}else if(param > 1){
		xx = x2;
		yy = y2;
	}else{
		xx = x1 + param * C;
		yy = y1 + param * D;
	}

	const dx = x - xx,
		dy = y - yy;
	return dx * dx + dy * dy;
}

Constrainautor.EPSILON = EPSILON;
Constrainautor.IGND = IGND;
Constrainautor.FLIPD = FLIPD;
Constrainautor.CONSD = CONSD;

Constrainautor.intersectSegments = intersectSegments;
Constrainautor.inCircle = inCircle;
Constrainautor.segPointDistSq = segPointDistSq;

export default Constrainautor;
