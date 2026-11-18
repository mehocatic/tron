import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  FLAVORS,
  NUTRITION_ROWS,
  SHEET_URL,
  SHEET_W,
  clamp,
  hexToRgba,
  mixHexTowardInk,
  seededRand,
} from './stride-data';

export const BH = (849 + 8) / (403 + 8); // ~2.08515815

export interface BarState {
  x: number;
  y: number;
  h: number;
  rz: number;
  ry: number;
  rx: number;
  z: number;
  op: number;
  sx: number;
  sy: number;
  shadow: number;
}

interface BarInstance {
  group: THREE.Group;
  frontMesh: THREE.Mesh;
  backMesh: THREE.Mesh;
  frontMat: THREE.MeshPhysicalMaterial;
  backMat: THREE.MeshPhysicalMaterial;
  shadowMesh: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  flavour: number;
  barIndex: number;
}

function buildBarGeometryPair(): { frontGeo: THREE.PlaneGeometry; backGeo: THREE.PlaneGeometry } {
  const frontGeo = new THREE.PlaneGeometry(1, BH, 30, 64);
  const backGeo = new THREE.PlaneGeometry(1, BH, 30, 64);
  const CR = 0.062;

  const pushZ = (geo: THREE.PlaneGeometry, sign: number, mirrorU: boolean) => {
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const uv = geo.attributes['uv'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const ex = Math.abs(2 * u - 1);
      const ev = Math.min(v, 1 - v);
      let z: number;
      if (ev < CR) {
        z = 0.006 + 0.006 * Math.abs(Math.sin(u * Math.PI * 34));
      } else {
        const across = Math.pow(Math.max(0, 1 - Math.pow(ex, 2.6)), 0.62);
        const along = Math.pow(clamp((ev - CR) / 0.11, 0, 1), 0.7);
        z = 0.012 + 0.118 * across * along + 0.004 * Math.sin(23 * u + 31 * v) * across;
      }
      pos.setZ(i, sign * z);
      if (mirrorU) {
        uv.setX(i, 1 - u);
      }
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
  };

  pushZ(frontGeo, 1, false);
  pushZ(backGeo, -1, true);

  const idx = backGeo.index;
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let k = 0; k < arr.length; k += 3) {
      const tmp = arr[k + 1];
      arr[k + 1] = arr[k + 2];
      arr[k + 2] = tmp;
    }
    idx.needsUpdate = true;
  }

  frontGeo.computeVertexNormals();
  backGeo.computeVertexNormals();
  return { frontGeo, backGeo };
}

function buildShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.save();
    ctx.translate(128, 256);
    ctx.scale(1, 2);
    const g = ctx.createRadialGradient(0, 0, 12, 0, 0, 120);
    g.addColorStop(0, 'rgba(30, 18, 40, 0.55)');
    g.addColorStop(0.45, 'rgba(30, 18, 40, 0.25)');
    g.addColorStop(1, 'rgba(30, 18, 40, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackCanvas(
  sheetImg: HTMLImageElement,
  flavourIndex: number,
): HTMLCanvasElement {
  const flav = FLAVORS[flavourIndex];
  const { x, y, w, h } = flav.box;
  const W = Math.round((w + 8) * 1.5 * 0.75);
  const H = Math.round(W * BH);
  const scale = sheetImg.naturalWidth / SHEET_W;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const sx = (x - 4) * scale;
  const sy = (y - 4) * scale;
  const sw = (w + 8) * scale;
  const sh = (h + 8) * scale;

  // 1. Mirrored crop gives alpha silhouette + crimp texture
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(sheetImg, sx, sy, sw, sh, 0, 0, W, H);
  ctx.restore();

  // 2. Fill body & seals with source-atop
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const sealH = H * 0.075;
  ctx.fillStyle = hexToRgba(flav.color, 0.35);
  ctx.fillRect(0, 0, W, sealH);
  ctx.fillRect(0, H - sealH, W, sealH);

  ctx.fillStyle = hexToRgba(flav.color, 0.9);
  ctx.fillRect(0, sealH, W, H - 2 * sealH);

  // 3. Horizontal sheen gradient
  const sheen = ctx.createLinearGradient(0, 0, W, 0);
  sheen.addColorStop(0, 'rgba(0,0,0,0.10)');
  sheen.addColorStop(0.28, 'rgba(255,255,255,0.14)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.8, 'rgba(0,0,0,0.04)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 4. Text & panels
  const ink = mixHexTowardInk(flav.color, 0.78);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // "STRIDE"
  ctx.font = `400 ${Math.round(0.085 * W)}px "Archivo Black", sans-serif`;
  ctx.fillText('STRIDE', W * 0.5, H * 0.15);

  // "<FLAVOUR> · 50 G"
  ctx.font = `500 ${Math.round(0.042 * W)}px "DM Mono", monospace`;
  ctx.fillText(`${flav.name.toUpperCase()} · 50 G`, W * 0.5, H * 0.185);

  // Nutrition Panel
  const px = W * 0.15;
  const py = H * 0.215;
  const pw = W * 0.7;
  const ph = H * 0.36;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  roundRectPath(ctx, px, py, pw, ph, 0.03 * W);
  ctx.fill();
  ctx.restore();

  const innerX = px + W * 0.048;
  const innerRight = px + pw - W * 0.048;
  const innerW = innerRight - innerX;

  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `400 ${Math.round(0.058 * W)}px "Archivo Black", sans-serif`;
  ctx.fillText('NUTRITION', innerX, py + H * 0.044);

  ctx.font = `400 ${Math.round(0.032 * W)}px "DM Mono", monospace`;
  ctx.fillText('Serving size 1 bar (50 g)', innerX, py + H * 0.072);

  // Solid rule
  const ruleY = py + H * 0.084;
  ctx.fillStyle = ink;
  ctx.fillRect(innerX, ruleY, innerW, Math.max(1.5, W * 0.004));

  // Seven rows, 3.4% H apart
  let rowY = py + H * 0.122;
  const rowStep = H * 0.034;
  const rowFontPx = Math.round(0.033 * W);

  for (const row of NUTRITION_ROWS) {
    ctx.font = `${row.bold ? 500 : 400} ${rowFontPx}px "DM Mono", monospace`;
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, innerX, rowY);
    ctx.textAlign = 'right';
    ctx.fillText(row.value, innerRight, rowY);

    ctx.fillStyle = 'rgba(28, 26, 31, 0.18)';
    ctx.fillRect(innerX, rowY + H * 0.01, innerW, 1);
    rowY += rowStep;
  }

  // Ingredients
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.font = `500 ${Math.round(0.038 * W)}px "DM Mono", monospace`;
  ctx.fillText('INGREDIENTS', px, H * 0.62);

  const ingFontPx = Math.round(0.034 * W);
  ctx.font = `400 ${ingFontPx}px "DM Mono", monospace`;
  const words = flav.ingredients.split(' ');
  let line = '';
  let ingY = H * 0.65;
  const maxW = W * 0.7;
  const lineH = H * 0.022;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, px, ingY);
      line = word;
      ingY += lineH;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, px, ingY);
  }

  // Barcode on white rounded card at 73.5% H
  const bcX = W * 0.22;
  const bcY = H * 0.735;
  const bcW = W * 0.56;
  const bcH = H * 0.11;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  roundRectPath(ctx, bcX, bcY, bcW, bcH, 0.024 * W);
  ctx.fill();
  ctx.restore();

  const rand = seededRand(104729 + flavourIndex * 7919);
  const barsPadX = bcW * 0.1;
  const barsStartX = bcX + barsPadX;
  const barsEndX = bcX + bcW - barsPadX;
  const barsTop = bcY + bcH * 0.16;
  const barsHeight = bcH * 0.54;

  ctx.fillStyle = '#1c1a1f';
  let curX = barsStartX;
  while (curX < barsEndX - 3) {
    const bw = (1 + Math.floor(rand() * 3)) * (W * 0.0042);
    const gap = (1 + Math.floor(rand() * 3)) * (W * 0.0038);
    if (curX + bw > barsEndX) break;
    ctx.fillRect(curX, barsTop, bw, barsHeight);
    curX += bw + gap;
  }

  ctx.fillStyle = '#1c1a1f';
  ctx.textAlign = 'center';
  ctx.font = `400 ${Math.round(0.026 * W)}px "DM Mono", monospace`;
  ctx.fillText(`5 060912 3405${flavourIndex + 1}8`, W * 0.5, bcY + bcH * 0.87);

  // "PRESSED, NOT BAKED" at 88.5% H
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(0.036 * W)}px "DM Mono", monospace`;
  ctx.fillText('PRESSED, NOT BAKED', W * 0.5, H * 0.885);

  return canvas;
}

function drawFrontCanvas(sheetImg: HTMLImageElement, flavourIndex: number): HTMLCanvasElement {
  const flav = FLAVORS[flavourIndex];
  const { x, y, w, h } = flav.box;
  const cw = Math.round((w + 8) * 1.5 * 0.75);
  const ch = Math.round(cw * BH);
  const scale = sheetImg.naturalWidth / SHEET_W;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(
      sheetImg,
      (x - 4) * scale,
      (y - 4) * scale,
      (w + 8) * scale,
      (h + 8) * scale,
      0,
      0,
      cw,
      ch,
    );
  }
  return canvas;
}

export class StrideGlScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly frontGeo: THREE.PlaneGeometry;
  private readonly backGeo: THREE.PlaneGeometry;
  private readonly shadowGeo: THREE.PlaneGeometry;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly envRT: THREE.WebGLRenderTarget;

  private readonly frontTextures: (THREE.CanvasTexture | null)[] = [null, null, null, null, null];
  private readonly backTextures: (THREE.CanvasTexture | null)[] = [null, null, null, null, null];

  private readonly pool: BarInstance[] = [];
  private readonly traveller: BarInstance;

  private vw = 1440;
  private vh = 900;
  private texturesReady = false;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 10, 10000);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-0.6, 0.9, 1.4);
    this.scene.add(key);

    const { frontGeo, backGeo } = buildBarGeometryPair();
    this.frontGeo = frontGeo;
    this.backGeo = backGeo;
    this.shadowGeo = new THREE.PlaneGeometry(1.25, 1.04 * BH);
    this.shadowTex = buildShadowTexture();

    for (let i = 0; i < 11; i++) {
      this.pool.push(this.createBarInstance(false));
    }
    this.traveller = this.createBarInstance(true);

    this.resize(window.innerWidth, window.innerHeight);
  }

  private createBarInstance(isTraveller: boolean): BarInstance {
    const frontMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.42,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.42,
    });

    const frontMesh = new THREE.Mesh(this.frontGeo, frontMat);
    const backMesh = new THREE.Mesh(this.backGeo, backMat);
    const group = new THREE.Group();
    group.add(frontMesh, backMesh);
    group.visible = false;
    group.userData['isTraveller'] = isTraveller;

    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeo, shadowMat);
    shadowMesh.renderOrder = -1;
    shadowMesh.visible = false;

    this.scene.add(shadowMesh);
    this.scene.add(group);

    return {
      group,
      frontMesh,
      backMesh,
      frontMat,
      backMat,
      shadowMesh,
      shadowMat,
      flavour: -1,
      barIndex: 0,
    };
  }

  async loadAssets(): Promise<void> {
    const imgPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = SHEET_URL;
    });

    const fontsPromise = Promise.all([
      document.fonts.load('400 16px "Archivo Black"'),
      document.fonts.load('400 16px "DM Mono"'),
      document.fonts.load('500 16px "DM Mono"'),
      document.fonts.load('700 16px "Inter"'),
    ]).catch(() => undefined);

    const [sheetImg] = await Promise.all([imgPromise, fontsPromise]);
    if (this.disposed) return;

    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    for (let i = 0; i < FLAVORS.length; i++) {
      const fc = drawFrontCanvas(sheetImg, i);
      const fTex = new THREE.CanvasTexture(fc);
      fTex.colorSpace = THREE.SRGBColorSpace;
      fTex.anisotropy = maxAniso;
      this.frontTextures[i] = fTex;

      const bc = drawBackCanvas(sheetImg, i);
      const bTex = new THREE.CanvasTexture(bc);
      bTex.colorSpace = THREE.SRGBColorSpace;
      bTex.anisotropy = maxAniso;
      this.backTextures[i] = bTex;
    }

    this.texturesReady = true;
  }

  resize(vw: number, vh: number): void {
    this.vw = Math.max(1, vw);
    this.vh = Math.max(1, vh);
    const pr = Math.min(window.devicePixelRatio || 1, this.vw < 820 ? 1.75 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.vw, this.vh, false);
    this.canvas.style.height = `${this.vh}px`;

    const D = clamp(1500 * Math.min(this.vw / 1440, this.vh / 900), 1000, 2200);
    const fov = 2 * Math.atan(this.vh / 2 / D) * (180 / Math.PI);
    this.camera.fov = fov;
    this.camera.aspect = this.vw / this.vh;
    this.camera.near = 10;
    this.camera.far = 4 * D;
    this.camera.position.set(0, 0, D);
    this.camera.updateProjectionMatrix();
  }

  private placeInstance(inst: BarInstance, flavour: number, barIndex: number, state: BarState): void {
    if (!this.texturesReady || state.op <= 0.01) {
      inst.group.visible = false;
      inst.shadowMesh.visible = false;
      return;
    }

    if (inst.flavour !== flavour) {
      inst.flavour = flavour;
      inst.frontMat.map = this.frontTextures[flavour];
      inst.frontMat.needsUpdate = true;
      inst.backMat.map = this.backTextures[flavour];
      inst.backMat.needsUpdate = true;
    }

    inst.barIndex = barIndex;
    inst.group.userData['barIndex'] = barIndex;
    inst.frontMesh.userData['barIndex'] = barIndex;
    inst.backMesh.userData['barIndex'] = barIndex;

    const wx = state.x - this.vw / 2;
    const wy = this.vh / 2 - state.y;
    const wz = state.z;
    const s = state.h / BH;

    inst.group.visible = true;
    inst.group.position.set(wx, wy, wz);
    inst.group.scale.set(s * state.sx, s * state.sy, s);
    inst.group.rotation.order = 'ZYX';
    const rxRad = (state.rx * Math.PI) / 180;
    const ryRad = (state.ry * Math.PI) / 180;
    const rzRad = (-state.rz * Math.PI) / 180;
    inst.group.rotation.set(rxRad, ryRad, rzRad);

    inst.frontMat.opacity = state.op;
    inst.backMat.opacity = state.op;

    const shOp = 0.5 * state.op * state.shadow;
    if (shOp > 0.005) {
      inst.shadowMesh.visible = true;
      inst.shadowMesh.position.set(wx, wy - 0.05 * state.h, wz - 0.32 * state.h);
      inst.shadowMesh.rotation.set(0, 0, rzRad);
      const cosY = Math.max(0.3, Math.abs(Math.cos(ryRad)));
      inst.shadowMesh.scale.set(s * state.sx * cosY, s * state.sy, 1);
      inst.shadowMat.opacity = shOp;
    } else {
      inst.shadowMesh.visible = false;
    }
  }

  updatePoolBar(slotIdx: number, flavour: number, barIndex: number, state: BarState): void {
    if (slotIdx < 0 || slotIdx >= this.pool.length) return;
    this.placeInstance(this.pool[slotIdx], flavour, barIndex, state);
  }

  hidePoolBar(slotIdx: number): void {
    if (slotIdx < 0 || slotIdx >= this.pool.length) return;
    this.pool[slotIdx].group.visible = false;
    this.pool[slotIdx].shadowMesh.visible = false;
  }

  updateTraveller(flavour: number, barIndex: number, state: BarState): void {
    this.placeInstance(this.traveller, flavour, barIndex, state);
  }

  pickBar(clientX: number, clientY: number): { barIndex: number; isTraveller: boolean } | null {
    if (!this.texturesReady) return null;
    this.pointerNdc.x = (clientX / this.vw) * 2 - 1;
    this.pointerNdc.y = -(clientY / this.vh) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const targets: THREE.Object3D[] = [];
    if (this.traveller.group.visible) targets.push(this.traveller.frontMesh, this.traveller.backMesh);
    for (const p of this.pool) {
      if (p.group.visible) targets.push(p.frontMesh, p.backMesh);
    }

    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;

    const hitObj = hits[0].object;
    const barIndex = hitObj.userData['barIndex'] as number;
    const isTraveller = Boolean(hitObj.parent?.userData['isTraveller']);
    return { barIndex, isTraveller };
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.frontGeo.dispose();
    this.backGeo.dispose();
    this.shadowGeo.dispose();
    this.shadowTex.dispose();
    this.envRT.dispose();

    for (const t of this.frontTextures) t?.dispose();
    for (const t of this.backTextures) t?.dispose();

    for (const inst of [...this.pool, this.traveller]) {
      inst.frontMat.dispose();
      inst.backMat.dispose();
      inst.shadowMat.dispose();
    }
    this.renderer.dispose();
  }
}
