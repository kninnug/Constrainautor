declare module 'robust-segment-intersect' {
    type P2 = [number, number];
 	export default function robustIntersect(p1: P2, p2: P2, p3: P2, p4: P2): boolean;
}