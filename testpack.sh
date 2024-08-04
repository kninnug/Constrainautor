#!/bin/bash

set -e

EXAMPLE=$(cat <<EOF
console.log('C', Constrainautor);
// A diamond
const points = [[150, 50], [50, 200], [150, 350], [250, 200]],
    // Creates a horizontal edge in the middle
    del = Delaunator.from(points),
    con = new Constrainautor(del);

// .. but we want a vertical edge, from [150, 50] to [150, 350]:
con.constrainOne(0, 2);
// del now has the constrained triangulation, in the same format that
// Delaunator outputs
console.log('del', del.triangles, del.halfedges);
EOF
)

SOURCE=$(realpath "$PWD")
DIR=$(mktemp -d)

echo "Running in $DIR"

cd "$DIR"
echo "Packing $SOURCE"
PACK=$(npm --silent pack "$SOURCE")
npm install "./$PACK" typescript delaunator@4
echo "CommonJS"
node --input-type=commonjs -e "const Constrainautor = require('@kninnug/constrainautor'), Delaunator = require('delaunator'); $EXAMPLE"
echo "CJS Minified"
node --input-type=commonjs -e "const Constrainautor = require('@kninnug/constrainautor/min'), Delaunator = require('delaunator'); $EXAMPLE"
echo "ES Module"
node --input-type=module -e "import Constrainautor from '@kninnug/constrainautor'; import Delaunator from 'delaunator'; $EXAMPLE"
echo "ESM Minified"
node --input-type=module -e "import Constrainautor from '@kninnug/constrainautor/min'; import Delaunator from 'delaunator'; $EXAMPLE"
echo "TypeScript"
cat <<EOF > ./test.ts
import Constrainautor from '@kninnug/constrainautor';
import Delaunator from 'delaunator';
console.log('C', Constrainautor);
$EXAMPLE
EOF
npx tsc --esModuleInterop true ./test.ts
node ./test.js

cd ".."
rm -rf "$DIR"
