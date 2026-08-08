/**
 * A canvas context that records instead of painting.
 *
 * Pixel comparison alone is a poor way to test a sprite renderer: it fails on
 * every legitimate colour tweak and says nothing about *why*. Most of what can
 * go wrong here is structural, and structure is visible in the call sequence:
 *
 * - unbalanced save/restore, which silently corrupts every sprite drawn after
 *   the offending one — a mistake made while writing the Angry Corso muzzle
 * - geometry escaping the body, which is how a limb detaches in a pose nobody
 *   inspected
 * - a pose that draws exactly what the idle pose draws, which is what "the
 *   enemy has no attack animation" looks like from the outside
 *
 * The recorder tracks the transform matrix, so recorded points are in the
 * caller's coordinate space rather than the sprite's local one.
 */

export interface RecordedPoint {
  x: number;
  y: number;
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

const apply = (m: Matrix, x: number, y: number): RecordedPoint => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f,
});

export class RecordingContext {
  /** Every point touched by a draw call, in the caller's coordinate space. */
  points: RecordedPoint[] = [];

  /** One entry per draw call: the operation and the fill or stroke colour. */
  operations: string[] = [];

  /**
   * Alpha in force at each draw call, aligned with `operations`.
   *
   * Kept separate rather than folded into the operation string because tests
   * assert on `operations` by exact value. Some effects change nothing but
   * transparency — the damage flash is one — and without this they are
   * invisible to a recorder that logs only geometry and colour.
   */
  alphas: number[] = [];

  saveCount = 0;
  restoreCount = 0;

  /**
   * How many curved segments were laid down.
   *
   * The sprites are almost entirely rectangles, arcs and straight lines, so a
   * quadratic curve is a strong signal for the handful of shapes drawn by
   * helpers -- the flame tattoos being the one tests care about. Counting
   * them is how a test can ask whether a detail survived a pose change
   * without pinning its exact geometry.
   */
  curveCount = 0;

  /** True if restore() was ever called with nothing on the stack. */
  underflowed = false;

  fillStyle: string | CanvasGradient = '#000000';
  strokeStyle: string | CanvasGradient = '#000000';
  lineWidth = 1;
  lineJoin = 'miter';
  lineCap = 'butt';
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign = 'start';
  shadowColor = 'transparent';
  shadowBlur = 0;

  private matrix: Matrix = { ...IDENTITY };
  private stack: Matrix[] = [];

  /** Depth left open at the end of a render. Anything but 0 is a bug. */
  get depth(): number {
    return this.stack.length;
  }

  private record(op: string, ...points: RecordedPoint[]) {
    const colour = typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient';
    this.operations.push(`${op}:${colour}`);
    this.alphas.push(this.globalAlpha);
    this.points.push(...points);
  }

  // -- state -------------------------------------------------------------
  save() {
    this.saveCount++;
    this.stack.push({ ...this.matrix });
  }

  restore() {
    this.restoreCount++;
    const previous = this.stack.pop();
    if (!previous) {
      this.underflowed = true;
      return;
    }
    this.matrix = previous;
  }

  // -- transforms --------------------------------------------------------
  translate(x: number, y: number) {
    this.matrix = multiply(this.matrix, { ...IDENTITY, e: x, f: y });
  }

  scale(x: number, y: number) {
    this.matrix = multiply(this.matrix, { ...IDENTITY, a: x, d: y });
  }

  rotate(angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.matrix = multiply(this.matrix, { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }

  // -- paths -------------------------------------------------------------
  private pending: RecordedPoint[] = [];

  beginPath() {
    this.pending = [];
  }

  closePath() {}

  moveTo(x: number, y: number) {
    this.pending.push(apply(this.matrix, x, y));
  }

  lineTo(x: number, y: number) {
    this.pending.push(apply(this.matrix, x, y));
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.curveCount++;
    this.pending.push(apply(this.matrix, cx, cy), apply(this.matrix, x, y));
  }

  arc(x: number, y: number, r: number, _start?: number, _end?: number) {
    this.pending.push(
      apply(this.matrix, x - r, y - r),
      apply(this.matrix, x + r, y + r)
    );
  }

  ellipse(x: number, y: number, rx: number, ry: number) {
    this.pending.push(
      apply(this.matrix, x - rx, y - ry),
      apply(this.matrix, x + rx, y + ry)
    );
  }

  rect(x: number, y: number, w: number, h: number) {
    this.pending.push(apply(this.matrix, x, y), apply(this.matrix, x + w, y + h));
  }

  roundRect(x: number, y: number, w: number, h: number, _radii?: unknown) {
    this.rect(x, y, w, h);
  }

  fill() {
    this.record('fill', ...this.pending);
  }

  stroke() {
    this.record('stroke', ...this.pending);
  }

  clip() {}

  // -- immediate draws ---------------------------------------------------
  fillRect(x: number, y: number, w: number, h: number) {
    this.record('fillRect', apply(this.matrix, x, y), apply(this.matrix, x + w, y + h));
  }

  strokeRect(x: number, y: number, w: number, h: number) {
    this.record('strokeRect', apply(this.matrix, x, y), apply(this.matrix, x + w, y + h));
  }

  fillText(text: string, x: number, y: number) {
    this.operations.push(`fillText:${text}`);
    this.points.push(apply(this.matrix, x, y));
  }

  measureText(text: string) {
    return { width: text.length * 6 };
  }

  drawImage(_img: unknown, x: number, y: number, w = 0, h = 0) {
    this.record('drawImage', apply(this.matrix, x, y), apply(this.matrix, x + w, y + h));
  }

  createRadialGradient() {
    return { addColorStop: () => {} };
  }

  /** Bounding box of everything drawn, or null if nothing was. */
  bounds() {
    if (this.points.length === 0) return null;
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }
}

/** Typed as a real context for the renderer, which only uses the subset above. */
export const asContext = (recorder: RecordingContext) =>
  recorder as unknown as CanvasRenderingContext2D;
