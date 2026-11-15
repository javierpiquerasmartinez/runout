import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { SUIT_PATHS, type Suit } from '../../ui/suits'
import { waveCrestAt, waveHeightAt, wavePoints } from './brandWave'
import {
  beatAt,
  cameraAt,
  card,
  chip,
  depthOfField,
  ease,
  figuresAt,
  layoutFor,
  placesFor,
  potCentre,
  seatChips,
  stackOf,
  staggeredBeatAt,
  type Places,
  type Point,
} from './choreography'
import { drawWhileVisible } from './frames'
import { paceOf, tierBelow, type Tier } from './quality'
import cardBackUrl from './textures/card-back.jpeg'
import chipFaceUrl from './textures/chip-face.jpeg'
import feltUrl from './textures/felt-3.jpeg'
import studioUrl from './textures/studio-2.jpeg'

/*
 * The Landing's scene: brass on black. Matt, near-black things under one
 * warm light, and the wave the only thing that glows. `choreography` says
 * what happens when; this file only draws it.
 */

const fieldOfView = 40
const brass = 0xe0a050

/** Seconds the wave takes to draw itself when the page opens, whatever the scroll. */
const introSeconds = 1.8

const linePoints = 160
const waveCurve = wavePoints(linePoints)
/** The mark's drawing is 18 across and 10 tall. */
const waveRise = 10 / 18
const waveMiddle = 1.3

const chipCount = 960
const { radius: chipRadius, height: chipHeight } = chip
/** The chips no seat sits with are not on the table: they come out of the pot as it bursts, to build the graph. */
const seatCount = seatChips.length
const graphColumns = 24
/** The graph's shortest stack, as a share of its tallest. */
const graphFloor = 0.12

const cardSize = card

/** The Hand the scroll plays: the Hero's cards, then the board. The river brings the flush. */
const hand = {
  hole: ['As', 'Ks'],
  flop: ['Qs', '7d', '2s'],
  turn: ['9c'],
  river: ['5s'],
} as const

type Street = keyof typeof hand

/** What each tier draws with. A still is drawn once, so it can afford what `high` does. */
const drawnWith: Record<Tier, { pixelRatio: number; shadows: number; samples: number }> = {
  high: { pixelRatio: 2, shadows: 2048, samples: 4 },
  medium: { pixelRatio: 1.5, shadows: 1024, samples: 0 },
  still: { pixelRatio: 2, shadows: 2048, samples: 4 },
}

/** The layer the wave is drawn on where there is a depth of field: apart from everything else, so it is never blurred. */
const waveLayer = 1

/**
 * Draws one layer of the scene, sharp, over what the passes before it made
 * of the rest. Whatever stands in front of that layer still hides it.
 */
class LayerOverPass extends Pass {
  private readonly unseen = new THREE.MeshBasicMaterial({ colorWrite: false })
  /** The layer alone, on nothing. */
  private readonly alone: THREE.WebGLRenderTarget
  private readonly laid = new THREE.ShaderMaterial({
    uniforms: { tUnder: { value: null }, tOver: { value: null } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tUnder;
      uniform sampler2D tOver;
      varying vec2 vUv;
      void main() {
        vec4 over = texture2D( tOver, vUv );
        gl_FragColor = vec4( texture2D( tUnder, vUv ).rgb * ( 1.0 - over.a ) + over.rgb, 1.0 );
      }`,
  })
  private readonly quad = new FullScreenQuad(this.laid)
  private readonly clearColour = new THREE.Color()

  private readonly scene: THREE.Scene
  private readonly camera: THREE.Camera
  private readonly layer: number

  constructor(scene: THREE.Scene, camera: THREE.Camera, layer: number, samples: number) {
    super()
    this.scene = scene
    this.camera = camera
    this.layer = layer
    this.alone = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
    this.laid.uniforms.tOver.value = this.alone.texture
  }

  override setSize(width: number, height: number) {
    this.alone.setSize(width, height)
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    renderer.getClearColor(this.clearColour)
    const clearAlpha = renderer.getClearAlpha()
    const autoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(this.alone)
    renderer.clear()
    // The rest of the scene, unseen, for its depths alone.
    this.scene.overrideMaterial = this.unseen
    renderer.render(this.scene, this.camera)
    this.scene.overrideMaterial = null
    // A target with smoothed edges keeps its depths from one drawing to the next, but not its colours.
    renderer.clear(true, false, false)
    this.camera.layers.set(this.layer)
    renderer.render(this.scene, this.camera)
    this.camera.layers.set(0)

    this.laid.uniforms.tUnder.value = readBuffer.texture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
    renderer.setClearColor(this.clearColour, clearAlpha)
    renderer.autoClear = autoClear
  }

  override dispose() {
    this.unseen.dispose()
    this.alone.dispose()
    this.laid.dispose()
    this.quad.dispose()
  }
}

/** Where the graph of chips is on the canvas, in CSS pixels from its top left. */
export type GraphOnScreen = {
  /** How visible the Results Graph's figures are, from 0 to 1. */
  showing: number
  /** The graph's two ends across. */
  left: number
  right: number
  /** Down the canvas: where the line starts from, the line's crest, and the felt the chips stand on. */
  zero: number
  crest: number
  floor: number
}

export type LandingSceneOptions = {
  /** The tier to start on; the scene falls to the one below if it can't keep up. */
  tier: Tier
  /**
   * Whether to draw with a shallow depth of field: see `depthOfFieldFor`.
   * Whatever is asked, the scene drops it when it falls a tier.
   */
  depthOfField?: boolean
  /** Told every frame the graph's place or its figures' visibility changes. */
  onGraph?(graph: GraphOnScreen): void
  /** Told when the scene falls to a lower tier. */
  onTier?(tier: Tier): void
}

export type LandingScene = {
  /** The scroll's progress through the story, from 0 to 1. The scene eases towards it. */
  setProgress(progress: number): void
  dispose(): void
}

/** A number from 0 to 1 that is always the same for the same `seed`. */
function seeded(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const mix = (from: number, to: number, t: number) => from + (to - from) * t

/** The classic deck's inks, four colours, as `ui/Card` draws it. */
const cardInk: Record<Suit, string> = { s: '#14201e', h: '#c1362f', d: '#1c6fb8', c: '#1f7a45' }

/**
 * A card's face as the app's classic deck draws it: ivory, the rank top left
 * in the mono face, the suit bottom right. Drawn again once the font is in.
 */
function cardFace(card: string, onPaint: () => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 432
  canvas.height = 608
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const font = '600 216px "IBM Plex Mono", ui-monospace, monospace'
  const paint = () => {
    const context = canvas.getContext('2d')
    if (!context) return
    const suit = card.slice(-1) as Suit
    context.fillStyle = '#f4f1ea'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = cardInk[suit]
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.font = font
    context.fillText(card.slice(0, -1), 36, 34)
    // The suit's 24×24 drawing, 168 px wide, in the bottom right corner.
    context.save()
    context.translate(canvas.width - 40 - 168, canvas.height - 40 - 168)
    context.scale(7, 7)
    context.fill(new Path2D(SUIT_PATHS[suit]))
    context.restore()
    texture.needsUpdate = true
    onPaint()
  }
  paint()
  void document.fonts?.load(font).then(paint)
  return texture
}

/** A chip's edge, unrolled: charcoal, with the six brass inlays of its face carried round. */
function chipEdge(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 8
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#3b3b3b'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#c9a05a'
    const inlay = canvas.width / 6
    for (let i = 0; i < 6; i++) context.fillRect((i + 0.5) * inlay - inlay * 0.14, 0, inlay * 0.28, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A playing card's outline, corners rounded, lying in the plane of its face. */
function cardOutline(): THREE.ShapeGeometry {
  const { width, length } = cardSize
  const corner = 0.045
  const x = width / 2
  const y = length / 2
  const shape = new THREE.Shape()
  shape.moveTo(-x + corner, -y)
  shape.lineTo(x - corner, -y)
  shape.absarc(x - corner, -y + corner, corner, -Math.PI / 2, 0)
  shape.lineTo(x, y - corner)
  shape.absarc(x - corner, y - corner, corner, 0, Math.PI / 2)
  shape.lineTo(-x + corner, y)
  shape.absarc(-x + corner, y - corner, corner, Math.PI / 2, Math.PI)
  shape.lineTo(-x, -y + corner)
  shape.absarc(-x + corner, -y + corner, corner, Math.PI, Math.PI * 1.5)
  const geometry = new THREE.ShapeGeometry(shape, 6)
  // A shape's texture coordinates are its own; the face fills the card.
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / length + 0.5)
  return geometry
}

/** Draws the scene on `canvas`. Throws where there is no WebGL. */
export function mountLandingScene(canvas: HTMLCanvasElement, options: LandingSceneOptions): LandingScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  let tier = options.tier
  let pace = paceOf(tier)
  /** A still is drawn again only when something in it has changed. */
  let stale = true
  renderer.setClearColor(0x040505)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // The shadows are cast once a frame, however many times the frame's passes draw the scene.
  renderer.shadowMap.autoUpdate = false

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(fieldOfView, 1, 0.05, 100)

  // One warm light from above and behind, a faint cool one against it, and the studio in every reflection.
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x050606, 0.22))
  const key = new THREE.DirectionalLight(0xffdcae, 2.4)
  key.position.set(-3.5, 8, -2.5)
  key.castShadow = true
  key.shadow.camera.left = key.shadow.camera.bottom = -6
  key.shadow.camera.right = key.shadow.camera.top = 6
  key.shadow.camera.near = 1
  key.shadow.camera.far = 20
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.shadow.radius = 5
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x9db9ff, 0.35)
  fill.position.set(4, 3, 6)
  scene.add(fill)

  const disposables: { dispose(): void }[] = [renderer]
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing)
    return thing
  }

  const loading = new THREE.LoadingManager()
  loading.onLoad = () => (stale = true)
  const textures = new THREE.TextureLoader(loading)
  const picture = (url: string) => {
    const texture = keep(textures.load(url))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }
  const reflections = keep(new THREE.PMREMGenerator(renderer))
  textures.load(studioUrl, (studio) => {
    studio.mapping = THREE.EquirectangularReflectionMapping
    studio.colorSpace = THREE.SRGBColorSpace
    scene.environment = keep(reflections.fromEquirectangular(studio)).texture
    scene.environmentIntensity = 1.6
    studio.dispose()
    stale = true
  })

  // What is drawn, out of focus where it is far from what the shot is of, then the wave over it, sharp,
  // then the glow of whatever is brighter than white, then a little grain.
  let composer: EffectComposer | null = null
  let lens: BokehPass | null = null
  let composerTarget: THREE.WebGLRenderTarget | null = null
  function leaveComposer() {
    composer?.passes.forEach((pass) => pass.dispose())
    composer?.dispose()
    composerTarget?.dispose()
  }
  /** Sets the renderer up for the tier: how many pixels, how fine the shadows, how smooth the edges, and whether there is a depth of field. */
  function drawWith(next: Tier, withDepthOfField: boolean) {
    tier = next
    pace = paceOf(tier)
    const { pixelRatio, shadows, samples } = drawnWith[tier]
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatio))
    key.shadow.mapSize.set(shadows, shadows)
    key.shadow.map?.dispose()
    key.shadow.map = null
    leaveComposer()
    composerTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
    composer = new EffectComposer(renderer, composerTarget)
    composer.addPass(new RenderPass(scene, camera))
    lens = null
    if (withDepthOfField) {
      // The wave is left out of what the lens blurs, and drawn after it.
      camera.layers.set(0)
      lens = new BokehPass(scene, camera, { maxblur: depthOfField.most })
      // The dark beyond the scene is at no distance: left as it is, so nothing in focus bleeds into it.
      // Should the addon's shader change and this line of it go, the dark is blurred like anything far away.
      lens.materialBokeh.fragmentShader = lens.materialBokeh.fragmentShader.replace(
        'float factor = ( focus + viewZ );',
        'float factor = getDepth( vUv ) < 0.99999 ? focus + viewZ : 0.0;',
      )
      composer.addPass(lens)
      composer.addPass(new LayerOverPass(scene, camera, waveLayer, samples))
    } else {
      camera.layers.enable(waveLayer)
    }
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.7, 1.15))
    composer.addPass(new FilmPass(0.22))
    composer.addPass(new OutputPass())
    // Sized again on the next frame.
    width = height = 0
    stale = true
  }
  disposables.push({ dispose: leaveComposer })

  // ---------- The wave: one line, the only thing that glows ----------

  const lineGeometry = keep(new LineGeometry())
  lineGeometry.setPositions(new Float32Array(linePoints * 3))
  const lineMaterial = keep(new LineMaterial({ color: brass, linewidth: 3 }))
  // Brighter than white, so it blooms.
  lineMaterial.color.multiplyScalar(3.2)
  const line = new Line2(lineGeometry, lineMaterial)
  line.frustumCulled = false
  line.layers.set(waveLayer)
  scene.add(line)
  const lineSegments = lineGeometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute
  const linePosition = new Float32Array(linePoints * 3)

  // ---------- The table ----------

  const feltCloth = picture(feltUrl)
  feltCloth.wrapS = feltCloth.wrapT = THREE.MirroredRepeatWrapping
  const feltMaterial = keep(
    new THREE.MeshStandardMaterial({ map: feltCloth, color: 0x2a4a3e, roughness: 1, metalness: 0, transparent: true }),
  )
  const felt = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 128)), feltMaterial)
  felt.rotation.x = -Math.PI / 2
  felt.receiveShadow = true
  scene.add(felt)

  // The padded rail round the felt, under the line of light.
  const railMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x0b0e0d, roughness: 0.45, transparent: true }))
  const rail = new THREE.Mesh(keep(new THREE.RingGeometry(0.985, 1.085, 128)), railMaterial)
  rail.rotation.x = -Math.PI / 2
  rail.position.y = 0.004
  scene.add(rail)

  const seatGeometry = keep(new THREE.RingGeometry(0.2, 0.3, 48))
  const seats = Array.from({ length: seatCount }, () => {
    const material = keep(
      new THREE.MeshStandardMaterial({ color: 0x1a201e, emissive: brass, emissiveIntensity: 0, transparent: true }),
    )
    const seat = new THREE.Mesh(seatGeometry, material)
    seat.rotation.x = -Math.PI / 2
    scene.add(seat)
    return { seat, material }
  })

  const cardBackPicture = picture(cardBackUrl)
  const cardPaper = keep(new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.8 }))
  const deckTop = keep(new THREE.MeshStandardMaterial({ map: cardBackPicture, roughness: 0.55 }))
  const deck = new THREE.Mesh(keep(new THREE.BoxGeometry(cardSize.width, 0.12, cardSize.length)), [
    cardPaper,
    cardPaper,
    deckTop,
    cardPaper,
    cardPaper,
    cardPaper,
  ])
  deck.castShadow = true
  scene.add(deck)

  // ---------- The cards ----------

  const cardGeometry = keep(cardOutline())
  const cardBack = keep(new THREE.MeshStandardMaterial({ map: cardBackPicture, roughness: 0.55 }))
  const streets = Object.keys(hand) as Street[]
  const cards = streets.flatMap((street) =>
    hand[street].map((card, index) => {
      const face = new THREE.Mesh(
        cardGeometry,
        keep(new THREE.MeshStandardMaterial({ map: keep(cardFace(card, () => (stale = true))), roughness: 0.6 })),
      )
      const back = new THREE.Mesh(cardGeometry, cardBack)
      // Lying flat: the face up, the back underneath, a card's thickness apart.
      face.rotation.x = -Math.PI / 2
      face.position.y = cardSize.thick / 2
      back.rotation.x = Math.PI / 2
      back.position.y = -cardSize.thick / 2
      face.castShadow = back.castShadow = true
      face.receiveShadow = true
      const mesh = new THREE.Group().add(face, back)
      scene.add(mesh)
      return { mesh, street, index, count: hand[street].length }
    }),
  )
  /** Where each card comes to rest: the Hero's two, or its place along the board. */
  function cardRest(places: Places, street: Street, index: number): Point {
    if (street === 'hole') return places.hole[index]
    return places.board[street === 'flop' ? index : street === 'turn' ? 3 : 4]
  }

  // ---------- The chips ----------

  const chipFace = picture(chipFaceUrl)
  // The picture's chip stops a little short of its edges; the cap takes the chip alone.
  chipFace.repeat.setScalar(0.972)
  chipFace.offset.setScalar(0.014)
  const chipCap = keep(new THREE.MeshStandardMaterial({ map: chipFace, roughness: 0.5, metalness: 0.15 }))
  const chipSide = keep(new THREE.MeshStandardMaterial({ map: keep(chipEdge()), roughness: 0.5, metalness: 0.15 }))
  // A cylinder's faces go side, top, bottom.
  const chips = new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(chipRadius, chipRadius, chipHeight, 32, 1)),
    [chipSide, chipCap, chipCap],
    chipCount,
  )
  chips.frustumCulled = false
  chips.castShadow = chips.receiveShadow = true
  // No two chips quite the same charcoal.
  const chipColour = new THREE.Color()
  for (let chip = 0; chip < chipCount; chip++) {
    chips.setColorAt(chip, chipColour.setScalar(0.85 + seeded(chip + 0.5) * 0.75))
  }
  scene.add(chips)
  disposables.push(chips)

  /** How many chips each column of the graph holds, summing to every chip there is. */
  const columnHeights = Array.from(
    { length: graphColumns },
    (_, column) => graphFloor + (1 - graphFloor) * waveHeightAt(column / (graphColumns - 1)),
  )
  const chipsPerHeight = chipCount / columnHeights.reduce((sum, height) => sum + height, 0)
  /** The top of the graph at `x` across it, from 0 to 1: where the wave runs. */
  const graphTopAt = (x: number) => (graphFloor + (1 - graphFloor) * waveHeightAt(x)) * chipsPerHeight * chipHeight

  /**
   * A chip's place in the cloud the camera dives through: above the felt, and
   * out of the corridor the camera flies along, so none ever fills the screen.
   */
  function cloudPlace(x: number, y: number, z: number): Point {
    const corridor = { height: 0.55, radius: 0.5 }
    const off = Math.hypot(x, y - corridor.height)
    if (off >= corridor.radius) return [x, Math.max(0.12, y), z]
    const out = corridor.radius / Math.max(off, 0.001)
    return [x * out, Math.max(0.12, corridor.height + (y - corridor.height) * out), z]
  }

  /** Each chip's place in every formation that doesn't depend on the layout. */
  const chipParts = (() => {
    const graph: { column: number; level: number }[] = []
    for (let column = 0; graph.length < chipCount; column = (column + 1) % graphColumns) {
      const wanted = Math.round(columnHeights[column] * chipsPerHeight)
      const held = graph.filter((chip) => chip.column === column).length
      if (held < wanted || graph.length >= chipCount - graphColumns) graph.push({ column, level: held })
    }
    // Left to right, bottom to top: the order the graph builds in.
    graph.sort((a, b) => a.column - b.column || a.level - b.level)

    // Chips are handed out to the seats in a shuffled order, each seat up to its count; the rest stay off the table.
    const seatOf = new Array<{ seat: number; inSeat: number }>(chipCount)
    const shuffled = Array.from({ length: chipCount }, (_, chip) => chip).sort((a, b) => seeded(a + 53.3) - seeded(b + 53.3))
    let seatFilling = 0
    let held = 0
    for (const chip of shuffled) {
      while (seatFilling < seatCount && held >= seatChips[seatFilling]) {
        seatFilling++
        held = 0
      }
      seatOf[chip] = { seat: seatFilling < seatCount ? seatFilling : -1, inSeat: held++ }
    }

    return graph.map((inGraph, chip) => {
      const { seat, inSeat } = seatOf[chip]
      const heap = seeded(chip + 3.1)
      const turn = seeded(chip + 5.7) * Math.PI * 2
      const spread = Math.sqrt(seeded(chip + 7.3)) * 0.78
      const height = Math.acos(2 * seeded(chip + 11.9) - 1)
      const around = seeded(chip + 13.3) * Math.PI * 2
      const far = Math.cbrt(seeded(chip + 17.7))
      return {
        inGraph,
        seat,
        /** Which of the seat's stacks it is in, and how far up it. */
        stack: Math.floor(inSeat / stackOf),
        level: inSeat % stackOf,
        /** In the pot's heap. */
        inPot: [
          potCentre[0] + Math.cos(turn) * spread,
          chipHeight / 2 + Math.floor(heap * heap * 9) * chipHeight,
          potCentre[2] + Math.sin(turn) * spread * 0.7,
        ] as Point,
        inCloud: cloudPlace(
          Math.sin(height) * Math.cos(around) * far * 3.4,
          0.9 + Math.cos(height) * far * 1.9,
          -0.4 + Math.sin(height) * Math.sin(around) * far * 3.4,
        ),
        tumble: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(seeded(chip + 19.1) * 6.28, seeded(chip + 23.9) * 6.28, seeded(chip + 29.3) * 6.28),
        ),
        spin: new THREE.Vector3(seeded(chip + 31.1) - 0.5, seeded(chip + 37.7) - 0.5, seeded(chip + 41.3) - 0.5).normalize(),
        drift: seeded(chip + 43.9) * 6.28,
        /** How it lies when flat: no two chips of a stack line their inlays up. */
        lie: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), seeded(chip + 59.9) * 6.28),
        /** When this chip goes into the pot, among all of them. */
        turnToPush: Math.floor(seeded(chip + 47.1) * chipCount),
      }
    })
  })()

  // ---------- Frame by frame ----------

  let target = 0
  let shown = 0
  let width = 0
  let height = 0
  let last = performance.now()
  const opened = last
  const pointer = { x: 0, y: 0, shownX: 0, shownY: 0 }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const spun = new THREE.Quaternion()
  const onScreen = new THREE.Vector3()
  let figuresShown = 0

  drawWith(tier, options.depthOfField ?? false)

  function resize() {
    const box = canvas.getBoundingClientRect()
    if (box.width === width && box.height === height) return
    width = box.width
    height = box.height
    renderer.setSize(width, height, false)
    composer?.setPixelRatio(renderer.getPixelRatio())
    composer?.setSize(width, height)
    stale = true
    lineMaterial.resolution.set(width, height)
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
  }

  function draw(now: number) {
    resize()
    if (!width || !height) return
    const still = tier === 'still'
    if (still) {
      // One picture per stop: nothing drifts, and nothing is drawn until something changes.
      if (!stale && shown === target) return
      shown = target
      last = now
    } else if (document.visibilityState === 'visible' && pace.frame(now - last)) {
      // A tier it fell to draws less: no depth of field, even in a still.
      drawWith(tierBelow(tier), false)
      options.onTier?.(tier)
    }
    stale = false
    const seconds = Math.min(0.1, (now - last) / 1000)
    last = now
    // In a still the wave is whole and the chips hang where they are.
    const time = still ? introSeconds : (now - opened) / 1000
    // Eased towards the scroll, so a wheel's steps and a finger's jitter come out smooth.
    shown += (target - shown) * (1 - Math.exp(-seconds * 9))
    if (Math.abs(target - shown) < 0.00005) shown = target
    const p = shown

    const aspect = width / height
    const layout = layoutFor(aspect)
    const places = placesFor(layout)
    const { table, waveWidth, graphWidth } = layout
    const tableUp = beatAt('table', p)

    // The line: the wave, bent into the rim, lifted along the graph, and back to the rim.
    const toRim = beatAt('rim', p)
    const toGraph = beatAt('line', p) * (1 - beatAt('room', p))
    for (let i = 0; i < linePoints; i++) {
      const wave = waveCurve[i]
      const angle = Math.PI - (i / (linePoints - 1)) * 2 * Math.PI
      const x = mix(mix((wave.x - 0.5) * waveWidth, table.across * Math.cos(angle), toRim), (wave.x - 0.5) * graphWidth, toGraph)
      const y = mix(
        mix(waveMiddle + (wave.y - 0.5) * waveWidth * waveRise, 0.02, toRim),
        graphTopAt(wave.x) + 0.07,
        toGraph,
      )
      const z = mix(mix(0, table.deep * Math.sin(angle), toRim), 0, toGraph)
      linePosition.set([x, y, z], i * 3)
    }
    const segments = lineSegments.data.array as Float32Array
    for (let i = 0; i < linePoints - 1; i++) segments.set(linePosition.subarray(i * 3, i * 3 + 6), i * 6)
    lineSegments.data.needsUpdate = true
    lineGeometry.instanceCount = Math.round((linePoints - 1) * ease(time / introSeconds))

    // The table.
    felt.visible = rail.visible = deck.visible = chips.visible = tableUp > 0
    felt.scale.set(table.across, table.deep, 1)
    rail.scale.set(table.across, table.deep, 1)
    feltCloth.repeat.set(table.across * 1.4, table.deep * 1.4)
    feltMaterial.opacity = railMaterial.opacity = tableUp
    deck.position.set(places.deck[0], 0.06, places.deck[2])
    deck.scale.setScalar(Math.max(0.001, tableUp))
    seats.forEach(({ seat, material }, index) => {
      seat.visible = tableUp > 0
      seat.position.set(...places.seats[index])
      material.opacity = tableUp
      // The Hero's seat lights first, then round the table.
      material.emissiveIntensity = staggeredBeatAt('seats', p, index, seatCount, 0.4) * 1.3
    })

    // The cards: out of the deck, face down, turning over as they land; back to it for the dive, and out again for the Room.
    const mucked = beatAt('muck', p) * (1 - beatAt('room', p))
    for (const { mesh, street, index, count } of cards) {
      const dealt = staggeredBeatAt(street, p, index, count, 0.6) * (1 - mucked)
      const rest = cardRest(places, street, index)
      mesh.visible = tableUp > 0 && dealt > 0
      mesh.position.set(
        mix(places.deck[0], rest[0], dealt),
        mix(0.125, cardSize.thick / 2, dealt) + Math.sin(Math.PI * dealt) * 0.7,
        mix(places.deck[2], rest[2], dealt),
      )
      mesh.rotation.set(0, (1 - dealt) * 0.7, (1 - dealt) * Math.PI)
    }

    // The chips: at their seats, into the pot, burst into the cloud, stacked as the graph, back to their seats.
    const burst = beatAt('dive', p)
    const narrow = graphWidth / 6
    for (let chip = 0; chip < chipCount; chip++) {
      const parts = chipParts[chip]
      const onTable = parts.seat >= 0
      const pushed = staggeredBeatAt('pot', p, parts.turnToPush, chipCount, 0.45)
      const stacked = staggeredBeatAt('graph', p, chip, chipCount, 0.55)
      const home = staggeredBeatAt('room', p, chip, chipCount, 0.6)
      const afloat = burst * (1 - stacked)

      // A chip that isn't any seat's waits unseen where the pot gathers.
      const stack = onTable ? places.stacks[parts.seat][parts.stack].at : parts.inPot
      const seatX = stack[0]
      const seatY = onTable ? chipHeight / 2 + parts.level * chipHeight : stack[1]
      const seatZ = stack[2]
      const sway = afloat * 0.09
      const cloudX = parts.inCloud[0] + Math.sin(time * 0.5 + parts.drift) * sway
      const cloudY = parts.inCloud[1] + Math.cos(time * 0.4 + parts.drift) * sway
      const graphX = (parts.inGraph.column / (graphColumns - 1) - 0.5) * graphWidth
      const graphY = chipHeight / 2 + parts.inGraph.level * chipHeight

      let x = mix(seatX, parts.inPot[0], pushed)
      let y = mix(seatY, parts.inPot[1], pushed) + Math.sin(Math.PI * pushed) * 0.22
      let z = mix(seatZ, parts.inPot[2], pushed)
      x = mix(mix(mix(x, cloudX, burst), graphX, stacked), seatX, home)
      y = mix(mix(mix(y, cloudY, burst), graphY, stacked), seatY, home) + Math.sin(Math.PI * home) * 0.5
      z = mix(mix(mix(z, parts.inCloud[2], burst), 0, stacked), seatZ, home)

      spun.setFromAxisAngle(parts.spin, time * 0.35).multiply(parts.tumble)
      rotation.copy(parts.lie).slerp(spun, afloat)
      const slim = mix(1, narrow, stacked * (1 - home))
      const there = onTable ? tableUp : burst * (1 - home)
      scale.set(slim * there, there, slim * there)
      chips.setMatrixAt(chip, matrix.compose(position.set(x, y, z), rotation, scale))
    }
    chips.instanceMatrix.needsUpdate = true

    // The camera, leaning a little after the pointer and never quite still.
    pointer.shownX += (pointer.x - pointer.shownX) * (1 - Math.exp(-seconds * 4))
    pointer.shownY += (pointer.y - pointer.shownY) * (1 - Math.exp(-seconds * 4))
    const view = cameraAt(p, aspect, fieldOfView)
    const distance = Math.hypot(
      view.position[0] - view.target[0],
      view.position[1] - view.target[1],
      view.position[2] - view.target[2],
    )
    const lean = still ? 0 : 1
    camera.position.set(
      view.position[0] + (pointer.shownX * 0.05 + Math.sin(time * 0.31) * 0.008) * distance * lean,
      view.position[1] + (-pointer.shownY * 0.03 + Math.sin(time * 0.23) * 0.006) * distance * lean,
      view.position[2],
    )
    camera.lookAt(...view.target)

    // Where the graph is on screen, for the Results Graph's figures laid over it.
    const figures = figuresAt(p)
    if (options.onGraph && (figures > 0 || figuresShown > 0)) {
      camera.updateMatrixWorld()
      const across = (x: number) => ((onScreen.set(x, 0, 0).project(camera).x + 1) / 2) * width
      const down = (y: number) => ((1 - onScreen.set(0, y, 0).project(camera).y) / 2) * height
      options.onGraph({
        showing: figures,
        left: across(-graphWidth / 2),
        right: across(graphWidth / 2),
        zero: down(graphTopAt(0) + 0.07),
        crest: down(graphTopAt(waveCrestAt) + 0.07),
        floor: down(0),
      })
    }
    figuresShown = figures

    if (lens) {
      const uniforms = lens.uniforms as Record<'focus' | 'aperture', THREE.IUniform<number>>
      uniforms.focus.value = view.focus
      uniforms.aperture.value = depthOfField.strength / view.focus
    }
    renderer.shadowMap.needsUpdate = true
    composer?.render(seconds)
  }

  const listening = new AbortController()
  if (window.matchMedia?.('(pointer: fine)').matches) {
    window.addEventListener(
      'pointermove',
      (event) => {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1
        pointer.y = (event.clientY / window.innerHeight) * 2 - 1
      },
      { signal: listening.signal, passive: true },
    )
  }
  // Nothing is drawn while the page is hidden, and the scene's time stands still until it is seen again.
  const stopDrawing = drawWhileVisible(draw)

  return {
    setProgress(progress) {
      target = Math.min(1, Math.max(0, progress))
    },
    dispose() {
      stopDrawing()
      listening.abort()
      for (const thing of disposables) thing.dispose()
    },
  }
}
