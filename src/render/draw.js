import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_H, CELL_W, HOUSE_LINE_X } from "../config/constants.js";
import { PLANTS } from "../config/plants.js";
import { ZOMBIES } from "../config/zombies.js";
import { state } from "../core/state.js";
import { ui } from "../ui/dom.js";
import * as THREE from "../../assets/vendor/three.module.min.js";

/**
 * 3D 渲染模块，基于 Three.js （WebGL）实现游戏的所有可视化内容。
 *
 * 主要责任：
 *   - 封装内部 sceneState：包括 Three.js 渲染器、场景、摄影机及所有 3D 对象映射
 *   - 每帧通过 syncMap() 将 state 中的实体与 Three.js对象对齐，增加/移除不变的部分
 *   - 支持自动畫质调整（fps 监控），低帧率时降至 medium/low 质量
 *   - 提供交互接口：光线投射识局卡格子、阳光点击检测
 *   - 3D 尚未就绪时降级为 Canvas 2D 邦小器渲染
 */

const sceneState = {
  ready: false,
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  groups: {
    mowers: null,
    plants: null,
    zombies: null,
    projectiles: null,
    suns: null,
    effects: null,
    preview: null,
  },
  maps: {
    mowers: new Map(),
    plants: new Map(),
    zombies: new Map(),
    projectiles: new Map(),
    suns: new Map(),
  },
  lastCanvasW: 0,
  lastCanvasH: 0,
  cameraMode: "default",
  cameraCurrent: { x: 0, y: 270, z: 860, lookX: 0, lookZ: -20 },
  cameraTarget: { x: 0, y: 270, z: 860, lookX: 0, lookZ: -20 },
  shake: 0,
  lastKillCount: 0,
  quality: "auto",
  resolvedQuality: "high",
  frameSampleMs: 16,
  lastFrameAt: 0,
  autoAdjustTimer: 0,
  keyLight: null,
  performanceMode: false,
  initFailed: false,
  initError: "",
};

const CAMERA_PRESETS = {
  default: { offsetX: 0, y: 520, z: 560, lookOffsetZ: -6 },
  close: { offsetX: 0, y: 360, z: 390, lookOffsetZ: 4 },
};

const QUALITY_PRESETS = {
  high: { pixelRatioCap: 1.75, shadow: true, shadowSize: 1024, effectBudget: 140 },
  medium: { pixelRatioCap: 1.25, shadow: true, shadowSize: 512, effectBudget: 90 },
  low: { pixelRatioCap: 1.0, shadow: false, shadowSize: 256, effectBudget: 56 },
};

const BASE_BACKGROUND = new THREE.Color(0xa5d07a);
const DOOM_BACKGROUND = new THREE.Color(0x33263f);
const BASE_FOG = new THREE.Color(0xa5d07a);
const DOOM_FOG = new THREE.Color(0x3f334a);
const PLANT_DAMAGE_TINT = new THREE.Color(0x516332);
const PLANT_CRITICAL_TINT = new THREE.Color(0x6b6e2f);
const ZOMBIE_DAMAGE_TINT = new THREE.Color(0x69544a);
const ZOMBIE_CRITICAL_TINT = new THREE.Color(0x8a5b43);

function getEffectivePreset() {
  const base = QUALITY_PRESETS[sceneState.resolvedQuality] || QUALITY_PRESETS.high;
  if (!sceneState.performanceMode) {
    return base;
  }
  return {
    pixelRatioCap: Math.min(1.0, base.pixelRatioCap),
    shadow: false,
    shadowSize: 256,
    effectBudget: Math.max(34, Math.floor(base.effectBudget * 0.55)),
  };
}

function getCanvasLogicalSize() {
  return {
    width: ui.canvas.clientWidth || ui.canvas.width,
    height: ui.canvas.clientHeight || ui.canvas.height,
  };
}

function getBoardWorldBounds() {
  const left = toWorldX(BOARD_X);
  const right = toWorldX(BOARD_X + BOARD_W);
  const top = toWorldY(BOARD_Y);
  const bottom = toWorldY(BOARD_Y + BOARD_H);
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerZ: (top + bottom) / 2,
  };
}

function fitCameraPreset(mode = sceneState.cameraMode) {
  const preset = CAMERA_PRESETS[mode] || CAMERA_PRESETS.default;
  const { width, height } = getCanvasLogicalSize();
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const aspect = safeW / safeH;
  const bounds = getBoardWorldBounds();
  const lookPoint = new THREE.Vector3(
    bounds.centerX + preset.offsetX,
    0,
    bounds.centerZ + preset.lookOffsetZ
  );
  let cameraPos = new THREE.Vector3(
    bounds.centerX + preset.offsetX,
    preset.y,
    preset.z
  );

  const corners = [
    new THREE.Vector3(bounds.left, 0, bounds.top),
    new THREE.Vector3(bounds.right, 0, bounds.top),
    new THREE.Vector3(bounds.left, 0, bounds.bottom),
    new THREE.Vector3(bounds.right, 0, bounds.bottom),
  ];

  const fitSpan = 1.72;
  for (let i = 0; i < 4; i += 1) {
    const probeCamera = new THREE.PerspectiveCamera(46, aspect, 1, 2600);
    probeCamera.position.copy(cameraPos);
    probeCamera.lookAt(lookPoint);
    probeCamera.updateProjectionMatrix();
    probeCamera.updateMatrixWorld();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    corners.forEach((point) => {
      const projected = point.clone().project(probeCamera);
      minX = Math.min(minX, projected.x);
      maxX = Math.max(maxX, projected.x);
      minY = Math.min(minY, projected.y);
      maxY = Math.max(maxY, projected.y);
    });

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    let ratio = Math.max(spanX / fitSpan, spanY / fitSpan);
    ratio = Math.min(1.38, Math.max(0.84, ratio));

    const dir = cameraPos.clone().sub(lookPoint).multiplyScalar(ratio);
    cameraPos = lookPoint.clone().add(dir);
  }

  return {
    x: cameraPos.x,
    y: cameraPos.y,
    z: cameraPos.z,
    lookX: lookPoint.x,
    lookZ: lookPoint.z,
  };
}

function syncCameraTargetToViewport() {
  if (!sceneState.ready) {
    return;
  }
  sceneState.cameraTarget = fitCameraPreset(sceneState.cameraMode);
}

function toWorldX(x) {
  return x - getCanvasLogicalSize().width / 2;
}

function toWorldY(y) {
  return getCanvasLogicalSize().height / 2 - y;
}

function toScreenX(worldX) {
  return worldX + getCanvasLogicalSize().width / 2;
}

function toScreenY(worldZ) {
  return getCanvasLogicalSize().height / 2 - worldZ;
}

function resizeRendererIfNeeded() {
  if (!sceneState.ready) {
    return;
  }
  const { renderer, camera } = sceneState;
  const w = ui.canvas.clientWidth || ui.canvas.width;
  const h = ui.canvas.clientHeight || ui.canvas.height;
  if (w < 1 || h < 1) {
    return;
  }
  if (w === sceneState.lastCanvasW && h === sceneState.lastCanvasH) {
    return;
  }
  sceneState.lastCanvasW = w;
  sceneState.lastCanvasH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  syncCameraTargetToViewport();
}

function applyResolvedQuality() {
  if (!sceneState.ready) {
    return;
  }
  const preset = getEffectivePreset();
  sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap));
  sceneState.renderer.shadowMap.enabled = preset.shadow;
  if (sceneState.keyLight) {
    sceneState.keyLight.castShadow = preset.shadow;
    sceneState.keyLight.shadow.mapSize.width = preset.shadowSize;
    sceneState.keyLight.shadow.mapSize.height = preset.shadowSize;
    sceneState.keyLight.shadow.needsUpdate = true;
  }
  sceneState.renderer.toneMappingExposure = sceneState.resolvedQuality === "low" ? 0.95 : 1.02;
  resizeRendererIfNeeded();
}

function resolveAutoQualityByFrameTime() {
  if (sceneState.quality !== "auto") {
    return;
  }
  sceneState.autoAdjustTimer += 1;
  if (sceneState.autoAdjustTimer < 60) {
    return;
  }
  sceneState.autoAdjustTimer = 0;
  const ms = sceneState.frameSampleMs;
  const prev = sceneState.resolvedQuality;
  if (ms > 29) {
    sceneState.resolvedQuality = "low";
  } else if (ms > 22) {
    sceneState.resolvedQuality = "medium";
  } else {
    sceneState.resolvedQuality = "high";
  }
  if (sceneState.resolvedQuality !== prev) {
    applyResolvedQuality();
  }
}

function makeMaterial(baseColor, roughness = 0.65, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color: baseColor, roughness, metalness });
}

function supportsEmissive(material) {
  return Boolean(material && material.emissive && typeof material.emissive.setHex === "function");
}

function enableShadow(mesh, receive = false) {
  mesh.castShadow = true;
  mesh.receiveShadow = receive;
}

function rememberMaterialColor(mesh) {
  if (mesh?.material?.color) {
    mesh.userData.baseColor = mesh.material.color.getHex();
  }
}

function makeLawnTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "#6ca44b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < 512; y += 64) {
    ctx.fillStyle = (y / 64) % 2 === 0 ? "#74ad51" : "#679d47";
    ctx.fillRect(0, y, 512, 64);
  }

  for (let y = 0; y < 512; y += 12) {
    ctx.strokeStyle = "rgba(40, 75, 30, 0.13)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + ((y / 12) % 2 === 0 ? 2 : -2));
    ctx.stroke();
  }

  for (let x = 0; x < 512; x += 8) {
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(x, 0, 1, 512);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.6, 1.7);
  texture.anisotropy = 4;
  return texture;
}

function addSimpleEyes(group, y, z = 9.8, scale = 1) {
  const eyeMat = makeMaterial(0xffffff, 0.35);
  const pupilMat = makeMaterial(0x131313, 0.45);
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(1.8 * scale, 8, 8), eyeMat);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(1.8 * scale, 8, 8), eyeMat);
  const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.72 * scale, 8, 8), pupilMat);
  const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.72 * scale, 8, 8), pupilMat);

  leftEye.position.set(-3.8 * scale, y, z);
  rightEye.position.set(3.8 * scale, y, z);
  leftPupil.position.set(-3.5 * scale, y - 0.2 * scale, z + 1.1 * scale);
  rightPupil.position.set(3.5 * scale, y - 0.2 * scale, z + 1.1 * scale);

  enableShadow(leftEye);
  enableShadow(rightEye);
  group.add(leftEye);
  group.add(rightEye);
  group.add(leftPupil);
  group.add(rightPupil);
}

function addPeaLeaves(group, tint = 0x3f963a) {
  const leafMat = makeMaterial(tint, 0.82);
  const leafA = new THREE.Mesh(new THREE.SphereGeometry(5.5, 10, 10, 0, Math.PI), leafMat);
  const leafB = new THREE.Mesh(new THREE.SphereGeometry(5.2, 10, 10, 0, Math.PI), leafMat);
  leafA.rotation.set(Math.PI / 2.35, -0.65, 0.2);
  leafB.rotation.set(Math.PI / 2.15, 0.65, -0.2);
  leafA.position.set(-6, -7, -3);
  leafB.position.set(6, -7, -3);
  enableShadow(leafA);
  enableShadow(leafB);
  group.add(leafA);
  group.add(leafB);
}

function buildStaticWorld() {
  const lawnTexture = makeLawnTexture();

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_W + 22, 26, BOARD_H + 14),
    new THREE.MeshStandardMaterial({
      color: 0x88bf5f,
      roughness: 0.86,
      metalness: 0.0,
      map: lawnTexture || null,
    })
  );
  enableShadow(board, true);
  board.position.set(toWorldX(BOARD_X + BOARD_W / 2), -18, toWorldY(BOARD_Y + BOARD_H / 2));
  sceneState.root.add(board);

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(CELL_W - 4, 2.4, CELL_H - 4),
        new THREE.MeshStandardMaterial({
          color: (row + col) % 2 === 0 ? 0x80b85a : 0x71a84d,
          roughness: 0.94,
          metalness: 0,
        })
      );
      tile.position.set(
        toWorldX(BOARD_X + col * CELL_W + CELL_W / 2),
        -3,
        toWorldY(BOARD_Y + row * CELL_H + CELL_H / 2)
      );
      tile.receiveShadow = true;
      sceneState.root.add(tile);

      const tileFrame = new THREE.Mesh(
        new THREE.BoxGeometry(CELL_W - 2, 0.6, CELL_H - 2),
        new THREE.MeshBasicMaterial({ color: 0x375d26, transparent: true, opacity: 0.22 })
      );
      tileFrame.position.set(
        toWorldX(BOARD_X + col * CELL_W + CELL_W / 2),
        -1.5,
        toWorldY(BOARD_Y + row * CELL_H + CELL_H / 2)
      );
      sceneState.root.add(tileFrame);
    }
  }

  const leftPath = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD_X - 8, 18, BOARD_H + 30),
    makeMaterial(0xcbb185, 0.95, 0.0)
  );
  enableShadow(leftPath, true);
  leftPath.position.set(toWorldX((BOARD_X - 8) / 2), -14, toWorldY(BOARD_Y + BOARD_H / 2));
  sceneState.root.add(leftPath);

  const houseLine = new THREE.Mesh(
    new THREE.BoxGeometry(6, 24, BOARD_H + 16),
    makeMaterial(0x6b3b1a, 0.7, 0.0)
  );
  enableShadow(houseLine, true);
  houseLine.position.set(toWorldX(HOUSE_LINE_X), -10, toWorldY(BOARD_Y + BOARD_H / 2));
  sceneState.root.add(houseLine);

  const { width: logicalW, height: logicalH } = getCanvasLogicalSize();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(logicalW + 120, logicalH + 80),
    new THREE.MeshStandardMaterial({ color: 0x6f9e4c, roughness: 0.98, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -32, -32);
  floor.receiveShadow = true;
  sceneState.root.add(floor);

  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x2e5b2e, transparent: true, opacity: 0.35 });
  const points = [];
  for (let c = 0; c <= 9; c += 1) {
    const x = BOARD_X + c * CELL_W;
    points.push(new THREE.Vector3(toWorldX(x), -4, toWorldY(BOARD_Y)));
    points.push(new THREE.Vector3(toWorldX(x), -4, toWorldY(BOARD_Y + BOARD_H)));
  }
  for (let r = 0; r <= 5; r += 1) {
    const y = BOARD_Y + r * CELL_H;
    points.push(new THREE.Vector3(toWorldX(BOARD_X), -4, toWorldY(y)));
    points.push(new THREE.Vector3(toWorldX(BOARD_X + BOARD_W), -4, toWorldY(y)));
  }
  const grid = new THREE.BufferGeometry().setFromPoints(points);
  const lines = new THREE.LineSegments(grid, gridMaterial);
  sceneState.root.add(lines);

  const houseWall = new THREE.Mesh(
    new THREE.BoxGeometry(34, 120, BOARD_H + 48),
    makeMaterial(0xc8a77a, 0.92)
  );
  houseWall.position.set(toWorldX(HOUSE_LINE_X - 24), 34, toWorldY(BOARD_Y + BOARD_H / 2));
  enableShadow(houseWall, true);
  sceneState.root.add(houseWall);

  const roofShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(140, BOARD_H + 44),
    new THREE.MeshBasicMaterial({ color: 0x2e281f, transparent: true, opacity: 0.12 })
  );
  roofShadow.rotation.x = -Math.PI / 2;
  roofShadow.position.set(toWorldX(HOUSE_LINE_X + 42), -2.6, toWorldY(BOARD_Y + BOARD_H / 2));
  sceneState.root.add(roofShadow);

  for (let i = 0; i < 3; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(16 - j, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xf9fff6, transparent: true, opacity: 0.22 })
      );
      puff.position.set(j * 14, (j % 2) * 6, (j % 3) * 4);
      cloud.add(puff);
    }
    cloud.position.set(-280 + i * 210, 180 + i * 10, -220 - i * 26);
    cloud.rotation.y = 0.4;
    sceneState.root.add(cloud);
  }
}

function createPlantObject(plant) {
  const def = PLANTS[plant.plantId];
  const group = new THREE.Group();

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 20, 8), makeMaterial(0x3d8f3a, 0.8));
  stem.position.y = -2;
  enableShadow(stem);
  stem.userData.part = "stem";
  group.add(stem);

  let head;
  if (plant.plantId === "sunflower") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(9.2, 14, 14), makeMaterial(0x8a5a2f, 0.75));
    core.position.y = 10;
    head = core;
    for (let i = 0; i < 12; i += 1) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(4.3, 8, 8), makeMaterial(0xf4cb4e, 0.55));
      const a = (i / 12) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 11.2, 10 + Math.sin(a) * 11.2, -1.8);
      enableShadow(petal);
      group.add(petal);
    }
    addSimpleEyes(group, 11.2, 9.2, 0.82);
  } else if (plant.plantId === "wallnut") {
    head = new THREE.Mesh(new THREE.BoxGeometry(30, 38, 24), makeMaterial(0xaa7642, 0.9));
    head.position.y = 8;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(15, 1.6, 1.2), makeMaterial(0x5b3419, 0.7));
    brow.position.set(0, 13, 12.8);
    group.add(brow);
    const crackA = new THREE.Mesh(new THREE.BoxGeometry(1.4, 18, 1.2), makeMaterial(0x583015, 0.8));
    const crackB = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12, 1.2), makeMaterial(0x583015, 0.8));
    crackA.position.set(-4, 6, 12.7);
    crackB.position.set(5, -1, 12.7);
    crackA.rotation.z = 0.3;
    crackB.rotation.z = -0.45;
    crackA.visible = false;
    crackB.visible = false;
    crackA.userData.part = "crackA";
    crackB.userData.part = "crackB";
    group.add(crackA);
    group.add(crackB);
    addSimpleEyes(group, 8.5, 12.5, 0.78);
  } else if (plant.plantId === "tallnut") {
    head = new THREE.Mesh(new THREE.BoxGeometry(32, 58, 26), makeMaterial(0x95663a, 0.92));
    head.position.y = 16;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(18, 1.8, 1.2), makeMaterial(0x5b3419, 0.7));
    brow.position.set(0, 26, 13.4);
    group.add(brow);
    addSimpleEyes(group, 16, 13.2, 0.84);
  } else if (plant.plantId === "cherrybomb") {
    const cherryA = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 12), makeMaterial(0xcf4f43, 0.58));
    const cherryB = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 12), makeMaterial(0xde5e4f, 0.58));
    cherryA.position.set(-6, 8, 0);
    cherryB.position.set(7, 9, 0);
    enableShadow(cherryA);
    enableShadow(cherryB);
    group.add(cherryA);
    group.add(cherryB);
    head = new THREE.Mesh(new THREE.ConeGeometry(3.2, 8, 8), makeMaterial(0xffcd6f, 0.45));
    head.position.set(2, 20, 0);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 8, 6), makeMaterial(0x2f5a2f, 0.85));
    fuse.position.set(2, 24, 0);
    fuse.userData.part = "fuse";
    group.add(fuse);
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd270, emissive: 0xff9a22, emissiveIntensity: 0.1, roughness: 0.35 })
    );
    spark.position.set(2, 28, 0);
    spark.userData.part = "spark";
    group.add(spark);
  } else if (plant.plantId === "potatomine") {
    head = new THREE.Mesh(new THREE.SphereGeometry(12, 14, 14), makeMaterial(0x9d7348, 0.88));
    head.position.y = -2;
    head.scale.set(1.08, 0.7, 1);
    const sproutA = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 8, 0, Math.PI), makeMaterial(0x5f983f, 0.82));
    const sproutB = new THREE.Mesh(new THREE.SphereGeometry(3.8, 8, 8, 0, Math.PI), makeMaterial(0x4e8c36, 0.82));
    sproutA.rotation.set(Math.PI / 2.1, -0.4, 0.1);
    sproutB.rotation.set(Math.PI / 2.1, 0.55, -0.1);
    sproutA.position.set(-4, 2, -2);
    sproutB.position.set(4, 3, -2);
    sproutA.userData.part = "sproutA";
    sproutB.userData.part = "sproutB";
    enableShadow(sproutA);
    enableShadow(sproutB);
    group.add(sproutA);
    group.add(sproutB);
    addSimpleEyes(group, -1.5, 10.6, 0.76);
  } else if (plant.plantId === "squash") {
    head = new THREE.Mesh(new THREE.SphereGeometry(12.5, 14, 14), makeMaterial(0x7e9b34, 0.82));
    head.position.y = 8;
    head.scale.set(1.05, 0.92, 1.02);
    const browL = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.2, 1), makeMaterial(0x37491c, 0.72));
    const browR = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.2, 1), makeMaterial(0x37491c, 0.72));
    browL.position.set(-3.6, 11.6, 11.8);
    browR.position.set(3.6, 11.6, 11.8);
    browL.rotation.z = 0.22;
    browR.rotation.z = -0.22;
    group.add(browL);
    group.add(browR);
    addSimpleEyes(group, 8.8, 11.2, 0.88);
  } else if (plant.plantId === "spikeweed") {
    head = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 4, 12), makeMaterial(0x5e8142, 0.86));
    head.position.y = -10;
    for (let i = 0; i < 8; i += 1) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(2.2, 10, 6), makeMaterial(0x4b6733, 0.86));
      const angle = (i / 8) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 8, -4, Math.sin(angle) * 8);
      spike.rotation.z = Math.PI / 2;
      spike.rotation.y = angle;
      enableShadow(spike);
      group.add(spike);
    }
  } else if (plant.plantId === "chomper") {
    head = new THREE.Mesh(new THREE.SphereGeometry(11.5, 14, 14), makeMaterial(0x8a4cb2, 0.7));
    head.position.y = 10;
    head.scale.set(1.06, 1, 1.02);
    const jawTop = new THREE.Mesh(new THREE.SphereGeometry(7.6, 10, 10), makeMaterial(0x9f63c1, 0.62));
    const jawBottom = new THREE.Mesh(new THREE.SphereGeometry(7.8, 10, 10), makeMaterial(0x714090, 0.7));
    jawTop.position.set(8, 13, 2);
    jawBottom.position.set(8, 6, 2);
    jawTop.scale.set(1.08, 0.52, 0.9);
    jawBottom.scale.set(1.08, 0.48, 0.9);
    jawTop.userData.part = "jawTop";
    jawBottom.userData.part = "jawBottom";
    enableShadow(jawTop);
    enableShadow(jawBottom);
    group.add(jawTop);
    group.add(jawBottom);
    addSimpleEyes(group, 11.5, 9.4, 0.82);
    addPeaLeaves(group, 0x487c31);
  } else if (plant.plantId === "torchwood") {
    head = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 24, 12), makeMaterial(0x8f5b31, 0.9));
    head.position.y = 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(9.5, 2.1, 8, 18), makeMaterial(0x5f3218, 0.8));
    rim.position.set(0, 14, 0);
    rim.rotation.x = Math.PI / 2;
    rim.userData.part = "rim";
    enableShadow(rim);
    group.add(rim);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(7, 18, 10),
      new THREE.MeshStandardMaterial({ color: 0xffa032, emissive: 0xff6a10, emissiveIntensity: 0.6, roughness: 0.3 })
    );
    flame.position.set(0, 24, 0);
    flame.userData.part = "flame";
    group.add(flame);
  } else if (plant.plantId === "magnetshroom") {
    head = new THREE.Mesh(new THREE.SphereGeometry(12, 14, 14), makeMaterial(0x7a6995, 0.7));
    head.position.y = 8;
    head.scale.set(1.1, 0.78, 1.06);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(15, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), makeMaterial(0x8e7aae, 0.62));
    cap.position.set(0, 16, 0);
    cap.userData.part = "cap";
    enableShadow(cap);
    group.add(cap);
    const magnet = new THREE.Mesh(new THREE.TorusGeometry(6.5, 2.1, 8, 18, Math.PI), makeMaterial(0xb43237, 0.5));
    magnet.position.set(0, 10, 10);
    magnet.rotation.z = Math.PI;
    magnet.userData.part = "magnet";
    enableShadow(magnet);
    group.add(magnet);
    addSimpleEyes(group, 8.8, 10.8, 0.8);
  } else if (plant.plantId === "iceshroom") {
    head = new THREE.Mesh(new THREE.SphereGeometry(12, 14, 14), makeMaterial(0x79badb, 0.64));
    head.position.y = 8;
    head.scale.set(1.08, 0.76, 1.04);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(15.5, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2), makeMaterial(0xa7ddf5, 0.52));
    cap.position.set(0, 16, 0);
    cap.userData.part = "iceCap";
    enableShadow(cap);
    group.add(cap);
    addSimpleEyes(group, 8.8, 10.4, 0.8);
  } else if (plant.plantId === "doomshroom") {
    head = new THREE.Mesh(new THREE.SphereGeometry(12.5, 16, 16), makeMaterial(0x5a4977, 0.68));
    head.position.y = 8;
    head.scale.set(1.08, 0.8, 1.08);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(17, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2), makeMaterial(0x71579a, 0.54));
    cap.position.set(0, 18, 0);
    cap.userData.part = "doomCap";
    enableShadow(cap);
    group.add(cap);
    const spots = new THREE.Mesh(new THREE.TorusGeometry(5.4, 1.2, 8, 16), makeMaterial(0xc7b6dd, 0.42));
    spots.position.set(0, 19, 4);
    spots.rotation.x = 1.1;
    spots.userData.part = "doomSpots";
    enableShadow(spots);
    group.add(spots);
    addSimpleEyes(group, 9, 10.8, 0.84);
  } else if (plant.plantId === "threepeater") {
    head = new THREE.Mesh(new THREE.SphereGeometry(11.5, 14, 14), makeMaterial(0x3da851, 0.62));
    head.position.y = 10;
    addSimpleEyes(group, 10.5, 10.4, 0.82);
    const topHead = new THREE.Mesh(new THREE.SphereGeometry(10.2, 12, 12), makeMaterial(0x45ad58, 0.62));
    const bottomHead = new THREE.Mesh(new THREE.SphereGeometry(10.2, 12, 12), makeMaterial(0x369249, 0.62));
    topHead.position.set(0, 24, 0);
    bottomHead.position.set(0, -4, 0);
    topHead.userData.part = "topHead";
    bottomHead.userData.part = "bottomHead";
    enableShadow(topHead);
    enableShadow(bottomHead);
    group.add(topHead);
    group.add(bottomHead);
    const topMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 14, 12), makeMaterial(0x34853f, 0.62));
    const midMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.6, 16, 12), makeMaterial(0x34853f, 0.62));
    const bottomMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 14, 12), makeMaterial(0x2f7b39, 0.62));
    topMuzzle.rotation.z = Math.PI / 2;
    midMuzzle.rotation.z = Math.PI / 2;
    bottomMuzzle.rotation.z = Math.PI / 2;
    topMuzzle.position.set(13, 24, 0);
    midMuzzle.position.set(14, 10, 0);
    bottomMuzzle.position.set(13, -4, 0);
    topMuzzle.userData.part = "topMuzzle";
    midMuzzle.userData.part = "muzzle";
    bottomMuzzle.userData.part = "bottomMuzzle";
    enableShadow(topMuzzle);
    enableShadow(midMuzzle);
    enableShadow(bottomMuzzle);
    group.add(topMuzzle);
    group.add(midMuzzle);
    group.add(bottomMuzzle);
    addPeaLeaves(group, 0x3b9342);
  } else {
    const color = plant.plantId === "snowpea" ? 0x74cae6 : def.color;
    head = new THREE.Mesh(new THREE.SphereGeometry(12, 14, 14), makeMaterial(color, 0.6));
    head.position.y = 10;
    addSimpleEyes(group, 12, 10.8, 0.85);
    const mouth = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4.6, 16, 12),
      makeMaterial(plant.plantId === "snowpea" ? 0x68c0df : 0x3d8f3a, 0.62)
    );
    mouth.rotation.z = Math.PI / 2;
    mouth.position.set(14, 10, 0);
    enableShadow(mouth);
    mouth.userData.part = "muzzle";
    group.add(mouth);
    addPeaLeaves(group, plant.plantId === "snowpea" ? 0x5ba9cb : 0x3f963a);
    if (plant.plantId === "repeater") {
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 12, 8), makeMaterial(0x2e6d2e));
      muzzle.rotation.z = Math.PI / 2;
      muzzle.position.set(20, 6, 0);
      enableShadow(muzzle);
      muzzle.userData.part = "muzzle2";
      group.add(muzzle);
    }
  }
  enableShadow(head);
  head.userData.part = "head";
  group.add(head);

  const shadow = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 12, 1.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })
  );
  shadow.position.y = -16;
  shadow.userData.part = "shadow";
  group.add(shadow);

  const woundA = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1, 0.8), makeMaterial(0x4f3218, 0.84));
  const woundB = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 0.8), makeMaterial(0x4f3218, 0.84));
  woundA.position.set(-4.5, 8.8, 11.4);
  woundB.position.set(4.2, 3.8, 11.1);
  woundA.rotation.z = -0.45;
  woundB.rotation.z = 0.35;
  woundA.userData.part = "woundA";
  woundB.userData.part = "woundB";
  woundA.visible = false;
  woundB.visible = false;
  group.add(woundA);
  group.add(woundB);

  const hpAnchor = new THREE.Group();
  hpAnchor.position.set(0, 30, 0);
  hpAnchor.userData.part = "hpAnchor";
  const hpFrame = new THREE.Mesh(
    new THREE.BoxGeometry(24, 4.2, 1),
    new THREE.MeshBasicMaterial({ color: 0x2a2219, transparent: true, opacity: 0.78 })
  );
  hpFrame.userData.part = "hpFrame";
  const hpBack = new THREE.Mesh(
    new THREE.BoxGeometry(21, 1.8, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x6f3826, transparent: true, opacity: 0.82 })
  );
  hpBack.position.z = 0.12;
  hpBack.userData.part = "hpBack";
  const hpFill = new THREE.Mesh(
    new THREE.BoxGeometry(21, 1.8, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x7cd25f, transparent: true, opacity: 0.92 })
  );
  hpFill.position.set(0, 0, 0.28);
  hpFill.userData.part = "hpFill";
  hpAnchor.add(hpFrame);
  hpAnchor.add(hpBack);
  hpAnchor.add(hpFill);
  group.add(hpAnchor);

  group.userData.kind = "plant";
  group.traverse((child) => {
    if (child.isMesh) {
      rememberMaterialColor(child);
    }
  });
  return group;
}

function createZombieObject(zombie) {
  const def = ZOMBIES[zombie.type];
  const group = new THREE.Group();

  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 10.2, 28, 14), makeMaterial(0xd8d1bb, 0.76));
  shirt.position.y = 4;
  enableShadow(shirt);
  shirt.userData.part = "shirt";
  rememberMaterialColor(shirt);
  group.add(shirt);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(10.2, 12.6, 31, 14), makeMaterial(def.color, 0.62));
  body.position.y = 4;
  body.scale.set(1.05, 1, 0.92);
  enableShadow(body);
  body.userData.part = "body";
  rememberMaterialColor(body);
  group.add(body);

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(12.8, 12, 12), makeMaterial(def.color, 0.64));
  shoulder.position.set(0, 17, 0);
  shoulder.scale.set(1.18, 0.82, 0.92);
  enableShadow(shoulder);
  shoulder.userData.part = "shoulder";
  rememberMaterialColor(shoulder);
  group.add(shoulder);

  const hip = new THREE.Mesh(new THREE.SphereGeometry(10.8, 12, 12), makeMaterial(def.color, 0.64));
  hip.position.set(0, -8, 0);
  hip.scale.set(1.06, 0.78, 0.9);
  enableShadow(hip);
  hip.userData.part = "hip";
  rememberMaterialColor(hip);
  group.add(hip);

  const coatL = new THREE.Mesh(new THREE.SphereGeometry(6.2, 10, 10), makeMaterial(def.color, 0.66));
  const coatR = new THREE.Mesh(new THREE.SphereGeometry(6.2, 10, 10), makeMaterial(def.color, 0.66));
  coatL.position.set(-5.4, -1, 7.2);
  coatR.position.set(5.4, -1, 7.2);
  coatL.scale.set(0.68, 1.45, 0.24);
  coatR.scale.set(0.68, 1.45, 0.24);
  coatL.userData.part = "coatL";
  coatR.userData.part = "coatR";
  enableShadow(coatL);
  enableShadow(coatR);
  rememberMaterialColor(coatL);
  rememberMaterialColor(coatR);
  group.add(coatL);
  group.add(coatR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(10.4, 14, 14), makeMaterial(0xdfcfb7, 0.64));
  head.position.set(0, 29, 0.6);
  head.scale.set(1.02, 1.08, 0.98);
  enableShadow(head);
  head.userData.part = "head";
  rememberMaterialColor(head);
  group.add(head);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(5.4, 10, 10), makeMaterial(0xc7b99e, 0.7));
  jaw.position.set(0, 22.5, 7.3);
  jaw.scale.set(1.05, 0.48, 0.82);
  jaw.userData.part = "jaw";
  enableShadow(jaw);
  rememberMaterialColor(jaw);
  group.add(jaw);

  const teeth = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 1.6, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xf3eedf, roughness: 0.82, metalness: 0 })
  );
  teeth.position.set(0.1, 22.1, 10.8);
  teeth.userData.part = "teeth";
  enableShadow(teeth);
  rememberMaterialColor(teeth);
  group.add(teeth);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.9, 8, 8), makeMaterial(0xd3c1a7, 0.72));
  nose.position.set(0.8, 27.5, 10.2);
  nose.scale.set(1.18, 0.78, 1.55);
  nose.userData.part = "nose";
  enableShadow(nose);
  rememberMaterialColor(nose);
  group.add(nose);

  const hair = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7, 6), makeMaterial(0x4b3a21, 0.8));
  hair.position.set(-1.5, 40, 1);
  hair.rotation.z = 0.4;
  enableShadow(hair);
  hair.userData.part = "hair";
  rememberMaterialColor(hair);
  group.add(hair);

  const danceHair = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 10), makeMaterial(0x22181c, 0.82));
  danceHair.position.set(0, 37.5, 0.5);
  danceHair.userData.part = "danceHair";
  danceHair.visible = zombie.type === "dancing";
  enableShadow(danceHair);
  rememberMaterialColor(danceHair);
  group.add(danceHair);

  addSimpleEyes(group, 29, 8.8, 0.74);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 24, 10), makeMaterial(0x5c6f51));
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 24, 10), makeMaterial(0x5c6f51));
  armL.position.set(-15.5, 5.5, 0);
  armR.position.set(15.5, 5.5, 0);
  enableShadow(armL);
  enableShadow(armR);
  armL.userData.part = "armL";
  armR.userData.part = "armR";
  rememberMaterialColor(armL);
  rememberMaterialColor(armR);
  group.add(armL);
  group.add(armR);

  const sleeveL = new THREE.Mesh(new THREE.SphereGeometry(4.8, 8, 8), makeMaterial(def.color, 0.64));
  const sleeveR = new THREE.Mesh(new THREE.SphereGeometry(4.8, 8, 8), makeMaterial(def.color, 0.64));
  sleeveL.position.set(-13.4, 12, 0);
  sleeveR.position.set(13.4, 12, 0);
  sleeveL.scale.set(0.8, 1.05, 0.8);
  sleeveR.scale.set(0.8, 1.05, 0.8);
  sleeveL.userData.part = "sleeveL";
  sleeveR.userData.part = "sleeveR";
  enableShadow(sleeveL);
  enableShadow(sleeveR);
  rememberMaterialColor(sleeveL);
  rememberMaterialColor(sleeveR);
  group.add(sleeveL);
  group.add(sleeveR);

  const handL = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 8), makeMaterial(0xc7b99e, 0.7));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 8), makeMaterial(0xc7b99e, 0.7));
  handL.position.set(-15, -6, 0);
  handR.position.set(15, -6, 0);
  handL.userData.part = "handL";
  handR.userData.part = "handR";
  enableShadow(handL);
  enableShadow(handR);
  rememberMaterialColor(handL);
  rememberMaterialColor(handR);
  group.add(handL);
  group.add(handR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.9, 22, 10), makeMaterial(0x415339));
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.9, 22, 10), makeMaterial(0x415339));
  legL.position.set(-5.2, -22, 0);
  legR.position.set(5.2, -22, 0);
  enableShadow(legL);
  enableShadow(legR);
  legL.userData.part = "legL";
  legR.userData.part = "legR";
  rememberMaterialColor(legL);
  rememberMaterialColor(legR);
  group.add(legL);
  group.add(legR);

  const footL = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 8), makeMaterial(0x2f2f2f, 0.86));
  const footR = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 8), makeMaterial(0x2f2f2f, 0.86));
  footL.position.set(-5.4, -34, 3.8);
  footR.position.set(5.4, -34, 3.8);
  footL.scale.set(1.4, 0.5, 1.8);
  footR.scale.set(1.4, 0.5, 1.8);
  enableShadow(footL);
  enableShadow(footR);
  footL.userData.part = "footL";
  footR.userData.part = "footR";
  rememberMaterialColor(footL);
  rememberMaterialColor(footR);
  group.add(footL);
  group.add(footR);

  const woundA = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 0.9), makeMaterial(0x4d231f, 0.84));
  const woundB = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 0.9), makeMaterial(0x4d231f, 0.84));
  const woundC = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.1, 0.9), makeMaterial(0x4d231f, 0.84));
  woundA.position.set(-4.5, 9, 11.4);
  woundB.position.set(4.5, 28.5, 10.8);
  woundC.position.set(0.5, -2.5, 11.2);
  woundA.rotation.z = -0.42;
  woundB.rotation.z = 0.3;
  woundC.rotation.z = -0.18;
  woundA.userData.part = "woundA";
  woundB.userData.part = "woundB";
  woundC.userData.part = "woundC";
  woundA.visible = false;
  woundB.visible = false;
  woundC.visible = false;
  group.add(woundA);
  group.add(woundB);
  group.add(woundC);

  const hpAnchor = new THREE.Group();
  hpAnchor.position.set(0, 55, 0);
  hpAnchor.userData.part = "hpAnchor";
  const hpFrame = new THREE.Mesh(
    new THREE.BoxGeometry(30, 4.8, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x2f261d, transparent: true, opacity: 0.82 })
  );
  hpFrame.userData.part = "hpFrame";
  const hpBack = new THREE.Mesh(
    new THREE.BoxGeometry(27, 2.2, 1),
    new THREE.MeshBasicMaterial({ color: 0x6a3028, transparent: true, opacity: 0.86 })
  );
  hpBack.position.z = 0.18;
  hpBack.userData.part = "hpBack";
  const hpFill = new THREE.Mesh(
    new THREE.BoxGeometry(27, 2.2, 1),
    new THREE.MeshBasicMaterial({ color: 0x7cd25f, transparent: true, opacity: 0.95 })
  );
  hpFill.position.set(0, 0, 0.42);
  hpFill.userData.part = "hpFill";
  const shieldFill = new THREE.Mesh(
    new THREE.BoxGeometry(27, 1.1, 0.9),
    new THREE.MeshBasicMaterial({ color: 0x8fd7f0, transparent: true, opacity: 0.9 })
  );
  shieldFill.position.set(0, -2.9, 0.4);
  shieldFill.userData.part = "shieldFill";
  hpAnchor.add(hpFrame);
  hpAnchor.add(hpBack);
  hpAnchor.add(hpFill);
  hpAnchor.add(shieldFill);
  group.add(hpAnchor);

  if (zombie.type === "conehead") {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(10, 22, 16), makeMaterial(0xd98d2f, 0.6));
    cone.position.set(0, 42, 0);
    enableShadow(cone);
    cone.userData.part = "cone";
    group.add(cone);
  }

  if (zombie.type === "buckethead") {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 13, 16), makeMaterial(0x9aa3a8, 0.45, 0.3));
    bucket.position.set(0, 42, 0);
    enableShadow(bucket);
    bucket.userData.part = "bucket";
    group.add(bucket);
  }

  if (zombie.type === "newspaper") {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0xe6e2d7, roughness: 0.96, metalness: 0.0 })
    );
    paper.position.set(-15, 8, 10);
    paper.rotation.y = -0.35;
    paper.userData.part = "paper";
    enableShadow(paper);
    group.add(paper);
  }

  if (zombie.type === "polevault") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 54, 8), makeMaterial(0xc3a36f, 0.82));
    pole.position.set(8, 18, 0);
    pole.rotation.z = 0.6;
    pole.userData.part = "pole";
    enableShadow(pole);
    group.add(pole);
  }

  if (zombie.type === "screendoor") {
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(6, 38, 20),
      new THREE.MeshStandardMaterial({ color: 0xb7c4c8, roughness: 0.5, metalness: 0.45 })
    );
    shield.position.set(-19, 2, 0);
    shield.userData.shield = true;
    enableShadow(shield);
    group.add(shield);
  }

  if (zombie.type === "flag") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 36, 8), makeMaterial(0x9e8f76, 0.75));
    pole.position.set(-16, 14, 0);
    pole.userData.part = "flagPole";
    enableShadow(pole);
    group.add(pole);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 14),
      new THREE.MeshStandardMaterial({ color: 0xc7433e, roughness: 0.74, metalness: 0.0, side: THREE.DoubleSide })
    );
    flag.position.set(-7, 22, 8);
    flag.userData.part = "flagCloth";
    group.add(flag);
  }
  if (zombie.type === "dancing") {
    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(3.1, 8, 8), makeMaterial(0xffffff, 0.35));
    const gloveR = new THREE.Mesh(new THREE.SphereGeometry(3.1, 8, 8), makeMaterial(0xffffff, 0.35));
    gloveL.position.set(-15, -6, 0.6);
    gloveR.position.set(15, -6, 0.6);
    gloveL.userData.part = "gloveL";
    gloveR.userData.part = "gloveR";
    enableShadow(gloveL);
    enableShadow(gloveR);
    group.add(gloveL);
    group.add(gloveR);

    const jacket = new THREE.Mesh(new THREE.BoxGeometry(20, 16, 12), makeMaterial(0x3b2b55, 0.6));
    jacket.position.set(0, 8, 1.4);
    jacket.userData.part = "jacket";
    enableShadow(jacket);
    group.add(jacket);
  }
  if (zombie.type === "miner") {
    const minerHelmet = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9.4, 7, 14), makeMaterial(0x5c4630, 0.72));
    minerHelmet.position.set(0, 40, 0.6);
    minerHelmet.userData.part = "minerHelmet";
    enableShadow(minerHelmet);
    group.add(minerHelmet);

    const minerLamp = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd26a, emissive: 0xffc04a, emissiveIntensity: 0.5, roughness: 0.3 })
    );
    minerLamp.position.set(4.6, 40, 8.6);
    minerLamp.userData.part = "minerLamp";
    group.add(minerLamp);

    const pickaxe = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 28, 8), makeMaterial(0x9b7a56, 0.74));
    pickaxe.position.set(-18, 12, 0);
    pickaxe.rotation.z = -0.55;
    pickaxe.userData.part = "pickaxe";
    enableShadow(pickaxe);
    group.add(pickaxe);

    const pickHead = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 2), makeMaterial(0x8c9498, 0.45, 0.22));
    pickHead.position.set(-10.5, 23, 0);
    pickHead.rotation.z = 0.18;
    pickHead.userData.part = "pickHead";
    enableShadow(pickHead);
    group.add(pickHead);

    const mound = new THREE.Mesh(new THREE.SphereGeometry(12, 10, 10), makeMaterial(0x7b5b37, 0.92));
    mound.position.set(0, -21, 0);
    mound.scale.set(1.35, 0.38, 1.05);
    mound.userData.part = "mound";
    enableShadow(mound);
    group.add(mound);
  }
  if (zombie.type === "backup") {
    body.scale.set(0.94, 0.92, 0.88);
    shirt.material.color.setHex(0xe0ddd6);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(16, 13, 9), makeMaterial(0x6b5e82, 0.68));
    vest.position.set(0, 8, 1);
    vest.userData.part = "vest";
    enableShadow(vest);
    group.add(vest);
  }

  if (zombie.type === "football") {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(10.2, 12, 12), makeMaterial(0x8b2b2c, 0.52, 0.12));
    helmet.position.set(0, 30.5, 1.4);
    helmet.scale.set(1.08, 0.92, 1.02);
    helmet.userData.part = "helmet";
    enableShadow(helmet);
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.TorusGeometry(7, 0.8, 6, 16, Math.PI), makeMaterial(0xf1f0ea, 0.5));
    visor.position.set(0, 29.8, 9.8);
    visor.rotation.z = Math.PI;
    visor.userData.part = "helmetVisor";
    enableShadow(visor);
    group.add(visor);

    const shoulderPads = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 12), makeMaterial(0x7f2d30, 0.6));
    shoulderPads.position.set(0, 18, 0);
    shoulderPads.scale.set(1.34, 0.75, 0.98);
    shoulderPads.userData.part = "pads";
    enableShadow(shoulderPads);
    group.add(shoulderPads);
  }

  const tie = new THREE.Mesh(new THREE.ConeGeometry(3.1, 14, 6), makeMaterial(0xb02627, 0.58));
  tie.position.set(0, -5, 9.2);
  tie.rotation.x = 0.2;
  tie.userData.part = "tie";
  enableShadow(tie);
  group.add(tie);

  const shadow = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 15, 1.5, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 })
  );
  shadow.position.y = -22;
  shadow.userData.part = "shadow";
  group.add(shadow);

  group.userData.kind = "zombie";
  group.traverse((child) => {
    if (child.isMesh) {
      rememberMaterialColor(child);
    }
  });
  return group;
}

function createProjectileObject(projectile) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(5.5, 10, 10),
    new THREE.MeshStandardMaterial({
      color: projectile.fire ? 0xff8a24 : projectile.slow ? 0x89ddff : 0x57bf4c,
      emissive: projectile.fire ? 0xff5a00 : projectile.slow ? 0x0a5778 : 0x1c5d1a,
      emissiveIntensity: projectile.fire ? 0.55 : 0.35,
      roughness: 0.4,
      metalness: 0.02,
    })
  );
  enableShadow(mesh);
  return mesh;
}

function createSunObject() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(10, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd64f, emissive: 0x7f5b00, emissiveIntensity: 0.3, roughness: 0.35 })
  );
  enableShadow(mesh);
  return mesh;
}

function createMowerObject() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(28, 16, 18), makeMaterial(0xd14f38, 0.58));
  body.position.set(0, 2, 0);
  enableShadow(body);
  group.add(body);

  const engine = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 12), makeMaterial(0x464b50, 0.44, 0.18));
  engine.position.set(2, 12, 0);
  enableShadow(engine);
  group.add(engine);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(10, 1.2, 6, 14, Math.PI), makeMaterial(0x7f8d8f, 0.38, 0.2));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-12, 18, 0);
  enableShadow(handle);
  group.add(handle);

  [-8, 8].forEach((offsetZ) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 3, 12), makeMaterial(0x232323, 0.88));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(6, -6, offsetZ);
    enableShadow(wheel);
    group.add(wheel);
  });

  group.userData.kind = "mower";
  return group;
}

function ensurePreviewObjects() {
  const group = sceneState.groups.preview;
  if (!group) {
    return;
  }
  if (!group.userData.hoverTile) {
    const hoverTile = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_W - 8, 3.2, CELL_H - 8),
      new THREE.MeshStandardMaterial({ color: 0xf7e38a, transparent: true, opacity: 0.0, roughness: 0.7 })
    );
    hoverTile.position.y = 0.5;
    hoverTile.visible = false;
    group.userData.hoverTile = hoverTile;
    group.add(hoverTile);
  }
}

function updateHoverPreview() {
  const group = sceneState.groups.preview;
  if (!group) {
    return;
  }

  ensurePreviewObjects();
  const hoverTile = group.userData.hoverTile;
  const hover = state.hoverCell;
  if (!hover || !state.running || state.paused) {
    hoverTile.visible = false;
    if (group.userData.previewPlant) {
      group.remove(group.userData.previewPlant);
      group.userData.previewPlant = null;
      group.userData.previewPlantId = null;
    }
    return;
  }

  const centerX = BOARD_X + hover.col * CELL_W + CELL_W / 2;
  const centerY = BOARD_Y + hover.row * CELL_H + CELL_H / 2;
  const hasPlant = Boolean(state.plants[hover.row]?.[hover.col]);
  const blocked = Boolean(hover.blockedType);
  hoverTile.visible = true;
  hoverTile.position.set(toWorldX(centerX), 0.5, toWorldY(centerY));

  let tileColor = 0xf7e38a;
  let tileOpacity = 0.26;
  if (state.shovelMode) {
    tileColor = hasPlant ? 0xe46a58 : 0x8a5a52;
    tileOpacity = hasPlant ? 0.34 : 0.18;
  } else if (state.selectedPlant) {
    tileColor = hasPlant || blocked ? 0xd7765b : 0x9de27b;
    tileOpacity = hasPlant || blocked ? 0.22 : 0.3;
  }
  hoverTile.material.color.setHex(tileColor);
  hoverTile.material.opacity = tileOpacity;

  if (!state.selectedPlant || state.shovelMode || hasPlant || blocked) {
    if (group.userData.previewPlant) {
      group.remove(group.userData.previewPlant);
      group.userData.previewPlant = null;
      group.userData.previewPlantId = null;
    }
    return;
  }

  if (group.userData.previewPlantId !== state.selectedPlant) {
    if (group.userData.previewPlant) {
      group.remove(group.userData.previewPlant);
    }
    const previewPlant = createPlantObject({
      plantId: state.selectedPlant,
      row: hover.row,
      col: hover.col,
      x: centerX,
      y: centerY,
      hp: 999,
      fireTimer: 0,
      produceTimer: 0,
      fuseTimer: 0,
      hitFlash: 0,
      action: "idle",
      animSeed: 0,
    });
    previewPlant.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = child.userData.part === "shadow" ? 0.12 : 0.42;
      }
      if (child.userData.part === "hpAnchor" || child.userData.part === "woundA" || child.userData.part === "woundB") {
        child.visible = false;
      }
    });
    group.userData.previewPlant = previewPlant;
    group.userData.previewPlantId = state.selectedPlant;
    group.add(previewPlant);
  }

  const previewPlant = group.userData.previewPlant;
  previewPlant.position.set(toWorldX(centerX), 10 + hover.row * 0.2, toWorldY(centerY));
  previewPlant.rotation.z = Math.sin((state.levelTime || 0) * 2.2) * 0.04;
}

function updateMowerObject(mower, obj) {
  const screenY = BOARD_Y + mower.row * CELL_H + CELL_H / 2;
  obj.position.set(toWorldX(mower.x), 7, toWorldY(screenY));
  obj.visible = mower.active || !mower.spent;
  obj.rotation.y = mower.active ? Math.sin((state.levelTime || 0) * 18) * 0.05 : 0;
}

function syncMap(items, map, group, createFn, updateFn) {
  const liveIds = new Set(items.map((item) => item.id));

  for (const [id, obj] of map.entries()) {
    if (!liveIds.has(id)) {
      group.remove(obj);
      map.delete(id);
    }
  }

  items.forEach((item) => {
    let obj = map.get(item.id);
    if (!obj) {
      obj = createFn(item);
      map.set(item.id, obj);
      group.add(obj);
    }
    updateFn(item, obj);
  });
}

function updatePlantObject(plant, obj) {
  const def = PLANTS[plant.plantId];
  const hpRatio = Math.max(0, Math.min(1, plant.hp / Math.max(1, def.hp)));
  const damageBlend = Math.max(0, 1 - hpRatio);
  const wobble = Math.sin((state.levelTime || 0) * 2.8 + (plant.animSeed || 0)) * 0.06;
  const flash = Math.max(0, plant.hitFlash || 0);
  const hitJolt = flash > 0 ? Math.sin(flash * 75 + (plant.animSeed || 0)) * (1.8 + flash * 4) : 0;
  const actionScale = plant.action === "attack" ? 1.08 : plant.action === "produce" ? 1.12 : plant.action === "hurt" ? 0.95 : 1;
  const digestRatio = plant.plantId === "chomper" ? Math.max(0, Math.min(1, (plant.attackTimer || 0) / Math.max(1, def.chewTime || 1))) : 0;

  obj.position.set(toWorldX(plant.x) + hitJolt, 10 + plant.row * 0.2 + flash * 2.1, toWorldY(plant.y));
  obj.rotation.z = wobble + hitJolt * 0.01 - damageBlend * 0.04;
  obj.scale.set(actionScale, actionScale, actionScale);

  const head = obj.children.find((child) => child.userData.part === "head");
  const stem = obj.children.find((child) => child.userData.part === "stem");
  const muzzle = obj.children.find((child) => child.userData.part === "muzzle");
  const muzzle2 = obj.children.find((child) => child.userData.part === "muzzle2");
  const crackA = obj.children.find((child) => child.userData.part === "crackA");
  const crackB = obj.children.find((child) => child.userData.part === "crackB");
  const fuse = obj.children.find((child) => child.userData.part === "fuse");
  const spark = obj.children.find((child) => child.userData.part === "spark");
  const sproutA = obj.children.find((child) => child.userData.part === "sproutA");
  const sproutB = obj.children.find((child) => child.userData.part === "sproutB");
  const jawTop = obj.children.find((child) => child.userData.part === "jawTop");
  const jawBottom = obj.children.find((child) => child.userData.part === "jawBottom");
  const flame = obj.children.find((child) => child.userData.part === "flame");
  const rim = obj.children.find((child) => child.userData.part === "rim");
  const magnet = obj.children.find((child) => child.userData.part === "magnet");
  const cap = obj.children.find((child) => child.userData.part === "cap");
  const iceCap = obj.children.find((child) => child.userData.part === "iceCap");
  const doomCap = obj.children.find((child) => child.userData.part === "doomCap");
  const doomSpots = obj.children.find((child) => child.userData.part === "doomSpots");
  const topHead = obj.children.find((child) => child.userData.part === "topHead");
  const bottomHead = obj.children.find((child) => child.userData.part === "bottomHead");
  const topMuzzle = obj.children.find((child) => child.userData.part === "topMuzzle");
  const bottomMuzzle = obj.children.find((child) => child.userData.part === "bottomMuzzle");
  const woundA = obj.children.find((child) => child.userData.part === "woundA");
  const woundB = obj.children.find((child) => child.userData.part === "woundB");
  const hpAnchor = obj.children.find((child) => child.userData.part === "hpAnchor");
  const hpFill = hpAnchor?.children.find((child) => child.userData.part === "hpFill");

  if (head) {
    const nod = plant.action === "attack" ? -0.3 : plant.action === "hurt" ? 0.22 : 0;
    head.rotation.z = nod + wobble * 2.2 - damageBlend * 0.08;
    const baseY = plant.plantId === "wallnut" ? 8 : plant.plantId === "tallnut" ? 16 : plant.plantId === "potatomine" ? -2 : plant.plantId === "squash" ? 8 : 10;
    head.position.y = baseY + Math.sin((state.levelTime || 0) * 5 + (plant.animSeed || 0)) * (plant.action === "produce" ? 2.4 : 0.6);
    if (plant.plantId === "sunflower") {
      head.rotation.y = Math.sin((state.levelTime || 0) * 1.6 + (plant.animSeed || 0)) * 0.22;
    }
    if (plant.plantId === "potatomine") {
      head.position.y = plant.armed ? 2.5 : -2.5;
      head.scale.y = plant.armed ? 0.96 : 0.62;
    }
    if (plant.plantId === "squash") {
      head.scale.y = plant.action === "attack" ? 0.72 : 0.92;
      head.position.y = plant.action === "attack" ? 13 : 8;
    }
    if (plant.plantId === "spikeweed") {
      head.rotation.y = Math.sin((state.levelTime || 0) * 4 + (plant.animSeed || 0)) * 0.08;
      head.position.y = -10;
    }
    if (plant.plantId === "chomper") {
      head.rotation.y = plant.action === "attack" ? -0.28 : 0;
      head.position.y = plant.action === "digest" ? 8.1 + Math.sin((state.levelTime || 0) * 3.5 + (plant.animSeed || 0)) * 0.5 : 10;
      head.scale.set(1.06 + digestRatio * 0.08, plant.action === "digest" ? 0.92 + digestRatio * 0.08 : 1, 1.02 + digestRatio * 0.06);
    }
    if (plant.plantId === "torchwood") {
      head.position.y = 2 + Math.sin((state.levelTime || 0) * 2.2 + (plant.animSeed || 0)) * 0.25;
    }
    if (plant.plantId === "magnetshroom") {
      head.position.y = 8 + Math.sin((state.levelTime || 0) * 2.1 + (plant.animSeed || 0)) * 0.35;
    }
    if (plant.plantId === "iceshroom") {
      head.position.y = 8 + Math.sin((state.levelTime || 0) * 1.9 + (plant.animSeed || 0)) * 0.25;
      head.scale.set(1.08, plant.action === "idle" ? 0.76 : 0.7, 1.04);
    }
    if (plant.plantId === "doomshroom") {
      head.position.y = 8 + Math.sin((state.levelTime || 0) * 1.4 + (plant.animSeed || 0)) * 0.3;
      head.scale.set(1.08, plant.action === "idle" ? 0.8 : 0.72, 1.08);
    }
    if (plant.plantId === "threepeater") {
      head.position.y = 10 + Math.sin((state.levelTime || 0) * 3.2 + (plant.animSeed || 0)) * 0.6;
    }
  }

  if (stem) {
    stem.rotation.z = wobble * 1.35 - damageBlend * 0.1;
  }
  if (muzzle) {
    muzzle.scale.set(plant.action === "attack" ? 1.15 : 1, 1, 1);
  }
  if (muzzle2) {
    muzzle2.scale.set(plant.action === "attack" ? 1.2 : 1, 1, 1);
    muzzle2.position.y = 6 + Math.sin((state.levelTime || 0) * 7 + (plant.animSeed || 0)) * 0.7;
  }
  if (crackA) {
    crackA.visible = hpRatio < 0.65;
  }
  if (crackB) {
    crackB.visible = hpRatio < 0.35;
  }
  if (fuse) {
    fuse.rotation.z = Math.sin((state.levelTime || 0) * 11 + (plant.animSeed || 0)) * 0.08;
  }
  if (spark && supportsEmissive(spark.material)) {
    const fuseProgress = def.kind === "bomb" ? Math.min(1, plant.fuseTimer / def.fuse) : 0;
    spark.scale.setScalar(0.9 + Math.sin((state.levelTime || 0) * 20) * 0.15 + fuseProgress * 0.4);
    spark.material.emissiveIntensity = 0.12 + fuseProgress * 0.9;
  }
  if (sproutA) {
    sproutA.rotation.z = Math.sin((state.levelTime || 0) * 5 + (plant.animSeed || 0)) * 0.14;
  }
  if (sproutB) {
    sproutB.rotation.z = -Math.sin((state.levelTime || 0) * 5 + (plant.animSeed || 0)) * 0.14;
  }
  if (jawTop) {
    jawTop.rotation.z = plant.action === "attack" ? -0.12 : 0;
    jawTop.rotation.x = plant.action === "attack" ? -0.42 : plant.action === "digest" ? -0.08 - digestRatio * 0.08 : -0.04;
    jawTop.position.y = plant.action === "digest" ? 12.4 + Math.sin((state.levelTime || 0) * 3 + (plant.animSeed || 0)) * 0.35 : 13;
  }
  if (jawBottom) {
    jawBottom.rotation.z = plant.action === "attack" ? 0.16 : 0;
    jawBottom.rotation.x = plant.action === "attack" ? 0.52 : plant.action === "digest" ? 0.12 + digestRatio * 0.1 : 0.05;
    jawBottom.position.y = plant.action === "attack" ? 5.2 : plant.action === "digest" ? 5.7 - Math.sin((state.levelTime || 0) * 3 + (plant.animSeed || 0)) * 0.25 : 6;
  }
  if (flame) {
    flame.scale.set(
      1 + Math.sin((state.levelTime || 0) * 9 + (plant.animSeed || 0)) * 0.12,
      1 + Math.sin((state.levelTime || 0) * 12 + (plant.animSeed || 0)) * 0.18,
      1
    );
    flame.position.y = 24 + Math.sin((state.levelTime || 0) * 8 + (plant.animSeed || 0)) * 1.6;
  }
  if (rim) {
    rim.rotation.z = Math.sin((state.levelTime || 0) * 2 + (plant.animSeed || 0)) * 0.04;
  }
  if (magnet) {
    magnet.rotation.z = Math.PI + Math.sin((state.levelTime || 0) * 2.5 + (plant.animSeed || 0)) * 0.08;
    magnet.position.z = plant.action === "attack" ? 13 : 10;
  }
  if (cap) {
    cap.position.y = 16 + Math.sin((state.levelTime || 0) * 2.4 + (plant.animSeed || 0)) * 0.4;
  }
  if (iceCap) {
    iceCap.position.y = 16 + Math.sin((state.levelTime || 0) * 2.1 + (plant.animSeed || 0)) * 0.3;
    iceCap.scale.set(1, 1 + Math.sin((state.levelTime || 0) * 3.6 + (plant.animSeed || 0)) * 0.03, 1);
  }
  if (doomCap) {
    doomCap.position.y = 18 + Math.sin((state.levelTime || 0) * 1.6 + (plant.animSeed || 0)) * 0.28;
  }
  if (doomSpots) {
    doomSpots.rotation.z = Math.sin((state.levelTime || 0) * 1.5 + (plant.animSeed || 0)) * 0.08;
  }
  if (topHead) {
    topHead.position.y = 24 + Math.sin((state.levelTime || 0) * 3 + (plant.animSeed || 0)) * 0.8;
    topHead.rotation.z = wobble * 1.8;
  }
  if (bottomHead) {
    bottomHead.position.y = -4 + Math.sin((state.levelTime || 0) * 3.4 + (plant.animSeed || 0)) * 0.8;
    bottomHead.rotation.z = wobble * 1.6;
  }
  if (topMuzzle) {
    topMuzzle.scale.set(plant.action === "attack" ? 1.14 : 1, 1, 1);
  }
  if (bottomMuzzle) {
    bottomMuzzle.scale.set(plant.action === "attack" ? 1.14 : 1, 1, 1);
  }
  if (woundA) {
    woundA.visible = hpRatio < 0.68 && plant.plantId !== "spikeweed";
  }
  if (woundB) {
    woundB.visible = hpRatio < 0.38 && plant.plantId !== "spikeweed";
  }
  if (hpAnchor) {
    hpAnchor.visible = hpRatio < 0.999 || flash > 0.02;
    hpAnchor.position.y = (plant.plantId === "tallnut" ? 52 : plant.plantId === "spikeweed" ? 12 : 30) + Math.abs(wobble) * 5;
    hpAnchor.rotation.y = -0.15;
  }
  if (hpFill) {
    hpFill.scale.x = Math.max(0.001, hpRatio);
    hpFill.position.x = -10.5 * (1 - hpRatio);
  }

  obj.traverse((child) => {
    if (child.isMesh && child.material && child.material.color) {
      if (child.userData.baseColor !== undefined) {
        child.material.color.setHex(child.userData.baseColor);
        if (!["hpFrame", "hpBack", "hpFill", "shadow", "spark", "flame"].includes(child.userData.part)) {
          child.material.color.lerp(PLANT_DAMAGE_TINT, Math.min(0.34, damageBlend * 0.24));
          if (hpRatio < 0.28 && ["head", "stem", "muzzle", "muzzle2", "topHead", "bottomHead"].includes(child.userData.part)) {
            child.material.color.lerp(PLANT_CRITICAL_TINT, (0.28 - hpRatio) * 1.7);
          }
        }
      }
      if (supportsEmissive(child.material)) {
        const baseEmissive = plant.plantId === "snowpea" ? 0x4aa7c8 : 0x000000;
        child.material.emissive.setHex(baseEmissive);
        child.material.emissiveIntensity = (plant.plantId === "snowpea" ? 0.08 : 0) + flash * 1.2;
      }
    }
  });

  if (hpFill) {
    hpFill.material.color.setHex(hpRatio < 0.3 ? 0xd4563d : hpRatio < 0.6 ? 0xe7b34c : 0x7cd25f);
  }
}

function updateZombieObject(zombie, obj) {
  const t = state.levelTime || 0;
  const pace = zombie.action === "bite" ? 9 : zombie.action === "hurt" ? 12 : 6.5;
  const phase = Math.sin(t * pace + (zombie.animSeed || 0));
  const secondaryPhase = Math.cos(t * (pace * 0.65) + (zombie.animSeed || 0));
  const flash = Math.max(0, zombie.hitFlash || 0);
  const hitJolt = flash > 0 ? Math.sin(flash * 70 + (zombie.animSeed || 0)) * (2.8 + flash * 6) : 0;

  obj.position.set(
    toWorldX(zombie.x) + hitJolt,
    10 + zombie.row * 0.2 + flash * 3.2,
    toWorldY(BOARD_Y + zombie.row * CELL_H + CELL_H / 2)
  );
  obj.rotation.z = phase * 0.05 + hitJolt * 0.01;

  const armL = obj.children.find((child) => child.userData.part === "armL");
  const armR = obj.children.find((child) => child.userData.part === "armR");
  const sleeveL = obj.children.find((child) => child.userData.part === "sleeveL");
  const sleeveR = obj.children.find((child) => child.userData.part === "sleeveR");
  const handL = obj.children.find((child) => child.userData.part === "handL");
  const handR = obj.children.find((child) => child.userData.part === "handR");
  const legL = obj.children.find((child) => child.userData.part === "legL");
  const legR = obj.children.find((child) => child.userData.part === "legR");
  const head = obj.children.find((child) => child.userData.part === "head");
  const body = obj.children.find((child) => child.userData.part === "body");
  const jaw = obj.children.find((child) => child.userData.part === "jaw");
  const teeth = obj.children.find((child) => child.userData.part === "teeth");
  const nose = obj.children.find((child) => child.userData.part === "nose");
  const coatL = obj.children.find((child) => child.userData.part === "coatL");
  const coatR = obj.children.find((child) => child.userData.part === "coatR");
  const cone = obj.children.find((child) => child.userData.part === "cone");
  const bucket = obj.children.find((child) => child.userData.part === "bucket");
  const paper = obj.children.find((child) => child.userData.part === "paper");
  const pole = obj.children.find((child) => child.userData.part === "pole");
  const flagPole = obj.children.find((child) => child.userData.part === "flagPole");
  const flagCloth = obj.children.find((child) => child.userData.part === "flagCloth");
  const helmet = obj.children.find((child) => child.userData.part === "helmet");
  const helmetVisor = obj.children.find((child) => child.userData.part === "helmetVisor");
  const pads = obj.children.find((child) => child.userData.part === "pads");
  const tie = obj.children.find((child) => child.userData.part === "tie");
  const danceHair = obj.children.find((child) => child.userData.part === "danceHair");
  const gloveL = obj.children.find((child) => child.userData.part === "gloveL");
  const gloveR = obj.children.find((child) => child.userData.part === "gloveR");
  const jacket = obj.children.find((child) => child.userData.part === "jacket");
  const vest = obj.children.find((child) => child.userData.part === "vest");
  const minerHelmet = obj.children.find((child) => child.userData.part === "minerHelmet");
  const minerLamp = obj.children.find((child) => child.userData.part === "minerLamp");
  const pickaxe = obj.children.find((child) => child.userData.part === "pickaxe");
  const pickHead = obj.children.find((child) => child.userData.part === "pickHead");
  const mound = obj.children.find((child) => child.userData.part === "mound");
  const woundA = obj.children.find((child) => child.userData.part === "woundA");
  const woundB = obj.children.find((child) => child.userData.part === "woundB");
  const woundC = obj.children.find((child) => child.userData.part === "woundC");
  const hpAnchor = obj.children.find((child) => child.userData.part === "hpAnchor");
  const hpFill = hpAnchor?.children.find((child) => child.userData.part === "hpFill");
  const shieldFill = hpAnchor?.children.find((child) => child.userData.part === "shieldFill");
  const hpRatio = zombie.hp / Math.max(1, zombie.maxHp);
  const clampedHpRatio = Math.max(0, Math.min(1, hpRatio));
  const shieldRatio = zombie.shieldHp > 0 ? Math.max(0, Math.min(1, zombie.shieldHp / Math.max(1, ZOMBIES[zombie.type].shieldHp || zombie.shieldHp))) : 0;
  const damageBlend = Math.max(0, 1 - clampedHpRatio);
  const isBiting = zombie.action === "bite";
  const isHurt = zombie.action === "hurt";
  const isSummoning = zombie.action === "summon";
  const isUnderground = Boolean(zombie.underground);

  if (armL) {
    armL.rotation.z = isSummoning ? -0.95 : phase * 0.35;
    armL.rotation.x = isSummoning ? 0.8 : 0.2 + Math.abs(secondaryPhase) * (isBiting ? 0.42 : 0.22);
    armL.position.y = 5.5 - Math.abs(phase) * 1.4;
  }
  if (isUnderground) {
    obj.position.y = -8 + zombie.row * 0.12;
  }
  if (armR) {
    armR.rotation.z = isSummoning ? 0.95 : -phase * 0.35;
    armR.rotation.x = isSummoning ? 0.8 : 0.2 + Math.abs(secondaryPhase) * (isBiting ? 0.42 : 0.22);
    armR.position.y = 5.5 - Math.abs(phase) * 1.4;
  }
  if (sleeveL) {
    sleeveL.rotation.z = phase * 0.16;
    sleeveL.position.y = 12 - Math.abs(phase) * 0.5;
  }
  if (sleeveR) {
    sleeveR.rotation.z = -phase * 0.16;
    sleeveR.position.y = 12 - Math.abs(phase) * 0.5;
  }
  if (handL) {
    handL.position.y = isSummoning ? -1.5 : -6 - Math.abs(phase) * 1.6;
    handL.position.z = isSummoning ? 2.2 : isBiting ? 1.6 : Math.abs(secondaryPhase) * 0.4;
  }
  if (handR) {
    handR.position.y = isSummoning ? -1.5 : -6 - Math.abs(phase) * 1.6;
    handR.position.z = isSummoning ? 2.2 : isBiting ? 1.6 : Math.abs(secondaryPhase) * 0.4;
  }
  if (legL) {
    legL.rotation.z = -phase * 0.28;
  }
  if (legR) {
    legR.rotation.z = phase * 0.28;
  }
  if (head) {
    head.rotation.z = isHurt ? phase * 0.22 : phase * 0.08;
    head.rotation.x = isSummoning ? -0.08 : isBiting ? -0.14 - Math.abs(secondaryPhase) * 0.05 : secondaryPhase * 0.03;
    head.position.y = 29 + Math.abs(phase) * (isBiting ? 1.2 : 0.4);
    head.position.z = 0.6 + (isBiting ? 1.5 : secondaryPhase * 0.35);
  }
  if (body) {
    body.rotation.z = isSummoning ? phase * 0.1 : isBiting ? -0.08 : 0;
    body.scale.set(1.05, 1 - damageBlend * 0.06 + flash * 0.04, 0.92);
  }
  if (jaw) {
    jaw.rotation.x = isBiting ? 0.5 + Math.abs(phase) * 0.3 : 0.18 + Math.abs(secondaryPhase) * 0.04;
    jaw.position.z = isBiting ? 8.6 : 7.2 + secondaryPhase * 0.18;
  }
  if (teeth) {
    teeth.position.y = isBiting ? 21.2 - Math.abs(phase) * 0.35 : 22.1;
    teeth.position.z = isBiting ? 11.2 : 10.8 + secondaryPhase * 0.12;
    teeth.rotation.x = isBiting ? -0.08 : 0;
  }
  if (nose) {
    nose.position.x = 0.8 + phase * 0.12;
    nose.position.y = 27.5 + Math.abs(phase) * (isBiting ? 0.75 : 0.2);
    nose.position.z = 10.2 + (isBiting ? 1.4 : secondaryPhase * 0.35);
    nose.rotation.z = isHurt ? phase * 0.08 : secondaryPhase * 0.03;
  }
  if (coatL) {
    coatL.rotation.y = 0.08 + phase * 0.18;
    coatL.rotation.z = -0.06 - Math.abs(secondaryPhase) * (isBiting ? 0.14 : 0.08);
    coatL.position.z = 7.2 + Math.abs(phase) * 0.8;
  }
  if (coatR) {
    coatR.rotation.y = -0.08 - phase * 0.18;
    coatR.rotation.z = 0.06 + Math.abs(secondaryPhase) * (isBiting ? 0.14 : 0.08);
    coatR.position.z = 7.2 + Math.abs(phase) * 0.8;
  }
  if (tie) {
    tie.rotation.z = -phase * 0.18;
  }
  if (cone) {
    cone.visible = hpRatio > 0.55;
    cone.position.y = 42 + Math.abs(phase) * 0.35;
    cone.position.z = head ? head.position.z * 0.25 : 0;
    cone.rotation.z = 0.12 + phase * 0.03 + (head ? head.rotation.z * 0.5 : 0);
  }
  if (bucket) {
    bucket.visible = hpRatio > 0.48;
    bucket.position.y = 42 + Math.abs(phase) * 0.28;
    bucket.position.z = head ? head.position.z * 0.2 : 0;
    bucket.rotation.z = -0.08 + phase * 0.02 + (head ? head.rotation.z * 0.4 : 0);
    bucket.scale.y = hpRatio < 0.68 ? 0.92 : 1;
  }
  if (paper) {
    paper.visible = !zombie.enraged;
    paper.rotation.z = Math.sin(t * 5.5 + (zombie.animSeed || 0)) * 0.08;
  }
  if (pole) {
    pole.visible = !zombie.jumped;
    pole.rotation.z = zombie.action === "bite" ? 0.18 : 0.6;
  }
  if (flagPole) {
    flagPole.rotation.z = 0.08 + phase * 0.03;
    flagPole.position.y = 14 + Math.abs(phase) * 0.6;
  }
  if (flagCloth) {
    flagCloth.rotation.y = 0.35 + secondaryPhase * 0.18;
    flagCloth.rotation.z = -0.08 + phase * 0.04;
  }
  if (helmet) {
    helmet.position.y = 30.5 + Math.abs(phase) * 0.4;
    helmet.position.z = 1.4 + (head ? head.position.z * 0.22 : 0);
    helmet.rotation.z = head ? head.rotation.z * 0.55 : 0;
    helmet.visible = hpRatio > 0.42 && !zombie.propDropState.helmetDropped;
  }
  if (helmetVisor) {
    helmetVisor.visible = hpRatio > 0.42;
    helmetVisor.position.y = 29.8 + Math.abs(phase) * 0.35;
    helmetVisor.position.z = 9.8 + (head ? head.position.z * 0.18 : 0);
    helmetVisor.rotation.z = Math.PI + (head ? head.rotation.z * 0.45 : 0);
  }
  if (pads) {
    pads.position.y = 18 + Math.abs(phase) * 0.35;
    pads.rotation.z = phase * 0.03;
  }
  if (danceHair) {
    danceHair.rotation.z = isSummoning ? phase * 0.12 : phase * 0.05;
  }
  if (gloveL) {
    gloveL.position.y = isSummoning ? -1 : -6 - Math.abs(phase) * 1.6;
    gloveL.position.z = isSummoning ? 2.8 : 0.6;
  }
  if (gloveR) {
    gloveR.position.y = isSummoning ? -1 : -6 - Math.abs(phase) * 1.6;
    gloveR.position.z = isSummoning ? 2.8 : 0.6;
  }
  if (jacket) {
    jacket.rotation.z = isSummoning ? phase * 0.08 : phase * 0.03;
    jacket.position.y = isSummoning ? 9.6 : 8;
  }
  if (vest) {
    vest.rotation.z = phase * 0.04;
  }
  if (minerHelmet) {
    minerHelmet.visible = !isUnderground && !zombie.propDropState.minerHelmetDropped;
    minerHelmet.rotation.z = phase * 0.03;
  }
  if (minerLamp) {
    minerLamp.visible = !isUnderground && !zombie.propDropState.minerHelmetDropped;
  }
  if (pickaxe) {
    pickaxe.visible = !isUnderground;
    pickaxe.rotation.z = isBiting ? -0.2 : -0.55 + phase * 0.04;
  }
  if (pickHead) {
    pickHead.visible = !isUnderground;
    pickHead.rotation.z = isBiting ? 0.38 : 0.18;
  }
  if (mound) {
    mound.visible = isUnderground;
    mound.scale.y = 0.32 + Math.abs(phase) * 0.08;
  }
  if (woundA) {
    woundA.visible = !isUnderground && clampedHpRatio < 0.78;
  }
  if (woundB) {
    woundB.visible = !isUnderground && clampedHpRatio < 0.5;
  }
  if (woundC) {
    woundC.visible = !isUnderground && clampedHpRatio < 0.26;
  }
  if (hpAnchor) {
    hpAnchor.visible = !isUnderground && (clampedHpRatio < 0.999 || shieldRatio > 0 || flash > 0.02);
    hpAnchor.position.y = 55 + Math.abs(phase) * 0.8;
    hpAnchor.rotation.y = -0.2;
  }
  if (hpFill) {
    hpFill.scale.x = Math.max(0.001, clampedHpRatio);
    hpFill.position.x = -13.5 * (1 - clampedHpRatio);
    hpFill.material.color.setHex(clampedHpRatio < 0.3 ? 0xd4563d : clampedHpRatio < 0.6 ? 0xe7b34c : 0x7cd25f);
  }
  if (shieldFill) {
    shieldFill.visible = shieldRatio > 0;
    shieldFill.scale.x = Math.max(0.001, shieldRatio);
    shieldFill.position.x = -13.5 * (1 - shieldRatio);
  }

  obj.traverse((child) => {
    if (child.userData.shield) {
      child.visible = zombie.shieldHp > 0;
    }
    if (
      isUnderground &&
      [
        "body",
        "shirt",
        "shoulder",
        "hip",
        "head",
        "jaw",
        "teeth",
        "nose",
        "hair",
        "armL",
        "armR",
        "legL",
        "legR",
        "footL",
        "footR",
        "handL",
        "handR",
        "sleeveL",
        "sleeveR",
        "coatL",
        "coatR",
        "tie",
        "danceHair",
        "gloveL",
        "gloveR",
        "jacket",
        "vest",
        "cone",
        "bucket",
        "paper",
        "pole",
        "flagPole",
        "flagCloth",
        "helmet",
        "helmetVisor",
        "pads",
        "hpAnchor",
        "woundA",
        "woundB",
        "woundC",
      ].includes(child.userData.part)
    ) {
      child.visible = false;
    }
    if (child.isMesh && child.material) {
      if (child.material.color && child.userData.baseColor !== undefined) {
        child.material.color.setHex(child.userData.baseColor);
        if (!["hpFrame", "hpBack", "hpFill", "shieldFill", "flagCloth"].includes(child.userData.part)) {
          child.material.color.lerp(ZOMBIE_DAMAGE_TINT, Math.min(0.38, damageBlend * 0.26));
          if (clampedHpRatio < 0.28 && ["body", "head", "shirt", "jaw", "coatL", "coatR"].includes(child.userData.part)) {
            child.material.color.lerp(ZOMBIE_CRITICAL_TINT, (0.28 - clampedHpRatio) * 1.6);
          }
        }
      }
      if (supportsEmissive(child.material)) {
        if (state.levelTime <= zombie.slowUntil) {
          child.material.emissive.setHex(0x7bc8ff);
          child.material.emissiveIntensity = Math.max(0.28, flash * 1.1);
        } else {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = flash * 1.1;
        }
      }
    }
  });
}

function updateProjectileObject(projectile, obj) {
  const pulse = 1 + Math.sin((state.levelTime || 0) * 18 + (projectile.x % 11)) * 0.1;
  obj.position.set(toWorldX(projectile.x), 16 + projectile.row * 0.12, toWorldY(projectile.y));
  obj.scale.set(pulse, pulse, pulse);
  if (obj.material) {
    obj.material.color.setHex(projectile.fire ? 0xff8a24 : projectile.slow ? 0x89ddff : 0x57bf4c);
    if (supportsEmissive(obj.material)) {
      obj.material.emissive.setHex(projectile.fire ? 0xff5a00 : projectile.slow ? 0x0a5778 : 0x1c5d1a);
      obj.material.emissiveIntensity = projectile.fire ? 0.55 : 0.35;
    }
  }
}

function updateSunObject(sun, obj) {
  const pulse = 1 + Math.sin((state.levelTime || 0) * 6 + (sun.x % 17)) * 0.08;
  obj.position.set(toWorldX(sun.x), 24, toWorldY(sun.y));
  obj.rotation.y += 0.04;
  obj.scale.set(pulse, pulse, pulse);
}

function rebuildEffects() {
  const group = sceneState.groups.effects;
  while (group.children.length) {
    const child = group.children.pop();
    group.remove(child);
  }

  const budget = getEffectivePreset().effectBudget;
  const visibleEffects = state.effects.slice(-budget);
  state.cellStates.forEach((row, rowIndex) => {
    row.forEach((cellState, colIndex) => {
      if (!cellState || cellState.type !== "crater") {
        return;
      }
      const maxTtl = Math.max(0.05, cellState.maxTtl || cellState.ttl || 1);
      const craterRatio = Math.max(0, Math.min(1, cellState.ttl / maxTtl));
      const craterRadius = Math.max(10, CELL_W * (0.28 + craterRatio * 0.12));
      const craterColor = new THREE.Color(0x5a4632).lerp(new THREE.Color(0x22151b), craterRatio * 0.9);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(craterRadius, Math.max(13, craterRadius * 1.18), 2.6, 18),
        new THREE.MeshStandardMaterial({ color: craterColor, roughness: 0.95, metalness: 0.0 })
      );
      mesh.position.set(
        toWorldX(BOARD_X + colIndex * CELL_W + CELL_W / 2),
        -1.6 - craterRatio * 0.45,
        toWorldY(BOARD_Y + rowIndex * CELL_H + CELL_H / 2)
      );
      mesh.scale.set(1, 1, 1 + Math.sin((state.levelTime || 0) * 1.2 + rowIndex + colIndex) * 0.02);
      group.add(mesh);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(12, craterRadius * 1.02), 1.5 + craterRatio * 0.9, 10, 28),
        new THREE.MeshBasicMaterial({ color: craterRatio > 0.45 ? 0x1d1116 : 0x6b5642, transparent: true, opacity: 0.35 + craterRatio * 0.25 })
      );
      rim.position.set(
        toWorldX(BOARD_X + colIndex * CELL_W + CELL_W / 2),
        -0.15,
        toWorldY(BOARD_Y + rowIndex * CELL_H + CELL_H / 2)
      );
      rim.rotation.x = Math.PI / 2;
      group.add(rim);

      if (craterRatio > 0.55) {
        const smoke = new THREE.Mesh(
          new THREE.SphereGeometry(7.5 + craterRatio * 5, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x463a43, transparent: true, opacity: 0.12 + craterRatio * 0.16 })
        );
        smoke.position.set(
          toWorldX(BOARD_X + colIndex * CELL_W + CELL_W / 2 + Math.sin((state.levelTime || 0) * 0.9 + rowIndex) * 4),
          7 + Math.sin((state.levelTime || 0) * 1.2 + colIndex) * 2,
          toWorldY(BOARD_Y + rowIndex * CELL_H + CELL_H / 2 + Math.cos((state.levelTime || 0) * 0.7 + colIndex) * 3)
        );
        smoke.scale.set(1.1, 0.72, 1.1);
        group.add(smoke);
      }
    });
  });
  visibleEffects.forEach((effect) => {
    if (effect.type === "dust") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(4, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xc3a47a, transparent: true, opacity: Math.max(0, effect.ttl / 0.28) })
      );
      mesh.position.set(toWorldX(effect.x), 4, toWorldY(effect.y));
      group.add(mesh);
      return;
    }

    if (effect.type === "boom") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(8, (effect.radius || 26) * 0.24), 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xef6438, transparent: true, opacity: Math.max(0, effect.ttl * 1.5) })
      );
      mesh.position.set(toWorldX(effect.x), 12, toWorldY(effect.y));
      group.add(mesh);
      return;
    }

    if (effect.type === "ice-wave") {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(24, (effect.radius || 140) * 0.12), 3.4, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0xa6e6ff, transparent: true, opacity: Math.max(0, effect.ttl * 1.5) })
      );
      mesh.position.set(toWorldX(effect.x), 8, toWorldY(effect.y));
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
      return;
    }

    if (effect.type === "doom-blast") {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(32, (effect.radius || 180) * 0.12), 6.2, 12, 30),
        new THREE.MeshBasicMaterial({ color: 0x9f78d0, transparent: true, opacity: Math.max(0, effect.ttl * 1.6) })
      );
      mesh.position.set(toWorldX(effect.x), 10, toWorldY(effect.y));
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
      return;
    }

    if (effect.type === "doom-smoke") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(8, (effect.size || 16) * 0.52), 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x493a4f, transparent: true, opacity: Math.max(0, effect.ttl * 0.34) })
      );
      mesh.position.set(toWorldX(effect.x), 10 + (effect.rise || 0), toWorldY(effect.y));
      mesh.scale.set(1.08, 0.86, 1.08);
      group.add(mesh);
      return;
    }

    if (effect.type === "doom-heat") {
      const heatRadius = Math.max(26, (effect.radius || 160) * (1.1 - effect.ttl / 1.15) * 0.18 + 18);
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(heatRadius, 2.4, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0xf28c54, transparent: true, opacity: Math.max(0, effect.ttl * 0.3) })
      );
      mesh.position.set(toWorldX(effect.x), 1.4, toWorldY(effect.y));
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
      return;
    }

    if (effect.type === "doom-edge") {
      const pulse = 1 + (1 - effect.ttl / 1.55) * 0.18;
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(30, (effect.radius || 145) * 0.14) * pulse, 1.8, 10, 26),
        new THREE.MeshBasicMaterial({ color: 0x2f171d, transparent: true, opacity: Math.max(0, effect.ttl * 0.22) })
      );
      mesh.position.set(toWorldX(effect.x), 0.8, toWorldY(effect.y));
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
      return;
    }

    if (effect.type === "mower-start" || effect.type === "mower-spark") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(effect.type === "mower-start" ? 8 : 5, 10, 10),
        new THREE.MeshBasicMaterial({ color: effect.type === "mower-start" ? 0xffc96e : 0xfff1b1, transparent: true, opacity: Math.max(0, effect.ttl * 2) })
      );
      mesh.position.set(toWorldX(effect.x), 8, toWorldY(effect.y));
      group.add(mesh);
      return;
    }

    if (effect.type === "cone-drop") {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(7, 16, 14),
        new THREE.MeshStandardMaterial({ color: 0xd98d2f, roughness: 0.62, metalness: 0.02 })
      );
      mesh.position.set(toWorldX(effect.x), 8, toWorldY(effect.y));
      mesh.rotation.z = 0.7;
      group.add(mesh);
      return;
    }

    if (effect.type === "bucket-drop") {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 9, 10, 14),
        new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.45, metalness: 0.35 })
      );
      mesh.position.set(toWorldX(effect.x), 8, toWorldY(effect.y));
      mesh.rotation.z = -0.5;
      group.add(mesh);
      return;
    }

    if (effect.type === "door-drop") {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(5, 28, 16),
        new THREE.MeshStandardMaterial({ color: 0xb7c4c8, roughness: 0.56, metalness: 0.32 })
      );
      mesh.position.set(toWorldX(effect.x), 8, toWorldY(effect.y));
      mesh.rotation.z = 0.85;
      group.add(mesh);
      return;
    }

    if (effect.type === "paper-burst") {
      for (let i = 0; i < 3; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(8, 10),
          new THREE.MeshBasicMaterial({ color: 0xf2eee0, transparent: true, opacity: Math.max(0, effect.ttl) })
        );
        mesh.position.set(toWorldX(effect.x + i * 5), 14 + i * 2, toWorldY(effect.y - i * 4));
        mesh.rotation.set(-Math.PI / 2, 0, i * 0.45);
        group.add(mesh);
      }
      return;
    }

    if (effect.type === "miner-warning") {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(11, 1.8, 8, 22),
        new THREE.MeshBasicMaterial({ color: 0xd7b15c, transparent: true, opacity: Math.max(0, effect.ttl * 1.4) })
      );
      mesh.position.set(toWorldX(effect.x), 2, toWorldY(effect.y));
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
      return;
    }

    if (effect.type === "magnet-pull") {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(7, 1.2, 8, 18),
        new THREE.MeshBasicMaterial({ color: 0xb93e46, transparent: true, opacity: Math.max(0, effect.ttl * 1.8) })
      );
      mesh.position.set(toWorldX(effect.x), 10, toWorldY(effect.y));
      group.add(mesh);
      return;
    }

    if (effect.type === "pole-drop") {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.1, 48, 8),
        new THREE.MeshStandardMaterial({ color: 0xc3a36f, roughness: 0.82, metalness: 0.03 })
      );
      mesh.position.set(toWorldX(effect.x), 7, toWorldY(effect.y));
      mesh.rotation.z = 1.1;
      group.add(mesh);
      return;
    }

    if (effect.type === "zombie-fall" || effect.type === "plant-fall") {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(18, 18, 12),
        new THREE.MeshBasicMaterial({ color: effect.type === "zombie-fall" ? 0x8ba181 : 0x5a9f4c, transparent: true, opacity: 0.5 })
      );
      mesh.position.set(toWorldX(effect.x), 6, toWorldY(effect.y));
      group.add(mesh);
      return;
    }

    if (effect.type === "pop") {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(7, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffb477, transparent: true, opacity: Math.max(0, effect.ttl * 1.5) })
      );
      mesh.position.set(toWorldX(effect.x), 10, toWorldY(effect.y));
      group.add(mesh);
      return;
    }

    if (effect.type === "damage-burst") {
      const color =
        effect.variant === "snowpea" || effect.variant === "ice" ? 0x9fe8ff :
        effect.variant === "shield" ? 0xd7edf6 :
        effect.variant === "fire" ? 0xff9b43 :
        effect.variant === "plant" ? 0xa8f28e :
        effect.variant === "cherrybomb" ? 0xff6f7b :
        effect.variant === "doomshroom" ? 0xb18cff :
        effect.variant === "potatomine" ? 0xffd36e :
        effect.variant === "squash" ? 0xb8dd58 :
        effect.variant === "spikeweed" ? 0xbecb7d :
        effect.variant === "repeater" ? 0x8ae067 :
        effect.variant === "threepeater" ? 0x73d86e :
        0xffefb8;
      const strength = Math.max(0.7, Math.min(1.6, (effect.amount || 20) / 36));
      const ttlRatio = Math.max(0, Math.min(1, effect.ttl / 0.24));
      if (["peashooter", "snowpea", "fire", "normal", "plant", "shield"].includes(effect.variant)) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(4.5 + strength * 1.4, 1.2 + strength * 0.2, 8, 18),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 3.4) })
        );
        ring.position.set(toWorldX(effect.x), 12 + strength * 2, toWorldY(effect.y));
        ring.rotation.x = Math.PI / 2;
        ring.scale.setScalar(1 + (1 - ttlRatio) * 0.7);
        group.add(ring);
      }
      if (effect.variant === "repeater") {
        [-1, 1].forEach((offset) => {
          const trail = new THREE.Mesh(
            new THREE.BoxGeometry(10 + strength * 4.5, 1.2 + strength * 0.18, 1),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 2.3) })
          );
          trail.position.set(toWorldX(effect.x - 6 - strength * 3), 12.5 + offset * 1.4, toWorldY(effect.y + offset * 2.2));
          trail.rotation.z = offset * 0.12;
          group.add(trail);
        });
        [-1, 1].forEach((offset) => {
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(2.1 + strength * 0.5, 8, 8),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 3.1) })
          );
          core.position.set(toWorldX(effect.x + offset * 5), 12.5, toWorldY(effect.y + offset * 2));
          group.add(core);
        });
      } else if (effect.variant === "threepeater") {
        [-1, 0, 1].forEach((offset) => {
          const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(2.3 + strength * 0.35, 8, 8, 0, Math.PI),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 2.8), side: THREE.DoubleSide })
          );
          leaf.position.set(toWorldX(effect.x + offset * 6), 12.2 + Math.abs(offset) * 1.5, toWorldY(effect.y + offset * 5));
          leaf.rotation.set(Math.PI / 2, offset * 0.45, Math.PI / 2 + offset * 0.35);
          leaf.scale.set(1.9, 0.9, 1.2);
          group.add(leaf);
        });
        [-1, 0, 1].forEach((offset) => {
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(1.9 + strength * 0.45, 8, 8),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 3.1) })
          );
          core.position.set(toWorldX(effect.x + offset * 5), 12.5 + Math.abs(offset) * 1.2, toWorldY(effect.y + offset * 4));
          group.add(core);
        });
      } else if (effect.variant === "spikeweed") {
        for (let index = 0; index < 4; index += 1) {
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(1.6 + strength * 0.35, 8 + strength * 2.2, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 2.8) })
          );
          spike.position.set(toWorldX(effect.x - 8 + index * 5), 4 + index * 0.4, toWorldY(effect.y + (index % 2 === 0 ? -2 : 2)));
          spike.rotation.z = Math.PI;
          group.add(spike);
        }
      } else if (effect.variant === "potatomine" || effect.variant === "cherrybomb" || effect.variant === "doomshroom" || effect.variant === "squash") {
        if (effect.variant === "cherrybomb") {
          [-1, 1].forEach((offset) => {
            const cherry = new THREE.Mesh(
              new THREE.SphereGeometry(3.1 + strength * 0.55, 10, 10),
              new THREE.MeshBasicMaterial({ color: 0xff7a88, transparent: true, opacity: Math.max(0, effect.ttl * 2.7) })
            );
            cherry.position.set(toWorldX(effect.x + offset * 5), 12.5, toWorldY(effect.y + offset * 3));
            group.add(cherry);
          });
          const stem = new THREE.Mesh(
            new THREE.TorusGeometry(5.4 + strength * 1.1, 0.8, 6, 14, Math.PI),
            new THREE.MeshBasicMaterial({ color: 0x8fd06f, transparent: true, opacity: Math.max(0, effect.ttl * 2.1) })
          );
          stem.position.set(toWorldX(effect.x), 18.5, toWorldY(effect.y));
          stem.rotation.z = Math.PI;
          group.add(stem);
        }
        if (effect.variant === "doomshroom") {
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(9 + strength * 4, 1.8 + strength * 0.35, 10, 24),
            new THREE.MeshBasicMaterial({ color: 0xc8a0ff, transparent: true, opacity: Math.max(0, effect.ttl * 2.5) })
          );
          halo.position.set(toWorldX(effect.x), 11.5, toWorldY(effect.y));
          halo.rotation.x = Math.PI / 2;
          halo.scale.setScalar(1 + (1 - ttlRatio) * 0.9);
          group.add(halo);
          for (let puffIndex = 0; puffIndex < 3; puffIndex += 1) {
            const smoke = new THREE.Mesh(
              new THREE.SphereGeometry(3.4 + puffIndex * 0.8 + strength * 0.35, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0x6e4a8f, transparent: true, opacity: Math.max(0, effect.ttl * 1.65) })
            );
            smoke.position.set(
              toWorldX(effect.x + (puffIndex - 1) * 6),
              14 + puffIndex * 2,
              toWorldY(effect.y + (puffIndex - 1) * 4)
            );
            smoke.scale.set(1.25, 0.8, 1.1);
            group.add(smoke);
          }
        }
        const shardCount = effect.variant === "doomshroom" ? 7 : effect.variant === "cherrybomb" ? 6 : 5;
        for (let index = 0; index < shardCount; index += 1) {
          const angle = (index / shardCount) * Math.PI * 2 + (1 - ttlRatio) * 0.3;
          const shard = new THREE.Mesh(
            new THREE.BoxGeometry(1.8 + strength, 6 + strength * 3.4, 1.1),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 3) })
          );
          shard.position.set(
            toWorldX(effect.x + Math.cos(angle) * (6 + strength * 5.5)),
            12 + Math.sin(angle * 1.5) * 2.2,
            toWorldY(effect.y + Math.sin(angle) * (5 + strength * 3))
          );
          shard.rotation.set(angle * 0.25, angle, Math.PI / 3 + angle);
          group.add(shard);
        }
      } else {
        for (let index = 0; index < 5; index += 1) {
          const angle = (index / 5) * Math.PI * 2 + (1 - ttlRatio) * 0.45;
          const star = new THREE.Mesh(
            new THREE.BoxGeometry(1.4 + strength * 0.8, 8 + strength * 4, 1),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 3) })
          );
          star.position.set(
            toWorldX(effect.x + Math.cos(angle) * (4 + strength * 5)),
            12 + Math.sin(angle * 2) * 2,
            toWorldY(effect.y + Math.sin(angle) * (3 + strength * 2.5))
          );
          star.rotation.set(0, angle, Math.PI / 2.8 + angle);
          group.add(star);
        }
      }
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(2.2 + strength * 0.6, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, effect.ttl * 3.2) })
      );
      core.position.set(toWorldX(effect.x), 12, toWorldY(effect.y));
      group.add(core);
      return;
    }

    if (effect.type === "hit" || effect.type === "ice-hit" || effect.type === "shield-hit" || effect.type === "fire-hit") {
      const color = effect.type === "ice-hit" ? 0xa7e9ff : effect.type === "shield-hit" ? 0xdaebf1 : effect.type === "fire-hit" ? 0xff9d42 : 0xffefb2;
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(5, 1.2, 8, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
      );
      mesh.position.set(toWorldX(effect.x), 10, toWorldY(effect.y));
      group.add(mesh);
    }
  });
}

function updateCameraAndShake() {
  if (state.stats.kills > sceneState.lastKillCount) {
    sceneState.shake = Math.min(1, sceneState.shake + 0.42);
    sceneState.lastKillCount = state.stats.kills;
  }

  const doomPulse = state.effects.reduce((maxValue, effect) => {
    if (effect.type !== "doom-blast") {
      return maxValue;
    }
    return Math.max(maxValue, Math.max(0, effect.ttl / 0.58));
  }, 0);
  if (doomPulse > 0) {
    sceneState.shake = Math.min(1.6, sceneState.shake + doomPulse * 0.42);
  }

  const current = sceneState.cameraCurrent;
  const target = sceneState.cameraTarget;
  current.x += (target.x - current.x) * 0.08;
  current.y += (target.y - current.y) * 0.08;
  current.z += (target.z - current.z) * 0.08;
  current.lookX += (target.lookX - current.lookX) * 0.08;
  current.lookZ += (target.lookZ - current.lookZ) * 0.08;

  sceneState.shake = Math.max(0, sceneState.shake - 0.05);
  const shakeStrength = sceneState.performanceMode ? 0.45 : 1;
  const shakeX = (Math.random() - 0.5) * sceneState.shake * 8 * shakeStrength;
  const shakeY = (Math.random() - 0.5) * sceneState.shake * 5 * shakeStrength;

  sceneState.camera.position.set(current.x + shakeX, current.y + shakeY, current.z);
  sceneState.camera.lookAt(current.lookX, 0, current.lookZ);
}

function initScene() {
  if (sceneState.ready || sceneState.initFailed) {
    return;
  }

  if (!THREE) {
    sceneState.initFailed = true;
    sceneState.initError = "Three.js 模块不可用";
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true });
  } catch (error) {
    sceneState.initFailed = true;
    sceneState.initError = error instanceof Error ? error.message : "WebGL 初始化失败";
    return;
  }
  const initW = Math.max(1, ui.canvas.clientWidth || ui.canvas.width);
  const initH = Math.max(1, ui.canvas.clientHeight || ui.canvas.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(initW, initH, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa5d07a);
  scene.fog = new THREE.Fog(0xa5d07a, 700, 1600);

  const camera = new THREE.PerspectiveCamera(46, initW / initH, 1, 2600);
  sceneState.lastCanvasW = initW;
  sceneState.lastCanvasH = initH;
  const fittedDefault = fitCameraPreset("default");
  camera.position.set(fittedDefault.x, fittedDefault.y, fittedDefault.z);
  camera.lookAt(fittedDefault.lookX, 0, fittedDefault.lookZ);

  const ambient = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6d9c4d, 0.35);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff3d8, 0.9);
  keyLight.position.set(-250, 420, 520);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 80;
  keyLight.shadow.camera.far = 1400;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x9acbff, 0.38);
  rimLight.position.set(360, -260, 320);
  scene.add(rimLight);

  const root = new THREE.Group();
  scene.add(root);

  const plants = new THREE.Group();
  const mowers = new THREE.Group();
  const zombies = new THREE.Group();
  const projectiles = new THREE.Group();
  const suns = new THREE.Group();
  const effects = new THREE.Group();
  const preview = new THREE.Group();
  root.add(mowers);
  root.add(plants);
  root.add(zombies);
  root.add(projectiles);
  root.add(suns);
  root.add(effects);
  root.add(preview);

  sceneState.renderer = renderer;
  sceneState.scene = scene;
  sceneState.camera = camera;
  sceneState.root = root;
  sceneState.groups.mowers = mowers;
  sceneState.groups.plants = plants;
  sceneState.groups.zombies = zombies;
  sceneState.groups.projectiles = projectiles;
  sceneState.groups.suns = suns;
  sceneState.groups.effects = effects;
  sceneState.groups.preview = preview;
  sceneState.keyLight = keyLight;
  sceneState.cameraCurrent = { ...fittedDefault };
  sceneState.cameraTarget = { ...fittedDefault };
  sceneState.ready = true;

  buildStaticWorld();
  applyResolvedQuality();
  resizeRendererIfNeeded();
}

function drawFallback2D() {
  const ctx = ui.canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
  ctx.fillStyle = "#8ab85f";
  ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
  ctx.fillStyle = "#1d2f13";
  ctx.font = "bold 16px Verdana";
  ctx.fillText("Three.js 渲染不可用，使用降级视图", 20, 30);
  if (sceneState.initError) {
    ctx.fillStyle = "#3b1f1f";
    ctx.font = "12px Verdana";
    ctx.fillText(sceneState.initError, 20, 52);
  }
}

function failScene(error) {
  sceneState.ready = false;
  sceneState.initFailed = true;
  sceneState.initError = error instanceof Error ? error.message : String(error || "Unknown render error");
  if (sceneState.renderer) {
    try {
      sceneState.renderer.dispose();
    } catch {
      // Ignore disposal errors and continue with fallback rendering.
    }
  }
}

/**
 * 主渲染函数，每帧调用一次。
 * 将 state 中的实体同步到 Three.js 对象呈，并执行场景渲染。
 * 若 3D 尚未就绪，则展示 Canvas 2D 退化渲染。
 */
export function draw() {
  if (document.hidden) {
    return;
  }

  try {
    if (!sceneState.ready && !sceneState.initFailed) {
      initScene();
    }

    if (!sceneState.ready) {
      drawFallback2D();
      return;
    }

    resizeRendererIfNeeded();

    const now = performance.now();
    if (sceneState.lastFrameAt > 0) {
      const frameMs = now - sceneState.lastFrameAt;
      sceneState.frameSampleMs = sceneState.frameSampleMs * 0.92 + frameMs * 0.08;
    }
    sceneState.lastFrameAt = now;
    resolveAutoQualityByFrameTime();

    syncMap(state.lawnMowers, sceneState.maps.mowers, sceneState.groups.mowers, createMowerObject, updateMowerObject);
    syncMap(state.plants.flat().filter(Boolean), sceneState.maps.plants, sceneState.groups.plants, createPlantObject, updatePlantObject);
    syncMap(state.zombies, sceneState.maps.zombies, sceneState.groups.zombies, createZombieObject, updateZombieObject);
    syncMap(state.projectiles, sceneState.maps.projectiles, sceneState.groups.projectiles, createProjectileObject, updateProjectileObject);
    syncMap(state.suns, sceneState.maps.suns, sceneState.groups.suns, createSunObject, updateSunObject);
    rebuildEffects();
    updateHoverPreview();
    updateCameraAndShake();

    const doomPulse = state.effects.reduce((maxValue, effect) => {
      if (effect.type !== "doom-blast") {
        return maxValue;
      }
      return Math.max(maxValue, Math.max(0, effect.ttl / 0.58));
    }, 0);
    const sceneFlash = Math.min(1, doomPulse * 0.9);
    sceneState.scene.background.copy(BASE_BACKGROUND).lerp(DOOM_BACKGROUND, sceneFlash * 0.72);
    if (sceneState.scene.fog) {
      sceneState.scene.fog.color.copy(BASE_FOG).lerp(DOOM_FOG, sceneFlash * 0.68);
    }
    sceneState.renderer.toneMappingExposure = (sceneState.resolvedQuality === "low" ? 0.95 : 1.02) - sceneFlash * 0.24;

    sceneState.renderer.render(sceneState.scene, sceneState.camera);
  } catch (error) {
    failScene(error);
    drawFallback2D();
  }
}

/** 切换摄影机在“标准”和“近景”之间切换，返回新的模式字符串。 */
export function toggleCameraMode() {
  sceneState.cameraMode = sceneState.cameraMode === "default" ? "close" : "default";
  sceneState.cameraTarget = fitCameraPreset(sceneState.cameraMode);
  return sceneState.cameraMode;
}

/**
 * 设置渲染画质。
 * @param {"auto"|"high"|"medium"|"low"} quality - auto 时根据 fps 自动调整
 */
export function setRenderQuality(quality) {
  sceneState.quality = ["auto", "high", "medium", "low"].includes(quality) ? quality : "auto";
  if (sceneState.quality === "auto") {
    sceneState.resolvedQuality = "high";
  } else {
    sceneState.resolvedQuality = sceneState.quality;
  }
  applyResolvedQuality();
  return sceneState.quality;
}

/**
 * 设置性能优先模式，启用时周素比上限和备用渲染等级均低于当前质量预设。
 * @param {boolean} enabled
 */
export function setPerformanceMode(enabled) {
  sceneState.performanceMode = Boolean(enabled);
  applyResolvedQuality();
  return sceneState.performanceMode;
}

/** 返回当前渲染统计信息：fps、质量字符串、性能模式标志。 */
export function getRenderStats() {
  const fps = Math.max(1, Math.round(1000 / Math.max(1, sceneState.frameSampleMs || 16)));
  const quality = sceneState.quality === "auto"
    ? `Auto:${sceneState.resolvedQuality}`
    : sceneState.resolvedQuality;
  return {
    fps,
    quality,
    performanceMode: sceneState.performanceMode,
  };
}

/**
 * 在 3D 场景中查找最近屏幕坐标的阳光实体，用于点击收集阳光。
 * @param {number} screenX - 屏幕坐标 X
 * @param {number} screenY - 屏幕坐标 Y
 * @param {number} radius - 确认圆半径（像素）
 * @returns {Object|null} 匹配的阳光实体，未匹配时为 null
 */
export function findSunHit(screenX, screenY, radius = 28) {
  if (!sceneState.ready || !sceneState.camera) {
    return null;
  }

  let bestSun = null;
  let bestDist = radius;
  const vector = new THREE.Vector3();
  const { width: logicalW, height: logicalH } = getCanvasLogicalSize();

  state.suns.forEach((sun) => {
    const obj = sceneState.maps.suns.get(sun.id);
    if (!obj) {
      return;
    }
    vector.copy(obj.position);
    vector.project(sceneState.camera);
    const px = (vector.x * 0.5 + 0.5) * logicalW;
    const py = (-vector.y * 0.5 + 0.5) * logicalH;
    const dist = Math.hypot(px - screenX, py - screenY);
    if (dist <= bestDist) {
      bestDist = dist;
      bestSun = sun;
    }
  });

  return bestSun;
}

/**
 * 将屏幕坐标通过射线投射转换为棋盘坑位面上的像素坐标。
 * @returns {{x: number, y: number}|null} 棋盘内像素坐标，超出棋盘范围时返回 null
 */
export function screenToBoardPixel(screenX, screenY) {
  if (!sceneState.ready || !sceneState.camera) {
    return null;
  }

  const raycaster = new THREE.Raycaster();
  const { width: logicalW, height: logicalH } = getCanvasLogicalSize();
  const pointer = new THREE.Vector2(
    (screenX / logicalW) * 2 - 1,
    -(screenY / logicalH) * 2 + 1
  );
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 3);
  const hitPoint = new THREE.Vector3();

  raycaster.setFromCamera(pointer, sceneState.camera);
  const hit = raycaster.ray.intersectPlane(boardPlane, hitPoint);
  if (!hit) {
    return null;
  }

  const x = toScreenX(hitPoint.x);
  const y = toScreenY(hitPoint.z);
  if (x < BOARD_X || x > BOARD_X + BOARD_W || y < BOARD_Y || y > BOARD_Y + BOARD_H) {
    return null;
  }
  return { x, y };
}

/** 返回 3D 渲染器是否就绪且可用，交互模块用于判断是否使用 3D 投射圆检测。 */
export function isRenderInteractionReady() {
  return sceneState.ready && !sceneState.initFailed;
}
