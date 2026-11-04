// @ts-nocheck — this app does not ship Three's type declarations.
import * as THREE from "three"

// Hop, drawn here: a jumping spider for a group trip. Eight legs, big front
// eyes, a paper-coloured body and a small hop mark. Nothing in this file is
// a scan or a photo of someone else's model.
//
// Frame matches the walker: forward +X, left +Y, up +Z, feet near the ground.

const K = 1.15

const n = (p: readonly number[], i: number) => p[i] ?? 0
const v = (x: number, y: number, z: number) => new THREE.Vector3(x * K, y * K, z * K)

function limb(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = Math.max(radius * 2 + 0.001, dir.length())
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len - radius * 2, 3, 6), material)
  mesh.castShadow = true
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  const unit = dir.normalize()
  if (unit.lengthSq() > 0) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit)
  return mesh
}

function eye(parent: THREE.Object3D, x: number, y: number, z: number, r: number, dark: THREE.Material, shine: THREE.Material) {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), dark)
  ball.position.copy(v(x, y, z))
  ball.castShadow = true
  parent.add(ball)
  const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), shine)
  glint.position.copy(v(x, y, z)).add(new THREE.Vector3(r * 0.35, r * 0.12, r * 0.32))
  parent.add(glint)
}

// Left side front to back, then right. Hips sit on the carapace; feet splay out.
const POSES: ReadonlyArray<readonly number[]> = [
  [0.1, 0.07, 0.11, 0.26, 0.14, 0.16, 0.42, 0.16, 0.02],
  [0.04, 0.09, 0.11, 0.12, 0.22, 0.17, 0.18, 0.36, 0.02],
  [-0.04, 0.08, 0.1, -0.02, 0.24, 0.15, -0.02, 0.4, 0.02],
  [-0.12, 0.06, 0.09, -0.26, 0.16, 0.13, -0.42, 0.24, 0.02],
  [0.1, -0.07, 0.11, 0.26, -0.14, 0.16, 0.42, -0.16, 0.02],
  [0.04, -0.09, 0.11, 0.12, -0.22, 0.17, 0.18, -0.36, 0.02],
  [-0.04, -0.08, 0.1, -0.02, -0.24, 0.15, -0.02, -0.4, 0.02],
  [-0.12, -0.06, 0.09, -0.26, -0.16, 0.13, -0.42, -0.24, 0.02],
]

export function buildHopMascot() {
  const paper = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.72, metalness: 0 })
  const ink = new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.55, metalness: 0 })
  const sand = new THREE.MeshStandardMaterial({ color: 0xe4c98a, roughness: 0.8, metalness: 0 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.16, metalness: 0.05 })
  const shine = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.2, metalness: 0 })
  const coral = new THREE.MeshStandardMaterial({ color: 0xff6b4a, roughness: 0.42, metalness: 0 })

  const root = new THREE.Group()
  const rootBone = new THREE.Bone()
  root.add(rootBone)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11 * K, 20, 16), paper)
  head.scale.set(1.15, 1.05, 0.82)
  head.position.copy(v(0.08, 0, 0.13))
  head.castShadow = true
  rootBone.add(head)

  const turret = new THREE.Mesh(new THREE.SphereGeometry(0.055 * K, 16, 12), paper)
  turret.scale.set(0.72, 1.2, 0.9)
  turret.position.copy(v(0.16, 0, 0.155))
  turret.castShadow = true
  rootBone.add(turret)

  eye(rootBone, 0.2, 0.03, 0.172, 0.03 * K, dark, shine)
  eye(rootBone, 0.2, -0.03, 0.172, 0.03 * K, dark, shine)
  eye(rootBone, 0.178, 0.058, 0.148, 0.015 * K, dark, shine)
  eye(rootBone, 0.178, -0.058, 0.148, 0.015 * K, dark, shine)

  const lids: THREE.Mesh[] = []
  for (const side of [1, -1]) {
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.036 * K, 12, 8), paper)
    lid.scale.set(0.48, 1.15, 0.4)
    const restZ = 0.21 * K
    lid.position.copy(v(0.205, side * 0.03, 0))
    lid.position.z = restZ
    lid.userData.restZ = restZ
    lid.userData.drop = 0.055 * K
    rootBone.add(lid)
    lids.push(lid)
  }

  const abdomen = new THREE.Bone()
  abdomen.position.copy(v(-0.05, 0, 0.12))
  rootBone.add(abdomen)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.135 * K, 20, 16), paper)
  belly.scale.set(1.35, 0.9, 0.82)
  belly.position.copy(v(-0.12, 0, 0.01))
  belly.castShadow = true
  abdomen.add(belly)
  const mark = new THREE.Mesh(new THREE.TorusGeometry(0.038 * K, 0.008 * K, 6, 12, Math.PI), coral)
  mark.rotation.set(Math.PI / 2, 0, Math.PI)
  mark.position.copy(v(-0.08, 0, 0.1))
  abdomen.add(mark)

  const palps: THREE.Group[] = []
  for (const side of [1, -1]) {
    const g = new THREE.Group()
    g.position.copy(v(0.15, side * 0.042, 0.09))
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.009 * K, 0.046 * K, 3, 6), ink)
    seg.position.copy(v(0.02, side * 0.01, -0.03))
    seg.rotation.set(0.9, 0, side * 0.45)
    seg.castShadow = true
    g.add(seg)
    rootBone.add(g)
    palps.push(g)
  }

  const legs = []
  for (const p of POSES) {
    const hip = v(n(p, 0), n(p, 1), n(p, 2))
    const knee = v(n(p, 3), n(p, 4), n(p, 5))
    const foot = v(n(p, 6), n(p, 7), n(p, 8))
    const b1 = new THREE.Bone()
    b1.position.copy(hip)
    const b2 = new THREE.Bone()
    const femurTo = knee.clone().sub(hip)
    b2.position.copy(femurTo)
    b1.add(b2)
    rootBone.add(b1)
    const tibiaTo = foot.clone().sub(knee)
    b1.add(limb(new THREE.Vector3(), femurTo, 0.016 * K, ink))
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.02 * K, 8, 6), paper)
    kneeCap.position.copy(femurTo)
    kneeCap.castShadow = true
    b1.add(kneeCap)
    b2.add(limb(new THREE.Vector3(), tibiaTo, 0.012 * K, sand))
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.014 * K, 8, 6), ink)
    toe.position.copy(tibiaTo)
    b2.add(toe)
    const d1 = femurTo.clone()
    const d2 = tibiaTo.clone()
    const restN = new THREE.Vector3().crossVectors(d1, d2)
    if (restN.lengthSq() < 1e-8) restN.set(0, 1, 0)
    const rd = foot.clone().sub(hip).normalize()
    const along = knee.clone().sub(hip)
    const rp = along.sub(rd.clone().multiplyScalar(along.dot(rd)))
    if (rp.lengthSq() < 1e-8) rp.set(0, 0, 1)
    legs.push({
      hip, knee, foot,
      l1: d1.length(),
      l2: d2.length(),
      b1, b2,
      restN: restN.normalize(),
      rd,
      rp: rp.normalize(),
      fx: 0, fy: 0, fz: 0, sx: 0, sy: 0, t: 0, stepping: false, dur: 0.14,
    })
  }

  return {
    root,
    legs,
    abdomen,
    uniforms: { uBlink: { value: 0 } },
    spinneret: v(-0.36, 0, 0.12),
    headFront: v(0.24, 0, 0.2),
    bodyLen: 0.55 * K,
    lids,
    palps,
  }
}
