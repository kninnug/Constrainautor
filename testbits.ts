import tape from 'tape';
import {BitSet8, BitSet16, BitSet32} from './BitSet';

import type {BitSet} from './BitSet';
import type {Test} from 'tape';

function checkEmpty(t: Test, bs: BitSet, size: number){
    let failed = false;
    for(let i = 0; i < size; i++){
        if(bs.has(i)){
            t.fail(`empty set should not have ${i}`);
            failed = true;
        }
    }
    t.assert(!failed, `set is empty`);
}
function checkFull(t: Test, bs: BitSet, size: number){
    let failed = false;
    for(let i = 0; i < size; i++){
        if(!bs.has(i)){
            t.fail(`full set should have ${i}`);
            failed = true;
        }
    }
    t.assert(!failed, `set is full`);
}
function testFull(t: Test, bs: BitSet, size: number){
    checkEmpty(t, bs, size);

    for(let i = 0; i < size; i++){
        if(bs.has(i)){
            t.fail(`should not have ${i} yet`);
        }
        bs.add(i);
        t.assert(bs.has(i), `has ${i} now`)
    }

    checkFull(t, bs, size);

    let last = -1;
    bs.forEach(i => {
        t.assert(i === last + 1, `iterated ${last}`);
        last = i;
    });
    t.assert(last + 1 === size, `iterated ${last}`);

    for(let i = 0; i < size; i++){
        if(!bs.has(i)){
            t.fail(`should still have ${i}`);
        }
        bs.delete(i);
        t.assert(!bs.has(i), `does not have ${i} now`);
    }

    checkEmpty(t, bs, size);

    for(let i = 0; i < size; i++){
        if(bs.has(i)){
            t.fail(`should not have ${i} yet`);
        }
        bs.set(i, true);
        t.assert(bs.has(i), `set ${i}`);
    }

    checkFull(t, bs, size);

    for(let i = 0; i < size; i++){
        if(!bs.has(i)){
            t.fail(`should still have ${i}`);
        }
        bs.set(i, false);
        t.assert(!bs.has(i), `unset ${i}`);
    }

    checkEmpty(t, bs, size);

    const need = new Set<number>();
    for(let i = 0; i < size; i += 2){
        if(bs.has(i - 1)){
            t.fail(`should not have previous: ${i - 1}`);
        }
        bs.add(i);
        need.add(i);
    }

    const need2 = new Set(need);
    bs.forEach(i => {
        t.assert(need2.has(i), `iterated halfth ${i}`);
        need2.delete(i);
    });
    t.equal(need2.size, 0, `iterated all halfths`);

    for(let i = 0; i < size; i++){
        t.equal(bs.has(i), need.has(i), `has${need.has(i) ? '' : ' not'} halfth ${i}`);
        need.delete(i);
    }
    t.equal(need.size, 0, `found all halfths`);

    t.end();
}

function main(args: string[]){
    const sizes = [0, 1, 2, 3, 7, 8, 9, 14, 15, 16, 17, 18, 126, 127, 128, 129, 130];
    for(const ctr of [BitSet8, BitSet16, BitSet32]){
        for(const size of sizes){
            tape(`${ctr.name} ${size}`, t => testFull(t, new (ctr)(size), size));
        }
    }
}

main(process.argv.slice(2));
