import {
  Application,
  Assets,
  BLEND_MODES,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js';
import './styles.css';

const assetPath = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;

const ASSETS = {
  background: assetPath('assets/jester-depth-background-4k.png'),
  character: assetPath('assets/jester-feminine-character.png'),
  foreground: assetPath('assets/jester-depth-foreground-4k.png'),
};

const DPR_CAP = 2;
const CHARACTER_RUNTIME_MAX_HEIGHT = 3840;
const app = new Application({
  resizeTo: window,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, DPR_CAP),
  backgroundAlpha: 0,
  powerPreference: 'high-performance',
});

document.getElementById('scene').appendChild(app.view);
window.__sceneApp = app;

const root = new Container();
const depth = new Container();
const backgroundLayer = new Container();
const architectureLayer = new Container();
const midLayer = new Container();
const foregroundLayer = new Container();
const fxLayer = new Container();
const groundLayer = new Container();
const characterLayer = new Container();
const floorVeilLayer = new Container();
const uiLightLayer = new Container();

app.stage.addChild(root);
root.addChild(depth, groundLayer, floorVeilLayer, characterLayer);
depth.addChild(backgroundLayer, architectureLayer, midLayer, fxLayer, foregroundLayer, uiLightLayer);

const state = {
  time: 0,
  pointer: { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 },
  camera: { axis: 'center', lastInputAxis: 'center' },
  input: {
    mode: 'hover',
    activePointerId: null,
    touchStartX: 0,
    touchStartY: 0,
    touchBaseX: 0.5,
    touchBaseY: 0.5,
    touchRawX: 0.5,
    touchRawY: 0.5,
    touchViewX: 0.5,
    touchViewY: 0.5,
    touchTargetX: 0.5,
    touchTargetY: 0.5,
  },
  size: { w: 1, h: 1 },
  assetsLoaded: { background: false, character: false, foreground: false },
};

const CAMERA = {
  roomPivotX: 0.53,
  roomPivotY: 0.54,
  orbitLimitX: 0.82,
  orbitLimitY: 0.52,
  idleX: 0.038,
  idleY: 0.026,
  backgroundRevealX: 0.18,
  backgroundRevealY: 0.072,
  midRevealX: 0.098,
  midRevealY: 0.044,
  foregroundRevealX: 0.22,
  foregroundRevealY: 0.118,
  fxRevealX: 0.076,
  fxRevealY: 0.042,
};

const TOUCH_CAMERA = {
  fullTravelX: 0.38,
  fullTravelY: 0.38,
  dragCatchupPerSecond: 1.55,
  releaseCatchupPerSecond: 1.05,
  dragEase: 0.26,
  releaseEase: 0.16,
};

const ANCHOR = {
  floorCircleX: 0.53,
  floorCircleY: 0.825,
};

const textures = {
  dust: makeGlowTexture(96, ['rgba(235,225,255,0.62)', 'rgba(190,160,230,0.16)', 'rgba(255,255,255,0)']),
  ember: makeGlowTexture(96, ['rgba(255,154,66,0.82)', 'rgba(255,112,42,0.18)', 'rgba(255,255,255,0)']),
  pistachio: makeGlowTexture(96, ['rgba(188,255,176,0.78)', 'rgba(126,230,146,0.16)', 'rgba(255,255,255,0)']),
  torch: makeGlowTexture(768, ['rgba(255,190,105,0.12)', 'rgba(120,67,255,0.045)', 'rgba(255,255,255,0)']),
  purpleBloom: makeGlowTexture(768, ['rgba(126,56,188,0.11)', 'rgba(42,8,64,0.035)', 'rgba(255,255,255,0)']),
  architecturalVeil: makeArchitecturalVeilTexture(),
  signatureSignals: makeSignatureSignalsTexture(),
  edgeGrade: makeEdgeGradeTexture(),
  clarityLane: makeClarityLaneTexture(),
  depthOccluder: makeDepthOccluderTexture(),
  subjectBacklight: makeSubjectBacklightTexture(),
  contactShadow: makeContactShadowTexture(),
  floorVeil: makeFloorVeilTexture(),
  floorGleam: makeFloorGleamTexture(),
};

const background = await loadLayer(ASSETS.background, createDepthBackroomTexture());
const character = await loadCharacterLayer(ASSETS.character, createCharacterTexture());
const foreground = await loadLayer(ASSETS.foreground, createForegroundTexture());

backgroundLayer.addChild(background.sprite);
const floorAnchorMark = new Graphics();
floorAnchorMark.blendMode = BLEND_MODES.ADD;
floorAnchorMark.alpha = 0.34;
backgroundLayer.addChild(floorAnchorMark);

const architecturalVeil = new Sprite(textures.architecturalVeil);
architecturalVeil.anchor.set(0.5);
architecturalVeil.alpha = 0.72;
architectureLayer.addChild(architecturalVeil);

const signatureSignals = new Sprite(textures.signatureSignals);
signatureSignals.anchor.set(0.5);
signatureSignals.blendMode = BLEND_MODES.ADD;
signatureSignals.alpha = 0.3;
architectureLayer.addChild(signatureSignals);

const livingSignals = makeLivingSignalSystem();
architectureLayer.addChild(livingSignals.container);

const roomBreath = makeRoomBreathSystem();
architectureLayer.addChild(roomBreath.graphics);

const arcReveal = makeArcRevealSystem();
architectureLayer.addChild(arcReveal.container);

const edgeGrade = new Sprite(textures.edgeGrade);
edgeGrade.anchor.set(0.5);
edgeGrade.alpha = 0.82;
architectureLayer.addChild(edgeGrade);

const clarityLane = new Sprite(textures.clarityLane);
clarityLane.anchor.set(0.5);
clarityLane.alpha = 0.62;
foregroundLayer.addChild(clarityLane);

const characterAura = new Sprite(textures.purpleBloom);
characterAura.anchor.set(0.5);
characterAura.blendMode = BLEND_MODES.ADD;
characterAura.alpha = 0.28;
characterLayer.addChild(characterAura);

const characterRimWarm = new Sprite(character.sprite.texture);
characterRimWarm.anchor.set(0, 1);
characterRimWarm.blendMode = BLEND_MODES.ADD;
characterRimWarm.tint = 0xffa25d;
characterRimWarm.alpha = 0.08;
characterRimWarm.filters = [new BlurFilter(4, 3)];
characterLayer.addChild(characterRimWarm);

const characterRimCool = new Sprite(character.sprite.texture);
characterRimCool.anchor.set(0, 1);
characterRimCool.blendMode = BLEND_MODES.ADD;
characterRimCool.tint = 0x9d63e5;
characterRimCool.alpha = 0.07;
characterRimCool.filters = [new BlurFilter(5, 3)];
characterLayer.addChild(characterRimCool);

characterLayer.addChild(character.sprite);
foregroundLayer.addChild(foreground.sprite);

state.assetsLoaded.background = background.loaded;
state.assetsLoaded.character = character.loaded;
state.assetsLoaded.foreground = foreground.loaded;

const centralGlow = new Sprite(textures.purpleBloom);
centralGlow.anchor.set(0.5);
centralGlow.blendMode = BLEND_MODES.ADD;
centralGlow.alpha = 0.62;

const volumetricDepth = makeVolumetricDepthSystem();
midLayer.addChild(volumetricDepth.graphics);

const focusAperture = makeFocusApertureSystem();
midLayer.addChild(focusAperture.graphics);

const thresholdLens = makeThresholdLensSystem();
midLayer.addChild(thresholdLens.graphics);

const thresholdPressure = makeThresholdPressureSystem();
midLayer.addChild(thresholdPressure.graphics);

const depthShear = makeDepthShearSystem();
midLayer.addChild(depthShear.graphics);

const presenceTrace = makePresenceTraceSystem();
midLayer.addChild(presenceTrace.graphics);
midLayer.addChild(centralGlow);

const cursorLight = new Sprite(textures.torch);
cursorLight.anchor.set(0.5);
cursorLight.blendMode = BLEND_MODES.ADD;
cursorLight.alpha = 0.42;
uiLightLayer.addChild(cursorLight);

const subjectMatte = new Graphics();
subjectMatte.blendMode = BLEND_MODES.MULTIPLY;
subjectMatte.filters = [new BlurFilter(24, 2)];
groundLayer.addChild(subjectMatte);

const subjectBacklight = new Sprite(textures.subjectBacklight);
subjectBacklight.anchor.set(0.5, 0.58);
subjectBacklight.blendMode = BLEND_MODES.ADD;
subjectBacklight.alpha = 0.34;
groundLayer.addChild(subjectBacklight);

const contactShadow = new Sprite(textures.contactShadow);
contactShadow.anchor.set(0.5);
contactShadow.alpha = 0.62;
groundLayer.addChild(contactShadow);

const floorReflection = new Sprite(character.sprite.texture);
floorReflection.anchor.set(0, 1);
floorReflection.tint = 0x7d4a96;
floorReflection.alpha = 0.1;
floorVeilLayer.addChild(floorReflection);

const floorVeil = new Sprite(textures.floorVeil);
floorVeil.anchor.set(0.5, 0.62);
floorVeil.alpha = 0.28;
floorVeilLayer.addChild(floorVeil);

const floorGleam = new Sprite(textures.floorGleam);
floorGleam.anchor.set(0.5, 0.58);
floorGleam.blendMode = BLEND_MODES.ADD;
floorGleam.alpha = 0.24;
floorVeilLayer.addChild(floorGleam);

const cinematicDepthFrame = new Sprite(textures.depthOccluder);
cinematicDepthFrame.anchor.set(0.5);
cinematicDepthFrame.alpha = 0.46;
foregroundLayer.addChild(cinematicDepthFrame);

const sideSeparation = makeSideSeparationSystem();
foregroundLayer.addChild(sideSeparation.container);

const rays = makeLightRays(10);
midLayer.addChild(rays);

const eyelids = makeEyeSystem();
characterLayer.addChild(eyelids.container);

const cloth = makeClothMotionSystem();
characterLayer.addChild(cloth.container);

const subjectLustre = makeSubjectLustreSystem();
characterLayer.addChild(subjectLustre.container);

const particles = makeParticles();
for (const particle of particles) {
  fxLayer.addChild(particle.sprite);
}

const mirrorMotes = makeMirrorMotes(34);
for (const mote of mirrorMotes) {
  fxLayer.addChild(mote);
}

function isTouchLikePointer(event) {
  return event.pointerType === 'touch' || event.pointerType === 'pen';
}

function setPointerTarget(x, y) {
  state.pointer.tx = clamp(x, 0, 1);
  state.pointer.ty = clamp(y, 0, 1);
}

function approachValue(current, target, ease, maxStep) {
  const delta = target - current;
  const eased = delta * ease;
  return current + clamp(eased, -maxStep, maxStep);
}

function syncTouchPointerTarget(dt) {
  if (state.input.mode !== 'touch-drag' && state.input.mode !== 'touch-release') return;

  const isRelease = state.input.mode === 'touch-release';
  const maxStep = (isRelease ? TOUCH_CAMERA.releaseCatchupPerSecond : TOUCH_CAMERA.dragCatchupPerSecond) * dt;
  const ease = isRelease ? TOUCH_CAMERA.releaseEase : TOUCH_CAMERA.dragEase;
  state.input.touchViewX = approachValue(state.input.touchViewX, state.input.touchRawX, ease, maxStep);
  state.input.touchViewY = approachValue(state.input.touchViewY, state.input.touchRawY, ease, maxStep);
  setPointerTarget(state.input.touchViewX, state.input.touchViewY);
}

function updateHoverPointer(event) {
  if (isTouchLikePointer(event)) return;
  state.input.mode = 'hover';
  setPointerTarget(
    event.clientX / Math.max(window.innerWidth, 1),
    event.clientY / Math.max(window.innerHeight, 1),
  );
}

function beginTouchCamera(event) {
  if (!isTouchLikePointer(event) || event.isPrimary === false) return;
  state.input.activePointerId = event.pointerId;
  state.input.mode = 'touch-drag';
  state.input.touchStartX = event.clientX;
  state.input.touchStartY = event.clientY;
  state.input.touchBaseX = state.pointer.tx;
  state.input.touchBaseY = state.pointer.ty;
  state.input.touchRawX = state.input.touchBaseX;
  state.input.touchRawY = state.input.touchBaseY;
  state.input.touchViewX = state.pointer.tx;
  state.input.touchViewY = state.pointer.ty;
  state.input.touchTargetX = state.input.touchBaseX;
  state.input.touchTargetY = state.input.touchBaseY;
  setPointerTarget(state.input.touchViewX, state.input.touchViewY);
  if (app.view.setPointerCapture) {
    try {
      app.view.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic touch tests and a few browsers can reject capture; the window listener still tracks the drag.
    }
  }
  event.preventDefault();
}

function updateTouchCamera(event) {
  if (!isTouchLikePointer(event)) return;
  if (state.input.activePointerId !== event.pointerId) return;
  const dx = (event.clientX - state.input.touchStartX) / Math.max(window.innerWidth, 1);
  const dy = (event.clientY - state.input.touchStartY) / Math.max(window.innerHeight, 1);
  const targetX = state.input.touchBaseX + clamp(dx / TOUCH_CAMERA.fullTravelX, -0.5, 0.5);
  const targetY = state.input.touchBaseY + clamp(dy / TOUCH_CAMERA.fullTravelY, -0.5, 0.5);
  state.input.mode = 'touch-drag';
  state.input.touchRawX = clamp(targetX, 0, 1);
  state.input.touchRawY = clamp(targetY, 0, 1);
  state.input.touchTargetX = state.input.touchRawX;
  state.input.touchTargetY = state.input.touchRawY;
  event.preventDefault();
}

function endTouchCamera(event) {
  if (!isTouchLikePointer(event)) return;
  if (state.input.activePointerId !== event.pointerId) return;
  state.input.activePointerId = null;
  state.input.mode = 'touch-release';
  state.input.touchRawX = 0.5;
  state.input.touchRawY = 0.5;
  state.input.touchTargetX = 0.5;
  state.input.touchTargetY = 0.5;
  if (app.view.releasePointerCapture) {
    try {
      app.view.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore capture mismatches from synthetic or interrupted touch sequences.
    }
  }
  event.preventDefault();
}

function handlePointerMove(event) {
  if (isTouchLikePointer(event)) {
    updateTouchCamera(event);
    return;
  }
  updateHoverPointer(event);
}

app.view.addEventListener('pointerdown', beginTouchCamera, { passive: false });
window.addEventListener('pointermove', handlePointerMove, { passive: false });
window.addEventListener('pointerup', endTouchCamera, { passive: false });
window.addEventListener('pointercancel', endTouchCamera, { passive: false });
window.addEventListener('mousemove', updateHoverPointer);

window.addEventListener('pointerleave', () => {
  if (state.input.activePointerId !== null) return;
  setPointerTarget(0.5, 0.5);
});

window.addEventListener('resize', layout);
layout();

app.ticker.add((delta) => {
  const dt = delta / 60;
  state.time += dt;
  syncTouchPointerTarget(dt);
  const pointerEase = state.input.mode === 'touch-drag' || state.input.mode === 'touch-release' ? 0.12 : 0.085;
  state.pointer.x += (state.pointer.tx - state.pointer.x) * pointerEase;
  state.pointer.y += (state.pointer.ty - state.pointer.y) * pointerEase;

  animateScene(dt);
});

function animateScene(dt) {
  const { w, h } = state.size;
  const t = state.time;
  const aspect = w / Math.max(h, 1);
  const portraitFactor = aspect < 0.82 ? 1 : 0;
  const px = state.pointer.x - 0.5;
  const py = state.pointer.y - 0.5;
  const breathe = Math.sin(t * 0.48) * 0.5 + 0.5;
  const slowPulse = Math.sin(t * 0.19) * 0.5 + 0.5;
  const orbit = constrainedCameraOrbit(px, py, t);
  const lookX = orbit.x;
  const lookY = orbit.y;
  const cameraArc = lookY;
  const arcFalloff = 1 - Math.min(0.42, Math.abs(lookX) * 0.14 + orbit.diagonal * 0.28);
  const focusX = w * CAMERA.roomPivotX;
  const focusY = h * CAMERA.roomPivotY;

  depth.pivot.set(focusX, focusY);
  depth.position.set(focusX, focusY);
  depth.rotation = lookX * 0.012 + lookY * 0.004;
  depth.scale.set(1.008 + Math.abs(lookY) * 0.002 + Math.abs(lookX) * 0.005);
  depth.skew.set(lookX * 0.028, lookY * -0.014);

  const backShift = cameraShift(lookX, lookY, w, h, -CAMERA.backgroundRevealX, -CAMERA.backgroundRevealY, arcFalloff);
  const architectureShift = cameraShift(lookX, lookY, w, h, -0.132, -0.052, arcFalloff);
  const midShift = cameraShift(lookX, lookY, w, h, -CAMERA.midRevealX, -CAMERA.midRevealY, arcFalloff);
  const foreShift = cameraShift(lookX, lookY, w, h, CAMERA.foregroundRevealX, CAMERA.foregroundRevealY, arcFalloff);
  const fxShift = cameraShift(lookX, lookY, w, h, CAMERA.fxRevealX, CAMERA.fxRevealY, arcFalloff);

  backgroundLayer.position.set(backShift.x, backShift.y);
  backgroundLayer.scale.set(1.024 + breathe * 0.006);
  floorAnchorMark.alpha = 0.24 + breathe * 0.12;
  architectureLayer.position.set(architectureShift.x, architectureShift.y);
  architectureLayer.scale.set(1.012 + Math.abs(lookX) * 0.004 + breathe * 0.003);
  midLayer.position.set(midShift.x, midShift.y);
  foregroundLayer.position.set(foreShift.x, foreShift.y);
  fxLayer.position.set(fxShift.x, fxShift.y);
  uiLightLayer.position.set(midShift.x * 0.52, midShift.y * 0.52);
  groundLayer.position.set(0, 0);
  floorVeilLayer.position.set(0, 0);

  characterLayer.position.set(0, 0);
  const foot = projectBackgroundPoint(character.sceneFootX, character.sceneFootY);
  character.projectedFootX = foot.x;
  character.projectedFootY = foot.y;
  const projectedWidth = character.sprite.texture.width * character.baseScale;
  character.sprite.position.set(character.projectedFootX - projectedWidth * 0.5, character.projectedFootY);
  character.displayCenterX = character.projectedFootX;
  character.displayFootY = character.projectedFootY;

  const characterBreathe = 1 + Math.sin(t * 0.82) * 0.00045;
  character.sprite.scale.x = character.baseScale * (1 + Math.sin(t * 0.36) * 0.00022);
  character.sprite.scale.y = character.baseScale * characterBreathe;
  character.sprite.rotation = Math.sin(t * 0.2) * 0.00018 + Math.sin(t * 0.07) * 0.00008;
  syncCharacterRim(characterRimWarm, character, character.sprite.position.x - w * (0.004 + Math.max(0, lookX) * 0.006), character.projectedFootY + h * 0.001, 1.006, characterBreathe, character.sprite.rotation - 0.0012);
  syncCharacterRim(characterRimCool, character, character.sprite.position.x + w * (0.004 + Math.max(0, -lookX) * 0.006), character.projectedFootY + h * 0.0005, 1.004, characterBreathe, character.sprite.rotation + 0.001);
  characterRimWarm.alpha = 0.035 + slowPulse * 0.022 + Math.max(0, lookX) * 0.012;
  characterRimCool.alpha = 0.03 + breathe * 0.018 + Math.max(0, -lookX) * 0.014;
  characterAura.position.set(
    character.displayCenterX,
    character.sprite.position.y - character.sprite.texture.height * character.baseScale * 0.52,
  );
  characterAura.scale.set(Math.max(w, h) / 660);
  characterAura.alpha = 0.18 + breathe * 0.1;
  drawSubjectMatte(subjectMatte, character, w, h, breathe, slowPulse, lookX, lookY);
  subjectBacklight.position.set(character.displayCenterX, character.displayFootY - h * 0.34);
  subjectBacklight.scale.set(h / subjectBacklight.texture.height * 0.88);
  subjectBacklight.alpha = 0.28 + breathe * 0.12;

  foreground.sprite.alpha = state.assetsLoaded.foreground ? 0.18 : 0.52;
  foreground.sprite.scale.set(foreground.baseScale * (1.03 + slowPulse * 0.004));
  architecturalVeil.alpha = 0.5 + slowPulse * 0.09;
  signatureSignals.alpha = 0.18 + breathe * 0.16;
  signatureSignals.rotation = Math.sin(t * 0.055) * 0.002;
  livingSignals.update(t, w, h, lookX, lookY, breathe, slowPulse);
  roomBreath.update(t, w, h, lookX, lookY, breathe);
  arcReveal.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse);
  volumetricDepth.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse);
  focusAperture.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse);
  thresholdLens.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse);
  thresholdPressure.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse);
  depthShear.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse, portraitFactor);
  presenceTrace.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse);
  edgeGrade.alpha = 0.62 + breathe * 0.05;
  clarityLane.position.set(w * 0.5 + lookX * w * 0.01, h * 0.5 + lookY * h * 0.006);
  clarityLane.scale.set(clarityLane.baseScale * (1.002 + Math.abs(lookX) * 0.006));
  clarityLane.alpha = 0.46 + slowPulse * 0.08 + portraitFactor * 0.1;

  centralGlow.position.set(w * 0.5 - lookX * w * 0.028, h * 0.52 + cameraArc * h * 0.026);
  centralGlow.scale.set(Math.max(w, h) / 540);
  centralGlow.alpha = 0.16 + breathe * 0.16;

  const guidedLightX = clamp(0.5 + Math.sin(lookX * Math.PI * 0.46) * 0.24, 0.16, 0.84);
  const guidedLightY = clamp(0.48 + Math.sin(lookY * Math.PI * 0.48) * 0.19, 0.18, 0.78);
  cursorLight.position.set(guidedLightX * w, guidedLightY * h);
  cursorLight.scale.set(Math.max(w, h) / 520);
  cursorLight.alpha = 0.18 + slowPulse * 0.12;

  rays.position.set(w * 0.5, h * 0.18);
  rays.rotation = lookX * 0.036 + Math.sin(t * 0.14) * 0.015;
  rays.alpha = 0.13 + breathe * 0.1;
  const footY = character.displayFootY - character.sprite.texture.height * 0.012 * character.baseScale;
  contactShadow.position.set(character.displayCenterX + w * 0.01, footY + h * 0.006);
  contactShadow.scale.set((w * 0.22) / contactShadow.texture.width, (h * 0.044) / contactShadow.texture.height);
  floorReflection.position.set(
    character.sprite.position.x + projectedWidth * 0.14 + lookX * w * 0.01,
    footY + h * 0.012 + lookY * h * 0.004,
  );
  floorReflection.scale.set(
    character.baseScale * (0.72 + Math.abs(lookX) * 0.04),
    -character.baseScale * (0.12 + Math.abs(lookY) * 0.025),
  );
  floorReflection.skew.set(lookX * -0.12, lookY * 0.018);
  floorReflection.rotation = lookX * 0.006 + Math.sin(t * 0.12) * 0.0015;
  floorVeil.position.set(character.displayCenterX + w * 0.006, footY + h * 0.002);
  floorGleam.position.set(character.displayCenterX + lookX * w * 0.014, footY + h * 0.004 + lookY * h * 0.006);
  floorGleam.scale.set((w * 0.42) / floorGleam.texture.width, (h * 0.13) / floorGleam.texture.height);
  floorGleam.rotation = lookX * 0.018 + Math.sin(t * 0.1) * 0.003;
  contactShadow.alpha = 0.56 + breathe * 0.08;
  floorReflection.alpha = 0.055 + breathe * 0.025 + Math.abs(lookY) * 0.012;
  floorVeil.alpha = 0.16 + breathe * 0.035;
  floorGleam.alpha = 0.15 + breathe * 0.09 + Math.abs(lookY) * 0.04;
  cinematicDepthFrame.alpha = 0.36 + slowPulse * 0.06 + Math.abs(lookX) * 0.026 + portraitFactor * 0.05;
  cinematicDepthFrame.position.set(w * 0.5 + lookX * w * 0.016, h * 0.5 + lookY * h * 0.012);
  cinematicDepthFrame.scale.set(cinematicDepthFrame.baseScale * (1.002 + Math.abs(lookX) * 0.01));
  sideSeparation.update(t, w, h, lookX, lookY, orbit.axis, breathe, slowPulse, portraitFactor);

  animateParticles(particles, dt, w, h, t);
  animateMirrorMotes(
    mirrorMotes,
    t,
    lookX / Math.max(CAMERA.orbitLimitX, 0.0001),
    lookY / Math.max(CAMERA.orbitLimitY, 0.0001),
  );
  eyelids.update(t, character);
  cloth.update(t, character);
  subjectLustre.update(t, character, lookX, lookY, breathe, slowPulse);
  document.body.dataset.cameraArc = lookY.toFixed(3);
  document.body.dataset.cameraOrbit = lookX.toFixed(3);
  document.body.dataset.cameraMode = 'constrained-cardinal-arc';
  document.body.dataset.inputMode = state.input.mode;
  document.body.dataset.touchCameraMode = 'relative-drag-smoothed-no-teleport';
  document.body.dataset.cameraAxis = orbit.axis;
  document.body.dataset.cameraRailLock = 'single-axis';
  document.body.dataset.cameraRadius = orbit.radius.toFixed(3);
  document.body.dataset.cameraCrossLeak = orbit.crossLeak.toFixed(3);
  document.body.dataset.cameraCardinalLock = orbit.axis === 'center' || orbit.crossLeak < 0.045 ? 'true' : 'false';
  document.body.dataset.arcRevealMode = 'cardinal-environment-reveal';
  document.body.dataset.arcRevealAxis = orbit.axis;
  document.body.dataset.focusApertureMode = 'peripheral-depth-focus';
  document.body.dataset.focusApertureAxis = orbit.axis;
  document.body.dataset.volumetricDepthMode = 'axis-bound-slit-haze';
  document.body.dataset.volumetricDepthAxis = orbit.axis;
  document.body.dataset.thresholdDepthMode = 'private-threshold-depth-lens';
  document.body.dataset.thresholdDepthAxis = orbit.axis;
  document.body.dataset.thresholdPressureMode = 'peripheral-threshold-pressure';
  document.body.dataset.thresholdPressureAxis = orbit.axis;
  document.body.dataset.thresholdPressureAlpha = thresholdPressure.graphics.alpha.toFixed(3);
  document.body.dataset.depthShearMode = 'axis-bound-anamorphic-depth-shear';
  document.body.dataset.depthShearAxis = orbit.axis;
  document.body.dataset.depthShearAlpha = depthShear.graphics.alpha.toFixed(3);
  document.body.dataset.sideSeparationMode = 'cinematic-side-depth-separation';
  document.body.dataset.sideSeparationAxis = orbit.axis;
  document.body.dataset.sideSeparationAlpha = sideSeparation.alpha.toFixed(3);
  document.body.dataset.presenceTraceMode = 'non-ui-directional-presence-memory';
  document.body.dataset.presenceTraceAxis = orbit.axis;
  document.body.dataset.presenceTracePeak = presenceTrace.peak.toFixed(3);
  document.body.dataset.subjectMatteMode = 'cinematic-negative-fill-subject-clarity';
  document.body.dataset.subjectMatteAlpha = subjectMatte.alpha.toFixed(3);
  document.body.dataset.floorReflectionMode = 'scene-anchored-contact-reflection';
  document.body.dataset.floorReflectionAlpha = floorReflection.alpha.toFixed(3);
  document.body.dataset.characterRimMode = 'dual-tone-silhouette-separation';
  document.body.dataset.characterRimAlpha = `${characterRimWarm.alpha.toFixed(3)},${characterRimCool.alpha.toFixed(3)}`;
  document.body.dataset.subjectLustreMode = 'pose-locked-micro-lustre';
  document.body.dataset.subjectLustrePeak = subjectLustre.peak.toFixed(3);
  document.body.dataset.cameraPivot = `${Math.round(focusX)},${Math.round(focusY)}`;
  document.body.dataset.cameraShift = `${Math.round(depth.position.x - focusX)},${Math.round(depth.position.y - focusY)}`;
  document.body.dataset.cameraReveal = `${Math.round(backShift.x)},${Math.round(foreShift.x)}`;
  document.body.dataset.subjectFoot = `${Math.round(character.projectedFootX)},${Math.round(character.projectedFootY)}`;
  document.body.dataset.anchorLayer = 'backgroundLayer';
  document.body.dataset.anchorLocal = `${Math.round(character.sceneFootX)},${Math.round(character.sceneFootY)}`;
  document.body.dataset.characterCenter = `${Math.round(character.displayCenterX)},${Math.round(character.displayFootY)}`;
  document.body.dataset.characterPosition = `${Math.round(character.sprite.position.x)},${Math.round(character.sprite.position.y)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createRng(label) {
  let state = 2166136261;
  for (let i = 0; i < label.length; i += 1) {
    state ^= label.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

function constrainedCameraOrbit(px, py, t) {
  const rawX = clamp(px * 2, -1, 1);
  const rawY = clamp(py * 2, -1, 1);
  const absX = Math.abs(rawX);
  const absY = Math.abs(rawY);
  const radius = Math.min(1, Math.hypot(rawX, rawY));
  const dominance = Math.abs(absX - absY);
  const deadZone = 0.045;
  const axisHysteresis = 0.18;

  let axis = absX >= absY ? 'x' : 'y';
  if (radius < deadZone) {
    axis = 'center';
  } else if (dominance < axisHysteresis && state.camera.lastInputAxis !== 'center') {
    axis = state.camera.lastInputAxis;
  }
  if (axis !== 'center') state.camera.lastInputAxis = axis;
  state.camera.axis = axis;

  const diagonalRatio = Math.min(absX, absY) / Math.max(absX, absY, 0.0001);
  const idleX = Math.sin(t * 0.105) * CAMERA.idleX + Math.sin(t * 0.031) * CAMERA.idleX * 0.42;
  const idleY = Math.cos(t * 0.081) * CAMERA.idleY;
  const sideIdle = axis === 'x' ? idleX : 0;
  const verticalIdle = axis === 'y' || axis === 'center' ? idleY : 0;
  const sideInput = axis === 'x' ? rawX : 0;
  const verticalInput = axis === 'y' ? rawY : 0;
  const sideArc = Math.sin(sideInput * Math.PI * 0.5) * CAMERA.orbitLimitX;
  const verticalArc = Math.sin(verticalInput * Math.PI * 0.5) * CAMERA.orbitLimitY;
  const x = clamp(sideArc + sideIdle, -CAMERA.orbitLimitX, CAMERA.orbitLimitX);
  const y = clamp(verticalArc + verticalIdle, -CAMERA.orbitLimitY, CAMERA.orbitLimitY);

  return {
    x,
    y,
    radius,
    diagonal: diagonalRatio,
    crossLeak: axis === 'x' ? Math.abs(y) : axis === 'y' ? Math.abs(x) : 0,
    axis,
  };
}

function cameraShift(lookX, lookY, w, h, xFactor, yFactor, falloff) {
  const sideArc = Math.sin(lookX * Math.PI * 0.5);
  const verticalArc = Math.sin(lookY * Math.PI * 0.48);
  return {
    x: sideArc * w * xFactor,
    y: verticalArc * h * yFactor * falloff,
  };
}

function projectBackgroundPoint(x, y) {
  return backgroundLayer.toGlobal({ x, y });
}

async function loadLayer(url, fallbackTexture) {
  try {
    const texture = await Assets.load(url);
    return { sprite: Sprite.from(texture), loaded: true, baseScale: 1 };
  } catch {
    return { sprite: Sprite.from(fallbackTexture), loaded: false, baseScale: 1 };
  }
}

async function loadCharacterLayer(url, fallbackTexture) {
  try {
    const texture = await loadImageAsCanvasTexture(url, CHARACTER_RUNTIME_MAX_HEIGHT);
    return { sprite: Sprite.from(texture), loaded: true, baseScale: 1 };
  } catch {
    return { sprite: Sprite.from(fallbackTexture), loaded: false, baseScale: 1 };
  }
}

async function loadImageAsCanvasTexture(url, maxHeight) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  if (image.decode) {
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  }

  const scale = Math.min(1, maxHeight / Math.max(image.naturalHeight, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const crop = findAlphaCrop(ctx, canvas.width, canvas.height, 8);
  if (!crop) return Texture.from(canvas);

  const padX = Math.round(canvas.width * 0.012);
  const padY = Math.round(canvas.height * 0.01);
  const sx = Math.max(0, crop.x - padX);
  const sy = Math.max(0, crop.y - padY);
  const sw = Math.min(canvas.width - sx, crop.width + padX * 2);
  const sh = Math.min(canvas.height - sy, crop.height + padY * 2);
  const cropped = document.createElement('canvas');
  cropped.width = sw;
  cropped.height = sh;
  const croppedCtx = cropped.getContext('2d', { alpha: true });
  croppedCtx.imageSmoothingEnabled = true;
  croppedCtx.imageSmoothingQuality = 'high';
  croppedCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return Texture.from(cropped);
}

function findAlphaCrop(ctx, width, height, threshold) {
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function layout() {
  const w = app.renderer.width / app.renderer.resolution;
  const h = app.renderer.height / app.renderer.resolution;
  state.size.w = w;
  state.size.h = h;

  fitCover(background.sprite, w, h, 1.24);
  background.baseScale = background.sprite.scale.x;
  background.sprite.anchor.set(0.5);
  background.sprite.position.set(w * 0.5, h * 0.5);
  drawFloorAnchorMark(floorAnchorMark, w, h);

  fitCover(architecturalVeil, w, h, 1.18);
  architecturalVeil.position.set(w * 0.5, h * 0.5);
  fitCover(signatureSignals, w, h, 1.18);
  signatureSignals.position.set(w * 0.5, h * 0.5);
  fitCover(edgeGrade, w, h, 1.18);
  edgeGrade.position.set(w * 0.5, h * 0.5);

  fitCover(foreground.sprite, w, h, 1.3);
  foreground.baseScale = foreground.sprite.scale.x;
  foreground.sprite.anchor.set(0.5);
  foreground.sprite.position.set(w * 0.5, h * 0.5);
  foreground.sprite.blendMode = BLEND_MODES.NORMAL;
  fitCover(clarityLane, w, h, 1.08);
  clarityLane.baseScale = clarityLane.scale.x;
  clarityLane.position.set(w * 0.5, h * 0.5);
  fitCover(cinematicDepthFrame, w, h, 1.08);
  cinematicDepthFrame.baseScale = cinematicDepthFrame.scale.x;
  cinematicDepthFrame.position.set(w * 0.5, h * 0.5);

  const aspect = w / Math.max(h, 1);
  const isPortrait = aspect < 0.78;
  const isNarrow = aspect >= 0.78 && aspect < 1.05;
  const isBalanced = aspect >= 1.05 && aspect < 1.32;
  const targetHeight = h * (isPortrait ? 0.455 : isNarrow ? 0.49 : isBalanced ? 0.57 : 0.63);
  const characterScale = targetHeight / character.sprite.texture.height;
  const footLine = h * (isPortrait ? 0.875 : isNarrow ? 0.88 : isBalanced ? 0.9 : 0.915);
  const displayWidth = character.sprite.texture.width * characterScale;
  const desiredCenterX = w * (isPortrait ? 0.48 : isNarrow ? 0.42 : isBalanced ? 0.5 : 0.56);
  const characterX = desiredCenterX - displayWidth * 0.5;
  character.sprite.anchor.set(0, 1);
  character.sprite.position.set(characterX, footLine);
  character.sprite.visible = true;
  character.sprite.alpha = 1;
  character.sprite.scale.set(characterScale);
  character.baseScale = characterScale;
  syncCharacterRim(characterRimWarm, character, characterX - w * 0.004, footLine + h * 0.001, 1.006, 1, -0.0012);
  syncCharacterRim(characterRimCool, character, characterX + w * 0.004, footLine + h * 0.0005, 1.004, 1, 0.001);
  characterRimWarm.alpha = 0.05;
  characterRimCool.alpha = 0.048;
  character.displayCenterX = character.sprite.position.x + displayWidth * 0.5;
  character.displayFootY = footLine;
  character.sceneFootX = w * ANCHOR.floorCircleX;
  character.sceneFootY = h * ANCHOR.floorCircleY;
  character.projectedFootX = character.sceneFootX;
  character.projectedFootY = character.sceneFootY;
  character.cameraFocusX = character.displayCenterX;
  character.cameraFocusY = footLine - character.sprite.texture.height * characterScale * 0.34;
  characterAura.position.set(character.displayCenterX, character.sprite.position.y - character.sprite.texture.height * characterScale * 0.52);
  characterAura.scale.set(Math.max(w, h) / 660);

  const footY = character.sprite.position.y - character.sprite.texture.height * 0.012 * characterScale;
  contactShadow.position.set(character.displayCenterX + w * 0.01, footY + h * 0.006);
  contactShadow.scale.set((w * (isBalanced ? 0.24 : 0.2)) / contactShadow.texture.width, (h * 0.044) / contactShadow.texture.height);
  floorReflection.position.set(characterX + displayWidth * 0.14, footY + h * 0.012);
  floorReflection.scale.set(characterScale * 0.72, -characterScale * 0.12);
  floorReflection.skew.set(0, 0);
  floorReflection.rotation = 0;
  floorReflection.alpha = 0.08;
  floorVeil.position.set(character.displayCenterX + w * 0.006, footY + h * 0.002);
  floorVeil.scale.set((w * (isBalanced ? 0.32 : 0.27)) / floorVeil.texture.width, (h * 0.074) / floorVeil.texture.height);
  floorGleam.position.set(character.displayCenterX, footY + h * 0.004);
  floorGleam.scale.set((w * (isBalanced ? 0.46 : 0.4)) / floorGleam.texture.width, (h * 0.13) / floorGleam.texture.height);

  eyelids.layout(character);
  cloth.layout(character);
  subjectLustre.layout(character);

  document.body.dataset.sceneReady = 'true';
  document.body.dataset.characterPosition = `${Math.round(character.sprite.position.x)},${Math.round(character.sprite.position.y)}`;
  document.body.dataset.characterScale = characterScale.toFixed(4);
  document.body.dataset.characterAnchor = '0.00,1';
  document.body.dataset.characterCenter = `${Math.round(character.displayCenterX)},${Math.round(footY)}`;
  document.body.dataset.sceneLayers = `${root.getChildIndex(depth)},${root.getChildIndex(characterLayer)}`;
  document.body.dataset.cameraModel = 'orbit-camera-background-foot-anchor';

  window.__sceneDebug = {
    assetsLoaded: { ...state.assetsLoaded },
    viewport: { w, h, aspect },
    character: {
      texture: {
        width: character.sprite.texture.width,
        height: character.sprite.texture.height,
      },
      position: { x: character.sprite.position.x, y: character.sprite.position.y },
      scale: { x: character.sprite.scale.x, y: character.sprite.scale.y },
      anchor: { x: character.sprite.anchor.x, y: character.sprite.anchor.y },
      visible: character.sprite.visible,
      alpha: character.sprite.alpha,
      layerChildren: characterLayer.children.length,
    },
    layers: {
      depthChildren: depth.children.length,
      characterLayerIndex: root.getChildIndex(characterLayer),
      floorVeilLayerIndex: root.getChildIndex(floorVeilLayer),
    },
  };
}

function fitCover(sprite, w, h, extra = 1) {
  const scale = Math.max(w / sprite.texture.width, h / sprite.texture.height) * extra;
  sprite.scale.set(scale);
}

function syncCharacterRim(sprite, subject, x, y, scaleLift, breathe, rotation) {
  sprite.position.set(x, y);
  sprite.scale.set(subject.baseScale * scaleLift, subject.baseScale * scaleLift * breathe);
  sprite.rotation = rotation;
  sprite.visible = subject.sprite.visible;
}

function drawSubjectMatte(g, subject, w, h, breathe, slowPulse, lookX, lookY) {
  const height = subject.sprite.texture.height * subject.baseScale;
  const width = subject.sprite.texture.width * subject.baseScale;
  const cx = subject.displayCenterX;
  const shoulderY = subject.projectedFootY - height * 0.64;
  const waistY = subject.projectedFootY - height * 0.38;
  const floorY = subject.projectedFootY - height * 0.02;
  const sidePull = clamp(Math.abs(lookX) * 0.34 + Math.abs(lookY) * 0.12, 0, 0.36);
  const alpha = 0.105 + slowPulse * 0.026 + sidePull * 0.038;

  g.clear();
  g.alpha = alpha;

  g.beginFill(0x020104, 0.64);
  g.drawEllipse(
    cx - width * (0.19 + Math.max(0, lookX) * 0.035),
    shoulderY + lookY * h * 0.004,
    width * (0.42 + sidePull * 0.08),
    height * (0.23 + breathe * 0.012),
  );
  g.endFill();

  g.beginFill(0x06020a, 0.46);
  g.drawEllipse(
    cx + width * (0.18 + Math.max(0, -lookX) * 0.035),
    waistY + lookY * h * 0.005,
    width * (0.36 + sidePull * 0.06),
    height * 0.2,
  );
  g.endFill();

  g.beginFill(0x030105, 0.5);
  g.drawPolygon([
    cx - width * 0.58, shoulderY + height * 0.04,
    cx - width * 0.34, floorY,
    cx + width * 0.34, floorY,
    cx + width * 0.58, shoulderY + height * 0.09,
    cx + width * 0.28, shoulderY - height * 0.11,
    cx - width * 0.28, shoulderY - height * 0.12,
  ]);
  g.endFill();
}

function makeRoomBreathSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('room-breath-system');
  const ribs = [];
  const sparks = [];

  for (let i = 0; i < 18; i += 1) {
    ribs.push({
      spread: (i - 8.5) / 8.5,
      phase: randRange(rng, 0, Math.PI * 2),
      weight: randRange(rng, 0.55, 1.25),
      color: i % 4 === 0 ? 0xbcffb0 : i % 4 === 1 ? 0xffa25d : 0x9d63e5,
    });
  }

  for (let i = 0; i < 28; i += 1) {
    sparks.push({
      lane: randRange(rng, -1, 1),
      depth: randRange(rng, 0.12, 0.92),
      phase: randRange(rng, 0, Math.PI * 2),
      size: randRange(rng, 1.2, 3.4),
      color: rng() > 0.58 ? 0xffa25d : rng() > 0.38 ? 0xbcffb0 : 0x9d63e5,
    });
  }

  return {
    graphics,
    update(t, w, h, lookX, lookY, breathe) {
      drawRoomBreath(graphics, ribs, sparks, t, w, h, lookX, lookY, breathe);
    },
  };
}

function drawRoomBreath(g, ribs, sparks, t, w, h, lookX, lookY, breathe) {
  const vanishX = w * (0.53 - lookX * 0.018);
  const vanishY = h * (0.48 + lookY * 0.016);
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;
  const breath = 0.5 + Math.sin(t * 0.34) * 0.5;

  g.clear();
  g.alpha = 0.34 + breathe * 0.18;

  for (const rib of ribs) {
    const floorSpread = rib.spread * w * (0.42 + Math.abs(rib.spread) * 0.12);
    const floorEndX = floorX + floorSpread + lookX * w * 0.03;
    const floorEndY = h * (0.95 - Math.abs(rib.spread) * 0.12) + lookY * h * 0.014;
    const wave = Math.sin(t * 0.44 + rib.phase) * 0.5 + 0.5;
    const alpha = (0.018 + wave * 0.04 + breath * 0.014) * rib.weight;
    const controlX = floorX + rib.spread * w * 0.14 + lookX * w * 0.018;
    const controlY = h * (0.66 + wave * 0.035);

    g.lineStyle(0.8 + rib.weight * 0.75, rib.color, alpha);
    g.moveTo(vanishX, vanishY);
    g.quadraticCurveTo(controlX, controlY, floorEndX, floorEndY);

    if (Math.abs(rib.spread) > 0.42) {
      g.lineStyle(0.7, rib.color, alpha * 0.52);
      g.moveTo(vanishX + rib.spread * w * 0.018, vanishY + h * 0.035);
      g.lineTo(floorEndX * 0.72 + floorX * 0.28, floorEndY - h * 0.05);
    }
  }

  for (let i = 0; i < 5; i += 1) {
    const progress = ((t * 0.045 + i * 0.19) % 1);
    const width = w * (0.11 + progress * 0.29);
    const height = h * (0.018 + progress * 0.036);
    const y = floorY - h * (0.03 + progress * 0.22) + lookY * h * 0.012;
    const alpha = (1 - progress) * 0.045;
    g.lineStyle(1.1, i % 2 === 0 ? 0xbcffb0 : 0xffa25d, alpha);
    g.drawEllipse(floorX + lookX * w * 0.012, y, width, height);
  }

  for (const spark of sparks) {
    const progress = (spark.depth + t * 0.028 + Math.sin(t * 0.07 + spark.phase) * 0.015) % 1;
    const lane = spark.lane + lookX * 0.08;
    const x = vanishX + lane * w * (0.08 + progress * 0.36);
    const y = vanishY + progress * h * (0.38 + Math.abs(lane) * 0.18) + lookY * h * 0.02;
    const pulse = Math.max(0, Math.sin(t * 0.7 + spark.phase));
    const alpha = 0.025 + pulse * 0.06;
    const size = spark.size * (0.5 + progress * 1.4);

    g.beginFill(spark.color, alpha);
    g.drawPolygon([x, y - size, x + size * 0.55, y, x, y + size, x - size * 0.55, y]);
    g.endFill();
  }
}

function makeArcRevealSystem() {
  const container = new Container();
  const shade = new Graphics();
  const glints = new Graphics();
  glints.blendMode = BLEND_MODES.ADD;
  container.addChild(shade, glints);

  const rng = createRng('cardinal-reveal-shutters');
  const sideSlats = [];
  const topWires = [];
  const floorSheens = [];

  for (let i = 0; i < 36; i += 1) {
    sideSlats.push({
      side: i % 2 === 0 ? -1 : 1,
      lane: randRange(rng, 0.045, 0.23),
      y: randRange(rng, 0.09, 0.84),
      length: randRange(rng, 0.035, 0.13),
      phase: randRange(rng, 0, Math.PI * 2),
      lean: randRange(rng, -0.018, 0.026),
      color: rng() > 0.62 ? 0xbcffb0 : rng() > 0.42 ? 0xffa25d : 0x9d63e5,
    });
  }

  for (let i = 0; i < 15; i += 1) {
    topWires.push({
      x: randRange(rng, 0.14, 0.86),
      drop: randRange(rng, 0.04, 0.23),
      phase: randRange(rng, 0, Math.PI * 2),
      color: i % 3 === 0 ? 0xffa25d : i % 3 === 1 ? 0x9d63e5 : 0xbcffb0,
    });
  }

  for (let i = 0; i < 18; i += 1) {
    floorSheens.push({
      side: i % 2 === 0 ? -1 : 1,
      spread: randRange(rng, 0.16, 0.92),
      depth: randRange(rng, 0.1, 1),
      phase: randRange(rng, 0, Math.PI * 2),
      color: i % 3 === 0 ? 0xffa25d : i % 3 === 1 ? 0xbcffb0 : 0x9d63e5,
    });
  }

  return {
    container,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse) {
      drawArcReveal(shade, glints, sideSlats, topWires, floorSheens, t, w, h, lookX, lookY, axis, breathe, slowPulse);
    },
  };
}

function drawArcReveal(shade, glints, sideSlats, topWires, floorSheens, t, w, h, lookX, lookY, axis, breathe, slowPulse) {
  const sideAmount = Math.min(1, Math.abs(lookX) / Math.max(CAMERA.orbitLimitX, 0.0001));
  const upAmount = Math.min(1, Math.max(0, -lookY) / Math.max(CAMERA.orbitLimitY, 0.0001));
  const downAmount = Math.min(1, Math.max(0, lookY) / Math.max(CAMERA.orbitLimitY, 0.0001));
  const active = Math.max(sideAmount, upAmount, downAmount);
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;

  shade.clear();
  glints.clear();
  shade.alpha = 0.56 + breathe * 0.08;
  glints.alpha = 0.48 + slowPulse * 0.16;

  for (const side of [-1, 1]) {
    const reveal = Math.max(0, side * lookX) / Math.max(CAMERA.orbitLimitX, 0.0001);
    const occlude = Math.max(0, -side * lookX) / Math.max(CAMERA.orbitLimitX, 0.0001);
    const edgeX = side < 0 ? 0 : w;
    const innerX = side < 0 ? w * (0.14 + reveal * 0.052) : w * (0.86 - reveal * 0.052);
    const throatX = side < 0 ? w * (0.25 + reveal * 0.034) : w * (0.75 - reveal * 0.034);
    const lowX = side < 0 ? w * (0.18 + reveal * 0.05) : w * (0.82 - reveal * 0.05);

    shade.beginFill(0x040107, 0.2 + occlude * 0.18 + active * 0.035);
    shade.drawPolygon([
      edgeX, 0,
      innerX, h * 0.03,
      throatX, h * 0.34 + lookY * h * 0.018,
      lowX, h,
      edgeX, h,
    ]);
    shade.endFill();

    shade.beginFill(0x15071f, 0.06 + reveal * 0.08);
    shade.drawPolygon([
      edgeX + side * w * 0.055, h * 0.09,
      edgeX + side * w * (0.17 + reveal * 0.04), h * 0.13,
      edgeX + side * w * (0.13 + reveal * 0.02), h * 0.78,
      edgeX + side * w * 0.04, h * 0.88,
    ]);
    shade.endFill();
  }

  shade.beginFill(0x050109, 0.08 + upAmount * 0.18);
  shade.drawPolygon([
    0, 0,
    w, 0,
    w * (0.84 - lookX * 0.018), h * (0.17 + upAmount * 0.035),
    w * (0.18 - lookX * 0.016), h * (0.2 + upAmount * 0.045),
  ]);
  shade.endFill();

  shade.beginFill(0x07020b, 0.06 + downAmount * 0.1);
  shade.drawPolygon([
    w * 0.08, h,
    w * 0.94, h,
    w * (0.76 + lookX * 0.03), h * (0.78 - downAmount * 0.018),
    w * (0.28 + lookX * 0.025), h * (0.79 - downAmount * 0.012),
  ]);
  shade.endFill();

  for (const slat of sideSlats) {
    const sideReveal = Math.max(0, slat.side * lookX) / Math.max(CAMERA.orbitLimitX, 0.0001);
    const edgeX = slat.side < 0 ? w * slat.lane : w * (1 - slat.lane);
    const y = h * slat.y + lookY * h * (0.006 + sideReveal * 0.014) + Math.sin(t * 0.23 + slat.phase) * h * 0.002;
    const len = w * slat.length * (0.75 + sideReveal * 0.72);
    const alpha = (0.018 + sideReveal * 0.104 + slowPulse * 0.015) * (slat.color === 0xbcffb0 ? 0.82 : 1);
    const width = 0.75 + sideReveal * 1.45;

    glints.lineStyle(width, slat.color, alpha);
    glints.moveTo(edgeX, y);
    glints.lineTo(edgeX + slat.side * len, y + h * (slat.lean + lookY * 0.006));

    if (sideReveal > 0.18 && slat.y > 0.18 && slat.y < 0.76) {
      glints.lineStyle(Math.max(0.65, width * 0.55), slat.color, alpha * 0.42);
      glints.moveTo(edgeX + slat.side * len * 0.35, y + h * 0.012);
      glints.lineTo(edgeX + slat.side * len * 0.72, y - h * 0.02);
    }
  }

  for (const wire of topWires) {
    const sway = Math.sin(t * 0.16 + wire.phase) * 0.006 + lookX * 0.012;
    const x = w * (wire.x + sway);
    const y0 = h * (0.03 + upAmount * 0.008);
    const y1 = h * (wire.drop + upAmount * 0.06 + Math.sin(t * 0.12 + wire.phase) * 0.008);
    const alpha = 0.016 + upAmount * 0.082 + slowPulse * 0.01;

    glints.lineStyle(0.9 + upAmount * 1.1, wire.color, alpha);
    glints.moveTo(x, y0);
    glints.lineTo(x + w * sway * 0.8, y1);
  }

  for (const sheen of floorSheens) {
    const y = floorY + h * (0.04 + sheen.depth * 0.12 + downAmount * 0.03);
    const x0 = floorX + sheen.side * w * (0.08 + sheen.spread * 0.36) + lookX * w * 0.018;
    const x1 = floorX + sheen.side * w * (0.18 + sheen.spread * 0.48) + lookX * w * 0.026;
    const wave = Math.sin(t * 0.28 + sheen.phase) * 0.5 + 0.5;
    const alpha = 0.014 + downAmount * 0.074 + wave * 0.018;

    glints.lineStyle(0.8 + sheen.depth * 1.4, sheen.color, alpha);
    glints.moveTo(x0, y);
    glints.quadraticCurveTo((x0 + x1) * 0.5, y - h * (0.012 + downAmount * 0.012), x1, y + h * 0.006);
  }

  if (axis === 'center') {
    glints.lineStyle(1.2, 0x9d63e5, 0.025 + breathe * 0.018);
    glints.drawEllipse(floorX, floorY - h * 0.016, w * 0.11, h * 0.026);
  }
}

function makeVolumetricDepthSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('axis-bound-slit-haze');
  const beams = [];
  const cuts = [];

  for (let i = 0; i < 18; i += 1) {
    beams.push({
      side: i % 2 === 0 ? -1 : 1,
      x: randRange(rng, 0.18, 0.82),
      y: randRange(rng, 0.02, 0.22),
      length: randRange(rng, 0.26, 0.68),
      width: randRange(rng, 0.012, 0.035),
      phase: randRange(rng, 0, Math.PI * 2),
      color: rng() > 0.55 ? 0x9d63e5 : rng() > 0.42 ? 0xffa25d : 0xbcffb0,
      depth: randRange(rng, 0.2, 1),
    });
  }

  for (let i = 0; i < 22; i += 1) {
    cuts.push({
      y: randRange(rng, 0.18, 0.82),
      spread: randRange(rng, -0.85, 0.85),
      width: randRange(rng, 0.025, 0.11),
      phase: randRange(rng, 0, Math.PI * 2),
      color: i % 3 === 0 ? 0xffa25d : i % 3 === 1 ? 0x9d63e5 : 0xbcffb0,
    });
  }

  return {
    graphics,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse) {
      drawVolumetricDepth(graphics, beams, cuts, t, w, h, lookX, lookY, axis, breathe, slowPulse);
    },
  };
}

function drawVolumetricDepth(g, beams, cuts, t, w, h, lookX, lookY, axis, breathe, slowPulse) {
  const axisStrength = axis === 'x' ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX) : axis === 'y' ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY) : 0;
  const vanishX = w * (0.53 - lookX * 0.026);
  const vanishY = h * (0.37 + lookY * 0.028);
  const clearCenterX = w * 0.53;
  const clearCenterY = h * 0.54;

  g.clear();
  g.alpha = 0.5 + breathe * 0.08;

  for (const beam of beams) {
    const pulse = 0.5 + Math.sin(t * (0.12 + beam.depth * 0.1) + beam.phase) * 0.5;
    const x0 = w * beam.x + lookX * w * (0.014 + beam.depth * 0.018) + Math.sin(t * 0.07 + beam.phase) * w * 0.004;
    const y0 = h * beam.y + lookY * h * 0.012;
    const x1 = vanishX + beam.side * w * (0.02 + beam.width * 1.6 + axisStrength * 0.014);
    const y1 = h * (beam.y + beam.length) + lookY * h * (0.018 + beam.depth * 0.018);
    const half = w * beam.width * (0.38 + beam.depth * 0.5);
    const centerDistance = Math.hypot((x1 - clearCenterX) / w, (y1 - clearCenterY) / h);
    const centerSoftener = clamp(centerDistance * 2.7, 0.28, 1);
    const alpha = (0.012 + pulse * 0.035 + axisStrength * 0.018 + slowPulse * 0.01) * centerSoftener * (beam.color === 0xbcffb0 ? 0.64 : 1);

    g.beginFill(beam.color, alpha);
    g.drawPolygon([
      x0 - half, y0,
      x0 + half * 0.7, y0 + h * 0.012,
      x1 + half * 1.8, y1,
      x1 - half * 1.2, y1 + h * 0.018,
    ]);
    g.endFill();
  }

  for (const cut of cuts) {
    const y = h * cut.y + lookY * h * 0.02 + Math.sin(t * 0.11 + cut.phase) * h * 0.002;
    const x = vanishX + cut.spread * w * (0.12 + Math.abs(cut.spread) * 0.28) + lookX * w * 0.018;
    const len = w * cut.width * (0.8 + axisStrength * 0.8);
    const alpha = 0.016 + Math.max(0, Math.sin(t * 0.32 + cut.phase)) * 0.036 + axisStrength * 0.018;

    g.lineStyle(0.7 + axisStrength * 1.1, cut.color, alpha * (cut.color === 0xbcffb0 ? 0.7 : 1));
    g.moveTo(x - len, y);
    g.lineTo(x + len * 0.92, y + h * 0.006);
  }
}

function makeFocusApertureSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('peripheral-depth-focus');
  const sideThreads = [];
  const apertureTicks = [];

  for (let i = 0; i < 26; i += 1) {
    sideThreads.push({
      side: i % 2 === 0 ? -1 : 1,
      depth: randRange(rng, 0.12, 1),
      lane: randRange(rng, 0.08, 0.46),
      phase: randRange(rng, 0, Math.PI * 2),
      color: rng() > 0.58 ? 0xffa25d : rng() > 0.36 ? 0xbcffb0 : 0x9d63e5,
    });
  }

  for (let i = 0; i < 32; i += 1) {
    apertureTicks.push({
      angle: (Math.PI * 2 * i) / 32 + randRange(rng, -0.035, 0.035),
      radius: randRange(rng, 0.74, 1.24),
      phase: randRange(rng, 0, Math.PI * 2),
      length: randRange(rng, 0.018, 0.044),
      color: i % 4 === 0 ? 0xbcffb0 : i % 4 === 1 ? 0xffa25d : 0x9d63e5,
    });
  }

  return {
    graphics,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse) {
      drawFocusAperture(graphics, sideThreads, apertureTicks, t, w, h, lookX, lookY, axis, breathe, slowPulse);
    },
  };
}

function drawFocusAperture(g, sideThreads, apertureTicks, t, w, h, lookX, lookY, axis, breathe, slowPulse) {
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;
  const vanishX = w * (0.53 - lookX * 0.022);
  const vanishY = h * (0.48 + lookY * 0.014);
  const axisStrength = axis === 'x' ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX) : axis === 'y' ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY) : 0;
  const pulse = 0.5 + Math.sin(t * 0.26) * 0.5;

  g.clear();
  g.alpha = 0.58 + breathe * 0.08;

  for (let i = 0; i < 5; i += 1) {
    const progress = i / 4;
    const rx = w * (0.085 + progress * 0.16 + axisStrength * 0.012);
    const ry = h * (0.024 + progress * 0.052 + pulse * 0.006);
    const y = floorY - h * (0.018 + progress * 0.17) + lookY * h * 0.014;
    const alpha = 0.024 + (1 - progress) * 0.034 + slowPulse * 0.012;
    const color = i % 2 === 0 ? 0x9d63e5 : 0xffa25d;

    g.lineStyle(0.8 + progress * 1.4, color, alpha);
    g.drawEllipse(floorX + lookX * w * 0.006, y, rx, ry);
  }

  for (const thread of sideThreads) {
    const reveal = Math.max(0.18, axis === 'x' ? Math.max(0.18, thread.side * lookX / CAMERA.orbitLimitX) : 0.34 + axisStrength * 0.16);
    const x0 = floorX + thread.side * w * (0.07 + thread.lane * 0.34) + lookX * w * 0.015;
    const y0 = floorY - h * (0.03 + thread.depth * 0.08);
    const x1 = vanishX + thread.side * w * (0.03 + thread.lane * 0.16);
    const y1 = vanishY + h * (thread.depth * 0.12 - 0.035);
    const controlX = (x0 + x1) * 0.5 + thread.side * w * (0.02 + axisStrength * 0.018);
    const controlY = h * (0.62 - thread.depth * 0.09 + Math.sin(t * 0.18 + thread.phase) * 0.006);
    const localPulse = Math.max(0, Math.sin(t * 0.44 + thread.phase));
    const alpha = (0.012 + reveal * 0.034 + localPulse * 0.022) * (thread.color === 0xbcffb0 ? 0.76 : 1);

    g.lineStyle(0.65 + thread.depth * 1.2, thread.color, alpha);
    g.moveTo(x0, y0);
    g.quadraticCurveTo(controlX, controlY, x1, y1);
  }

  const apertureX = vanishX + lookX * w * 0.008;
  const apertureY = vanishY + lookY * h * 0.012;
  const apertureRx = w * (0.13 + axisStrength * 0.018);
  const apertureRy = h * (0.092 + pulse * 0.008);

  g.lineStyle(1.15, 0x9d63e5, 0.032 + slowPulse * 0.012);
  g.drawEllipse(apertureX, apertureY, apertureRx, apertureRy);
  g.lineStyle(0.75, 0xffa25d, 0.026 + pulse * 0.012);
  g.drawEllipse(apertureX, apertureY + h * 0.006, apertureRx * 0.68, apertureRy * 0.46);

  for (const tick of apertureTicks) {
    const angle = tick.angle + lookX * 0.08 + Math.sin(t * 0.08 + tick.phase) * 0.012;
    const radiusPulse = tick.radius + Math.sin(t * 0.24 + tick.phase) * 0.03;
    const x = apertureX + Math.cos(angle) * apertureRx * radiusPulse;
    const y = apertureY + Math.sin(angle) * apertureRy * radiusPulse + lookY * h * 0.004;
    const len = w * tick.length * (0.72 + axisStrength * 0.52);
    const alpha = 0.018 + axisStrength * 0.036 + Math.max(0, Math.sin(t * 0.5 + tick.phase)) * 0.024;

    g.lineStyle(0.7 + axisStrength * 0.65, tick.color, alpha * (tick.color === 0xbcffb0 ? 0.78 : 1));
    g.moveTo(x - Math.cos(angle) * len * 0.35, y - Math.sin(angle) * len * 0.18);
    g.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len * 0.5);
  }
}

function makeThresholdLensSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('private-threshold-depth-lens');
  const panes = [];
  const sparks = [];

  for (let i = 0; i < 24; i += 1) {
    panes.push({
      side: i % 2 === 0 ? -1 : 1,
      spread: randRange(rng, 0.08, 0.72),
      depth: randRange(rng, 0.08, 0.95),
      phase: randRange(rng, 0, Math.PI * 2),
      color: i % 5 === 0 ? 0xbcffb0 : i % 3 === 0 ? 0xffa25d : 0x9d63e5,
    });
  }

  for (let i = 0; i < 28; i += 1) {
    sparks.push({
      lane: randRange(rng, -1, 1),
      depth: randRange(rng, 0.12, 1),
      phase: randRange(rng, 0, Math.PI * 2),
      size: randRange(rng, 0.8, 2.4),
      color: rng() > 0.72 ? 0xbcffb0 : rng() > 0.42 ? 0xffa25d : 0x9d63e5,
    });
  }

  return {
    graphics,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse) {
      drawThresholdLens(graphics, panes, sparks, t, w, h, lookX, lookY, axis, breathe, slowPulse);
    },
  };
}

function drawThresholdLens(g, panes, sparks, t, w, h, lookX, lookY, axis, breathe, slowPulse) {
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;
  const vanishX = w * (0.53 - lookX * 0.016);
  const vanishY = h * (0.43 + lookY * 0.016);
  const sideStrength = axis === 'x' ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX) : 0;
  const verticalStrength = axis === 'y' ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY) : 0;
  const active = Math.max(sideStrength, verticalStrength);
  const downReveal = Math.max(0, lookY) / CAMERA.orbitLimitY;
  const upReveal = Math.max(0, -lookY) / CAMERA.orbitLimitY;

  g.clear();
  g.alpha = 0.42 + breathe * 0.08;

  for (let i = 0; i < 5; i += 1) {
    const progress = i / 4;
    const radiusPulse = Math.sin(t * 0.18 + progress * 2.4) * 0.5 + 0.5;
    const rx = w * (0.105 + progress * 0.112 + active * 0.014 + radiusPulse * 0.004);
    const ry = h * (0.018 + progress * 0.027 + downReveal * 0.009);
    const x = floorX + lookX * w * 0.003;
    const y = floorY - h * (0.004 + progress * 0.046) + lookY * h * 0.007;
    const alpha = 0.018 + (1 - progress) * 0.023 + slowPulse * 0.01 + active * 0.008;
    const color = i % 3 === 0 ? 0xffa25d : i % 3 === 1 ? 0x9d63e5 : 0xbcffb0;

    g.lineStyle(0.55 + progress * 0.55, color, alpha * (color === 0xbcffb0 ? 0.72 : 1));
    g.drawEllipse(x, y, rx, ry);
  }

  for (const pane of panes) {
    const sideReveal = axis === 'x'
      ? Math.max(0.18, pane.side * lookX / CAMERA.orbitLimitX)
      : 0.24 + verticalStrength * 0.1;
    const wave = Math.sin(t * 0.17 + pane.phase) * 0.5 + 0.5;
    const baseX = floorX + pane.side * w * (0.12 + pane.spread * 0.34) + lookX * w * 0.008;
    const baseY = floorY - h * (0.018 + pane.depth * 0.16) + lookY * h * 0.006;
    const topX = vanishX + pane.side * w * (0.018 + pane.spread * 0.08);
    const topY = vanishY - h * (0.026 + pane.depth * 0.11 + upReveal * 0.022);
    const controlX = (baseX + topX) * 0.5 + pane.side * w * (0.018 + sideStrength * 0.024);
    const controlY = h * (0.57 - pane.depth * 0.08 + Math.sin(t * 0.11 + pane.phase) * 0.004);
    const alpha = (0.01 + sideReveal * 0.026 + wave * 0.014 + active * 0.008) * (pane.color === 0xbcffb0 ? 0.68 : 1);

    g.lineStyle(0.55 + pane.depth * 0.95 + active * 0.35, pane.color, alpha);
    g.moveTo(baseX, baseY);
    g.quadraticCurveTo(controlX, controlY, topX, topY);
  }

  for (const spark of sparks) {
    const progress = (spark.depth + t * 0.018 + Math.sin(t * 0.035 + spark.phase) * 0.018) % 1;
    const lane = spark.lane + lookX * 0.045;
    const x = floorX + lane * w * (0.06 + progress * 0.31);
    const y = floorY - h * (0.028 + progress * (0.22 + verticalStrength * 0.05)) + lookY * h * 0.008;
    const alpha = (0.016 + Math.max(0, Math.sin(t * 0.52 + spark.phase)) * 0.05 + active * 0.012) * (spark.color === 0xbcffb0 ? 0.66 : 1);

    g.beginFill(spark.color, alpha);
    g.drawCircle(x, y, spark.size * (0.6 + progress * 0.7));
    g.endFill();
  }
}

function makeThresholdPressureSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('peripheral-threshold-pressure');
  const sideThreads = [];
  const floorCuts = [];

  for (let i = 0; i < 30; i += 1) {
    sideThreads.push({
      side: i % 2 === 0 ? -1 : 1,
      lane: randRange(rng, 0.06, 0.25),
      y: randRange(rng, 0.13, 0.78),
      reach: randRange(rng, 0.09, 0.28),
      phase: randRange(rng, 0, Math.PI * 2),
      depth: randRange(rng, 0.16, 1),
      color: i % 5 === 0 ? 0xbcffb0 : i % 3 === 0 ? 0xffa25d : 0x9d63e5,
    });
  }

  for (let i = 0; i < 18; i += 1) {
    floorCuts.push({
      side: i % 2 === 0 ? -1 : 1,
      angle: randRange(rng, -0.9, 0.9),
      radius: randRange(rng, 0.72, 1.22),
      phase: randRange(rng, 0, Math.PI * 2),
      length: randRange(rng, 0.022, 0.07),
      color: i % 4 === 0 ? 0xbcffb0 : i % 4 === 1 ? 0xffa25d : 0x9d63e5,
    });
  }

  return {
    graphics,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse) {
      drawThresholdPressure(graphics, sideThreads, floorCuts, t, w, h, lookX, lookY, axis, breathe, slowPulse);
    },
  };
}

function drawThresholdPressure(g, sideThreads, floorCuts, t, w, h, lookX, lookY, axis, breathe, slowPulse) {
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;
  const vanishX = w * (0.53 - lookX * 0.018);
  const vanishY = h * (0.47 + lookY * 0.016);
  const sideStrength = axis === 'x' ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX) : 0;
  const verticalStrength = axis === 'y' ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY) : 0;
  const active = Math.max(sideStrength, verticalStrength);
  const pulse = 0.5 + Math.sin(t * 0.31) * 0.5;

  g.clear();
  g.alpha = 0.28 + breathe * 0.08 + active * 0.05;

  for (const thread of sideThreads) {
    const reveal = axis === 'x'
      ? clamp(0.18 + thread.side * lookX / CAMERA.orbitLimitX, 0.08, 1)
      : 0.24 + verticalStrength * 0.16;
    const wave = Math.max(0, Math.sin(t * (0.24 + thread.depth * 0.18) + thread.phase));
    const edgeX = thread.side < 0 ? w * thread.lane : w * (1 - thread.lane);
    const y0 = h * thread.y + lookY * h * (0.004 + thread.depth * 0.012);
    const x1 = vanishX + thread.side * w * (0.018 + thread.reach * 0.18) + lookX * w * 0.006;
    const y1 = vanishY + h * (thread.y - 0.5) * 0.26 + lookY * h * 0.012;
    const controlX = edgeX + thread.side * w * (thread.reach * (0.48 + reveal * 0.22));
    const controlY = (y0 + y1) * 0.5 + Math.sin(t * 0.11 + thread.phase) * h * 0.01;
    const alpha = (0.012 + reveal * 0.026 + wave * 0.026 + slowPulse * 0.008) * (thread.color === 0xbcffb0 ? 0.62 : 1);

    g.lineStyle(0.55 + thread.depth * 1.08 + active * 0.42, thread.color, alpha);
    g.moveTo(edgeX, y0);
    g.bezierCurveTo(controlX, controlY, controlX * 0.64 + x1 * 0.36, y1 + h * 0.02, x1, y1);
  }

  for (let i = 0; i < 4; i += 1) {
    const progress = i / 3;
    const rx = w * (0.145 + progress * 0.075 + active * 0.01 + pulse * 0.004);
    const ry = h * (0.027 + progress * 0.018 + verticalStrength * 0.006);
    const alpha = 0.014 + (1 - progress) * 0.018 + active * 0.012;
    const y = floorY - h * (0.006 + progress * 0.05) + lookY * h * 0.005;

    g.lineStyle(0.6 + progress * 0.6, progress % 2 === 0 ? 0xffa25d : 0x9d63e5, alpha);
    g.drawEllipse(floorX + lookX * w * 0.004, y, rx, ry);
  }

  for (const cut of floorCuts) {
    const angle = cut.angle + lookX * 0.16 + Math.sin(t * 0.08 + cut.phase) * 0.025;
    const sideBias = cut.side * (0.16 + sideStrength * 0.04);
    const x = floorX + Math.sin(angle) * w * (0.11 + cut.radius * 0.075) + sideBias * w * 0.18;
    const y = floorY - h * (0.016 + Math.cos(angle) * 0.035 + verticalStrength * 0.012) + lookY * h * 0.006;
    const len = w * cut.length * (0.6 + active * 0.45);
    const alpha = 0.014 + Math.max(0, Math.sin(t * 0.38 + cut.phase)) * 0.034 + active * 0.01;

    g.lineStyle(0.55 + active * 0.75, cut.color, alpha * (cut.color === 0xbcffb0 ? 0.66 : 1));
    g.moveTo(x - len, y);
    g.lineTo(x + len * 0.8, y + h * 0.004);
  }
}

function makeDepthShearSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('axis-bound-anamorphic-depth-shear');
  const sideNeedles = [];
  const floorNeedles = [];

  for (let i = 0; i < 30; i += 1) {
    sideNeedles.push({
      side: i % 2 === 0 ? -1 : 1,
      lane: randRange(rng, 0.055, 0.21),
      y: randRange(rng, 0.12, 0.79),
      reach: randRange(rng, 0.045, 0.16),
      depth: randRange(rng, 0.18, 1),
      phase: randRange(rng, 0, Math.PI * 2),
      color: i % 5 === 0 ? 0xbcffb0 : i % 3 === 0 ? 0xffa25d : 0x9d63e5,
    });
  }

  for (let i = 0; i < 22; i += 1) {
    floorNeedles.push({
      side: i % 2 === 0 ? -1 : 1,
      spread: randRange(rng, 0.28, 0.86),
      depth: randRange(rng, 0.12, 0.94),
      phase: randRange(rng, 0, Math.PI * 2),
      color: i % 4 === 0 ? 0xffa25d : i % 4 === 1 ? 0xbcffb0 : 0x9d63e5,
    });
  }

  return {
    graphics,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse, portraitFactor) {
      drawDepthShear(graphics, sideNeedles, floorNeedles, t, w, h, lookX, lookY, axis, breathe, slowPulse, portraitFactor);
    },
  };
}

function drawDepthShear(g, sideNeedles, floorNeedles, t, w, h, lookX, lookY, axis, breathe, slowPulse, portraitFactor) {
  const sideStrength = axis === 'x' ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX) : 0;
  const verticalStrength = axis === 'y' ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY) : 0;
  const active = Math.max(sideStrength, verticalStrength);
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;
  const vanishX = w * (0.53 - lookX * 0.014);
  const vanishY = h * (0.47 + lookY * 0.012);

  g.clear();
  g.alpha = clamp(0.15 + breathe * 0.038 + active * 0.058 - portraitFactor * 0.026, 0.12, 0.25);

  for (const needle of sideNeedles) {
    const reveal = axis === 'x'
      ? clamp(0.12 + needle.side * lookX / CAMERA.orbitLimitX, 0.02, 1)
      : 0.14 + verticalStrength * 0.18;
    const wave = Math.max(0, Math.sin(t * (0.22 + needle.depth * 0.18) + needle.phase));
    const edgeX = needle.side < 0 ? w * needle.lane : w * (1 - needle.lane);
    const y0 = h * needle.y + lookY * h * (0.006 + needle.depth * 0.012);
    const x1 = vanishX + needle.side * w * (0.018 + needle.reach * 0.24) + lookX * w * 0.004;
    const y1 = vanishY + h * (needle.y - 0.5) * 0.18 + Math.sin(t * 0.11 + needle.phase) * h * 0.004;
    const controlX = edgeX + needle.side * w * (0.06 + needle.reach * (0.62 + reveal * 0.16));
    const controlY = y0 * 0.62 + y1 * 0.38;
    const alpha = (0.012 + reveal * 0.048 + wave * 0.018 + slowPulse * 0.006) * (needle.color === 0xbcffb0 ? 0.58 : 1);

    g.lineStyle(0.42 + needle.depth * 0.9 + active * 0.28, needle.color, alpha);
    g.moveTo(edgeX, y0);
    g.quadraticCurveTo(controlX, controlY, x1, y1);
  }

  for (const needle of floorNeedles) {
    const activeFloor = axis === 'y'
      ? clamp(0.16 + Math.abs(lookY) / CAMERA.orbitLimitY, 0.08, 1)
      : 0.16 + sideStrength * 0.28;
    const wave = Math.max(0, Math.sin(t * 0.32 + needle.phase));
    const x0 = floorX + needle.side * w * (0.16 + needle.spread * 0.18) + lookX * w * 0.012;
    const x1 = floorX + needle.side * w * (0.26 + needle.spread * 0.31) + lookX * w * 0.018;
    const y = floorY + h * (0.02 + needle.depth * 0.12 + Math.max(0, lookY) * 0.026);
    const rise = h * (0.014 + needle.depth * 0.018 + verticalStrength * 0.018);
    const alpha = (0.01 + activeFloor * 0.044 + wave * 0.018) * (needle.color === 0xbcffb0 ? 0.62 : 1);

    g.lineStyle(0.48 + needle.depth * 0.86 + active * 0.22, needle.color, alpha);
    g.moveTo(x0, y);
    g.quadraticCurveTo((x0 + x1) * 0.5, y - rise, x1, y + h * 0.006);
  }
}

function makeSideSeparationSystem() {
  const container = new Container();
  const shade = new Graphics();
  const cuts = new Graphics();
  shade.blendMode = BLEND_MODES.MULTIPLY;
  cuts.blendMode = BLEND_MODES.ADD;
  container.addChild(shade, cuts);

  return {
    container,
    alpha: 0,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse, portraitFactor) {
      this.alpha = drawSideSeparation(shade, cuts, t, w, h, lookX, lookY, axis, breathe, slowPulse, portraitFactor);
    },
  };
}

function drawSideSeparation(shade, cuts, t, w, h, lookX, lookY, axis, breathe, slowPulse, portraitFactor) {
  const sideStrength = axis === 'x' ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX) : 0;
  const verticalStrength = axis === 'y' ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY) : 0;
  const active = Math.max(sideStrength, verticalStrength);
  const alpha = clamp(0.145 + breathe * 0.018 + active * 0.026 - portraitFactor * 0.012, 0.13, 0.23);
  const centerY = h * (0.52 + lookY * 0.01);
  const planeFill = clamp(0.34 + active * 0.07 - portraitFactor * 0.08, 0.22, 0.42);
  const innerFill = clamp(0.14 + verticalStrength * 0.04 - portraitFactor * 0.04, 0.08, 0.2);

  shade.clear();
  shade.alpha = alpha;

  for (const side of [-1, 1]) {
    const reveal = axis === 'x'
      ? clamp(side * lookX / CAMERA.orbitLimitX, -0.2, 1)
      : 0.16 + verticalStrength * 0.14;
    const edgeX = side < 0 ? -w * 0.08 : w * 1.08;
    const innerTop = side < 0 ? w * (0.2 + reveal * 0.035) : w * (0.82 - reveal * 0.035);
    const innerMid = side < 0 ? w * (0.28 + reveal * 0.038) : w * (0.74 - reveal * 0.038);
    const innerLow = side < 0 ? w * (0.18 + reveal * 0.032) : w * (0.86 - reveal * 0.032);

    shade.beginFill(0x050108, planeFill);
    shade.drawPolygon([
      edgeX, -h * 0.08,
      innerTop + lookX * w * 0.01, h * 0.06,
      innerMid, centerY + h * 0.1,
      innerLow + lookX * w * 0.012, h * 1.08,
      edgeX, h * 1.08,
    ]);
    shade.endFill();

    shade.beginFill(0x11051a, innerFill);
    shade.drawPolygon([
      edgeX, h * 0.18,
      innerTop + side * w * 0.045, h * (0.2 + lookY * 0.018),
      innerMid + side * w * 0.028, h * 0.72,
      edgeX, h * 0.9,
    ]);
    shade.endFill();
  }

  cuts.clear();
  cuts.alpha = 0.28 + slowPulse * 0.08 + active * 0.08;

  for (let i = 0; i < 10; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const depth = i / 9;
    const x = side < 0 ? w * (0.13 + depth * 0.08) : w * (0.87 - depth * 0.08);
    const y = h * (0.16 + depth * 0.58) + Math.sin(t * 0.12 + i) * h * 0.004 + lookY * h * 0.01;
    const len = w * (0.045 + depth * 0.04 + active * 0.012);
    const color = i % 3 === 0 ? 0xffa25d : i % 3 === 1 ? 0x9d63e5 : 0xbcffb0;
    const lineAlpha = (0.018 + active * 0.045 + Math.max(0, Math.sin(t * 0.36 + i)) * 0.022) * (color === 0xbcffb0 ? 0.64 : 1);

    cuts.lineStyle(0.65 + depth * 0.8 + active * 0.35, color, lineAlpha);
    cuts.moveTo(x, y);
    cuts.lineTo(x + side * len, y + h * (0.012 - depth * 0.006));
  }

  return alpha;
}

function makePresenceTraceSystem() {
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  const rng = createRng('non-ui-directional-presence-memory');
  const memory = { left: 0, right: 0, up: 0, down: 0 };
  const scars = [];

  for (let i = 0; i < 36; i += 1) {
    scars.push({
      lane: randRange(rng, -1, 1),
      depth: randRange(rng, 0.08, 1),
      phase: randRange(rng, 0, Math.PI * 2),
      width: randRange(rng, 0.004, 0.014),
      color: i % 6 === 0 ? 0xbcffb0 : i % 3 === 0 ? 0xffa25d : 0x9d63e5,
    });
  }

  return {
    graphics,
    peak: 0,
    update(t, w, h, lookX, lookY, axis, breathe, slowPulse) {
      const active = updatePresenceMemory(memory, lookX, lookY, axis);
      this.peak = Math.max(memory.left, memory.right, memory.up, memory.down);
      drawPresenceTrace(graphics, scars, memory, active, t, w, h, lookX, lookY, breathe, slowPulse);
    },
  };
}

function updatePresenceMemory(memory, lookX, lookY, axis) {
  const direction = axis === 'x'
    ? lookX < 0 ? 'left' : 'right'
    : axis === 'y'
      ? lookY < 0 ? 'up' : 'down'
      : 'center';
  const strength = axis === 'x'
    ? Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX)
    : axis === 'y'
      ? Math.min(1, Math.abs(lookY) / CAMERA.orbitLimitY)
      : 0;

  for (const key of ['left', 'right', 'up', 'down']) {
    const decay = key === direction ? 0.982 : 0.992;
    memory[key] = clamp(memory[key] * decay, 0, 0.68);
  }

  if (direction !== 'center') {
    memory[direction] = clamp(memory[direction] + strength * 0.016, 0, 0.68);
  }

  return { direction, strength };
}

function drawPresenceTrace(g, scars, memory, active, t, w, h, lookX, lookY, breathe, slowPulse) {
  const floorX = w * ANCHOR.floorCircleX;
  const floorY = h * ANCHOR.floorCircleY;
  const directions = [
    { key: 'left', side: -1, color: 0x9d63e5, vertical: 0 },
    { key: 'right', side: 1, color: 0xffa25d, vertical: 0 },
    { key: 'up', side: 0, color: 0xbcffb0, vertical: -1 },
    { key: 'down', side: 0, color: 0x9d63e5, vertical: 1 },
  ];

  g.clear();
  g.alpha = 0.46 + breathe * 0.06;

  for (const item of directions) {
    const charge = memory[item.key];
    if (charge < 0.012) continue;

    const isVertical = item.vertical !== 0;
    const directionPulse = Math.sin(t * 0.34 + charge * 8) * 0.5 + 0.5;
    const alpha = 0.018 + charge * 0.116 + directionPulse * 0.012;
    const width = 0.7 + charge * 2.2;
    const reach = isVertical ? h * (0.08 + charge * 0.18) : w * (0.12 + charge * 0.26);
    const x0 = floorX + lookX * w * 0.003;
    const y0 = floorY + lookY * h * 0.004;
    const x1 = isVertical ? floorX + lookX * w * 0.006 : floorX + item.side * reach;
    const y1 = isVertical ? floorY + item.vertical * reach : floorY - h * (0.026 + charge * 0.08);
    const controlX = isVertical ? floorX + lookX * w * 0.016 : floorX + item.side * reach * 0.46;
    const controlY = isVertical ? (y0 + y1) * 0.5 : floorY - h * (0.008 + charge * 0.14);

    g.lineStyle(width, item.color, alpha * (item.color === 0xbcffb0 ? 0.68 : 1));
    g.moveTo(x0, y0);
    g.quadraticCurveTo(controlX, controlY, x1, y1);

    g.lineStyle(Math.max(0.55, width * 0.55), item.color, alpha * 0.44);
    g.drawEllipse(
      floorX + (isVertical ? 0 : item.side * reach * 0.28),
      floorY - h * (0.012 + charge * 0.028) + (isVertical ? item.vertical * reach * 0.18 : 0),
      w * (0.05 + charge * 0.12),
      h * (0.01 + charge * 0.028),
    );
  }

  const totalMemory = clamp(memory.left + memory.right + memory.up + memory.down, 0, 1.6);
  for (const scar of scars) {
    const sideBias = scar.lane < 0 ? memory.left : memory.right;
    const verticalBias = scar.lane < 0 ? memory.up : memory.down;
    const charge = clamp(0.18 * totalMemory + sideBias * 0.42 + verticalBias * 0.22, 0, 0.78);
    if (charge < 0.03) continue;

    const progress = (scar.depth + t * (0.012 + charge * 0.018) + Math.sin(t * 0.05 + scar.phase) * 0.012) % 1;
    const spread = scar.lane * w * (0.09 + progress * 0.34);
    const x = floorX + spread + lookX * w * 0.006;
    const y = floorY - h * (0.012 + progress * (0.08 + charge * 0.18)) + lookY * h * 0.006;
    const length = w * scar.width * (0.6 + charge * 1.4);
    const alpha = (0.01 + charge * 0.048 + Math.max(0, Math.sin(t * 0.47 + scar.phase)) * 0.022) * (scar.color === 0xbcffb0 ? 0.62 : 1);
    const lean = scar.lane * 0.35 + (active.direction === 'left' ? -0.08 : active.direction === 'right' ? 0.08 : 0);

    g.lineStyle(0.55 + charge * 0.9, scar.color, alpha);
    g.moveTo(x - length, y);
    g.lineTo(x + length * (1 + Math.abs(lean)), y + h * scar.width * lean);
  }
}

function makeLivingSignalSystem() {
  const container = new Container();
  const wallSignals = [];
  const floorSignals = [];
  const rng = createRng('living-signal-system');

  for (let i = 0; i < 42; i += 1) {
    const g = new Graphics();
    g.blendMode = BLEND_MODES.ADD;
    container.addChild(g);
    wallSignals.push({
      g,
      side: i % 2 === 0 ? -1 : 1,
      u: randRange(rng, 0, 1),
      v: randRange(rng, 0, 1),
      depth: randRange(rng, 0.25, 1),
      length: randRange(rng, 0.018, 0.056),
      phase: randRange(rng, 0, Math.PI * 2),
      color: rng() > 0.62 ? 0xbcffb0 : rng() > 0.42 ? 0xffa25d : 0x9d63e5,
      broken: rng() > 0.5,
    });
  }

  for (let i = 0; i < 24; i += 1) {
    const g = new Graphics();
    g.blendMode = BLEND_MODES.ADD;
    container.addChild(g);
    floorSignals.push({
      g,
      angle: (Math.PI * 2 * i) / 24 + randRange(rng, -0.08, 0.08),
      radius: randRange(rng, 0.42, 1.06),
      phase: randRange(rng, 0, Math.PI * 2),
      width: randRange(rng, 0.006, 0.018),
      color: i % 4 === 0 ? 0xbcffb0 : i % 4 === 1 ? 0xffa25d : 0x9d63e5,
      split: rng() > 0.58,
    });
  }

  return {
    container,
    update(t, w, h, lookX, lookY, breathe, slowPulse) {
      container.alpha = 0.54 + slowPulse * 0.18;
      drawWallSignals(wallSignals, t, w, h, lookX, lookY, breathe);
      drawFloorSignals(floorSignals, t, w, h, lookX, lookY, slowPulse);
    },
  };
}

function drawWallSignals(signals, t, w, h, lookX, lookY, breathe) {
  for (const signal of signals) {
    const sideBias = signal.side < 0 ? 0.09 + signal.u * 0.18 : 0.91 - signal.u * 0.18;
    const x = w * sideBias + lookX * signal.side * w * (0.01 + signal.depth * 0.018);
    const y = h * (0.12 + signal.v * 0.68) + lookY * h * (0.004 + signal.depth * 0.012);
    const len = w * signal.length * (0.78 + signal.depth * 0.72);
    const kink = h * (0.006 + signal.depth * 0.012);
    const pulse = Math.max(0, Math.sin(t * (0.42 + signal.depth * 0.55) + signal.phase));
    const alpha = (0.025 + pulse * 0.09 + breathe * 0.018) * (signal.color === 0xbcffb0 ? 0.82 : 1);
    const width = 0.7 + signal.depth * 1.4 + pulse * 0.55;
    const turn = signal.side * (0.14 + lookX * 0.035);

    signal.g.clear();
    signal.g.position.set(x, y);
    signal.g.rotation = turn;
    signal.g.lineStyle(width, signal.color, alpha);
    signal.g.moveTo(0, 0);
    signal.g.lineTo(signal.side * len * 0.45, kink);
    signal.g.lineTo(signal.side * len, -kink * 0.32);

    if (signal.broken) {
      signal.g.lineStyle(Math.max(0.7, width * 0.7), signal.color, alpha * 0.62);
      signal.g.moveTo(signal.side * len * 1.22, -kink * 0.2);
      signal.g.lineTo(signal.side * len * 1.48, kink * 0.8);
    }

    if (pulse > 0.78) {
      signal.g.beginFill(signal.color, alpha * 0.38);
      signal.g.drawPolygon([
        signal.side * len * 1.04,
        -kink,
        signal.side * len * 1.16,
        0,
        signal.side * len * 1.04,
        kink,
        signal.side * len * 0.92,
        0,
      ]);
      signal.g.endFill();
    }
  }
}

function drawFloorSignals(signals, t, w, h, lookX, lookY, slowPulse) {
  const cx = w * ANCHOR.floorCircleX;
  const cy = h * ANCHOR.floorCircleY;
  const rx = w * 0.18;
  const ry = h * 0.044;

  for (const signal of signals) {
    const phaseAngle = signal.angle + lookX * 0.09 + Math.sin(t * 0.06 + signal.phase) * 0.018;
    const radiusPulse = signal.radius + Math.sin(t * 0.22 + signal.phase) * 0.035;
    const x = cx + Math.cos(phaseAngle) * rx * radiusPulse;
    const y = cy + Math.sin(phaseAngle + lookY * 0.06) * ry * radiusPulse;
    const pulse = Math.max(0, Math.sin(t * 0.7 + signal.phase));
    const length = w * signal.width * (0.7 + pulse * 0.8);
    const alpha = 0.04 + pulse * 0.12 + slowPulse * 0.026;

    signal.g.clear();
    signal.g.position.set(x, y);
    signal.g.rotation = phaseAngle + Math.PI * 0.5;
    signal.g.lineStyle(1.1 + pulse * 1.4, signal.color, alpha);
    signal.g.moveTo(-length, 0);
    signal.g.lineTo(length, 0);

    if (signal.split) {
      signal.g.lineStyle(0.9 + pulse * 0.8, signal.color, alpha * 0.62);
      signal.g.moveTo(-length * 0.42, -h * 0.006);
      signal.g.lineTo(length * 0.36, h * 0.006);
    }
  }
}

function makeLightRays(count) {
  const layer = new Container();
  for (let i = 0; i < count; i += 1) {
    const g = new Graphics();
    const width = 70 + i * 19;
    const height = 1450 + i * 55;
    const x = (i - count / 2) * 74;
    g.beginFill(i % 2 ? 0x6c38a0 : 0xb87ff2, 0.045 + (i % 3) * 0.018);
    g.moveTo(x, 0);
    g.lineTo(x + width, 0);
    g.lineTo(x + width * 3.3, height);
    g.lineTo(x - width * 2.1, height);
    g.endFill();
    g.blendMode = BLEND_MODES.ADD;
    layer.addChild(g);
  }
  return layer;
}

function makeParticles() {
  const items = [];
  const total = 260;
  const rng = createRng('ambient-particles');
  for (let i = 0; i < total; i += 1) {
    const type = rng();
    const texture = type > 0.9 ? textures.ember : type > 0.78 ? textures.pistachio : textures.dust;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.blendMode = BLEND_MODES.ADD;
    items.push({
      sprite,
      x: rng(),
      y: rng(),
      z: randRange(rng, 0.35, 2.15),
      speed: randRange(rng, 0.012, 0.052),
      drift: randRange(rng, -0.015, 0.015),
      base: randRange(rng, 0.0025, 0.0095),
      phase: rng() * Math.PI * 2,
      ember: type > 0.9,
    });
  }
  return items;
}

function animateParticles(items, dt, w, h, t) {
  for (const p of items) {
    p.y += p.speed * dt * (p.ember ? -0.7 : 1);
    p.x += Math.sin(t * 0.15 + p.phase) * 0.00012 + p.drift * dt * 0.01;

    if (!p.ember && p.y > 1.08) p.y = -0.08;
    if (p.ember && p.y < -0.08) p.y = 1.08;
    if (p.x < -0.08) p.x = 1.08;
    if (p.x > 1.08) p.x = -0.08;

    p.sprite.position.set(p.x * w, p.y * h);
    const depthScale = Math.max(w, h) * p.base * p.z;
    p.sprite.scale.set(depthScale / 96);
    p.sprite.alpha = (0.022 + Math.sin(t * 0.8 + p.phase) * 0.012 + p.z * 0.014) * (p.ember ? 1.4 : 1);
  }
}

function makeMirrorMotes(count) {
  const motes = [];
  const rng = createRng('mirror-motes');
  for (let i = 0; i < count; i += 1) {
    const g = new Graphics();
    g.beginFill(i % 3 === 0 ? 0xc9ffb4 : 0xffb46d, 0.18);
    g.drawPolygon([0, -8, 5, 0, 0, 8, -5, 0]);
    g.endFill();
    g.blendMode = BLEND_MODES.ADD;
    g.seed = rng();
    g.side = i % 2 === 0 ? -1 : 1;
    motes.push(g);
  }
  return motes;
}

function animateMirrorMotes(motes, t, px, py) {
  const { w, h } = state.size;
  for (const mote of motes) {
    const sideX = mote.side < 0 ? 0.14 : 0.86;
    const spread = Math.sin(t * 0.09 + mote.seed * 12) * 0.05;
    mote.position.set(
      w * (sideX + spread + px * 0.02),
      h * (0.18 + (mote.seed * 0.64) + py * 0.03),
    );
    mote.rotation = t * (0.15 + mote.seed * 0.35);
    const scale = 0.45 + Math.sin(t * 0.7 + mote.seed * 9) * 0.18;
    mote.scale.set(scale);
    mote.alpha = 0.08 + Math.max(0, Math.sin(t * 0.6 + mote.seed * 20)) * 0.22;
  }
}

function makeEyeSystem() {
  const container = new Container();
  const left = new Graphics();
  const right = new Graphics();
  const gazeLeft = new Graphics();
  const gazeRight = new Graphics();
  for (const eye of [left, right]) {
    eye.beginFill(0xf7e7d3, 0.9);
    eye.drawEllipse(0, 0, 15, 5.5);
    eye.endFill();
    eye.blendMode = BLEND_MODES.ADD;
  }
  for (const iris of [gazeLeft, gazeRight]) {
    iris.beginFill(0xbcffb0, 0.95);
    iris.drawCircle(0, 0, 3.2);
    iris.endFill();
    iris.blendMode = BLEND_MODES.ADD;
  }
  container.addChild(left, right, gazeLeft, gazeRight);

  return {
    container,
    layout(layer) {
      const s = layer.sprite.scale.x;
      const x = layer.sprite.position.x;
      const y = layer.sprite.position.y;
      container.position.set(x, y);
      container.scale.set(s);
    },
    update(t, layer) {
      container.position.set(layer.sprite.position.x, layer.sprite.position.y);
      container.scale.set(layer.sprite.scale.x, layer.sprite.scale.y);
      container.rotation = layer.sprite.rotation;
      const tx = Math.sin(t * 0.19) * 0.45;
      const ty = Math.cos(t * 0.16) * 0.22;
      const blink = blinkAmount(t);
      const eyeY = -layer.sprite.texture.height * 0.705;
      const eyeX = layer.sprite.texture.width * 0.036;
      left.position.set(-eyeX, eyeY);
      right.position.set(eyeX, eyeY);
      gazeLeft.position.set(-eyeX + tx, eyeY + ty);
      gazeRight.position.set(eyeX + tx, eyeY + ty);
      left.scale.y = Math.max(0.08, 1 - blink);
      right.scale.y = Math.max(0.08, 1 - blink);
      gazeLeft.alpha = blink > 0.84 ? 0 : 0.95;
      gazeRight.alpha = gazeLeft.alpha;
    },
  };
}

function blinkAmount(t) {
  const cycle = t % 7.4;
  const micro = (t + 2.1) % 11.2;
  if (cycle > 6.95 && cycle < 7.15) return Math.sin(((cycle - 6.95) / 0.2) * Math.PI);
  if (micro > 10.9 && micro < 11.03) return Math.sin(((micro - 10.9) / 0.13) * Math.PI) * 0.7;
  return 0;
}

function makeClothMotionSystem() {
  const container = new Container();
  const strands = [];
  const rng = createRng('cloth-strands');
  for (let i = 0; i < 26; i += 1) {
    const g = new Graphics();
    g.blendMode = BLEND_MODES.ADD;
    container.addChild(g);
    strands.push({ g, seed: rng(), side: i % 2 === 0 ? -1 : 1 });
  }

  return {
    container,
    layout(layer) {
      container.position.set(layer.sprite.position.x, layer.sprite.position.y);
      container.scale.set(layer.sprite.scale.x);
    },
    update(t, layer) {
      container.position.set(layer.sprite.position.x, layer.sprite.position.y);
      container.scale.set(layer.sprite.scale.x, layer.sprite.scale.y);
      container.rotation = layer.sprite.rotation;
      const tex = layer.sprite.texture;
      for (const strand of strands) {
        const g = strand.g;
        const startY = -tex.height * (0.45 + strand.seed * 0.26);
        const startX = strand.side * tex.width * (0.12 + strand.seed * 0.18);
        const sway = Math.sin(t * (0.42 + strand.seed * 0.34) + strand.seed * 9) * (2.2 + strand.seed * 3.2);
        const length = tex.height * (0.18 + strand.seed * 0.16);
        const color = strand.seed > 0.74 ? 0xffb46d : strand.seed > 0.5 ? 0xbcffb0 : 0x9d63e5;
        g.clear();
        g.lineStyle(1.1 + strand.seed * 1.1, color, 0.035 + strand.seed * 0.055);
        g.moveTo(startX, startY);
        g.bezierCurveTo(startX + sway * 0.4, startY + length * 0.35, startX + sway, startY + length * 0.7, startX + sway * 0.5, startY + length);
      }
    },
  };
}

function makeSubjectLustreSystem() {
  const container = new Container();
  const graphics = new Graphics();
  graphics.blendMode = BLEND_MODES.ADD;
  container.addChild(graphics);

  const accents = [
    { x: 0.5, y: 0.725, size: 6.8, color: 0xffb46d, phase: 0.1 },
    { x: 0.462, y: 0.61, size: 5.4, color: 0xbcffb0, phase: 1.8 },
    { x: 0.545, y: 0.58, size: 5.8, color: 0x9d63e5, phase: 2.6 },
    { x: 0.49, y: 0.49, size: 4.6, color: 0xffb46d, phase: 4.2 },
    { x: 0.57, y: 0.405, size: 4.8, color: 0xbcffb0, phase: 5.1 },
    { x: 0.435, y: 0.36, size: 4.2, color: 0x9d63e5, phase: 3.4 },
    { x: 0.59, y: 0.235, size: 4.6, color: 0xffb46d, phase: 6.3 },
    { x: 0.505, y: 0.155, size: 4.2, color: 0xbcffb0, phase: 7.0 },
  ];

  return {
    container,
    peak: 0,
    layout(layer) {
      container.position.set(layer.sprite.position.x, layer.sprite.position.y);
      container.scale.set(layer.sprite.scale.x, layer.sprite.scale.y);
    },
    update(t, layer, lookX, lookY, breathe, slowPulse) {
      const tex = layer.sprite.texture;
      const cameraTension = Math.min(1, Math.abs(lookX) / CAMERA.orbitLimitX + Math.abs(lookY) / CAMERA.orbitLimitY);
      let peak = 0;

      container.position.set(layer.sprite.position.x, layer.sprite.position.y);
      container.scale.set(layer.sprite.scale.x, layer.sprite.scale.y);
      container.rotation = layer.sprite.rotation;
      container.alpha = 0.82 + breathe * 0.1;
      graphics.clear();

      for (const accent of accents) {
        const x = tex.width * accent.x + lookX * 1.2;
        const y = -tex.height * accent.y + lookY * 0.8;
        const blink = Math.max(0, Math.sin(t * 0.58 + accent.phase));
        const alpha = (0.026 + blink * 0.065 + slowPulse * 0.012 + cameraTension * 0.018) * (accent.color === 0xbcffb0 ? 0.72 : 1);
        const size = accent.size * (0.78 + blink * 0.46);
        peak = Math.max(peak, alpha);

        graphics.lineStyle(0.9, accent.color, alpha * 0.82);
        graphics.moveTo(x - size, y);
        graphics.lineTo(x + size, y);
        graphics.moveTo(x, y - size * 0.82);
        graphics.lineTo(x, y + size * 0.82);

        graphics.beginFill(accent.color, alpha * 0.34);
        graphics.drawPolygon([
          x,
          y - size * 0.7,
          x + size * 0.42,
          y,
          x,
          y + size * 0.7,
          x - size * 0.42,
          y,
        ]);
        graphics.endFill();
      }

      this.peak = peak * container.alpha;
    },
  };
}

function createDepthBackroomTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 120, w * 0.5, h * 0.5, h * 0.75);
  bg.addColorStop(0, '#4c2375');
  bg.addColorStop(0.42, '#1b0b26');
  bg.addColorStop(1, '#060309');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  drawDepthCorridor(ctx, w, h);
  drawSideStructures(ctx, w, h);
  drawGlassPanels(ctx, w, h);
  drawFloor(ctx, w, h);
  drawHaze(ctx, w, h);

  return Texture.from(canvas);
}

function drawDepthCorridor(ctx, w, h) {
  const cx = w * 0.5;
  const cy = h * 0.48;
  for (let i = 0; i < 18; i += 1) {
    const p = i / 18;
    const alpha = 0.22 * (1 - p);
    ctx.strokeStyle = `rgba(223, 151, 91, ${alpha})`;
    ctx.lineWidth = 2 + (1 - p) * 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(w * (0.05 + p * 0.36), h);
    ctx.moveTo(cx, cy);
    ctx.lineTo(w * (0.95 - p * 0.36), h);
    ctx.stroke();
  }

  for (let i = 0; i < 11; i += 1) {
    const y = cy + (h - cy) * Math.pow(i / 11, 1.45);
    ctx.strokeStyle = `rgba(138, 76, 174, ${0.18 + i * 0.012})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y);
    ctx.lineTo(w * 0.92, y);
    ctx.stroke();
  }

  const frame = ctx.createLinearGradient(cx, h * 0.04, cx, h * 0.78);
  frame.addColorStop(0, 'rgba(169, 92, 222, 0.16)');
  frame.addColorStop(1, 'rgba(18, 8, 28, 0)');
  ctx.strokeStyle = frame;
  ctx.lineWidth = 18;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    const inset = 110 + i * 95;
    ctx.moveTo(inset, h);
    ctx.lineTo(cx - (280 + i * 42), cy);
    ctx.lineTo(cx + (280 + i * 42), cy);
    ctx.lineTo(w - inset, h);
    ctx.stroke();
  }
}

function drawSideStructures(ctx, w, h) {
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : w;
    const grad = ctx.createLinearGradient(x0, 0, x0 + side * w * 0.28, 0);
    grad.addColorStop(0, 'rgba(28, 5, 34, 0.96)');
    grad.addColorStop(0.45, 'rgba(52, 19, 66, 0.86)');
    grad.addColorStop(1, 'rgba(33, 8, 44, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    for (let y = 0; y <= h; y += 120) {
      const offset = Math.sin(y * 0.009) * 18 * side;
      ctx.lineTo(x0 + side * (130 + offset + (y % 240 === 0 ? 28 : -12)), y + 120);
    }
    ctx.lineTo(x0, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 161, 82, 0.13)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      const x = x0 + side * (42 + i * 42);
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + side * 36, h * 0.28, x - side * 44, h * 0.66, x + side * 18, h);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(188, 255, 176, 0.11)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      const y = h * (0.12 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(x0 + side * 22, y);
      ctx.lineTo(x0 + side * (220 + i * 16), y + 46);
      ctx.stroke();
    }
  }
}

function drawGlassPanels(ctx, w, h) {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const depth = i / 4;
      const x = side < 0 ? w * (0.13 + i * 0.055) : w * (0.87 - i * 0.055);
      const y = h * (0.2 + i * 0.045);
      const mh = h * (0.45 - i * 0.045);
      const mw = w * (0.052 - i * 0.004);
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0.08 * side, 0.08 * side, 1, 0, 0);
      ctx.fillStyle = `rgba(178, 255, 161, ${0.045 + depth * 0.02})`;
      ctx.strokeStyle = `rgba(234, 154, 82, ${0.22 - depth * 0.03})`;
      ctx.lineWidth = 5 - depth * 2;
      ctx.beginPath();
      ctx.roundRect(-mw * 0.5, 0, mw, mh, 6);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = `rgba(200, 161, 255, ${0.12 - depth * 0.02})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-mw * 0.36, mh * 0.18);
      ctx.lineTo(mw * 0.36, mh * 0.08);
      ctx.moveTo(-mw * 0.28, mh * 0.62);
      ctx.lineTo(mw * 0.24, mh * 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawFloor(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, h * 0.55, 0, h);
  grad.addColorStop(0, 'rgba(34, 12, 38, 0)');
  grad.addColorStop(1, 'rgba(18, 6, 16, 0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * 0.52, w, h * 0.48);

  for (let i = 0; i < 30; i += 1) {
    const y = h * (0.6 + Math.pow(i / 30, 1.4) * 0.4);
    ctx.strokeStyle = `rgba(255, 154, 82, ${0.08 + i * 0.002})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, y);
    ctx.lineTo(w * 0.92, y + Math.sin(i) * 2);
    ctx.stroke();
  }
}

function drawHaze(ctx, w, h) {
  const rng = createRng('background-haze');
  for (let i = 0; i < 18; i += 1) {
    const x = w * randRange(rng, 0.15, 0.85);
    const y = h * randRange(rng, 0.14, 0.74);
    const r = w * randRange(rng, 0.08, 0.26);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(163, 104, 230, 0.08)');
    grad.addColorStop(1, 'rgba(163, 104, 230, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function createCharacterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 2100;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.5;

  ctx.clearRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(cx, h * 0.42, 80, cx, h * 0.5, 630);
  glow.addColorStop(0, 'rgba(161, 92, 229, 0.42)');
  glow.addColorStop(0.55, 'rgba(78, 28, 109, 0.18)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  drawJesterCharacter(ctx, w, h, cx);
  return Texture.from(canvas);
}

function drawJesterCharacter(ctx, w, h, cx) {
  ctx.save();
  ctx.translate(cx, h * 0.12);

  ctx.fillStyle = 'rgba(28, 7, 38, 0.88)';
  ctx.beginPath();
  ctx.moveTo(-250, 860);
  ctx.bezierCurveTo(-430, 1220, -350, 1730, -290, 1930);
  ctx.lineTo(290, 1930);
  ctx.bezierCurveTo(350, 1700, 430, 1220, 250, 860);
  ctx.bezierCurveTo(155, 730, -155, 730, -250, 860);
  ctx.closePath();
  ctx.fill();

  const dress = ctx.createLinearGradient(0, 660, 0, 1900);
  dress.addColorStop(0, '#7a34a5');
  dress.addColorStop(0.35, '#2d0d3e');
  dress.addColorStop(1, '#0b0511');
  ctx.fillStyle = dress;
  ctx.beginPath();
  ctx.moveTo(-126, 640);
  ctx.bezierCurveTo(-260, 920, -315, 1380, -240, 1900);
  ctx.bezierCurveTo(-80, 1970, 112, 1970, 250, 1900);
  ctx.bezierCurveTo(320, 1380, 250, 910, 126, 640);
  ctx.bezierCurveTo(70, 590, -74, 590, -126, 640);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 169, 91, 0.42)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-120, 650);
  ctx.bezierCurveTo(-30, 860, -60, 1240, -170, 1850);
  ctx.moveTo(120, 650);
  ctx.bezierCurveTo(30, 860, 64, 1240, 170, 1850);
  ctx.stroke();

  ctx.fillStyle = 'rgba(188, 255, 176, 0.12)';
  for (let y = 810; y < 1740; y += 138) {
    for (let x = -138; x <= 138; x += 92) {
      ctx.save();
      ctx.translate(x + Math.sin(y * 0.01) * 18, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-16, -16, 32, 32);
      ctx.restore();
    }
  }

  ctx.fillStyle = '#d9b6a0';
  ctx.beginPath();
  ctx.ellipse(0, 438, 82, 112, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(24, 5, 30, 0.96)';
  ctx.beginPath();
  ctx.moveTo(-102, 420);
  ctx.bezierCurveTo(-60, 345, 70, 340, 110, 420);
  ctx.bezierCurveTo(92, 500, -82, 500, -102, 420);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 178, 93, 0.75)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-62, 442);
  ctx.quadraticCurveTo(-28, 433, 0, 445);
  ctx.quadraticCurveTo(28, 433, 62, 442);
  ctx.stroke();

  ctx.fillStyle = 'rgba(245, 225, 210, 0.98)';
  ctx.beginPath();
  ctx.ellipse(-35, 452, 13, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(35, 452, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#bfffac';
  ctx.beginPath();
  ctx.arc(-34, 452, 3.5, 0, Math.PI * 2);
  ctx.arc(34, 452, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(54, 13, 65, 0.94)';
  ctx.lineWidth = 45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-72, 350);
  ctx.bezierCurveTo(-230, 250, -245, 410, -190, 520);
  ctx.moveTo(72, 350);
  ctx.bezierCurveTo(230, 250, 245, 410, 190, 520);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 169, 91, 0.86)';
  ctx.beginPath();
  ctx.arc(-205, 520, 15, 0, Math.PI * 2);
  ctx.arc(205, 520, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(11, 4, 16, 0.88)';
  ctx.beginPath();
  ctx.moveTo(-170, 690);
  ctx.bezierCurveTo(-310, 760, -365, 1050, -320, 1280);
  ctx.bezierCurveTo(-260, 1160, -240, 950, -150, 800);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(170, 690);
  ctx.bezierCurveTo(310, 760, 365, 1050, 320, 1280);
  ctx.bezierCurveTo(260, 1160, 240, 950, 150, 800);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function createForegroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : w;
    const grad = ctx.createLinearGradient(x0, 0, x0 + side * w * 0.34, 0);
    grad.addColorStop(0, 'rgba(34, 4, 43, 0.78)');
    grad.addColorStop(0.48, 'rgba(92, 28, 114, 0.34)');
    grad.addColorStop(1, 'rgba(34, 4, 43, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.bezierCurveTo(x0 + side * 260, h * 0.24, x0 + side * 80, h * 0.55, x0 + side * 230, h);
    ctx.lineTo(x0, h);
    ctx.closePath();
    ctx.fill();
  }

  const lower = ctx.createRadialGradient(w * 0.5, h * 1.02, 20, w * 0.5, h * 1.02, w * 0.44);
  lower.addColorStop(0, 'rgba(255, 152, 73, 0.24)');
  lower.addColorStop(0.58, 'rgba(110, 44, 143, 0.1)');
  lower.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lower;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  const rng = createRng('foreground-sparks');
  for (let i = 0; i < 80; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const r = randRange(rng, 2, 10);
    ctx.fillStyle = i % 5 === 0 ? 'rgba(188,255,176,0.16)' : 'rgba(230,210,255,0.09)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return Texture.from(canvas);
}

function drawFloorAnchorMark(g, w, h) {
  const rx = w * 0.148;
  const ry = h * 0.034;
  g.clear();
  g.position.set(w * ANCHOR.floorCircleX, h * ANCHOR.floorCircleY);

  g.lineStyle(Math.max(1.2, h * 0.0022), 0x9d63e5, 0.42);
  g.drawEllipse(0, 0, rx, ry);
  g.lineStyle(Math.max(0.9, h * 0.0013), 0xffa25d, 0.32);
  g.drawEllipse(0, 0, rx * 0.78, ry * 0.62);
  g.lineStyle(Math.max(0.8, h * 0.0011), 0xbcffb0, 0.2);
  g.drawEllipse(0, 0, rx * 0.44, ry * 0.32);

  const ticks = 18;
  for (let i = 0; i < ticks; i += 1) {
    const a = (Math.PI * 2 * i) / ticks;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const innerX = c * rx * 0.86;
    const innerY = s * ry * 0.86;
    const outerX = c * rx;
    const outerY = s * ry;
    g.lineStyle(i % 3 === 0 ? 1.8 : 1.1, i % 3 === 0 ? 0xffa25d : 0xbcffb0, i % 3 === 0 ? 0.28 : 0.18);
    g.moveTo(innerX, innerY);
    g.lineTo(outerX, outerY);
  }
}

function makeArchitecturalVeilTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const rearShade = ctx.createLinearGradient(w * 0.5, h * 0.1, w * 0.5, h * 0.78);
  rearShade.addColorStop(0, 'rgba(6, 3, 10, 0.5)');
  rearShade.addColorStop(0.42, 'rgba(22, 7, 33, 0.36)');
  rearShade.addColorStop(1, 'rgba(8, 4, 12, 0)');
  ctx.fillStyle = rearShade;
  ctx.beginPath();
  ctx.moveTo(w * 0.39, h * 0.08);
  ctx.lineTo(w * 0.66, h * 0.04);
  ctx.lineTo(w * 0.64, h * 0.66);
  ctx.lineTo(w * 0.45, h * 0.7);
  ctx.lineTo(w * 0.41, h * 0.38);
  ctx.closePath();
  ctx.fill();

  drawCentralGlassOccluder(ctx, w, h);
  drawAntiArchBaffles(ctx, w, h);
  drawSideAntiArchShutters(ctx, w, h);
  drawVeilPanel(ctx, w * 0.49, h * 0.12, w * 0.11, h * 0.52, -0.035, 'left');
  drawVeilPanel(ctx, w * 0.61, h * 0.08, w * 0.12, h * 0.6, 0.026, 'right');
  drawVeilPanel(ctx, w * 0.73, h * 0.02, w * 0.15, h * 0.58, 0.065, 'right');
  drawVeilPanel(ctx, w * 0.28, h * 0.08, w * 0.13, h * 0.64, -0.045, 'left');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i += 1) {
    const x = w * (0.18 + i * 0.052);
    const y0 = h * (0.16 + (i % 3) * 0.045);
    const y1 = h * (0.82 - (i % 4) * 0.035);
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(188,255,176,0.12)' : 'rgba(255,162,93,0.11)';
    ctx.lineWidth = i % 4 === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + Math.sin(i * 1.7) * w * 0.018, y1);
    ctx.stroke();
  }

  const rng = createRng('architectural-veinlets');
  for (let i = 0; i < 36; i += 1) {
    const x = w * randRange(rng, 0.12, 0.88);
    const y = h * randRange(rng, 0.18, 0.74);
    const len = w * randRange(rng, 0.012, 0.047);
    ctx.strokeStyle = rng() > 0.55 ? 'rgba(188,255,176,0.11)' : 'rgba(255,162,93,0.12)';
    ctx.lineWidth = randRange(rng, 1, 2.4);
    ctx.beginPath();
    ctx.moveTo(x - len * 0.5, y);
    ctx.lineTo(x + len * 0.5, y + randRange(rng, -4, 4));
    ctx.stroke();
  }
  ctx.restore();

  const lowMask = ctx.createLinearGradient(0, h * 0.48, 0, h);
  lowMask.addColorStop(0, 'rgba(0,0,0,0)');
  lowMask.addColorStop(0.55, 'rgba(5,2,8,0.1)');
  lowMask.addColorStop(1, 'rgba(5,2,8,0.36)');
  ctx.fillStyle = lowMask;
  ctx.fillRect(0, h * 0.46, w, h * 0.54);

  return Texture.from(canvas);
}

function drawCentralGlassOccluder(ctx, w, h) {
  const x = w * 0.51;
  const y = h * 0.18;
  const grad = ctx.createLinearGradient(x - w * 0.16, y, x + w * 0.13, h * 0.74);
  grad.addColorStop(0, 'rgba(12, 5, 18, 0.18)');
  grad.addColorStop(0.36, 'rgba(54, 18, 78, 0.34)');
  grad.addColorStop(0.72, 'rgba(12, 5, 18, 0.48)');
  grad.addColorStop(1, 'rgba(8, 3, 12, 0)');

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.15, y);
  ctx.lineTo(x + w * 0.15, y + h * 0.035);
  ctx.lineTo(x + w * 0.105, y + h * 0.49);
  ctx.lineTo(x - w * 0.04, y + h * 0.61);
  ctx.lineTo(x - w * 0.12, y + h * 0.36);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 162, 93, 0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.15, y);
  ctx.lineTo(x + w * 0.15, y + h * 0.035);
  ctx.lineTo(x + w * 0.105, y + h * 0.49);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(188, 255, 176, 0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.085, y + h * 0.13);
  ctx.lineTo(x + w * 0.07, y + h * 0.18);
  ctx.moveTo(x - w * 0.07, y + h * 0.31);
  ctx.lineTo(x + w * 0.08, y + h * 0.37);
  ctx.stroke();
  ctx.restore();
}

function drawAntiArchBaffles(ctx, w, h) {
  const plates = [
    { x: 0.49, y: 0.2, width: 0.26, height: 0.18, lean: -0.035, alpha: 0.2 },
    { x: 0.58, y: 0.34, width: 0.2, height: 0.28, lean: 0.04, alpha: 0.18 },
    { x: 0.42, y: 0.38, width: 0.16, height: 0.24, lean: -0.055, alpha: 0.16 },
  ];

  ctx.save();
  for (const plate of plates) {
    const x = w * plate.x;
    const y = h * plate.y;
    const pw = w * plate.width;
    const ph = h * plate.height;
    const grad = ctx.createLinearGradient(x - pw * 0.5, y, x + pw * 0.5, y + ph);
    grad.addColorStop(0, `rgba(8, 3, 12, ${plate.alpha * 0.5})`);
    grad.addColorStop(0.44, `rgba(44, 14, 62, ${plate.alpha})`);
    grad.addColorStop(1, 'rgba(3, 1, 6, 0)');

    ctx.save();
    ctx.transform(1, plate.lean, plate.lean * 0.3, 1, 0, 0);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - pw * 0.48, y);
    ctx.lineTo(x + pw * 0.44, y + ph * 0.08);
    ctx.lineTo(x + pw * 0.28, y + ph);
    ctx.lineTo(x - pw * 0.54, y + ph * 0.78);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(157, 99, 229, ${plate.alpha * 0.48})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawSideAntiArchShutters(ctx, w, h) {
  const shutters = [
    { side: -1, x: 0.18, y: 0.04, width: 0.16, height: 0.82, lean: -0.055, alpha: 0.34 },
    { side: -1, x: 0.28, y: 0.12, width: 0.08, height: 0.66, lean: 0.035, alpha: 0.22 },
    { side: 1, x: 0.84, y: 0.02, width: 0.13, height: 0.78, lean: 0.06, alpha: 0.3 },
    { side: 1, x: 0.74, y: 0.16, width: 0.07, height: 0.58, lean: -0.032, alpha: 0.2 },
  ];

  ctx.save();
  for (const shutter of shutters) {
    const x = w * shutter.x;
    const y = h * shutter.y;
    const sw = w * shutter.width;
    const sh = h * shutter.height;
    const grad = ctx.createLinearGradient(x - sw * shutter.side, y, x + sw * shutter.side, y + sh);
    grad.addColorStop(0, `rgba(4, 1, 7, ${shutter.alpha * 0.75})`);
    grad.addColorStop(0.36, `rgba(26, 8, 34, ${shutter.alpha})`);
    grad.addColorStop(0.7, `rgba(73, 24, 91, ${shutter.alpha * 0.42})`);
    grad.addColorStop(1, 'rgba(4, 1, 7, 0)');

    ctx.save();
    ctx.transform(1, shutter.lean, shutter.lean * 0.25, 1, 0, 0);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - shutter.side * sw * 0.52, y);
    ctx.lineTo(x + shutter.side * sw * 0.45, y + sh * 0.04);
    ctx.lineTo(x + shutter.side * sw * 0.28, y + sh);
    ctx.lineTo(x - shutter.side * sw * 0.6, y + sh * 0.9);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255, 162, 93, ${0.08 + shutter.alpha * 0.16})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = `rgba(188, 255, 176, ${0.045 + shutter.alpha * 0.08})`;
    ctx.lineWidth = 1.6;
    for (let i = 1; i < 5; i += 1) {
      const px = x - shutter.side * sw * 0.42 + shutter.side * sw * (i / 5);
      ctx.beginPath();
      ctx.moveTo(px, y + sh * 0.08);
      ctx.lineTo(px - shutter.side * sw * 0.16, y + sh * 0.86);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (const side of [-1, 1]) {
    const base = side < 0 ? w * 0.08 : w * 0.92;
    ctx.strokeStyle = side < 0 ? 'rgba(255,162,93,0.13)' : 'rgba(188,255,176,0.09)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 9; i += 1) {
      const y = h * (0.11 + i * 0.075);
      ctx.beginPath();
      ctx.moveTo(base, y);
      ctx.lineTo(base + side * w * (0.18 + (i % 3) * 0.032), y + h * (0.026 + (i % 2) * 0.018));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function makeSignatureSignalsTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawSideSignalField(ctx, w, h, -1);
  drawSideSignalField(ctx, w, h, 1);
  drawFloorSignalRails(ctx, w, h);
  drawAnchorPulseCircuit(ctx, w, h);
  ctx.restore();

  return Texture.from(canvas);
}

function drawSideSignalField(ctx, w, h, side) {
  const baseX = side < 0 ? w * 0.12 : w * 0.88;
  for (let i = 0; i < 18; i += 1) {
    const y = h * (0.12 + i * 0.041);
    const x = baseX + side * Math.sin(i * 1.9) * w * 0.035;
    const len = w * (0.02 + (i % 5) * 0.006);
    const hue = i % 4 === 0 ? 0xbcffb0 : i % 4 === 1 ? 0xffa25d : 0x9d63e5;
    const alpha = i % 4 === 0 ? 0.12 : 0.08;
    ctx.strokeStyle = colorToRgba(hue, alpha);
    ctx.lineWidth = i % 6 === 0 ? 2.4 : 1.25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * len, y + h * 0.014);
    ctx.lineTo(x + side * len * 0.54, y + h * 0.028);
    ctx.stroke();

    if (i % 5 === 0) {
      ctx.fillStyle = colorToRgba(hue, 0.1);
      ctx.beginPath();
      ctx.moveTo(x + side * len * 1.18, y + h * 0.012);
      ctx.lineTo(x + side * len * 1.38, y + h * 0.022);
      ctx.lineTo(x + side * len * 1.16, y + h * 0.032);
      ctx.lineTo(x + side * len * 0.98, y + h * 0.022);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawFloorSignalRails(ctx, w, h) {
  const vanishingX = w * 0.525;
  const vanishingY = h * 0.49;
  for (let i = 0; i < 10; i += 1) {
    const spread = (i - 4.5) / 4.5;
    const startX = w * (0.5 + spread * 0.42);
    const startY = h * (0.72 + Math.abs(spread) * 0.12);
    const color = i % 3 === 0 ? 0xbcffb0 : i % 3 === 1 ? 0xffa25d : 0x9d63e5;
    ctx.strokeStyle = colorToRgba(color, 0.055 + Math.abs(spread) * 0.018);
    ctx.lineWidth = 1.2 + Math.abs(spread) * 1.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(w * (0.5 + spread * 0.18), h * 0.62, vanishingX, vanishingY);
    ctx.stroke();
  }

  for (let i = 0; i < 7; i += 1) {
    const y = h * (0.64 + i * 0.045);
    const width = w * (0.2 + i * 0.075);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(188,255,176,0.055)' : 'rgba(255,162,93,0.06)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - width, y);
    ctx.lineTo(w * 0.5 + width, y + Math.sin(i) * h * 0.003);
    ctx.stroke();
  }
}

function drawAnchorPulseCircuit(ctx, w, h) {
  const cx = w * ANCHOR.floorCircleX;
  const cy = h * ANCHOR.floorCircleY;
  const rx = w * 0.18;
  const ry = h * 0.042;

  ctx.strokeStyle = 'rgba(188,255,176,0.115)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.08, Math.PI * 0.84);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,162,93,0.13)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.72, ry * 0.58, 0, Math.PI * 1.06, Math.PI * 1.78);
  ctx.stroke();

  for (let i = 0; i < 12; i += 1) {
    const a = (Math.PI * 2 * i) / 12;
    const x = cx + Math.cos(a) * rx * (0.48 + (i % 3) * 0.14);
    const y = cy + Math.sin(a) * ry * (0.48 + (i % 2) * 0.18);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(188,255,176,0.13)' : 'rgba(157,99,229,0.12)';
    ctx.beginPath();
    ctx.rect(x - 2, y - 2, 4, 4);
    ctx.fill();
  }
}

function colorToRgba(color, alpha) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawVeilPanel(ctx, x, y, width, height, lean, side) {
  const g = ctx.createLinearGradient(x, y, x + width, y + height);
  g.addColorStop(0, 'rgba(8, 3, 12, 0.08)');
  g.addColorStop(0.35, 'rgba(48, 18, 67, 0.22)');
  g.addColorStop(0.74, 'rgba(8, 3, 12, 0.42)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.save();
  ctx.transform(1, lean, lean * 0.25, 1, 0, 0);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y + height * 0.04);
  ctx.lineTo(x + width * 0.82, y + height);
  ctx.lineTo(x - width * 0.08, y + height * 0.94);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = side === 'left' ? 'rgba(255,162,93,0.16)' : 'rgba(188,255,176,0.11)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(157,99,229,0.16)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i += 1) {
    const px = x + width * (i / 4);
    ctx.beginPath();
    ctx.moveTo(px, y + height * 0.04);
    ctx.lineTo(px - width * 0.1, y + height * 0.9);
    ctx.stroke();
  }
  ctx.restore();
}

function makeEdgeGradeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const center = ctx.createRadialGradient(w * 0.52, h * 0.46, h * 0.18, w * 0.52, h * 0.5, h * 0.74);
  center.addColorStop(0, 'rgba(0,0,0,0)');
  center.addColorStop(0.62, 'rgba(5,2,8,0.1)');
  center.addColorStop(1, 'rgba(2,1,4,0.54)');
  ctx.fillStyle = center;
  ctx.fillRect(0, 0, w, h);

  const topGlow = ctx.createLinearGradient(0, 0, 0, h * 0.58);
  topGlow.addColorStop(0, 'rgba(86, 33, 130, 0.2)');
  topGlow.addColorStop(0.34, 'rgba(60, 22, 92, 0.08)');
  topGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, w, h * 0.58);

  return Texture.from(canvas);
}

function makeClarityLaneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const sideVignette = ctx.createRadialGradient(w * 0.52, h * 0.52, h * 0.16, w * 0.52, h * 0.52, h * 0.86);
  sideVignette.addColorStop(0, 'rgba(0,0,0,0)');
  sideVignette.addColorStop(0.48, 'rgba(5,2,8,0.02)');
  sideVignette.addColorStop(0.78, 'rgba(12,4,18,0.2)');
  sideVignette.addColorStop(1, 'rgba(2,1,4,0.54)');
  ctx.fillStyle = sideVignette;
  ctx.fillRect(0, 0, w, h);

  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : w;
    const sideHaze = ctx.createLinearGradient(x0, 0, x0 + side * w * 0.38, 0);
    sideHaze.addColorStop(0, 'rgba(3,1,6,0.34)');
    sideHaze.addColorStop(0.44, 'rgba(72,22,94,0.13)');
    sideHaze.addColorStop(1, 'rgba(72,22,94,0)');
    ctx.fillStyle = sideHaze;
    ctx.fillRect(side < 0 ? 0 : w * 0.62, 0, w * 0.38, h);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rng = createRng('clarity-lane-side-sheen');
  for (let i = 0; i < 24; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side < 0 ? w * randRange(rng, 0.02, 0.28) : w * randRange(rng, 0.72, 0.98);
    const y = h * randRange(rng, 0.06, 0.92);
    const len = w * randRange(rng, 0.028, 0.1);
    ctx.strokeStyle = rng() > 0.62 ? 'rgba(188,255,176,0.035)' : 'rgba(255,162,93,0.05)';
    ctx.lineWidth = randRange(rng, 0.8, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * len, y + h * randRange(rng, -0.018, 0.018));
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const bodyCut = ctx.createRadialGradient(w * 0.53, h * 0.5, h * 0.04, w * 0.53, h * 0.5, h * 0.36);
  bodyCut.addColorStop(0, 'rgba(0,0,0,0.92)');
  bodyCut.addColorStop(0.45, 'rgba(0,0,0,0.68)');
  bodyCut.addColorStop(0.78, 'rgba(0,0,0,0.22)');
  bodyCut.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bodyCut;
  ctx.fillRect(w * 0.28, h * 0.12, w * 0.5, h * 0.72);

  const floorCut = ctx.createRadialGradient(w * ANCHOR.floorCircleX, h * ANCHOR.floorCircleY, w * 0.03, w * ANCHOR.floorCircleX, h * ANCHOR.floorCircleY, w * 0.22);
  floorCut.addColorStop(0, 'rgba(0,0,0,0.9)');
  floorCut.addColorStop(0.5, 'rgba(0,0,0,0.5)');
  floorCut.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = floorCut;
  ctx.fillRect(w * 0.28, h * 0.64, w * 0.5, h * 0.28);
  ctx.restore();

  return Texture.from(canvas);
}

function makeDepthOccluderTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2560;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : w;
    const edge = ctx.createLinearGradient(x0, 0, x0 + side * w * 0.32, 0);
    edge.addColorStop(0, 'rgba(2, 1, 4, 0.76)');
    edge.addColorStop(0.46, 'rgba(8, 3, 13, 0.32)');
    edge.addColorStop(1, 'rgba(8, 3, 13, 0)');
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + side * w * 0.22, h * 0.05);
    ctx.lineTo(x0 + side * w * 0.13, h * 0.34);
    ctx.lineTo(x0 + side * w * 0.27, h * 0.62);
    ctx.lineTo(x0 + side * w * 0.11, h);
    ctx.lineTo(x0, h);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = side < 0 ? 'rgba(255,162,93,0.12)' : 'rgba(157,99,229,0.12)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 8; i += 1) {
      const y = h * (0.08 + i * 0.118);
      const length = w * (0.06 + (i % 3) * 0.028);
      ctx.beginPath();
      ctx.moveTo(x0 + side * w * 0.018, y);
      ctx.lineTo(x0 + side * length, y + h * (0.018 + (i % 2) * 0.014));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  const top = ctx.createLinearGradient(0, 0, 0, h * 0.26);
  top.addColorStop(0, 'rgba(3,1,6,0.38)');
  top.addColorStop(1, 'rgba(3,1,6,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.26);

  const bottom = ctx.createLinearGradient(0, h * 0.78, 0, h);
  bottom.addColorStop(0, 'rgba(3,1,6,0)');
  bottom.addColorStop(1, 'rgba(3,1,6,0.36)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rng = createRng('depth-occluder-slivers');
  for (let i = 0; i < 22; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side < 0 ? w * randRange(rng, 0.02, 0.22) : w * randRange(rng, 0.78, 0.98);
    const y = h * randRange(rng, 0.05, 0.92);
    const len = w * randRange(rng, 0.02, 0.08);
    ctx.strokeStyle = rng() > 0.55 ? 'rgba(188,255,176,0.07)' : 'rgba(255,162,93,0.08)';
    ctx.lineWidth = randRange(rng, 0.8, 2.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * len, y + h * randRange(rng, -0.012, 0.018));
    ctx.stroke();
  }
  ctx.restore();

  return Texture.from(canvas);
}

function makeFloorGleamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 420;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w * 0.5;
  const cy = h * 0.58;

  ctx.clearRect(0, 0, w, h);

  const pool = ctx.createRadialGradient(cx, cy, w * 0.02, cx, cy, w * 0.44);
  pool.addColorStop(0, 'rgba(188,255,176,0.1)');
  pool.addColorStop(0.22, 'rgba(157,99,229,0.12)');
  pool.addColorStop(0.54, 'rgba(255,162,93,0.055)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i += 1) {
    const spread = (i - 4) / 4;
    const alpha = 0.08 - Math.abs(spread) * 0.024;
    ctx.strokeStyle = i % 3 === 0 ? `rgba(188,255,176,${alpha})` : `rgba(255,162,93,${alpha * 0.9})`;
    ctx.lineWidth = 1.4 + (1 - Math.abs(spread)) * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + spread * w * 0.34, cy + h * 0.18);
    ctx.quadraticCurveTo(cx + spread * w * 0.12, cy + h * 0.02, cx, cy - h * 0.08);
    ctx.stroke();
  }

  for (let i = 0; i < 14; i += 1) {
    const width = w * (0.12 + i * 0.026);
    const y = cy + h * (-0.04 + i * 0.013);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(157,99,229,0.08)' : 'rgba(255,162,93,0.07)';
    ctx.lineWidth = i % 3 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.ellipse(cx, y, width, h * (0.028 + i * 0.003), 0, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, y, width, h * (0.028 + i * 0.003), 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
  ctx.restore();

  return Texture.from(canvas);
}

function makeSubjectBacklightTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1400;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const core = ctx.createRadialGradient(w * 0.5, h * 0.48, 18, w * 0.5, h * 0.5, w * 0.46);
  core.addColorStop(0, 'rgba(174, 110, 255, 0.3)');
  core.addColorStop(0.32, 'rgba(102, 42, 150, 0.16)');
  core.addColorStop(0.72, 'rgba(26, 8, 38, 0.06)');
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, w, h);

  const vertical = ctx.createLinearGradient(w * 0.5, h * 0.08, w * 0.5, h * 0.94);
  vertical.addColorStop(0, 'rgba(188,255,176,0)');
  vertical.addColorStop(0.2, 'rgba(188,255,176,0.08)');
  vertical.addColorStop(0.54, 'rgba(255,162,93,0.1)');
  vertical.addColorStop(0.82, 'rgba(157,99,229,0.08)');
  vertical.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = vertical;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.12);
  ctx.bezierCurveTo(w * 0.46, h * 0.34, w * 0.56, h * 0.58, w * 0.49, h * 0.9);
  ctx.stroke();

  return Texture.from(canvas);
}

function makeGlowTexture(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const radius = size * 0.5;
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  const step = 1 / (stops.length - 1);
  stops.forEach((color, index) => gradient.addColorStop(index * step, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

function makeContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(512, 132, 24, 512, 132, 500);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  gradient.addColorStop(0.42, 'rgba(28, 8, 34, 0.46)');
  gradient.addColorStop(0.72, 'rgba(67, 28, 78, 0.18)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return Texture.from(canvas);
}

function makeFloorVeilTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  const mist = ctx.createRadialGradient(600, 210, 20, 600, 210, 560);
  mist.addColorStop(0, 'rgba(54, 18, 64, 0.32)');
  mist.addColorStop(0.42, 'rgba(91, 40, 112, 0.22)');
  mist.addColorStop(0.78, 'rgba(20, 8, 28, 0.12)');
  mist.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const floorCut = ctx.createLinearGradient(0, 0, 0, canvas.height);
  floorCut.addColorStop(0, 'rgba(0, 0, 0, 0)');
  floorCut.addColorStop(0.56, 'rgba(0, 0, 0, 0.12)');
  floorCut.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
  ctx.fillStyle = floorCut;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return Texture.from(canvas);
}
