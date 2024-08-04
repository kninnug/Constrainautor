import type {BitSet} from './BitSet';
import {BitSet8, BitSet16, BitSet32} from './BitSet';
import {fmtTime, summarizeTimes} from './bench';

function prepare(bs: BitSet, size: number){
    for(let i = 0; i < size; i++){
        if(Math.random() > 0.5){
            bs.add(i);
        }
    }
    return bs;
}

function benchCB(bs: BitSet, iter: number){
    const times = new Array();
    for(let i = 0; i < iter; i++){
        const start = process.hrtime.bigint();
        let count = 0;
        bs.forEach(idx => count += idx%2);
        const end = process.hrtime.bigint();
        times.push(end - start);
    }
    return times;
}

function cloneInto(a: BitSet, b: BitSet){
    a.forEach(idx => b.add(idx));
    return b;
}

async function main(args: string[]){
    const size = args[0] ? +args[0] : 4096;
    const ITER = args[1] ? +args[1] : 10;
    const bs8 = prepare(new BitSet8(size), size);
    const bs16 = cloneInto(bs8, new BitSet16(size));
    const bs32 = cloneInto(bs8, new BitSet32(size));

    console.log('size:', size, 'iter:', ITER);

    const times8 = benchCB(bs8, ITER);
    console.table(summarizeTimes(times8));
    const times16 = benchCB(bs16, ITER);
    console.table(summarizeTimes(times16));
    const times32 =  benchCB(bs32, ITER);
    console.table(summarizeTimes(times32));

    /*
    console.log('callback');
    for(let i = 0; i < ITER; i++){
        const start = process.hrtime.bigint();
        let count = 0;
        bs8.forEach(idx => count += idx%2);
        const end = process.hrtime.bigint();
        console.log('count:', count, 'time:', fmtTime(end - start));
    }
    
    console.log('iterator');
    for(let i = 0; i < ITER; i++){
        const start = process.hrtime.bigint();
        let count = 0;
        for(const idx of bs8){
            count += idx%2;
        }
        const end = process.hrtime.bigint();
        console.log('count:', count, 'time:', fmtTime(end - start));
    }
    */
}

main(process.argv.slice(2)).catch(ex => { throw ex; });
