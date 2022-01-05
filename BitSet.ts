/**
 * A set of numbers, stored as bits in a typed array. The amount of numbers / 
 * the maximum number that can be stored is limited by the length, which is
 * fixed at construction time.
 */
abstract class BitSet {
    protected readonly bs: Uint8Array | Uint16Array | Uint32Array;
    protected readonly W: 8 | 16 | 32;

    protected constructor(W: typeof BitSet.prototype.W, bs: typeof BitSet.prototype.bs){
        this.W = W;
        this.bs = bs;
    }

    /**
     * Add a number to the set.
     * 
     * @param idx The number to add. Must be 0 <= idx < len.
     * @return this.
     */
    add(idx: number){
        const W = this.W,
            byte = (idx / W) | 0,
            bit = idx % W;
        this.bs[byte] |= 1 << bit;
        return this;
    }

    /**
     * Delete a number from the set.
     * 
     * @param idx The number to delete. Must be 0 <= idx < len.
     * @return this.
     */
    delete(idx: number){
        const W = this.W,
            byte = (idx / W) | 0,
            bit = idx % W;
        this.bs[byte] &= ~(1 << bit);
        return this;
    }

    /**
     * Add or delete a number in the set, depending on the second argument.
     * 
     * @param idx The number to add or delete. Must be 0 <= idx < len.
     * @param val If true, add the number, otherwise delete.
     * @return val.
     */
    set(idx: number, val: boolean){
        const W = this.W,
            byte = (idx / W) | 0,
            bit = idx % W,
            m = 1 << bit;
        //this.bs[byte] = set ? this.bs[byte] | m : this.bs[byte] & ~m;
        this.bs[byte] ^= (-val ^ this.bs[byte]) & m; // -set == set * 255
        return val;
    }

    /**
     * Whether the number is in the set.
     * 
     * @param idx The number to test. Must be 0 <= idx < len.
     * @return True if the number is in the set.
     */
    has(idx: number){
        const W = this.W,
            byte = (idx / W) | 0,
            bit = idx % W;
        return !!(this.bs[byte] & (1 << bit));
    }

    /**
     * Iterate over the numbers that are in the set. The callback is invoked
     * with each number that is set. It is allowed to change the BitSet during
     * iteration. If it deletes a number that has not been iterated over, that
     * number will not show up in a later call. If it adds a number during
     * iteration, that number may or may not show up in a later call.
     * 
     * @param fn The function to call for each number.
     * @return this.
     */
    forEach(fn: (idx: number) => void){
        const W = this.W,
            bs = this.bs,
            len = bs.length;
        for(let byte = 0; byte < len; byte++){
            let bit = 0;
            // bs[byte] may change during iteration
            while(bs[byte] && bit < W){
                if(bs[byte] & (1 << bit)){
                    fn(byte * W + bit);
                }
                bit++;
            }
        }
        return this;
    }
}

export type { BitSet };

/**
 * A bit set using 8 bits per cell.
 */
export class BitSet8 extends BitSet {
    /**
     * Create a bit set.
     * 
     * @param len The length of the bit set, limiting the maximum value that
     *        can be stored in it to len - 1.
     */
    constructor(len: number){
        const W = 8,
            bs = new Uint8Array(Math.ceil(len / W)).fill(0);
        super(W, bs);
    }
}

/**
 * A bit set using 16 bits per cell.
 */
export class BitSet16 extends BitSet {
    /**
     * Create a bit set.
     * 
     * @param len The length of the bit set, limiting the maximum value that
     *        can be stored in it to len - 1.
     */
    constructor(len: number){
        const W = 16,
            bs = new Uint16Array(Math.ceil(len / W)).fill(0);
        super(W, bs);
    }
}

/**
 * A bit set using 32 bits per cell.
 */
export class BitSet32 extends BitSet {
    /**
     * Create a bit set.
     * 
     * @param len The length of the bit set, limiting the maximum value that
     *        can be stored in it to len - 1.
     */
    constructor(len: number){
        const W = 32,
            bs = new Uint32Array(Math.ceil(len / W)).fill(0);
        super(W, bs);
    }
}
