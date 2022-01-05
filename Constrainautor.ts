import {orient2d, incircle} from 'robust-predicates';
import {BitSet8} from './BitSet';
import type {BitSet} from './BitSet';

export interface DelaunatorLike {
    coords: {readonly length: number, readonly [n: number]: number};
    triangles:  {readonly length: number, [n: number]: number};
    halfedges:  {readonly length: number, [n: number]: number};
    hull:  {readonly length: number, readonly [n: number]: number};
};

function nextEdge(e: number){ return (e % 3 === 2) ? e - 2 : e + 1; }
function prevEdge(e: number){ return (e % 3 === 0) ? e + 2 : e - 1; }

/**
 * Constrain a triangulation from Delaunator, using (parts of) the algorithm
 * in "A fast algorithm for generating constrained Delaunay triangulations" by
 * S. W. Sloan.
 */
class Constrainautor {
    /**
     * @member del The triangulation object from Delaunator, which will be 
     * moddified by Constrainautor.
     */
    public del: DelaunatorLike;
    vertMap: Uint32Array;

    flips: BitSet;
    consd: BitSet;
    
    /**
     * Make a Constrainautor.
     *
     * @param del The triangulation output from Delaunator.
     * @param edges If provided, constrain these edges as by constrainAll.
     */
    constructor(del: DelaunatorLike, edges?: readonly [number, number][]){
        if(!del || typeof del !== 'object' || !del.triangles || !del.halfedges || !del.coords){
            throw new Error("Expected an object with Delaunator output");
        }
        if(del.triangles.length % 3 || del.halfedges.length !== del.triangles.length || del.coords.length % 2){
            throw new Error("Delaunator output appears inconsistent");
        }
        if(del.triangles.length < 3){
            throw new Error("No edges in triangulation");
        }
        
        this.del = del;
        
        const U32NIL = 2**32 - 1, // Max value of a Uint32Array: use as a sentinel for not yet defined 
            numPoints = del.coords.length >> 1,
            numEdges = del.triangles.length;
        
        // Map every vertex id to the right-most edge that points to that vertex.
        this.vertMap = new Uint32Array(numPoints).fill(U32NIL);
        // Keep track of edges flipped while constraining
        this.flips = new BitSet8(numEdges);
        // Keep track of constrained edges
        this.consd = new BitSet8(numEdges);
        
        for(let e = 0; e < numEdges; e++){
            const v = del.triangles[e];
            if(this.vertMap[v] === U32NIL){
                this.updateVert(e);
            }
        }

        if(edges){
            this.constrainAll(edges);
        }
    }
    
    /**
     * Constrain the triangulation such that there is an edge between p1 and p2.
     *
     * @param segP1 The index of one segment end-point in the coords array.
     * @param segP2 The index of the other segment end-point in the coords array.
     * @return The id of the edge that points from p1 to p2. If the 
     *         constrained edge lies on the hull and points in the opposite 
     *         direction (p2 to p1), the negative of its id is returned.
     */
    constrainOne(segP1: number, segP2: number){
        const {triangles, halfedges} = this.del,
            vm = this.vertMap,
            consd = this.consd,
            start = vm[segP1];
        
        // Loop over the edges touching segP1
        let edg = start;
        do{
            // edg points toward segP1, so its start-point is opposite it
            const p4 = triangles[edg],
                nxt = nextEdge(edg);
            
            // already constrained, but in reverse order
            if(p4 === segP2){
                return this.protect(edg);
            }
            // The edge opposite segP1
            const opp = prevEdge(edg),
                p3 = triangles[opp];
            
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
            
            const adj = halfedges[nxt];
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
            const adj = halfedges[edg],
                // cross diagonal
                bot = prevEdge(edg),
                top = prevEdge(adj),
                rgt = nextEdge(adj);
            
            if(adj === -1){
                throw new Error("Constraining edge exited the hull");
            }
            
            if(consd.has(edg)){ // || consd.has(adj) // assume consd is consistent
                throw new Error("Edge intersects already constrained edge");
            }
            
            if(this.isCollinear(segP1, segP2, triangles[edg]) ||
                    this.isCollinear(segP1, segP2, triangles[adj])){
                throw new Error("Constraining edge intersects point");
            }
            
            const convex = this.intersectSegments(
                triangles[edg],
                triangles[adj],
                triangles[bot],
                triangles[top]
            );
            
            // The quadrilateral formed by the two triangles adjoing edg is not
            // convex, so the edge can't be flipped. Continue looking for the
            // next intersecting edge and restart at this one later.
            if(!convex){
                if(rescan === -1){
                    rescan = edg;
                }
                
                if(triangles[top] === segP2){
                    if(edg === rescan){
                        throw new Error("Infinite loop: non-convex quadrilateral");
                    }
                    edg = rescan;
                    rescan = -1;
                    continue;
                }
                
                // Look for the next intersect
                if(this.intersectSegments(segP1, segP2, triangles[top], triangles[adj])){
                    edg = top;
                }else if(this.intersectSegments(segP1, segP2, triangles[rgt], triangles[top])){
                    edg = rgt;
                }else if(rescan === edg){
                    throw new Error("Infinite loop: no further intersect after non-convex");
                }
                
                continue;
            }
            
            this.flipDiagonal(edg);
            
            // The new edge might still intersect, which will be fixed in the
            // next rescan.
            if(this.intersectSegments(segP1, segP2, triangles[bot], triangles[top])){
                if(rescan === -1){
                    rescan = bot;
                }
                if(rescan === bot){
                    throw new Error("Infinite loop: flipped diagonal still intersects");
                }
            }
            
            // Reached the other segment end-point? Start the rescan.
            if(triangles[top] === segP2){
                conEdge = top;
                edg = rescan;
                rescan = -1;
            // Otherwise, for the next edge that intersects. Because we just
            // flipped, it's either edg again, or rgt.
            }else if(this.intersectSegments(segP1, segP2, triangles[rgt], triangles[top])){
                edg = rgt;
            }
        }
        
        const flips = this.flips;
        this.protect(conEdge);
        do{
            // need to use var to scope it outside the loop, but re-initialize
            // to 0 each iteration
            var flipped = 0;
            flips.forEach(edg => {
                flips.delete(edg);

                const adj = halfedges[edg];
                if(adj === -1){
                    return;
                }
                flips.delete(adj);

                if(!this.isDelaunay(edg)){
                    this.flipDiagonal(edg);
                    flipped++;
                }
            });
        }while(flipped > 0);
        return this.findEdge(segP1, segP2);
    }
    
    /**
     * Fix the Delaunay condition. It is no longer necessary to call this
     * method after constraining (many) edges, since constrainOne will do it 
     * after each.
     *
     * @param deep If true, keep checking & flipping edges until all
     *        edges are Delaunay, otherwise only check the edges once.
     * @return The triangulation object.
     */
    delaunify(deep = false){
        const halfedges = this.del.halfedges,
            flips = this.flips,
            consd = this.consd,
            len = halfedges.length;
        
        do{
            var flipped = 0;
            for(let edg = 0; edg < len; edg++){
                if(consd.has(edg)){
                    continue;
                }
                flips.delete(edg);
                
                const adj = halfedges[edg];
                if(adj === -1){
                    continue;
                }
                
                flips.delete(adj);
                if(!this.isDelaunay(edg)){
                    this.flipDiagonal(edg);
                    flipped++;
                }
            }
        }while(deep && flipped > 0);
        
        return this;
    }
    
    /**
     * Call constrainOne on each edge, and delaunify afterwards.
     *
     * @param edges The edges to constrain: each element is an array with
     *        [p1, p2] which are indices into the points array originally 
     *        supplied to Delaunator.
     * @return The triangulation object.
     */
    constrainAll(edges: readonly [number, number][]){
        const len = edges.length;
        for(let i = 0; i < len; i++){
            const e = edges[i];
            this.constrainOne(e[0], e[1]);
        }
        
        return this;
    }
    
    /**
     * Whether an edge is a constrained edge.
     *
     * @param edg The edge id.
     * @return True if the edge is constrained.
     */
    isConstrained(edg: number){
        return this.consd.has(edg);
    }

    /**
     * Find the edge that points from p1 -> p2. If there is only an edge from
     * p2 -> p1 (i.e. it is on the hull), returns the negative id of it.
     * 
     * @param p1 The index of the first point into the points array.
     * @param p2 The index of the second point into the points array.
     * @return The id of the edge that points from p1 -> p2, or the negative
     *         id of the edge that goes from p2 -> p1, or Infinity if there is
     *         no edge between p1 and p2.
     */
    findEdge(p1: number, p2: number){
        const start1 = this.vertMap[p2],
            {triangles, halfedges} = this.del;
        let edg = start1,
            prv = -1;
        // Walk around p2, iterating over the edges pointing to it
        do{
            if(triangles[edg] === p1){
                return edg;
            }
            prv = nextEdge(edg);
            edg = halfedges[prv];
        }while(edg !== -1 && edg !== start1);

        // Did not find p1 -> p2, the only option is that it is on the hull on
        // the 'left-hand' side, pointing p2 -> p1 (or there is no edge)
        if(triangles[nextEdge(prv)] === p1){
            return -prv;
        }

        return Infinity;
    }
    
    /**
     * Mark an edge as constrained, i.e. should not be touched by `delaunify`.
     *
     * @private
     * @param edg The edge id.
     * @return If edg has an adjacent, returns that, otherwise -edg.
     */
    private protect(edg: number){
        const adj = this.del.halfedges[edg],
            flips = this.flips,
            consd = this.consd;
        flips.delete(edg);
        consd.add(edg);
        
        if(adj !== -1){
            flips.delete(adj);
            consd.add(adj);
            return adj;
        }
        
        return -edg;
    }
    
    /**
     * Mark an edge as flipped, unless it is already marked as constrained.
     *
     * @private
     * @param edg The edge id.
     * @return True if edg was not constrained.
     */
    private markFlip(edg: number){
        const halfedges = this.del.halfedges,
            flips = this.flips,
            consd = this.consd;
        if(consd.has(edg)){
            return false;
        }
        const adj = halfedges[edg];
        if(adj !== -1){
            flips.add(edg);
            flips.add(adj);
        }
        return true;
    }
    
    /**
     * Flip the edge shared by two triangles.
     *
     * @private
     * @param edg The edge shared by the two triangles, must have an
     *        adjacent half-edge.
     * @return The new diagonal.
     */
    private flipDiagonal(edg: number){
        // Flip a diagonal
        //                top                     edg
        //          o  <----- o            o <------  o 
        //         | ^ \      ^           |       ^ / ^
        //      lft|  \ \     |        lft|      / /  |
        //         |   \ \adj |           |  bot/ /   |
        //         | edg\ \   |           |    / /top |
        //         |     \ \  |rgt        |   / /     |rgt
        //         v      \ v |           v  / v      |
        //         o ----->  o            o   ------> o 
        //           bot                     adj

        const {triangles, halfedges} = this.del,
            flips = this.flips,
            consd = this.consd,
            adj = halfedges[edg],
            bot = prevEdge(edg),
            lft = nextEdge(edg),
            top = prevEdge(adj),
            rgt = nextEdge(adj),
            adjBot = halfedges[bot],
            adjTop = halfedges[top];
        
        if(consd.has(edg)){ // || consd.has(adj) // assume consd is consistent
            throw new Error("Trying to flip a constrained edge");
        }
        
        // move *edg to *top
        triangles[edg] = triangles[top];
        halfedges[edg] = adjTop;
        if(!flips.set(edg, flips.has(top))){
            consd.set(edg, consd.has(top));
        }
        if(adjTop !== -1){
            halfedges[adjTop] = edg;
        }
        halfedges[bot] = top;
        
        // move *adj to *bot
        triangles[adj] = triangles[bot];
        halfedges[adj] = adjBot;
        if(!flips.set(adj, flips.has(bot))){
            consd.set(adj, consd.has(bot));
        }
        if(adjBot !== -1){
            halfedges[adjBot] = adj;
        }
        halfedges[top] = bot;
        
        this.markFlip(edg);
        this.markFlip(lft);
        this.markFlip(adj);
        this.markFlip(rgt);

        // mark flips unconditionally
        flips.add(bot);
        consd.delete(bot);
        flips.add(top);
        consd.delete(top);
        
        this.updateVert(edg);
        this.updateVert(lft);
        this.updateVert(adj);
        this.updateVert(rgt);
        
        return bot;
    }
    
    /**
     * Whether the two triangles sharing edg conform to the Delaunay condition.
     * As a shortcut, if the given edge has no adjacent (is on the hull), it is
     * certainly Delaunay.
     *
     * @private
     * @param edg The edge shared by the triangles to test.
     * @return True if they are Delaunay.
     */
    private isDelaunay(edg: number){
        const {triangles, halfedges} = this.del,
            adj = halfedges[edg];
        if(adj === -1){
            return true;
        }
        
        const p1 = triangles[prevEdge(edg)],
            p2 = triangles[edg],
            p3 = triangles[nextEdge(edg)],
            px = triangles[prevEdge(adj)];
        
        return !this.inCircle(p1, p2, p3, px);
    }
    
    /**
     * Update the vertex -> incoming edge map.
     *
     * @private
     * @param start The id of an *outgoing* edge.
     * @return The id of the right-most incoming edge.
     */
    private updateVert(start: number){
        const {triangles, halfedges} = this.del,
            vm = this.vertMap,
            v = triangles[start];
        
        // When iterating over incoming edges around a vertex, we do so in
        // clockwise order ('going left'). If the vertex lies on the hull, two
        // of the edges will have no opposite, leaving a gap. If the starting
        // incoming edge is not the right-most, we will miss edges between it
        // and the gap. So walk counter-clockwise until we find an edge on the
        // hull, or get back to where we started.
        
        let inc = prevEdge(start),
            adj = halfedges[inc];
        while(adj !== -1 && adj !== start){
            inc = prevEdge(adj);
            adj = halfedges[inc];
        }
        
        vm[v] = inc;
        return inc;
    }
    
    /**
     * Whether the segment between [p1, p2] intersects with [p3, p4]. When the
     * segments share an end-point (e.g. p1 == p3 etc.), they are not considered
     * intersecting.
     *
     * @private
     * @param p1 The index of point 1 into this.del.coords.
     * @param p2 The index of point 2 into this.del.coords.
     * @param p3 The index of point 3 into this.del.coords.
     * @param p4 The index of point 4 into this.del.coords.
     * @return True if the segments intersect.
     */
    protected intersectSegments(p1: number, p2: number, p3: number, p4: number){
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
     * and p3 (which are in counter-clockwise order).
     *
     * @param p1 The index of point 1 into this.del.coords.
     * @param p2 The index of point 2 into this.del.coords.
     * @param p3 The index of point 3 into this.del.coords.
     * @param px The index of point x into this.del.coords.
     * @return True if (px, py) is in the circumcircle.
     */
    protected inCircle(p1: number, p2: number, p3: number, px: number){
        const pts = this.del.coords;
        return incircle(
            pts[p1 * 2], pts[p1 * 2 + 1],
            pts[p2 * 2], pts[p2 * 2 + 1],
            pts[p3 * 2], pts[p3 * 2 + 1],
            pts[px * 2], pts[px * 2 + 1]
        ) < 0.0;
    }
    
    /**
     * Whether point p1, p2, and p are collinear.
     *
     * @private
     * @param p1 The index of segment point 1 into this.del.coords.
     * @param p2 The index of segment point 2 into this.del.coords.
     * @param p The index of the point p into this.del.coords.
     * @return True if the points are collinear.
     */
    protected isCollinear(p1: number, p2: number, p: number){
        const pts = this.del.coords;
        return orient2d(
            pts[p1 * 2], pts[p1 * 2 + 1],
            pts[p2 * 2], pts[p2 * 2 + 1],
            pts[p * 2], pts[p * 2 + 1]
        ) === 0.0;
    }
    
    static intersectSegments = intersectSegments;
}

/**
 * Compute if two line segments [p1, p2] and [p3, p4] intersect.
 *
 * @name Constrainautor.intersectSegments
 * @source https://github.com/mikolalysenko/robust-segment-intersect
 * @param p1x The x coordinate of point 1 of the first segment.
 * @param p1y The y coordinate of point 1 of the first segment.
 * @param p2x The x coordinate of point 2 of the first segment.
 * @param p2y The y coordinate of point 2 of the first segment.
 * @param p3x The x coordinate of point 1 of the second segment.
 * @param p3y The y coordinate of point 1 of the second segment.
 * @param p4x The x coordinate of point 2 of the second segment.
 * @param p4y The y coordinate of point 2 of the second segment.
 * @return True if the line segments intersect.
 */
function intersectSegments(p1x: number, p1y: number, p2x: number, p2y: number,
        p3x: number, p3y: number, p4x: number, p4y: number){
    const x0 = orient2d(p1x, p1y, p3x, p3y, p4x, p4y),
        y0 = orient2d(p2x, p2y, p3x, p3y, p4x, p4y);
    if((x0 > 0 && y0 > 0) || (x0 < 0 && y0 < 0)) {
        return false
    }

    const x1 = orient2d(p3x, p3y, p1x, p1y, p2x, p2y),
        y1 = orient2d(p4x, p4y, p1x, p1y, p2x, p2y);
    if((x1 > 0 && y1 > 0) || (x1 < 0 && y1 < 0)) {
        return false;
    }

    //Check for degenerate collinear case
    if(x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) {
        return !(Math.max(p3x, p4x) < Math.min(p1x, p2x) ||
            Math.max(p1x, p2x) < Math.min(p3x, p4x) ||
            Math.max(p3y, p4y) < Math.min(p1y, p2y) ||
            Math.max(p1y, p2y) < Math.min(p3y, p4y));
    }

    return true;
}

export default Constrainautor;
