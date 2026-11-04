// @ts-nocheck
"use client"

// Silk cursor: Hop, a jumping spider drawn in code, follows the pointer,
// walks with an alternating gait, and lays silk that sticks only to elements
// marked with data-silk-anchor (or anchorSelector).

import * as React from "react"
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { buildHopMascot } from "./hop-mascot"

export interface SilkSpiderCursorProps {
  /** CSS selector for elements the silk may stick to. Never anchors to empty space. */
  anchorSelector?: string
  /** Kept so older call sites still type-check. The mascot is always drawn in code. */
  modelSrc?: string
  /** Kept so older call sites still type-check. The mascot is always drawn in code. */
  topTextureSrc?: string
  /** Kept so older call sites still type-check. The mascot is always drawn in code. */
  faceTextureSrc?: string
  /** Leg span in px. Defaults to a size that scales with the viewport. */
  size?: number
  /** Silk colour. */
  silkColor?: string
  /** The page colour behind the spider, used as bounce light on its belly. */
  bounceColor?: string
  /** Shadow colour cast on the page. */
  shadowColor?: string
  /** Most threads kept at once; the oldest fade out past this. */
  maxThreads?: number
  /** Let a fly wander in now and then. */
  fly?: boolean
  /** Still time before it falls asleep, ms. */
  sleepAfter?: number
  /** Threads already spun across the marked elements when the page opens. */
  seedWebs?: number
  /** Drop in on a thread from the top of the page. */
  enter?: boolean
  /** Keys that clear the webs. */
  clearKeys?: string[]
  /** "fixed" covers the viewport; "absolute" covers the nearest positioned parent. */
  position?: "fixed" | "absolute"
  zIndex?: number
  /** Device-pixel-ratio cap for both canvases. */
  maxDpr?: number
  className?: string
}

const MAXP = 9000
const MAXC = 9000

type AnchorRef = { el: Element | null; u: number; v: number; sx: number; sy: number }

type Thread = {
  id: number
  parts: number[]
  cons: number[]
  owned: number[]
  state: number
  alpha: number
  born: number
  dieT: number
  dews: number[]
  anchorEl: Element | null
  hostIds: number[]
}

function createSilk() {
  const X = new Float32Array(MAXP)
  const Y = new Float32Array(MAXP)
  const PX = new Float32Array(MAXP)
  const PY = new Float32Array(MAXP)
  const INV = new Float32Array(MAXP)
  const PIN = new Int32Array(MAXP).fill(-1)
  const CA = new Int32Array(MAXC)
  const CB = new Int32Array(MAXC)
  const CR = new Float32Array(MAXC)
  const CON = new Uint8Array(MAXC)
  const freeP = [] as number[]
  const freeC = [] as number[]
  for (let i = MAXP - 1; i >= 0; i--) freeP.push(i)
  for (let i = MAXC - 1; i >= 0; i--) freeC.push(i)
  const anchors = [] as (AnchorRef | null)[]
  const freeA = [] as number[]
  const threads = [] as Thread[]
  let nextId = 1

  const addAnchor = (a: AnchorRef) => {
    const id = freeA.length ? (freeA.pop() as number) : anchors.length
    anchors[id] = a
    return id
  }
  const hw = { p: 0, c: 0 }
  const particle = (x: number, y: number, anchor: number) => {
    const i = freeP.pop()
    if (i === undefined) return -1
    hw.p = Math.max(hw.p, i + 1)
    X[i] = PX[i] = x
    Y[i] = PY[i] = y
    PIN[i] = anchor
    INV[i] = anchor >= 0 ? 0 : 1
    return i
  }
  const constraint = (a: number, b: number, rest: number) => {
    const c = freeC.pop()
    if (c === undefined) return -1
    hw.c = Math.max(hw.c, c + 1)
    CA[c] = a
    CB[c] = b
    CR[c] = rest
    CON[c] = 1
    return c
  }
  const freeThread = (t: Thread) => {
    for (const c of t.cons) {
      CON[c] = 0
      freeC.push(c)
    }
    for (const p of t.owned) {
      const a = PIN[p]
      if (a >= 0) {
        anchors[a] = null
        freeA.push(a)
      }
      PIN[p] = -1
      INV[p] = 0
      freeP.push(p)
    }
    t.cons.length = 0
    t.owned.length = 0
    t.parts.length = 0
  }
  const newThread = (anchorEl: Element | null) => {
    const t: Thread = {
      id: nextId++, parts: [], cons: [], owned: [], state: 0, alpha: 1, born: 0, dieT: 0,
      dews: [], anchorEl, hostIds: [],
    }
    threads.push(t)
    return t
  }
  const length = (t: Thread) => {
    let L = 0
    for (let k = 1; k < t.parts.length; k++) {
      const a = t.parts[k - 1], b = t.parts[k]
      L += Math.hypot(X[b] - X[a], Y[b] - Y[a])
    }
    return L
  }
  const unpin = (p: number) => {
    const a = PIN[p]
    if (a >= 0) {
      anchors[a] = null
      freeA.push(a)
    }
    PIN[p] = -1
    INV[p] = 1
  }
  const span = (t: Thread, a: number, b: number, seg: number, slack: number) => {
    const d = Math.hypot(X[b] - X[a], Y[b] - Y[a])
    const n = Math.max(2, Math.min(36, Math.round(d / seg)))
    const rest = (d * (1 + slack)) / n
    let prev = a
    t.parts.push(a)
    for (let k = 1; k < n; k++) {
      const f = k / n
      const sag = Math.sin(Math.PI * f) * d * slack * 0.9
      const p = particle(X[a] + (X[b] - X[a]) * f, Y[a] + (Y[b] - Y[a]) * f + sag, -1)
      if (p < 0) break
      t.owned.push(p)
      t.parts.push(p)
      t.cons.push(constraint(prev, p, rest))
      prev = p
    }
    t.parts.push(b)
    t.cons.push(constraint(prev, b, rest))
  }
  const sprinkleDew = (t: Thread, rand: () => number, scale: number) => {
    t.dews.length = 0
    const L = length(t)
    const n = Math.floor(L / (24 + rand() * 30))
    for (let k = 0; k < n; k++) {
      const big = rand() < 0.18
      t.dews.push(1 + rand() * (t.parts.length - 3), (big ? 1.5 + rand() * 1.1 : 0.55 + rand() * 0.75) * scale)
    }
  }

  return {
    X, Y, PX, PY, INV, PIN, CA, CB, CR, CON, anchors, threads, hw,
    addAnchor, particle, constraint, freeThread, newThread, length, unpin, span, sprinkleDew,
  }
}
type Silk = ReturnType<typeof createSilk>

function stepSilk(s: Silk, dt: number, time: number, rects: Map<Element, DOMRect>, iters: number) {
  const { X, Y, PX, PY, INV, PIN, CA, CB, CR, CON, anchors, hw } = s
  const g = 620 * dt * dt
  for (let i = 0; i < hw.p; i++) {
    const a = PIN[i]
    if (a >= 0) {
      const an = anchors[a]
      if (!an) continue
      if (an.el) {
        const r = rects.get(an.el)
        if (r) {
          X[i] = r.left + an.u * r.width
          Y[i] = r.top + an.v * r.height
        }
      } else {
        X[i] = an.sx
        Y[i] = an.sy
      }
      PX[i] = X[i]
      PY[i] = Y[i]
      continue
    }
    if (INV[i] === 0) continue
    const vx = (X[i] - PX[i]) * 0.986
    const vy = (Y[i] - PY[i]) * 0.986
    PX[i] = X[i]
    PY[i] = Y[i]
    const wind = Math.sin(time * 0.9 + X[i] * 0.006 + Y[i] * 0.004) * 9 * dt * dt
    X[i] += vx + wind
    Y[i] += vy + g * INV[i]
  }
  for (let it = 0; it < iters; it++) {
    for (let c = 0; c < hw.c; c++) {
      if (!CON[c]) continue
      const a = CA[c], b = CB[c]
      const wa = INV[a], wb = INV[b]
      const w = wa + wb
      if (w === 0) continue
      const dx = X[b] - X[a], dy = Y[b] - Y[a]
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6
      if (d <= CR[c]) continue
      const k = ((d - CR[c]) / d / w) * 0.92
      X[a] += dx * k * wa
      Y[a] += dy * k * wa
      X[b] -= dx * k * wb
      Y[b] -= dy * k * wb
    }
  }
}

function solveKnee(
  hx: number, hy: number, hz: number,
  fx: number, fy: number, fz: number,
  l1: number, l2: number, px0: number, py0: number, pz0: number,
  out: number[],
) {
  let dx = fx - hx, dy = fy - hy, dz = fz - hz
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6
  const maxD = (l1 + l2) * 0.999
  const minD = Math.abs(l1 - l2) * 1.001 + 1e-6
  const dc = Math.min(maxD, Math.max(minD, d))
  dx /= d; dy /= d; dz /= d
  d = dc
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  let px = px0, py = py0, pz = pz0
  const dot = px * dx + py * dy + pz * dz
  px -= dx * dot; py -= dy * dot; pz -= dz * dot
  const pl = Math.sqrt(px * px + py * py + pz * pz) || 1
  out[0] = hx + dx * a + (px / pl) * h
  out[1] = hy + dy * a + (py / pl) * h
  out[2] = hz + dz * a + (pz / pl) * h
  out[3] = hx + dx * d
  out[4] = hy + dy * d
  out[5] = hz + dz * d
  return out
}

const GROUP = [0, 1, 0, 1, 1, 0, 1, 0]

type Leg = {
  hip: THREE.Vector3
  knee: THREE.Vector3
  foot: THREE.Vector3
  l1: number
  l2: number
  b1: THREE.Bone
  b2: THREE.Bone
  restN: THREE.Vector3
  rd: THREE.Vector3
  rp: THREE.Vector3
  fx: number; fy: number; fz: number
  sx: number; sy: number
  t: number
  stepping: boolean
  dur: number
}

type Rig = {
  root: THREE.Group
  legs: Leg[]
  abdomen: THREE.Bone
  uniforms: { uBlink: { value: number } }
  spinneret: THREE.Vector3
  headFront: THREE.Vector3
  bodyLen: number
  lids: THREE.Mesh[]
  palps: THREE.Group[]
}

// The body is buildHopMascot(): original geometry, same walker and silk.

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable)

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export default function SilkSpiderCursor({
  anchorSelector = "[data-silk-anchor]",
  modelSrc,
  topTextureSrc,
  faceTextureSrc,
  size,
  silkColor = "#ffffff",
  bounceColor = "#1530e6",
  shadowColor = "#000a3a",
  maxThreads = 120,
  fly = true,
  sleepAfter = 4500,
  enter = true,
  seedWebs = 0,
  clearKeys = ["Delete", "Backspace"],
  position = "fixed",
  zIndex = 50,
  maxDpr = 2,
  className,
}: SilkSpiderCursorProps) {
  const wrapRef = React.useRef(null as HTMLDivElement | null)
  const silkRef = React.useRef(null as HTMLCanvasElement | null)
  const glRef = React.useRef(null as HTMLCanvasElement | null)
  const opts = React.useRef({ anchorSelector, size, silkColor, maxThreads, fly, sleepAfter, enter, clearKeys })
  opts.current = { anchorSelector, size, silkColor, maxThreads, fly, sleepAfter, enter, clearKeys }

  React.useEffect(() => {
    const wrap = wrapRef.current
    const silkCanvas = silkRef.current
    const glCanvas = glRef.current
    if (!wrap || !silkCanvas || !glCanvas) return
    const ctx = silkCanvas.getContext("2d")
    if (!ctx) return
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    const rand = mulberry(0x5eed)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, powerPreference: "high-performance" })
    } catch {
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.35
    const hemi = new THREE.HemisphereLight(0xfff6ec, new THREE.Color(bounceColor), 0.45)
    hemi.position.set(0, 0, 1)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xfff1de, 1.9)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.radius = 5
    key.shadow.bias = -0.0008
    key.shadow.normalBias = 0.6
    scene.add(key, key.target)
    const rim = new THREE.DirectionalLight(0xbcd0ff, 0.7)
    scene.add(rim, rim.target)
    const camera = new THREE.PerspectiveCamera(20, 1, 1, 20000)
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ color: new THREE.Color(shadowColor), opacity: 0.42 }),
    )
    catcher.receiveShadow = true
    scene.add(catcher)
    const blobCanvas = document.createElement("canvas")
    blobCanvas.width = blobCanvas.height = 64
    const bctx = blobCanvas.getContext("2d") as CanvasRenderingContext2D
    const bg = bctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    bg.addColorStop(0, "rgba(0,0,0,0.55)")
    bg.addColorStop(0.55, "rgba(0,0,0,0.18)")
    bg.addColorStop(1, "rgba(0,0,0,0)")
    bctx.fillStyle = bg
    bctx.fillRect(0, 0, 64, 64)
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false, color: new THREE.Color(shadowColor) }),
    )
    blob.position.z = 0.2
    scene.add(blob)

    const body = new THREE.Group()
    scene.add(body)
    let rig: Rig | null = null

    let W = 0, H = 0, dpr = 1, S = 220
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      W = Math.max(1, r.width)
      H = Math.max(1, r.height)
      dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
      silkCanvas.width = Math.round(W * dpr)
      silkCanvas.height = Math.round(H * dpr)
      renderer.setPixelRatio(dpr)
      renderer.setSize(W, H, false)
      const fov = camera.fov * (Math.PI / 180)
      const dist = H / 2 / Math.tan(fov / 2)
      camera.aspect = W / H
      camera.position.set(W / 2, -H / 2, dist)
      camera.near = dist * 0.5
      camera.far = dist * 1.6
      camera.lookAt(W / 2, -H / 2, 0)
      camera.updateProjectionMatrix()
      S = opts.current.size ?? clamp(Math.min(W, H * 1.4) * 0.22, 150, 300)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const sp = {
      x: W * 0.5, y: -S, vx: 0, vy: 0, th: Math.PI / 2, pitch: 0, roll: 0, z: 0, vz: 0,
      mode: reduced ? "idle" : opts.current.enter ? "enter" : "idle",
      t: 0, idleT: 0, blink: 0, sleep: 0, eyesClosed: 0, wake: 0, preferGroup: 0, ik: 0,
      enterX: W * 0.5, enterY: H * 0.34, landed: false,
    }
    if (sp.mode !== "enter") {
      sp.x = reduced ? W * 0.6 : W * 0.5
      sp.y = reduced ? H * 0.2 : H * 0.4
      sp.landed = true
    }
    const ptr = { x: sp.x, y: sp.y, has: false, lastMove: -1e9, ix: 0, iy: 0 }

    const silk = createSilk()
    let drag: Thread | null = null
    let dragEl: Element | null = null
    let tackX = 0, tackY = 0
    let dropLine: Thread | null = null
    let anchorEls = [] as Element[]
    let anchorScan = 0
    const rects = new Map() as Map<Element, DOMRect>

    const scanAnchors = () => {
      const root = position === "fixed" ? document : wrap.parentElement ?? document
      anchorEls = Array.from(root.querySelectorAll(opts.current.anchorSelector))
    }
    scanAnchors()

    const toPage = (local: THREE.Vector3, out: THREE.Vector3) => {
      out.copy(local).applyMatrix4(rig ? rig.root.matrixWorld : body.matrixWorld)
      out.y = -out.y
      return out
    }
    const spinPage = new THREE.Vector3()
    const headPage = new THREE.Vector3()

    const anchorAt = (x: number, y: number, el: Element | null) => {
      if (!el) return silk.addAnchor({ el: null, u: 0, v: 0, sx: x, sy: y })
      const r = rects.get(el) as DOMRect
      return silk.addAnchor({ el, u: (x - r.left) / Math.max(1, r.width), v: (y - r.top) / Math.max(1, r.height), sx: x, sy: y })
    }

    const startDrag = (x: number, y: number, el: Element) => {
      const t = silk.newThread(el)
      const a = silk.particle(x, y, anchorAt(x, y, el))
      const s = silk.particle(x, y, silk.addAnchor({ el: null, u: 0, v: 0, sx: x, sy: y }))
      if (a < 0 || s < 0) return null
      t.owned.push(a, s)
      t.parts.push(a, s)
      t.cons.push(silk.constraint(a, s, 0.5))
      t.born = sp.t
      drag = t
      dragEl = el
      tackX = x
      tackY = y
      return t
    }

    const dragSpinner = (t: Thread) => t.parts[t.parts.length - 1]

    const feedDrag = (x: number, y: number) => {
      if (!drag) return
      const s = dragSpinner(drag)
      const an = silk.anchors[silk.PIN[s]]
      if (an) {
        an.sx = x
        an.sy = y
      }
      const prev = drag.parts[drag.parts.length - 2]
      const seg = Math.max(10, S * 0.07)
      const d = Math.hypot(x - silk.X[prev], y - silk.Y[prev])
      if (d > seg && drag.parts.length < 60) {
        silk.unpin(s)
        silk.X[s] = silk.PX[s] = x
        silk.Y[s] = silk.PY[s] = y
        const c = drag.cons[drag.cons.length - 1]
        silk.CR[c] = d
        const ns = silk.particle(x, y, silk.addAnchor({ el: null, u: 0, v: 0, sx: x, sy: y }))
        if (ns < 0) return
        drag.owned.push(ns)
        drag.parts.push(ns)
        drag.cons.push(silk.constraint(s, ns, 0.5))
      } else {
        silk.CR[drag.cons[drag.cons.length - 1]] = Math.max(0.5, d)
      }
    }

    const setThreads = () => silk.threads.filter((t) => t.state === 1)

    const lay = (a: number, b: number, el: Element | null) => {
      const t = silk.newThread(el)
      silk.span(t, a, b, Math.max(12, S * 0.08), 0.02 + rand() * 0.05)
      t.state = 1
      t.born = -10
      silk.sprinkleDew(t, rand, Math.sqrt(S / 220))
      return t
    }
    const bridgeFrom = (t: Thread) => {
      const mid = t.parts[Math.floor(t.parts.length / 2)]
      let best = -1, bd = S * 1.1, host: Thread | null = null
      for (const o of setThreads()) {
        if (o === t || o.parts.length < 4) continue
        for (let k = 1; k < o.parts.length - 1; k++) {
          const p = o.parts[k]
          const d = Math.hypot(silk.X[p] - silk.X[mid], silk.Y[p] - silk.Y[mid])
          if (d < bd && d > S * 0.18) { bd = d; best = p; host = o }
        }
      }
      if (best < 0 || !host) return
      const b = lay(mid, best, null)
      b.born = sp.t
      b.hostIds.push(t.id, host.id)
    }

    const seed = (n: number) => {
      const els = anchorEls.filter((e) => {
        const r = rects.get(e)
        return !!r && r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < H
      })
      if (els.length < 2) return
      const pt = (el: Element) => {
        const r = rects.get(el) as DOMRect
        return [r.left + r.width * (0.15 + rand() * 0.7), r.top + r.height * (0.08 + rand() * 0.45)]
      }
      const made = [] as Thread[]
      for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
        const A = els[Math.floor(rand() * els.length)]
        const ra = rects.get(A) as DOMRect
        const near = els.filter((e) => {
          if (e === A) return false
          const r = rects.get(e) as DOMRect
          const d = Math.hypot(r.left + r.width / 2 - ra.left - ra.width / 2, r.top + r.height / 2 - ra.top - ra.height / 2)
          return d > S * 0.4 && d < Math.min(W, H) * 0.6
        })
        if (!near.length) continue
        const B = near[Math.floor(rand() * near.length)]
        const [ax, ay] = pt(A), [bx, by] = pt(B)
        const pa = silk.particle(ax, ay, anchorAt(ax, ay, A))
        const pb = silk.particle(bx, by, anchorAt(bx, by, B))
        if (pa < 0 || pb < 0) break
        const t = lay(pa, pb, A)
        t.owned.push(pa, pb)
        made.push(t)
        k++
      }
      for (const t of made) if (rand() < 0.6) bridgeFrom(t)
    }
    let seeded = reduced || seedWebs <= 0

    const kill = (t: Thread, burst: boolean) => {
      if (t.state === 2) return
      t.state = 2
      t.dieT = 0
      for (const o of silk.threads) if (o.hostIds.includes(t.id)) kill(o, burst)
      for (const p of t.parts) {
        silk.unpin(p)
        if (burst) {
          silk.PX[p] = silk.X[p] - (rand() - 0.5) * 6
          silk.PY[p] = silk.Y[p] + 1 + rand() * 3
        }
      }
    }

    const attach = (x: number, y: number, el: Element) => {
      if (!drag) return
      const t = drag
      const s = dragSpinner(t)
      const a0 = t.parts[0]
      const straight = Math.hypot(silk.X[a0] - x, silk.Y[a0] - y)
      if (straight < S * 0.1) {
        silk.freeThread(t)
        silk.threads.splice(silk.threads.indexOf(t), 1)
        drag = null
        startDrag(x, y, el)
        return
      }
      const an = silk.anchors[silk.PIN[s]]
      if (an) {
        const r = rects.get(el) as DOMRect
        an.el = el
        an.u = (x - r.left) / Math.max(1, r.width)
        an.v = (y - r.top) / Math.max(1, r.height)
      }
      const parts = t.parts
      const n = parts.length
      for (let k = 1; k < n - 1; k++) {
        const p = parts[k]
        const f = k / (n - 1)
        silk.X[p] = silk.X[a0] + (x - silk.X[a0]) * f + (rand() - 0.5) * 3
        silk.Y[p] = silk.Y[a0] + (y - silk.Y[a0]) * f
        silk.PX[p] = silk.X[p] + (rand() - 0.5) * 2
        silk.PY[p] = silk.Y[p] - 4 * Math.sin(Math.PI * f)
      }
      const slack = 0.015 + rand() * 0.05
      const rest = (straight * (1 + slack)) / (n - 1)
      for (const c of t.cons) silk.CR[c] = rest
      t.state = 1
      t.born = sp.t
      silk.sprinkleDew(t, rand, Math.sqrt(S / 220))
      drag = null
      if (rand() < 0.75) bridgeFrom(t)
      const live = setThreads()
      const over = live.length - opts.current.maxThreads
      for (let k = 0; k < over; k++) kill(live[k], false)
      startDrag(x, y, el)
    }

    const clearAll = () => {
      for (const t of silk.threads) kill(t, true)
      drag = null
      dragEl = null
      if (sp.mode === "sleep") wake()
      sp.vz += S * 0.9
    }

    const flyS = { on: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, caught: -1, wrapped: 0, next: 9 + rand() * 6, seed: 0, done: false, cx: 0, cy: 0 }
    const cocoons = [] as { p: number; t: number; th: number }[]

    const onMove = (x: number, y: number) => {
      const r = wrap.getBoundingClientRect()
      const nx = x - r.left, ny = y - r.top
      if (!ptr.has || Math.hypot(nx - ptr.x, ny - ptr.y) > 0.5) ptr.lastMove = sp.t
      ptr.x = nx
      ptr.y = ny
      ptr.has = true
    }
    const pm = (e: PointerEvent) => onMove(e.clientX, e.clientY)
    const tm = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) onMove(t.clientX, t.clientY)
    }
    const kd = (e: KeyboardEvent) => {
      if (!opts.current.clearKeys.includes(e.key)) return
      if (isTyping(document.activeElement)) return
      if (!silk.threads.length) return
      clearAll()
    }
    window.addEventListener("pointermove", pm, { passive: true })
    window.addEventListener("pointerdown", pm, { passive: true })
    window.addEventListener("touchstart", tm, { passive: true })
    window.addEventListener("touchmove", tm, { passive: true })
    window.addEventListener("keydown", kd)

    const wake = () => {
      sp.mode = "walk"
      sp.idleT = 0
      sp.wake = 1
      sp.vz += S * 0.7
    }

    const placeFeet = () => {
      if (!rig) return
      const c = Math.cos(sp.th), s = Math.sin(sp.th)
      for (const lg of rig.legs) {
        const lx = lg.foot.x * S, ly = -lg.foot.y * S
        lg.fx = sp.x + lx * c - ly * s
        lg.fy = sp.y + lx * s + ly * c
        lg.fz = 0
      }
    }
    rig = buildHopMascot()
    body.add(rig.root)
    placeFeet()

    const knee = [0, 0, 0, 0, 0, 0]
    const qA = new THREE.Quaternion()
    const qB = new THREE.Quaternion()
    const mA = new THREE.Matrix4()
    const mB = new THREE.Matrix4()
    const inv = new THREE.Matrix4()
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vN = new THREE.Vector3(), vC = new THREE.Vector3()
    const nd1 = new THREE.Vector3(), nd2 = new THREE.Vector3(), fb2 = new THREE.Vector3()
    const qS = new THREE.Quaternion(), qT = new THREE.Quaternion()

    const frameRot = (d: THREE.Vector3, n: THREE.Vector3, d2: THREE.Vector3, n2: THREE.Vector3, out: THREE.Quaternion) => {
      const b1 = vC.crossVectors(n, d).normalize()
      mA.makeBasis(d, n, b1)
      const b2 = fb2.crossVectors(n2, d2).normalize()
      mB.makeBasis(d2, n2, b2)
      mA.transpose()
      mB.multiply(mA)
      return out.setFromRotationMatrix(mB)
    }

    const pluck = (x: number, y: number) => {
      const r = S * 0.08
      for (const t of silk.threads) {
        if (t.state !== 1) continue
        for (const p of t.parts) {
          if (silk.INV[p] === 0) continue
          const d = Math.hypot(silk.X[p] - x, silk.Y[p] - y)
          if (d < r) silk.PY[p] -= 2.2 * (1 - d / r)
        }
      }
    }

    const updateLegs = (dt: number) => {
      if (!rig) return
      const c = Math.cos(sp.th), s = Math.sin(sp.th)
      const speed = Math.hypot(sp.vx, sp.vy)
      const walking = sp.mode === "walk" || sp.mode === "hunt"
      const tuck = sp.sleep
      const dur = clamp(0.19 - (speed / S) * 0.03, 0.085, 0.19)
      const lead = dur * 0.95
      const thresh = (walking ? 0.1 : 0.045) * S
      const hang = sp.mode === "enter" && !sp.landed
      const errs = [] as number[]
      const homes = [] as number[]
      for (let i = 0; i < rig.legs.length; i++) {
        const lg = rig.legs[i]
        const k = 1 - tuck * 0.22
        const lx = lg.foot.x * S * k, ly = -lg.foot.y * S * k
        const hx = sp.x + lx * c - ly * s + sp.vx * lead
        const hy = sp.y + lx * s + ly * c + sp.vy * lead
        homes.push(hx, hy)
        errs.push(Math.hypot(lg.fx - hx, lg.fy - hy))
        if (errs[i] > S * 0.6) {
          lg.fx = hx
          lg.fy = hy
          lg.stepping = false
          errs[i] = 0
        }
      }
      if (!hang) {
        const stepping = [false, false]
        for (let i = 0; i < 8; i++) if (rig.legs[i].stepping) stepping[GROUP[i]] = true
        for (const g of [sp.preferGroup, 1 - sp.preferGroup]) {
          if (stepping[0] || stepping[1]) break
          let worst = 0
          for (let i = 0; i < 8; i++) if (GROUP[i] === g) worst = Math.max(worst, errs[i])
          if (worst > thresh) {
            for (let i = 0; i < 8; i++) {
              if (GROUP[i] !== g || errs[i] < thresh * 0.3) continue
              const lg = rig.legs[i]
              lg.stepping = true
              lg.t = 0
              lg.dur = dur * (0.9 + rand() * 0.2)
              lg.sx = lg.fx
              lg.sy = lg.fy
            }
            sp.preferGroup = 1 - g
            stepping[g] = true
          }
        }
      }
      for (let i = 0; i < rig.legs.length; i++) {
        const lg = rig.legs[i]
        if (hang) {
          const k = 0.62
          const lx = lg.foot.x * S * k, ly = -lg.foot.y * S * k
          lg.fx = sp.x + lx * c - ly * s
          lg.fy = sp.y + lx * s + ly * c
          lg.fz = S * (0.05 + 0.025 * Math.sin(sp.t * 5 + i * 1.7))
          continue
        }
        if (lg.stepping) {
          lg.t += dt / lg.dur
          const f = Math.min(1, lg.t)
          const e = f * f * (3 - 2 * f)
          lg.fx = lg.sx + (homes[i * 2] - lg.sx) * e
          lg.fy = lg.sy + (homes[i * 2 + 1] - lg.sy) * e
          lg.fz = Math.sin(Math.PI * f) * S * (0.05 + Math.min(0.04, (speed / S) * 0.01))
          if (f >= 1) {
            lg.stepping = false
            lg.fz = 0
            pluck(lg.fx, lg.fy)
          }
        } else {
          lg.fz += (0 - lg.fz) * damp(20, dt)
        }
      }
      const facing = sp.mode === "idle" && Math.abs(angDiff(sp.th, Math.PI / 2)) < 0.3
      const ikTo = hang || sp.mode === "sleep" || facing ? 0 : 1
      sp.ik += (ikTo - sp.ik) * damp(ikTo ? 10 : 5, dt)
      if (sp.ik < 0.5) {
        for (let i = 0; i < rig.legs.length; i++) {
          const lg = rig.legs[i]
          lg.fx = homes[i * 2] - sp.vx * lead
          lg.fy = homes[i * 2 + 1] - sp.vy * lead
          lg.fz = 0
          lg.stepping = false
        }
      }

      rig.root.updateMatrixWorld(true)
      inv.copy(rig.root.matrixWorld).invert()
      const w = sp.ik
      for (let i = 0; i < rig.legs.length; i++) {
        const lg = rig.legs[i]
        if (w < 0.001) {
          lg.b1.quaternion.identity()
          lg.b2.quaternion.identity()
        } else {
          vA.set(lg.fx, -lg.fy, lg.fz).applyMatrix4(inv)
          vC.copy(vA).sub(lg.hip).normalize()
          qS.setFromUnitVectors(lg.rd, vC)
          vB.copy(lg.rp).applyQuaternion(qS)
          solveKnee(lg.hip.x, lg.hip.y, lg.hip.z, vA.x, vA.y, vA.z, lg.l1, lg.l2, vB.x, vB.y, vB.z, knee)
          const d1 = vA.set(lg.knee.x - lg.hip.x, lg.knee.y - lg.hip.y, lg.knee.z - lg.hip.z).normalize()
          const d2 = vB.set(lg.foot.x - lg.knee.x, lg.foot.y - lg.knee.y, lg.foot.z - lg.knee.z).normalize()
          nd1.set(knee[0] - lg.hip.x, knee[1] - lg.hip.y, knee[2] - lg.hip.z).normalize()
          nd2.set(knee[3] - knee[0], knee[4] - knee[1], knee[5] - knee[2]).normalize()
          const nn = vN.crossVectors(nd1, nd2)
          if (nn.lengthSq() < 1e-8) nn.copy(lg.restN)
          nn.normalize()
          frameRot(d1, lg.restN, nd1, nn, qA)
          frameRot(d2, lg.restN, nd2, nn, qB)
          qB.premultiply(qT.copy(qA).invert())
          lg.b1.quaternion.identity().slerp(qA, w)
          lg.b2.quaternion.identity().slerp(qB, w)
        }
        if (hang) {
          qT.setFromAxisAngle(lg.restN, Math.sin(sp.t * 5 + i * 1.7) * 0.14)
          lg.b1.quaternion.multiply(qT)
          qT.setFromAxisAngle(lg.restN, Math.sin(sp.t * 5 + i * 1.7 + 0.8) * 0.2)
          lg.b2.quaternion.multiply(qT)
        }
      }
    }

    const updateSpider = (dt: number) => {
      sp.t += dt
      const o = opts.current
      if (sp.mode === "enter") {
        const t = sp.t
        const dropT = 1.9
        const p = Math.min(1, t / dropT)
        const ease = 1 - Math.pow(1 - p, 3)
        sp.x = sp.enterX + Math.sin(t * 2.1) * S * 0.04 * Math.exp(-t * 0.5)
        sp.y = -S * 0.7 + (sp.enterY + S * 0.7) * ease
        if (t > dropT) sp.y += Math.sin((t - dropT) * 9) * S * 0.07 * Math.exp(-(t - dropT) * 3)
        sp.th = Math.PI / 2 + Math.sin(t * 1.3) * 0.22 * Math.exp(-t * 0.4)
        sp.pitch += (0.55 - sp.pitch) * damp(3, dt)
        if (!dropLine) {
          const tl = silk.newThread(null)
          const a = silk.particle(sp.enterX, -2, silk.addAnchor({ el: null, u: 0, v: 0, sx: sp.enterX, sy: -2 }))
          const b = silk.particle(sp.enterX, -1, silk.addAnchor({ el: null, u: 0, v: 0, sx: sp.enterX, sy: -1 }))
          tl.owned.push(a, b)
          tl.parts.push(a, b)
          tl.cons.push(silk.constraint(a, b, 1))
          tl.state = 1
          dropLine = tl
        }
        if (t > 2.7 && !sp.landed) {
          sp.landed = true
          if (dropLine) {
            const end = dropLine.parts[dropLine.parts.length - 1]
            silk.unpin(end)
            silk.PY[end] = silk.Y[end] + 14
            const tl = dropLine
            setTimeout(() => kill(tl, false), 650)
          }
          sp.mode = "idle"
          sp.idleT = 0.4
          sp.vx = sp.vy = 0
          placeFeet()
          ptr.x = sp.x
          ptr.y = sp.y
        }
        return
      }

      const moved = ptr.has && sp.t - ptr.lastMove < 0.25
      const huntFly = !reduced && flyS.on && flyS.caught >= 0 && !moved && sp.t - ptr.lastMove > 1.2
      let tx = ptr.x, ty = ptr.y
      if (huntFly) {
        tx = silk.X[flyS.caught]
        ty = silk.Y[flyS.caught]
      }
      if (reduced) {
        tx = sp.x
        ty = sp.y
      }
      const dx = tx - sp.x, dy = ty - sp.y
      const dist = Math.hypot(dx, dy)

      if (sp.mode === "sleep") {
        if ((moved && Math.hypot(ptr.x - ptr.ix, ptr.y - ptr.iy) > 4) || (huntFly && flyS.t > 1.5)) wake()
      } else if (moved || huntFly || dist > S * 0.12) {
        if (sp.mode !== "walk" && sp.mode !== "hunt") {
          sp.mode = "walk"
          sp.idleT = 0
        }
        if (huntFly) sp.mode = "hunt"
        else if (sp.mode === "hunt") sp.mode = "walk"
      }

      if (sp.mode === "walk" || sp.mode === "hunt") {
        const maxV = S * 2.7
        const stop = sp.mode === "hunt" ? S * 0.32 : 4
        let want = Math.min(maxV, Math.max(0, dist - stop) * 3.2)
        const head = Math.atan2(dy, dx)
        const err = Math.abs(angDiff(sp.th, head))
        want *= clamp(Math.cos(err) * 1.2, 0.18, 1)
        const ux = dist > 0.001 ? dx / dist : 0, uy = dist > 0.001 ? dy / dist : 0
        sp.vx += (ux * want - sp.vx) * damp(6.5, dt)
        sp.vy += (uy * want - sp.vy) * damp(6.5, dt)
        const speed = Math.hypot(sp.vx, sp.vy)
        if (dist > 6) {
          const turn = angDiff(sp.th, head)
          sp.th += clamp(turn, -8 * dt, 8 * dt) * Math.min(1, 0.25 + speed / (S * 0.3))
        }
        sp.x += sp.vx * dt
        sp.y += sp.vy * dt
        sp.pitch += (0 - sp.pitch) * damp(9, dt)
        if (!moved && dist <= stop + 6 && speed < S * 0.06) {
          if (sp.mode === "hunt") flyS.wrapped += dt
          else {
            sp.mode = "idle"
            sp.idleT = 0
            ptr.ix = ptr.x
            ptr.iy = ptr.y
          }
        }
      } else {
        sp.vx += (0 - sp.vx) * damp(10, dt)
        sp.vy += (0 - sp.vy) * damp(10, dt)
        sp.x += sp.vx * dt
        sp.y += sp.vy * dt
      }

      if (sp.mode === "idle") {
        sp.idleT += dt
        const face = Math.PI / 2
        if (sp.idleT > 0.15) sp.th += clamp(angDiff(sp.th, face), -4 * dt, 4 * dt)
        const facing = Math.abs(angDiff(sp.th, face)) < 0.3
        const rearTo = facing ? (reduced ? 0.6 : 0.85) : 0
        sp.pitch += (rearTo - sp.pitch) * damp(4, dt)
        const bt = sp.idleT - 1.0
        sp.blink = bt > 0 && bt < 0.18 ? Math.sin((bt / 0.18) * Math.PI) : bt > 0.34 && bt < 0.52 ? Math.sin(((bt - 0.34) / 0.18) * Math.PI) : 0
        if (reduced) sp.blink = Math.max(0, Math.sin(sp.t * 0.9) * 40 - 39)
        if (!reduced && sp.idleT * 1000 > o.sleepAfter) {
          sp.mode = "sleep"
          ptr.ix = ptr.x
          ptr.iy = ptr.y
        }
      }
      const sleeping = sp.mode === "sleep"
      sp.sleep += ((sleeping ? 1 : 0) - sp.sleep) * damp(sleeping ? 1.4 : 7, dt)
      if (sleeping) sp.pitch += (0 - sp.pitch) * damp(2.5, dt)
      sp.eyesClosed = Math.max(sp.blink, sp.sleep)
      sp.wake = Math.max(0, sp.wake - dt * 2)
      sp.vz += (-sp.z * 160 - sp.vz * 14) * dt
      sp.z += sp.vz * dt
      const lat = -Math.sin(sp.th) * sp.vx + Math.cos(sp.th) * sp.vy
      sp.roll += (clamp(-lat / (S * 30), -0.12, 0.12) - sp.roll) * damp(6, dt)
    }

    const placeBody = () => {
      body.position.set(sp.x, -sp.y, sp.z - sp.sleep * S * 0.025)
      body.rotation.set(0, 0, 0)
      body.rotation.order = "ZYX"
      body.rotation.z = -sp.th
      body.rotation.y = -sp.pitch * 0.85
      body.rotation.x = sp.roll
      if (rig) {
        rig.root.scale.setScalar(S)
        const th = sp.pitch * 0.85
        const px = (rig.legs[3].foot.x + rig.legs[7].foot.x) * 0.5 * S
        rig.root.position.set(px * (Math.cos(th) - 1), 0, -px * Math.sin(th))
        rig.abdomen.rotation.y = sp.pitch * 0.5 + Math.sin(sp.t * 7) * 0.01 * Math.min(1, Math.hypot(sp.vx, sp.vy) / S)
        rig.abdomen.scale.setScalar(1 + Math.sin(sp.t * (sp.sleep > 0.5 ? 1.6 : 2.6)) * 0.004)
        rig.uniforms.uBlink.value = sp.eyesClosed
        const shut = sp.eyesClosed
        for (const lid of rig.lids) lid.position.z = lid.userData.restZ - shut * lid.userData.drop
        const wave = Math.sin(sp.t * (sp.mode === "idle" ? 7 : 3)) * (sp.mode === "idle" ? 0.55 : 0.08)
        rig.palps[0].rotation.z = wave
        rig.palps[1].rotation.z = -wave
      }
      body.updateMatrixWorld(true)
      if (rig) {
        toPage(rig.spinneret, spinPage)
        toPage(rig.headFront, headPage)
      } else {
        spinPage.set(sp.x - Math.cos(sp.th) * S * 0.2, sp.y - Math.sin(sp.th) * S * 0.2, 0)
        headPage.set(sp.x + Math.cos(sp.th) * S * 0.15, sp.y + Math.sin(sp.th) * S * 0.15, 0)
      }
    }

    const updateWebs = () => {
      if (reduced) return
      if (dropLine && !sp.landed) {
        const end = dropLine.parts[dropLine.parts.length - 1]
        const an = silk.anchors[silk.PIN[end]]
        if (an) {
          an.sx = spinPage.x
          an.sy = spinPage.y
        }
        const a = dropLine.parts[0]
        silk.CR[dropLine.cons[0]] = Math.max(1, Math.hypot(spinPage.x - silk.X[a], spinPage.y - silk.Y[a]))
        return
      }
      if (!sp.landed) return
      const x = spinPage.x, y = spinPage.y
      let el: Element | null = null
      let area = Infinity
      for (const e of anchorEls) {
        const r = rects.get(e)
        if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) continue
        const a = r.width * r.height
        if (a < area) { area = a; el = e }
      }
      const walking = Math.hypot(sp.vx, sp.vy) > S * 0.1
      if (!drag) {
        if (el && walking) startDrag(x, y, el)
        return
      }
      feedDrag(x, y)
      if (el && walking) {
        const r = rects.get(el) as DOMRect
        const big = Math.max(r.width, r.height) > S * 1.3
        if (el !== dragEl) attach(x, y, el)
        else if (big && Math.hypot(x - tackX, y - tackY) > S * 0.42) attach(x, y, el)
      }
      if (drag && silk.length(drag) > Math.hypot(W, H) * 0.9) {
        const t = drag
        drag = null
        dragEl = null
        kill(t, false)
      }
    }

    const updateFly = (dt: number) => {
      if (reduced || !opts.current.fly) return
      const f = flyS
      if (!f.on) {
        f.next -= dt
        if (f.next <= 0 && setThreads().length >= 3) {
          f.on = true
          f.cx = 0
          f.t = 0
          f.caught = -1
          f.wrapped = 0
          f.seed = rand() * 100
          const side = rand() < 0.5 ? -1 : 1
          f.x = side < 0 ? -20 : W + 20
          f.y = H * (0.15 + rand() * 0.6)
          f.vx = -side * 90
          f.vy = 0
        }
        return
      }
      f.t += dt
      if (f.caught < 0) {
        const n = f.seed
        const ax = Math.sin(f.t * 1.7 + n) * 260 + Math.sin(f.t * 4.3 + n * 2) * 140
        const ay = Math.cos(f.t * 1.3 + n * 3) * 220 + Math.sin(f.t * 5.1 + n) * 120
        if (f.cx === 0 || rand() < dt * 0.4) {
          const live = setThreads()
          const t = live[Math.floor(rand() * live.length)]
          if (t) {
            const p = t.parts[Math.floor(t.parts.length / 2)]
            f.cx = silk.X[p]
            f.cy = silk.Y[p]
          }
        }
        const gx = f.cx || W * 0.5, gy = f.cy || H * 0.45
        f.vx += (ax + (gx - f.x) * 0.9) * dt
        f.vy += (ay + (gy - f.y) * 0.9) * dt
        const v = Math.hypot(f.vx, f.vy)
        const maxV = 230
        if (v > maxV) { f.vx *= maxV / v; f.vy *= maxV / v }
        f.x += f.vx * dt
        f.y += f.vy * dt
        if (f.t > 1.2) {
          for (const t of silk.threads) {
            if (t.state !== 1) continue
            for (let k = 1; k < t.parts.length - 1; k++) {
              const p = t.parts[k]
              const q = t.parts[k + 1]
              const ex = silk.X[q] - silk.X[p], ey = silk.Y[q] - silk.Y[p]
              const u = clamp(((f.x - silk.X[p]) * ex + (f.y - silk.Y[p]) * ey) / (ex * ex + ey * ey || 1), 0, 1)
              if (Math.hypot(silk.X[p] + ex * u - f.x, silk.Y[p] + ey * u - f.y) < 6 && silk.INV[p] > 0) {
                f.caught = p
                silk.PY[p] -= 6
                break
              }
            }
            if (f.caught >= 0) break
          }
        }
        if (f.t > 16 || f.x < -60 || f.x > W + 60 || f.y < -60 || f.y > H + 60) {
          if (f.t > 3) {
            f.on = false
            f.next = 14 + rand() * 10
          }
        }
      } else {
        f.x = silk.X[f.caught]
        f.y = silk.Y[f.caught]
        if (silk.INV[f.caught] > 0 && f.wrapped < 0.01 && rand() < 0.12) {
          silk.PX[f.caught] += (rand() - 0.5) * 3
          silk.PY[f.caught] += (rand() - 0.5) * 3
        }
        const hostAlive = silk.threads.some((t) => t.state === 1 && t.parts.includes(f.caught))
        if (!hostAlive) {
          f.on = false
          f.next = 12 + rand() * 10
        } else if (f.wrapped > 1.6) {
          cocoons.push({ p: f.caught, t: 0, th: rand() * Math.PI })
          f.on = false
          f.next = 16 + rand() * 12
          if (sp.mode === "hunt") {
            sp.mode = "idle"
            sp.idleT = 0
            ptr.x = sp.x
            ptr.y = sp.y
            ptr.ix = sp.x
            ptr.iy = sp.y
          }
        }
      }
    }

    const dew = document.createElement("canvas")
    dew.width = dew.height = 32
    {
      const d = dew.getContext("2d") as CanvasRenderingContext2D
      const g = d.createRadialGradient(16, 16, 2, 16, 16, 15)
      g.addColorStop(0, "rgba(255,255,255,0.12)")
      g.addColorStop(0.7, "rgba(255,255,255,0.28)")
      g.addColorStop(0.92, "rgba(255,255,255,0.75)")
      g.addColorStop(1, "rgba(255,255,255,0)")
      d.fillStyle = g
      d.beginPath()
      d.arc(16, 16, 15, 0, Math.PI * 2)
      d.fill()
      d.fillStyle = "rgba(255,255,255,0.95)"
      d.beginPath()
      d.ellipse(11.5, 11, 3.2, 2.4, -0.6, 0, Math.PI * 2)
      d.fill()
    }

    const pathThread = (t: Thread) => {
      const { X, Y } = silk
      const P = t.parts
      ctx.moveTo(X[P[0]], Y[P[0]])
      for (let k = 1; k < P.length - 1; k++) {
        const a = P[k], b = P[k + 1]
        ctx.quadraticCurveTo(X[a], Y[a], (X[a] + X[b]) / 2, (Y[a] + Y[b]) / 2)
      }
      const last = P[P.length - 1]
      ctx.lineTo(X[last], Y[last])
    }

    const sprite = (w: number, h: number, paint: (d: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas")
      c.width = w * 4
      c.height = h * 4
      const d = c.getContext("2d") as CanvasRenderingContext2D
      d.scale(4, 4)
      d.translate(w / 2, h / 2)
      paint(d)
      return c
    }
    const flyBody = sprite(24, 14, (d) => {
      d.fillStyle = "#1d1f24"
      d.beginPath()
      d.ellipse(-4.5, 0, 6, 3.6, 0, 0, Math.PI * 2)
      d.fill()
      d.beginPath()
      d.ellipse(1.8, 0, 3.6, 3.2, 0, 0, Math.PI * 2)
      d.fill()
      d.fillStyle = "#8c1a12"
      for (const side of [-1, 1]) {
        d.beginPath()
        d.ellipse(5.2, side * 1.9, 1.9, 1.7, 0, 0, Math.PI * 2)
        d.fill()
      }
    })
    const flyWing = sprite(20, 10, (d) => {
      d.fillStyle = "rgba(220,230,255,0.55)"
      d.beginPath()
      d.ellipse(0, 0, 8.5, 3.6, 0, 0, Math.PI * 2)
      d.fill()
    })
    const flyWrap = sprite(26, 14, (d) => {
      d.fillStyle = "rgba(250,252,255,0.92)"
      d.beginPath()
      d.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2)
      d.fill()
    })
    const cocoonSprite = sprite(16, 22, (d) => {
      d.fillStyle = "rgba(245,248,255,0.95)"
      d.beginPath()
      d.ellipse(0, 0, 5.5, 8.5, 0, 0, Math.PI * 2)
      d.fill()
    })

    const drawFly = (time: number) => {
      const f = flyS
      if (!f.on) return
      const caught = f.caught >= 0
      const wrap01 = Math.min(1, f.wrapped / 1.6)
      const ang = caught ? Math.sin(time * 23) * 0.3 * (1 - wrap01) : Math.atan2(f.vy, f.vx)
      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(ang)
      const s = clamp(S / 220, 0.7, 1.2)
      ctx.scale(s, s)
      const beat = caught ? Math.sin(time * 18) * 0.25 * (1 - wrap01) : Math.sin(time * 90)
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.rotate(side * (0.5 + beat * 0.35))
        ctx.drawImage(flyWing, -16, side * 4.2 - 5, 20, 10)
        ctx.restore()
      }
      ctx.drawImage(flyBody, -12, -7, 24, 14)
      if (wrap01 > 0) {
        ctx.globalAlpha = wrap01
        ctx.drawImage(flyWrap, -14.5, -7, 26, 14)
        ctx.globalAlpha = 1
      }
      ctx.restore()
    }

    const drawZ = (time: number) => {
      if (sp.sleep < 0.4) return
      const a = (sp.sleep - 0.4) / 0.6
      const base = clamp(S / 220, 0.7, 1.3)
      ctx.fillStyle = "#ffffff"
      ctx.textBaseline = "middle"
      for (let k = 0; k < 3; k++) {
        const ph = (time * 0.45 + k / 3) % 1
        const x = headPage.x + S * 0.12 + ph * S * 0.16 + Math.sin(time * 1.4 + k * 2) * 4
        const y = headPage.y - S * 0.12 - ph * S * 0.42
        ctx.globalAlpha = a * Math.sin(ph * Math.PI)
        ctx.font = "italic 700 " + Math.round((14 + ph * 12) * base) + "px ui-rounded, system-ui, sans-serif"
        ctx.fillText("z", x, y)
      }
      ctx.globalAlpha = 1
    }

    const drawSilk = (time: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = opts.current.silkColor
      const solid = [] as Thread[]
      for (const t of silk.threads) {
        if (t.parts.length < 2 || t.alpha <= 0.01) continue
        const a = t.alpha * (t.state === 0 ? 0.75 : Math.min(1, 0.55 + (time - t.born) * 2))
        if (a >= 0.999) {
          solid.push(t)
          continue
        }
        ctx.beginPath()
        pathThread(t)
        ctx.globalAlpha = a * 0.13
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.globalAlpha = a * 0.88
        ctx.lineWidth = 0.95
        ctx.stroke()
      }
      if (solid.length) {
        ctx.beginPath()
        for (const t of solid) pathThread(t)
        ctx.globalAlpha = 0.13
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.globalAlpha = 0.88
        ctx.lineWidth = 0.95
        ctx.stroke()
      }
      for (const t of silk.threads) {
        if (!t.dews.length || t.alpha <= 0.02) continue
        const { X, Y } = silk
        const P = t.parts
        for (let k = 0; k < t.dews.length; k += 2) {
          const f = t.dews[k]
          const i = Math.min(P.length - 2, Math.floor(f))
          const fr = f - i
          const a = P[i], b = P[i + 1]
          let x = X[a] + (X[b] - X[a]) * fr
          let y = Y[a] + (Y[b] - Y[a]) * fr
          let r = t.dews[k + 1]
          if (t.state === 2) {
            y += t.dieT * t.dieT * 260 * (0.6 + (k % 5) * 0.12)
            r *= 1 + t.dieT * 0.4
          }
          ctx.globalAlpha = t.alpha * (0.75 + 0.25 * Math.sin(time * 2.2 + k))
          const R = r * 2.1
          ctx.drawImage(dew, x - R, y - R, R * 2, R * 2)
        }
      }
      ctx.globalAlpha = 1
      for (const c of cocoons) {
        const alive = silk.threads.some((t) => t.state !== 2 && t.parts.includes(c.p))
        if (!alive) c.t = -1
        if (c.t < 0) continue
        ctx.save()
        ctx.translate(silk.X[c.p], silk.Y[c.p] + 5)
        ctx.rotate(c.th * 0.3)
        ctx.drawImage(cocoonSprite, -8, -11, 16, 22)
        ctx.restore()
      }
      for (let k = cocoons.length - 1; k >= 0; k--) if (cocoons[k].t < 0) cocoons.splice(k, 1)
      drawFly(time)
      drawZ(time)
    }


    let raf = 0
    let last = 0
    let acc = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const t = now / 1000
      let dt = last ? t - last : 1 / 60
      last = t
      dt = Math.min(dt, 1 / 20)
      anchorScan -= dt
      if (anchorScan <= 0) {
        scanAnchors()
        anchorScan = 1
      }
      const wr = wrap.getBoundingClientRect()
      rects.clear()
      for (const e of anchorEls) {
        const r = e.getBoundingClientRect()
        rects.set(e, new DOMRect(r.left - wr.left, r.top - wr.top, r.width, r.height))
      }
      if (!seeded) {
        seeded = true
        seed(seedWebs)
      }
      updateSpider(dt)
      placeBody()
      updateLegs(dt)
      updateWebs()
      updateFly(dt)
      acc += dt
      let steps = 0
      while (acc >= 1 / 120 && steps < 4) {
        stepSilk(silk, 1 / 120, sp.t, rects, 4)
        acc -= 1 / 120
        steps++
      }
      if (steps === 4) acc = 0
      for (let k = silk.threads.length - 1; k >= 0; k--) {
        const th = silk.threads[k]
        if (th.state === 2) {
          th.dieT += dt
          th.alpha = Math.max(0, 1 - th.dieT / 0.85)
          if (th.dieT > 0.9) {
            silk.freeThread(th)
            silk.threads.splice(k, 1)
            if (th === dropLine) dropLine = null
          }
        }
      }
      drawSilk(sp.t)
      const span = S * 1.25
      key.position.set(sp.x - S * 0.9, -sp.y + S * 1.3, S * 3.2)
      key.target.position.set(sp.x, -sp.y, 0)
      const sc = key.shadow.camera as THREE.OrthographicCamera
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span
      sc.near = 1; sc.far = S * 8
      sc.updateProjectionMatrix()
      rim.position.set(sp.x + S, -sp.y - S * 1.5, S)
      rim.target.position.set(sp.x, -sp.y, 0)
      catcher.position.set(sp.x, -sp.y, 0)
      catcher.scale.set(span * 2.4, span * 2.4, 1)
      const blobS = S * (0.42 - sp.pitch * 0.05)
      blob.position.set(sp.x + Math.cos(sp.th) * S * 0.02 + S * 0.02, -sp.y - S * 0.03, 0.2)
      blob.rotation.z = -sp.th
      blob.scale.set(blobS * 1.25, blobS * 0.8, 1)
      ;(blob.material as THREE.MeshBasicMaterial).opacity = 0.75 - sp.z / (S * 0.5)
      if (rig) {
        const pad = S * 0.95
        const x0 = clamp(sp.x - pad, 0, W), x1 = clamp(sp.x + pad, 0, W)
        const y0 = clamp(sp.y - pad, 0, H), y1 = clamp(sp.y + pad, 0, H)
        renderer.setScissorTest(true)
        renderer.setScissor(x0, H - y1, x1 - x0, y1 - y0)
        renderer.render(scene, camera)
      }
    }
    const start = () => {
      if (!raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const vis = () => (document.hidden ? stop() : start())
    document.addEventListener("visibilitychange", vis)
    start()

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener("visibilitychange", vis)
      window.removeEventListener("pointermove", pm)
      window.removeEventListener("pointerdown", pm)
      window.removeEventListener("touchstart", tm)
      window.removeEventListener("touchmove", tm)
      window.removeEventListener("keydown", kd)
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
    }
  }, [modelSrc, topTextureSrc, faceTextureSrc, position, maxDpr, bounceColor, shadowColor, seedWebs])

  const layer = { position: "absolute", inset: 0, width: "100%", height: "100%", maxWidth: "none", pointerEvents: "none" } as React.CSSProperties
  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={className}
      style={{ position, inset: 0, width: "100%", height: position === "fixed" ? "100svh" : undefined, pointerEvents: "none", zIndex, overflow: "hidden" }}
    >
      <canvas ref={silkRef} style={layer} />
      <canvas ref={glRef} style={layer} />
    </div>
  )
}

