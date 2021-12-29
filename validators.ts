import Constrainautor from './Constrainautor';
import robustIntersect from 'robust-segment-intersect';
import {incircle, orient2d} from 'robust-predicates';

import type {Test} from 'tape';
import type {DelaunatorLike} from './Constrainautor';

type P2 = [number, number];
type PTS = P2[];

/**
 * Maps keys to sets of values.
 *
 * @extends Map
 */
class SetMap<Key, Value> extends Map<Key, Set<Value>> {
    /**
     * Add a value to the set of `key` to the set-map. Adds a new set if the
     * key didn't have one yet.
     *
     * @override
     * @param {any} key The key.
     * @param {any} val The value.
     * @return {SetMap} this.
     */
    set(key: Key, val: Set<Value>): this;
    set(key: Key, val: Value): this;
    set(key: Key, val: Value | Set<Value>): this {
        let set = this.get(key);
        if(!set){
            set = new Set<Value>();
            super.set(key, set);
        }
        if(val instanceof Set){
            for(const v of val){ set.add(v); }
        }else{
            set.add(val);
        }
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
    delete(key: Key, val?: Value){
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
 * @param t The tape test argument.
 * @param points The points to delaunate.
 * @param del The Delaunator output.
 */
function validateDelaunator(t: Test, points: PTS, del: DelaunatorLike){
    let failed = false;
    // validate halfedges
    for(let edg = 0; edg < del.triangles.length; edg++){
        const adj = del.halfedges[edg];
        if(adj === -1){
            continue;
        }
        
        if(del.halfedges[adj] !== edg){
            t.fail(`invalid halfedge connection: ${edg} -> ${adj} != ${del.halfedges[adj]} -> ${edg}`);
            failed = true;
        }
        
        const e1 = del.triangles[edg],
            e2 = del.triangles[nextEdge(edg)],
            a1 = del.triangles[adj],
            a2 = del.triangles[nextEdge(adj)];
        
        if(e1 !== a2 && e2 !== a1){
            t.fail(`halfedges ${edg}/${adj} do not share end-points (${e1}, ${e2}) / (${a2}, ${a1})`);
            failed = true;
        }
    }

    // validate triangulation
    const hullAreas = [],
        hulLen = del.hull.length;
    for(let i = 0, j = hulLen - 1; i < hulLen; j = i++){
        const [x0, y0] = points[del.hull[j]];
        const [x, y] = points[del.hull[i]];
        hullAreas.push((x - x0) * (y + y0));
        const c = convex(
            points[del.hull[j]],
            points[del.hull[(j + 1) % del.hull.length]],
            points[del.hull[(j + 3) % del.hull.length]]
        );
        if(!c){
            t.fail(`hull is not convex at ${j}`);
            failed = true;
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
    if(err > Math.pow(2, -51)){
        t.fail(`triangulation is broken: ${err} error`);
        failed = true;
    }
    
    t.assert(!failed, `triangulation is valid`);
    return failed;
}

function convex(r: P2, q: P2, p: P2){
    return (orient2d(...p, ...r, ...q) ||
            orient2d(...r, ...q, ...p) ||
            orient2d(...q, ...p, ...r)) >= 0;
}

// Kahan and Babuska summation, Neumaier variant; accumulates less FP error
function sum(x: number[]){
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

function nextEdge(e: number){ return (e % 3 === 2) ? e - 2 : e + 1; }
function prevEdge(e: number){ return (e % 3 === 0) ? e + 2 : e - 1; }

/**
 * Validate the vertMap of a Constrainautor:
 * - Every point has at least one incoming edge.
 * - All incoming edges to a point can be reached by walking around the point
 *   starting at the edge in `con.vertMap`.
 *
 * @param t The tape test argument.
 * @param points The points of the triangulation.
 * @param con The constrainautor.
 */
function validateVertMap(t: Test, points: PTS, con: Constrainautor){
    const del = con.del,
        numPoints = points.length,
        numEdges = del.triangles.length,
        edgeMap = new SetMap<number, number>();
    let failed = false;
    
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
            //t.fail("point has no incoming edges");
            continue;
        }
        
        const start = con.vertMap[i];
        let edg = start;
        do{
            if(!inc.has(edg)){
                t.fail(`edge ${edg} incorrectly marked as incoming to point ${i}`);
                failed = true;
            }
            
            inc.delete(edg);
            const nxt = nextEdge(edg),
                adj = del.halfedges[nxt];
            edg = adj;
        }while(edg !== -1 && edg !== start);
        
        if(inc.size){
            t.fail(`edges missed while walking around point: ${i}: ${inc}`);
            failed = true;
        }
        edgeMap.delete(i);
    }
    
    if(edgeMap.size){
        t.fail(`invalid points in edge map: ${edgeMap}`);
        failed = true;
    }
    
    t.assert(!failed, `vertMap is valid`);
    return failed;
}

/**
 * Validate the flips array of a Constrainautor:
 * - All entries have either the IGND, CONSD, or FLIPD value, and no other.
 * - Linked half-edges have the same flip value.
 * - If requested, FLIPD values were cleared by delaunify.
 *
 * @param t The tape test argument.
 * @param con The constrainautor.
 * @param edges The edge ids of constraint edges, as returned by constrainOne.
 * @param clear If `true`, disallow FLIPD values.
 */
function validateFlips(t: Test, con: Constrainautor, clear = true){
    const del = con.del,
        numEdges = del.triangles.length;
    let failed = false;
    
    for(let edg = 0; edg < numEdges; edg++){
        const flp = con.flips[edg],
            adj = del.halfedges[edg];
        
        if(flp !== Constrainautor.IGND && flp !== Constrainautor.CONSD && flp !== Constrainautor.FLIPD){
            t.fail(`invalid flip value for ${edg}/${adj}: ${flp}`);
            failed = true;
        }
        if(clear && flp !== Constrainautor.CONSD && flp !== Constrainautor.IGND){
            t.fail(`flip not cleared for ${edg}/${adj}: ${flp}`);
            failed = true;
        }
        
        if(adj === -1){
            continue;
        }
        
        if(flp !== con.flips[adj] || con.isConstrained(edg) !== con.isConstrained(adj)){
            t.fail(`flip status inconsistent for ${edg}/${adj}: ${flp}/${con.flips[adj]}`);
            failed = true;
        }
    }
    
    t.assert(!failed, `flips array is valid`);
    return failed;
}

/**
 * Check that non-constrained edges are Delaunay.
 * 
 * @param t The tape test argument.
 * @param con The constrainautor.
 */
function validateDelaunay(t: Test, con: Constrainautor){
    const del = con.del,
        pts = del.coords,
        len = del.triangles.length;
    let failed = false;

    for(let edg = 0; edg < len; edg++){
        const adj = del.halfedges[edg];
        if(con.isConstrained(edg) || adj < edg){ // also catches adj === -1
            continue;
        }
        /*
         *         e2/a1
         *           o 
         *         / | \
         *        /  |  \
         *       /   |   \
         *      /    |    \
         *  e3 o edg | adj o a3
         *      \    |    /
         *       \   |   /
         *        \  |  /
         *         \ | /
         *           o 
         *         e1/a2
         */
        const e1 = del.triangles[edg],
            e2 = del.triangles[nextEdge(edg)],
            e3 = del.triangles[nextEdge(nextEdge(edg))],
            a3 = del.triangles[nextEdge(nextEdge(adj))],
            p1x = pts[e1 * 2], p1y = pts[e1 * 2 + 1],
            p2x = pts[e2 * 2], p2y = pts[e2 * 2 + 1],
            p3x = pts[e3 * 2], p3y = pts[e3 * 2 + 1],
            p4x = pts[a3 * 2], p4y = pts[a3 * 2 + 1];
        
        const isD = incircle(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y);
        if(isD < 0){
            t.fail(`triangles shared by ${edg}/${adj} not Delaunay (${isD})`);
            failed = true;
        }
    }

    t.assert(!failed, `all edges are Delaunay`)
    return failed;
}

/**
 * Validate that an edge was correctly constrained:
 * - `constrainOne` returned the correct value.
 * - The constrained edge occurs exactly once.
 * - If not on the hull, the adjacent edge occurs exactly once.
 * - No edge intersects the constrained edge.
 * - The constrained edge is marked in the flips array.
 * 
 * @param t The tape test argument.
 * @param points The points of the triangulation.
 * @param con The constrainautor.
 * @param ret The return value from `con.constrainOne(p1, p2)`.
 * @param p1 The index of point 1.
 * @param p2 The index of point 2.
 */
function validateConstraint(t: Test, points: PTS, con: Constrainautor, ret: number | undefined, p1: number, p2: number){
    const del = con.del,
        numEdges = del.triangles.length,
        [x1, y1] = points[p1],
        [x2, y2] = points[p2],
        re1 = ret === undefined ? -1 : (ret < 0 ? del.triangles[nextEdge(-ret)] : del.triangles[ret]),
        re2 = ret === undefined ? -1 : (ret < 0 ? del.triangles[-ret] : del.triangles[nextEdge(ret)]);
    let failed = false;
    
    if(ret !== undefined && (re1 !== p1 || re2 !== p2)){
        t.fail(`invalid edge returned from constrainOne: ${ret}: ${p1} -> ${p2} === ${re1} -> ${re2}`);
        failed = true;
    }
    
    let found = -1,
        foundAdj = -1;
    
    for(let edg = 0; edg < numEdges; edg++){
        const e1 = del.triangles[edg],
            e2 = del.triangles[nextEdge(edg)];
        
        if(e1 === p1 && e2 === p2){
            if(found !== -1){
                t.fail(`edge ${edg} is duplicate of constraint`);
                failed = true;
            }
            found = edg;
        }else if(e1 === p2 && e2 === p1){
            if(foundAdj !== -1){
                t.fail(`edge ${edg} is reversed duplicate of constraint`);
                failed = true;
            }
            foundAdj = edg;
        }
        
        if(e1 === p1 || e1 === p2 || e2 === p1 || e2 === p2){
            continue;
        }
        
        const [x3, y3] = points[e1],
            [x4, y4] = points[e2];
        
        if(robustIntersect([x1, y1], [x2, y2], [x3, y3], [x4, y4])){
            t.fail(`edge ${edg} intersects constrained edge ${p1} -> ${p2}`);
            failed = true;
        }
    }
    
    if(found === -1 && foundAdj === -1){
        t.fail(`constrained edge not in triangulation`);
        failed = true;
    }
    if(found !== -1 && !con.isConstrained(found)){
        t.fail(`constrained edge not marked`);
        failed = true;
    }
    if(foundAdj !== -1 && !con.isConstrained(foundAdj)){
        t.fail(`reverse constrained edge not marked`);
        failed = true;
    }
    
    t.assert(!failed, `constraint ${p1} -> ${p2}: ${ret === undefined ? `(${found})` : ret} is valid`);
    return failed;
}

function validateAllConstraints(t: Test, points: PTS, edges: PTS, con: Constrainautor){
    for(const [p1, p2] of edges){
        validateConstraint(t, points, con, undefined, p1, p2);
    }
}

export {
    validateDelaunator,
    validateVertMap,
    validateConstraint,
    validateFlips,
    validateDelaunay,
    validateAllConstraints,
    SetMap
};
