Constrainautor
==============

A small library for constraining triangulations from [Delaunator](https://github.com/mapbox/delaunator).

![Constrained triangulation](strain.png)

Example
-------

Constrainautor takes a Delaunay triangulation (from Delaunator), and turns it
into a *constrained* (but not necessarily *conforming*) triangulation. You
specify two points in the triangulation, and Constrainautor ensures there is an
edge between those points.

	// A diamond
	const points = [[150, 50], [50, 200], [150, 350], [250, 200]],
		// Creates a horizontal edge in the middle
		del = Delaunator.from(points),
		con = new Constrainautor(del);
	
	// .. but we want a vertical edge, from [150, 50] to [150, 350]:
	con.constrainOne(0, 2);
	con.delaunify();
	// del now has the constrained triangulation, in the same format that
	// Delaunator outputs

![Constrained diamond](diamond.png)

Install
-------

Install from NPM:

	npm install @kninnug/constrainautor
	
Use in Node.js:

	const Constrainautor = require('@kninnug/constrainautor');
	
or as an ECMAScript/ES6 module:

	import Constrainautor from '@kninnug/constrainautor';

or in the browser:

	<script src="node_modules/@kninnug/constrainautor/Constrainautor.js"></script>

or minified:

	<script src="node_modules/@kninnug/constrainautor/Constrainautor.min.js"></script>

The Constrainautor library does not depend on Delaunator itself, but the input
is expected to be in the format that Delaunator outputs. The ES module variant
(`Constrainautor.mjs`) depends on
[robust-predicates](https://www.npmjs.com/package/robust-predicates), but the
browser and minified versions (`Constrainautor.js` and `Constrainautor.min.js`)
come with this dependency compiled in, and can be used standalone.

Usage
-----

Besides being in the format that Delaunator outputs, the library has these other
requirements on the input data:

- Points are not duplicated, i.e. no two points have the same x and y coordinates.
- No two constrained edges intersect with eachother.
- Constrained edges do not intersect with any point in the triangulation (beside
  their end-points).
- The outer edges of the triangulation form a convex hull.
- The triangulation has no holes.

The last two requirements are already guaranteed by Delaunator, but are 
important to keep in mind if you modify the triangulation before passing it to
Constrainautor. If one or more of these requirements are not met, the library
may throw an error during constrainment, or produce bogus results.
  
To triangulate a set of points, and constrain certain edges:

1. Define the points to be triangulated: `points = [[x1, y1], [x2, y2], ...]`.
2. Generate a triangulation (using Delaunator): `del = Delaunator.from(points)`.
3. Make a constrainer: `con = new Constrainautor(del)`. Note that `del` will be
   modified by the Constrainautor methods.
4. Define the edges to be constrained: `edges = [[0, 1], [3, 4], ...]`. These are
   indices into the `points` array.
5. Constrain the triangulation: `for(const [p1, p2] of edges){ con.constrainOne(p1, p2); }`.
6. Restore the Delaunay condition: `con.delaunify()`.

Alternatively, you can call `con.constrainAll(edges)`, which will constrain all
the edges in the supplied array and call `delaunify`.

You can then use the triangulation in `del` as described in the [Delaunator
guide](https://mapbox.github.io/delaunator/).

If you change the point coordinates and their triangulation (via `Delaunator#update`),
you need to re-constrain the edges by creating a `new Constrainautor` and going
through steps 3 - 6 again.

API reference
-------------

More details can be found in the comments of `Constrainautor.mjs`.

### con = new Constrainautor(del)

Construct a new Constrainautor from the given triangulation. The `del` object
should be returned from Delaunator, and is modified in-place by the 
Constrainautor methods.

#### con.constrainOne(p1, p2)

Constrain an edge in the triangulation. The arguments `p1` and `p2` must be
indices into the `points` array originally supplied to the Delaunator. It 
returns the id of the half-edge that points from `p1` to `p2`, or the negative
id of the half-edge that points from `p2` to `p1`.

#### con.delaunify(force = false)

After constraining edges, call this method to restore the Delaunay condition
(for every two triangles sharing an edge, neither lies completely within the
circumcircle of the other), for every edge that was flipped by `constrainOne`.
If `force` is `true`, it will check & correct every non-constrained edge
(regardless of whether it was touched by `constrainOne`).

#### con.constrainAll(edges)

A shortcut to constraining an array of edges by `constrainOne` and calling
`delaunify` afterwards. The argument `edges` must be an array of arrays of 
indices into the `points` array originally supplied to Delaunator, i.e:
`[[p1, p2], [p3, p4], ...]`. Returns the updated `del` object.

#### con.isConstrained(edg)

Whether the half-edge with the given id is a constraint edge. Returns true if
`edg` (or `-edg`) was earlier returned by a call to `constrainOne`. Note: this
doesn't try to detect if the edge must be a constraint, merely that it has been
marked as such by the `Constrainautor` instance.

Details
-------

At construction time, the Constrainautor library allocates two arrays, in 
addition to the arrays already present in the Delaunator output:

- `vertMap`: a mapping of each point (vertex) in the triangulation to the (id of
  the) left-most edge that points to that vertex. This is used to find the edges
  connected to any given point.
- `flips`: keeps track of the edges that were flipped or constrained. It is used
  by `delaunify` to determine which edges may need to be flipped again to 
  restore the Delaunay condition.
  
During the constraining process, or the re-Delaunay-fying afterwards, the 
library does no dynamic allocations. This is also the reason that `constrainOne`
does not restore the Delaunay condition immediately, as that would require 
keeping track of an unbounded list of flipped edges. Rather, it sets `flips` to
1 at the index of each newly created edge, which `delaunify` iterates over to
check and restore the Delaunay condition.

The library uses robust geometric predicates from
[robust-predicates](https://github.com/mourner/robust-predicates) and
[robust-segment-intersect](https://github.com/mikolalysenko/robust-segment-intersect),
and should not break on smallish inputs. This can be changed by extending the
class and overriding the `intersectSegments`, `inCircle`, and `isCollinear`
methods. See the comments in `Constrainautor.mjs` on how they should behave.

Known issues
------------

- `delaunify` might not restore the Delaunay condition for all triangle pairs
  when that requires flipping edges more than once.

Attributions
------------

- The constraining algorithm is adapted from [A fast algorithm for generating constrained Delaunay triangulations](https://www.newcastle.edu.au/__data/assets/pdf_file/0019/22519/23_A-fast-algortithm-for-generating-constrained-Delaunay-triangulations.pdf), 1992, S. W. Sloan.
- Uses Vladimir Agafonkin's [robust-predicates](https://github.com/mourner/robust-predicates) port
  of Jonathan Shewchuk's [Adaptive Precision Floating-Point Arithmetic and Fast Robust Predicates
  for Computational Geometry](http://www.cs.cmu.edu/~quake/robust.html).
- Robust segment-segment intersection test adapted from Mikola Lysenko's
  [robust-segment-intersect](https://github.com/mikolalysenko/robust-segment-intersect).
