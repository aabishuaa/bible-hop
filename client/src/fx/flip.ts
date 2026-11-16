// The page turn. When a player hops, the pages of the Bible riffle from the verse they left to
// the verse they land on: forwards toward Revelation, backwards toward Genesis. Each page is a
// sheet that bends as it turns, lit from above, washed in the color of the hop. It is drawn with
// WebGL on a canvas over the page; the real text waits underneath and is uncovered as the last
// page lands.

export type Tex = HTMLCanvasElement;

export interface FlipPlan {
  /** The right-hand page, in viewport pixels. Its left edge is the book's spine. */
  page: { x: number; y: number; w: number; h: number };
  /** True when the left-hand page is on screen too (a two-page spread). */
  spread: boolean;
  /** 1 turns pages forward (right to left); -1 turns them back. */
  dir: 1 | -1;
  leaves: number;
  /** Milliseconds for one page to turn, and the pause before the next one starts. */
  duration: number;
  stagger: number;
  /** How far the free edge lags behind as the page bends, 0 to 0.95. */
  curl: number;
  tint: [number, number, number];
  fromRight: Tex;
  toRight: Tex;
  fromLeft?: Tex;
  toLeft?: Tex;
  /** Printed pages for the leaves in between. */
  generic: Tex[];
  onLeaf?: (index: number) => void;
}

const VERT = `
attribute vec3 a_pos;
attribute vec2 a_uv;
attribute vec2 a_n;
uniform vec2 u_view;
uniform vec3 u_cam;
uniform float u_bias;
varying vec2 v_uv;
varying vec3 v_n;
varying vec3 v_pos;
void main() {
  float s = u_cam.z / (u_cam.z - a_pos.z);
  vec2 p = u_cam.xy + (a_pos.xy - u_cam.xy) * s;
  vec2 clip = vec2(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0);
  gl_Position = vec4(clip, -(a_pos.z + u_bias) / (u_cam.z * 1.5), 1.0);
  v_uv = a_uv;
  v_n = vec3(a_n.x, 0.0, a_n.y);
  v_pos = a_pos;
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_front;
uniform sampler2D u_back;
uniform vec3 u_cam;
uniform vec3 u_tint;
uniform float u_wash;
uniform float u_alpha;
varying vec2 v_uv;
varying vec3 v_n;
varying vec3 v_pos;
void main() {
  vec3 n = normalize(v_n);
  vec3 v = normalize(vec3(u_cam.xy - v_pos.xy, u_cam.z - v_pos.z));
  vec4 c;
  if (dot(n, v) >= 0.0) {
    c = texture2D(u_front, v_uv);
  } else {
    c = texture2D(u_back, vec2(1.0 - v_uv.x, v_uv.y));
    n = -n;
  }
  vec3 light = normalize(vec3(-0.32, -0.28, 0.9));
  float diffuse = clamp(dot(n, light), 0.0, 1.0);
  float shade = 0.56 + 0.44 * diffuse;
  shade *= mix(0.84, 1.0, smoothstep(0.0, 0.12, v_uv.x));
  // a little shine where the bending paper catches the light
  float shine = pow(clamp(dot(n, normalize(light + v)), 0.0, 1.0), 24.0) * 0.14;
  vec3 col = c.rgb * shade + shine;
  // the hop's color washes over the turning page, and gilds its free edge
  col = mix(col, col * (0.35 + u_tint * 1.15), u_wash);
  col = mix(col, u_tint * (0.75 + 0.5 * diffuse), smoothstep(0.972, 1.0, v_uv.x) * 0.9);
  gl_FragColor = vec4(col, 1.0) * u_alpha;
}`;

const SHADOW_VERT = `
attribute vec2 a_pos;
attribute float a_alpha;
uniform vec2 u_view;
varying float v_a;
void main() {
  gl_Position = vec4(a_pos.x / u_view.x * 2.0 - 1.0, 1.0 - a_pos.y / u_view.y * 2.0, 0.999, 1.0);
  v_a = a_alpha;
}`;

const SHADOW_FRAG = `
precision mediump float;
varying float v_a;
void main() { gl_FragColor = vec4(0.16, 0.09, 0.03, 1.0) * v_a; }`;

const COLS = 30;
const FLOATS = 7;
const VERTS = (COLS + 1) * 2;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
/** Quick to lift, gentle to land. */
const ease = (x: number) => {
  const smooth = x * x * (3 - 2 * x);
  const out = 1 - Math.pow(1 - x, 3);
  return smooth * 0.55 + out * 0.45;
};

export class FlipStage {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private shadowProg: WebGLProgram | null = null;
  private buf: WebGLBuffer | null = null;
  private shadowBuf: WebGLBuffer | null = null;
  private data = new Float32Array(VERTS * FLOATS);
  private textures = new Map<Tex, WebGLTexture>();
  private raf = 0;
  private dpr = 1;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private sloc: Record<string, WebGLUniformLocation | null> = {};
  ok = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flip-stage';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.canvas);
    try {
      const gl = (this.canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, depth: true }) ?? null) as WebGLRenderingContext | null;
      if (!gl) return;
      this.gl = gl;
      this.prog = this.program(VERT, FRAG);
      this.shadowProg = this.program(SHADOW_VERT, SHADOW_FRAG);
      if (!this.prog || !this.shadowProg) return;
      this.buf = gl.createBuffer();
      this.shadowBuf = gl.createBuffer();
      for (const name of ['u_view', 'u_cam', 'u_bias', 'u_front', 'u_back', 'u_tint', 'u_wash', 'u_alpha']) this.loc[name] = gl.getUniformLocation(this.prog, name);
      this.sloc.u_view = gl.getUniformLocation(this.shadowProg, 'u_view');
      this.ok = true;
      (window as unknown as { __bh?: Record<string, unknown> }).__bh = { flip: 'webgl' };
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.ok = false;
      });
    } catch {
      this.ok = false;
    }
  }

  private program(vs: string, fs: string): WebGLProgram | null {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }

  private texture(src: Tex): WebGLTexture {
    const gl = this.gl!;
    let t = this.textures.get(src);
    if (!t) {
      t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures.set(src, t);
    }
    return t;
  }

  private release(): void {
    for (const t of this.textures.values()) this.gl?.deleteTexture(t);
    this.textures.clear();
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * this.dpr), ph = Math.round(h * this.dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.gl!.viewport(0, 0, pw, ph);
  }

  /**
   * One sheet, bent. `theta` is its angle at the spine (0 lies on the right page, pi on the left);
   * the free edge trails behind by `lag` radians. Returns where the free edge is, for the shadow.
   */
  private bend(page: FlipPlan['page'], theta: number, lag: number): { edgeX: number; edgeZ: number } {
    const d = this.data;
    const ds = page.w / COLS;
    let x = page.x, z = 0, o = 0;
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS;
      const phi = clamp(theta - lag * Math.pow(u, 1.6), 0, Math.PI);
      const nx = -Math.sin(phi), nz = Math.cos(phi);
      for (let row = 0; row < 2; row++) {
        d[o++] = x;
        d[o++] = page.y + row * page.h;
        d[o++] = z;
        d[o++] = u;
        d[o++] = row;
        d[o++] = nx;
        d[o++] = nz;
      }
      if (c < COLS) {
        const mid = clamp(theta - lag * Math.pow((c + 0.5) / COLS, 1.6), 0, Math.PI);
        x += Math.cos(mid) * ds;
        z += Math.sin(mid) * ds;
      }
    }
    return { edgeX: x, edgeZ: z };
  }

  private drawLeaf(plan: FlipPlan, cam: [number, number, number], theta: number, lag: number, bias: number, front: Tex, back: Tex, wash: number): { edgeX: number; edgeZ: number } {
    const gl = this.gl!;
    const edge = this.bend(plan.page, theta, lag);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    const attr = (name: string, size: number, offset: number) => {
      const l = gl.getAttribLocation(this.prog!, name);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride, offset * 4);
    };
    attr('a_pos', 3, 0);
    attr('a_uv', 2, 3);
    attr('a_n', 2, 5);
    gl.uniform2f(this.loc.u_view, window.innerWidth, window.innerHeight);
    gl.uniform3f(this.loc.u_cam, cam[0], cam[1], cam[2]);
    gl.uniform1f(this.loc.u_bias, bias);
    gl.uniform3f(this.loc.u_tint, plan.tint[0], plan.tint[1], plan.tint[2]);
    gl.uniform1f(this.loc.u_wash, wash);
    gl.uniform1f(this.loc.u_alpha, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(front));
    gl.uniform1i(this.loc.u_front, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(back));
    gl.uniform1i(this.loc.u_back, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, VERTS);
    return edge;
  }

  /** The soft shadow a lifted page throws on the pages beneath it. */
  private drawShadow(plan: FlipPlan, cam: [number, number, number], edgeX: number, edgeZ: number, strength: number): void {
    const gl = this.gl!;
    const { page } = plan;
    const s = cam[2] / (cam[2] - 0);
    void s;
    // where the free edge would fall if dropped straight down, pushed out a little by its height
    const reach = clamp(edgeX + (edgeX >= page.x ? 1 : -1) * edgeZ * 0.35, page.x - page.w * 1.05, page.x + page.w * 1.05);
    const a = strength * clamp(edgeZ / (page.w * 0.5), 0, 1);
    if (a < 0.01) return;
    const data = new Float32Array([page.x, page.y, a, page.x, page.y + page.h, a, reach, page.y, 0, reach, page.y + page.h, 0]);
    gl.useProgram(this.shadowProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const pos = gl.getAttribLocation(this.shadowProg!, 'a_pos'), al = gl.getAttribLocation(this.shadowProg!, 'a_alpha');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(al);
    gl.vertexAttribPointer(al, 1, gl.FLOAT, false, 12, 8);
    gl.uniform2f(this.sloc.u_view, window.innerWidth, window.innerHeight);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);
  }

  /** Draws the book at one moment of the turn. `t` is milliseconds since it began. */
  private frame(plan: FlipPlan, t: number, started: Set<number>): boolean {
    const gl = this.gl!;
    const { page, leaves, dir } = plan;
    const cam: [number, number, number] = [plan.spread ? page.x : page.x + page.w * 0.5, page.y + page.h * 0.5, page.w * (plan.spread ? 3.4 : 3.0)];
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const generic = (i: number) => plan.generic[i % plan.generic.length];
    // the pages that stay where they are
    if (dir > 0 && plan.spread && plan.fromLeft) this.drawLeaf(plan, cam, Math.PI, 0, 0, generic(0), plan.fromLeft, 0);
    if (dir < 0) this.drawLeaf(plan, cam, 0, 0, 0, plan.fromRight, generic(0), 0);
    let done = true;
    const shadows: { x: number; z: number; a: number }[] = [];
    for (let i = 0; i < leaves; i++) {
      const raw = clamp((t - i * plan.stagger) / plan.duration, 0, 1);
      if (raw < 1) done = false;
      if (raw > 0 && !started.has(i)) {
        started.add(i);
        plan.onLeaf?.(i);
      }
      const p = ease(raw);
      const theta = dir > 0 ? p * Math.PI : (1 - p) * Math.PI;
      const lag = dir * plan.curl * Math.sin(Math.PI * p);
      // on the stack it starts from, the first page to move lies on top; where they land, the last one does
      const bias = (raw < 0.5 ? leaves - i : i + 1) * 0.7;
      const first = i === 0, last = i === leaves - 1;
      const front = dir > 0 ? (first ? plan.fromRight : generic(i)) : last ? plan.toRight : generic(i);
      const back = dir > 0 ? (last && plan.toLeft ? plan.toLeft : generic(i + 1)) : first && plan.fromLeft ? plan.fromLeft : generic(i + 1);
      // the page keeps its own ink at the start and the end, and takes on the hop's color in between
      const keep = (dir > 0 && first) || (dir < 0 && last);
      const wash = keep ? 0.5 * Math.sin(Math.PI * p) : 0.18 + 0.4 * Math.sin(Math.PI * p);
      const edge = this.drawLeaf(plan, cam, theta, lag, bias, front, back, wash);
      if (raw > 0 && raw < 1) shadows.push({ x: edge.edgeX, z: edge.edgeZ, a: 0.34 });
    }
    for (const s of shadows) this.drawShadow(plan, cam, s.x, s.z, s.a);
    return done;
  }

  // ------------------------------------------------------------------ without WebGL: flat pages turned with CSS 3D
  private cssHost: HTMLDivElement | null = null;

  private cssFace(tex: Tex, back = false): HTMLImageElement {
    const img = document.createElement('img');
    img.src = tex.toDataURL('image/jpeg', 0.86);
    img.alt = '';
    img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden;${back ? 'transform:rotateY(180deg);' : ''}`;
    return img;
  }

  private cssHostFor(plan: FlipPlan): HTMLDivElement {
    const { page, dir } = plan;
    if (!this.cssHost) {
      this.cssHost = document.createElement('div');
      this.cssHost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.cssHost);
    }
    this.cssHost.innerHTML = '';
    this.cssHost.style.cssText = `position:fixed;left:${page.x}px;top:${page.y}px;width:${page.w}px;height:${page.h}px;z-index:40;pointer-events:none;perspective:${page.w * 2.4}px;perspective-origin:${dir > 0 ? '0%' : '100%'} 50%;overflow:visible;`;
    return this.cssHost;
  }

  private holdCss(plan: FlipPlan): void {
    const host = this.cssHostFor(plan);
    host.appendChild(this.cssFace(plan.fromRight));
  }

  private playCss(plan: FlipPlan): Promise<void> {
    const host = this.cssHostFor(plan);
    const { leaves, dir } = plan;
    const generic = (i: number) => plan.generic[i % plan.generic.length];
    const anims: Animation[] = [];
    for (let i = 0; i < leaves; i++) {
      const first = i === 0, last = i === leaves - 1;
      const front = dir > 0 ? (first ? plan.fromRight : generic(i)) : last ? plan.toRight : generic(i);
      const back = generic(i + 1);
      const leaf = document.createElement('div');
      // on the stack it starts from, the first page to move lies on top; where they land, the last one does
      leaf.style.cssText = `position:absolute;inset:0;transform-origin:left center;transform-style:preserve-3d;will-change:transform;z-index:${dir > 0 ? leaves - i : i + 1};`;
      leaf.appendChild(this.cssFace(front));
      leaf.appendChild(this.cssFace(back, true));
      const shade = document.createElement('div');
      shade.style.cssText = 'position:absolute;inset:0;background:linear-gradient(90deg,rgba(60,36,12,0.0),rgba(60,36,12,0.28));opacity:0;';
      leaf.appendChild(shade);
      host.appendChild(leaf);
      const from = dir > 0 ? 'rotateY(0deg)' : 'rotateY(-180deg)';
      const to = dir > 0 ? 'rotateY(-180deg)' : 'rotateY(0deg)';
      const opts = { duration: plan.duration, delay: i * plan.stagger, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'both' as const };
      anims.push(leaf.animate([{ transform: from }, { transform: to }], opts));
      anims.push(shade.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], opts));
      window.setTimeout(() => plan.onLeaf?.(i), i * plan.stagger);
    }
    return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
      host.style.transition = 'opacity 110ms linear';
      host.style.opacity = '0';
      return new Promise<void>((r) => window.setTimeout(() => { host.innerHTML = ''; host.style.opacity = '1'; r(); }, 120));
    });
  }

  /** Covers the page with a still picture of itself, so the text beneath can change unseen. */
  hold(plan: FlipPlan): void {
    if (!this.ok) return this.holdCss(plan);
    cancelAnimationFrame(this.raf);
    this.resize();
    this.canvas.style.transition = 'none';
    this.canvas.style.opacity = '1';
    this.canvas.style.display = 'block';
    this.frame(plan, 0, new Set([...Array(plan.leaves).keys()]));
  }

  /** Plays the turn. Resolves when the last page has landed. */
  play(plan: FlipPlan): Promise<void> {
    if (!this.ok) return this.playCss(plan);
    cancelAnimationFrame(this.raf);
    this.resize();
    this.canvas.style.transition = 'none';
    this.canvas.style.opacity = '1';
    this.canvas.style.display = 'block';
    return new Promise((resolve) => {
      const t0 = performance.now();
      const started = new Set<number>();
      const total = plan.duration + (plan.leaves - 1) * plan.stagger;
      const step = (now: number) => {
        const t = now - t0;
        let done = true;
        try {
          done = this.frame(plan, t, started) || t > total + 400;
        } catch {
          done = true;
        }
        if (!done) {
          this.raf = requestAnimationFrame(step);
          return;
        }
        // let the real page show through, then put the canvas away
        this.canvas.style.transition = 'opacity 110ms linear';
        this.canvas.style.opacity = '0';
        window.setTimeout(() => {
          this.clear();
          resolve();
        }, 120);
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  clear(): void {
    if (this.cssHost) this.cssHost.innerHTML = '';
    cancelAnimationFrame(this.raf);
    if (this.gl && this.ok) {
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }
    this.canvas.style.display = 'none';
    this.release();
  }
}

let stage: FlipStage | null = null;
export function flipStage(): FlipStage {
  if (!stage) stage = new FlipStage();
  return stage;
}
