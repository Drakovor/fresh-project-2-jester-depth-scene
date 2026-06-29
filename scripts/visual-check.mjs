import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.SCENE_URL || 'http://127.0.0.1:5173/';
const runId = Date.now();
const outDir = new URL('../tmp/', import.meta.url);
const reportFile = fileURLToPath(new URL('visual-check.json', outDir));
const legacyScreenshotFile = fileURLToPath(new URL('visual-check.png', outDir));
const legacyMotionAFile = fileURLToPath(new URL('visual-motion-a.png', outDir));
const legacyMotionBFile = fileURLToPath(new URL('visual-motion-b.png', outDir));

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 1366 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

const consoleMessages = [];

try {
  const viewportReports = [];
  for (const viewport of viewports) {
    viewportReports.push(await checkViewport(browser, viewport, consoleMessages));
  }

  const desktop = viewportReports.find((item) => item.viewport.name === 'desktop') ?? viewportReports[0];
  if (desktop) {
    await copyFile(desktop.screenshot, legacyScreenshotFile);
    await copyFile(desktop.motion.frameA, legacyMotionAFile);
    await copyFile(desktop.motion.frameB, legacyMotionBFile);
  }

  const report = {
    runId,
    url: makeUrl('desktop'),
    screenshot: legacyScreenshotFile,
    motion: desktop?.motion,
    regions: desktop?.regions,
    samples: desktop?.samples,
    viewports: viewportReports,
    consoleMessages,
  };
  report.qualityGates = evaluateQualityGates(report);
  report.touchInput = await checkTouchInput(browser, consoleMessages);
  evaluateTouchGates(report.qualityGates.failures, report.touchInput);
  report.passed = report.qualityGates.failures.length === 0;

  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error(`Visual check failed:\n${report.qualityGates.failures.map((failure) => `- ${failure}`).join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

async function checkViewport(browser, viewport, consoleMessages) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const screenshotFile = fileURLToPath(new URL(`visual-check-${viewport.name}.png`, outDir));
  const motionAFile = fileURLToPath(new URL(`visual-motion-a-${viewport.name}.png`, outDir));
  const motionBFile = fileURLToPath(new URL(`visual-motion-b-${viewport.name}.png`, outDir));

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push({
        viewport: viewport.name,
        type: message.type(),
        text: message.text(),
      });
    }
  });

  try {
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.goto(makeUrl(viewport.name), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(
      () => document.body.dataset.sceneReady === 'true' && document.querySelector('canvas')?.width > 0,
      { timeout: 15000 },
    );
    await page.waitForTimeout(700);

    await page.mouse.move(viewport.width * 0.5, viewport.height * 0.5, { steps: 8 });
    await page.waitForTimeout(500);
    const motionFrameA = await page.screenshot({ path: motionAFile, fullPage: false });
    await page.waitForTimeout(1300);
    const motionFrameB = await page.screenshot({ path: motionBFile, fullPage: false });
    const motionByteDiff = compareBuffers(motionFrameA, motionFrameB);
    const motionPixelDiff = comparePngPixels(motionFrameA, motionFrameB);

    const samples = [];
    const points = makeSamplePoints(viewport.width, viewport.height);
    for (const point of points) {
      await page.mouse.move(point.x, point.y, { steps: 18 });
      await page.waitForTimeout(760);
      samples.push(await readSceneState(page, point.name));
    }

    const finalScreenshot = await page.screenshot({ path: screenshotFile, fullPage: false });
    const finalFrame = PNG.sync.read(finalScreenshot);
    const regions = analyzeRegions(finalFrame);

    return {
      viewport,
      url: makeUrl(viewport.name),
      screenshot: screenshotFile,
      motion: {
        frameA: motionAFile,
        frameB: motionBFile,
        byteDiffRatio: motionByteDiff.ratio,
        differingBytes: motionByteDiff.differingBytes,
        comparedBytes: motionByteDiff.comparedBytes,
        pixelDiffRatio: motionPixelDiff.ratio,
        changedPixels: motionPixelDiff.changedPixels,
        comparedPixels: motionPixelDiff.comparedPixels,
        meanChannelDelta: motionPixelDiff.meanChannelDelta,
      },
      regions,
      samples,
    };
  } finally {
    await page.close();
  }
}

async function checkTouchInput(browser, consoleMessages) {
  const viewport = { name: 'touch', width: 390, height: 844 };
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleMessages.push({
        viewport: viewport.name,
        type: message.type(),
        text: message.text(),
      });
    }
  });

  try {
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await page.goto(makeUrl(viewport.name), { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(
      () => document.body.dataset.sceneReady === 'true' && document.querySelector('canvas')?.width > 0,
      { timeout: 15000 },
    );
    await page.waitForTimeout(700);

    const baseline = await readSceneState(page, 'touch-baseline');
    const tapOnly = await dispatchTouchStep(page, {
      name: 'touch-tap-only',
      start: { x: viewport.width * 0.86, y: viewport.height * 0.5 },
      moves: [],
    });
    const dragRightEarly = await dispatchTouchStep(page, {
      name: 'touch-drag-right-early',
      start: { x: viewport.width * 0.5, y: viewport.height * 0.5 },
      moves: [{ x: viewport.width * 0.86, y: viewport.height * 0.5 }],
      settleMs: 140,
    });
    const dragRight = await dispatchTouchStep(page, {
      name: 'touch-drag-right',
      start: { x: viewport.width * 0.5, y: viewport.height * 0.5 },
      moves: [{ x: viewport.width * 0.86, y: viewport.height * 0.5 }],
      settleMs: 980,
    });
    const dragUp = await dispatchTouchStep(page, {
      name: 'touch-drag-up',
      start: { x: viewport.width * 0.5, y: viewport.height * 0.5 },
      moves: [{ x: viewport.width * 0.5, y: viewport.height * 0.16 }],
      settleMs: 980,
    });
    const afterRelease = await readSceneState(page, 'touch-after-release');

    return {
      viewport,
      baseline,
      tapOnly,
      dragRightEarly,
      dragRight,
      dragUp,
      afterRelease,
    };
  } finally {
    await page.close();
  }
}

async function dispatchTouchStep(page, step) {
  const end = await page.evaluate(({ start, moves }) => {
    const target = document.querySelector('canvas');
    const pointerId = 23;
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 1,
      pressure: 0.6,
      width: 14,
      height: 14,
    };
    target.dispatchEvent(new PointerEvent('pointerdown', {
      ...base,
      clientX: start.x,
      clientY: start.y,
    }));

    for (const move of moves) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        ...base,
        clientX: move.x,
        clientY: move.y,
      }));
    }

    return moves[moves.length - 1] ?? start;
  }, step);

  await page.waitForTimeout(step.settleMs ?? (step.moves.length > 0 ? 820 : 420));
  const state = await readSceneState(page, step.name);

  await page.evaluate(({ x, y }) => {
    const pointerId = 23;
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      buttons: 0,
      pressure: 0,
      width: 14,
      height: 14,
      clientX: x,
      clientY: y,
    }));
  }, end);

  await page.waitForFunction(
    () => {
      const orbit = Math.abs(Number(document.body.dataset.cameraOrbit));
      const arc = Math.abs(Number(document.body.dataset.cameraArc));
      return Number.isFinite(orbit) && Number.isFinite(arc) && orbit <= 0.055 && arc <= 0.055;
    },
    { timeout: 2200 },
  );
  return state;
}

function makeUrl(viewportName) {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}v=visual-${runId}-${viewportName}`;
}

function makeSamplePoints(width, height) {
  return [
    { name: 'center', x: width * 0.5, y: height * 0.5 },
    { name: 'right', x: width * 0.92, y: height * 0.5 },
    { name: 'up', x: width * 0.5, y: height * 0.09 },
    { name: 'diagonal-right-up', x: width * 0.92, y: height * 0.09 },
    { name: 'down', x: width * 0.5, y: height * 0.91 },
  ];
}

function evaluateQualityGates(report) {
  const failures = [];
  if (report.consoleMessages.length > 0) {
    failures.push(`console has ${report.consoleMessages.length} warning/error messages`);
  }

  for (const entry of report.viewports) {
    const { name, width, height } = entry.viewport;
    const maxEdge = Math.max(entry.regions.leftEdge.brightness, entry.regions.rightEdge.brightness);
    const edgeRatio = maxEdge / Math.max(entry.regions.center.brightness, 1);
    const maxAllowedEdgeRatio = name === 'mobile' ? 0.68 : 0.42;
    const maxAllowedEdgeBrightness = name === 'mobile' ? 22 : 16;

    assertGate(failures, entry.regions.center.brightness >= 26, `${name}: center brightness too low (${entry.regions.center.brightness})`);
    assertGate(failures, entry.regions.center.contrast >= 18, `${name}: center contrast too low (${entry.regions.center.contrast})`);
    assertGate(failures, entry.regions.floorAnchor.brightness >= 24, `${name}: floor anchor brightness too low (${entry.regions.floorAnchor.brightness})`);
    assertGate(failures, edgeRatio <= maxAllowedEdgeRatio, `${name}: edge ratio too high (${edgeRatio.toFixed(3)})`);
    assertGate(failures, maxEdge <= maxAllowedEdgeBrightness, `${name}: edge brightness too high (${maxEdge})`);
    assertGate(failures, entry.motion.meanChannelDelta >= 1.4, `${name}: idle motion too weak (${entry.motion.meanChannelDelta})`);
    assertGate(failures, entry.motion.meanChannelDelta <= 7.2, `${name}: idle motion too strong (${entry.motion.meanChannelDelta})`);
    assertGate(failures, entry.motion.pixelDiffRatio >= 0.18, `${name}: changed pixel ratio too low (${entry.motion.pixelDiffRatio})`);

    const centerSample = entry.samples.find((sample) => sample.sample === 'center');
    const rightSample = entry.samples.find((sample) => sample.sample === 'right');
    const upSample = entry.samples.find((sample) => sample.sample === 'up');
    const diagonalSample = entry.samples.find((sample) => sample.sample === 'diagonal-right-up');
    const downSample = entry.samples.find((sample) => sample.sample === 'down');
    assertGate(failures, centerSample?.cameraAxis === 'center', `${name}: center camera axis is ${centerSample?.cameraAxis}`);
    assertGate(failures, rightSample?.cameraAxis === 'x', `${name}: right camera axis is ${rightSample?.cameraAxis}`);
    assertGate(failures, upSample?.cameraAxis === 'y', `${name}: up camera axis is ${upSample?.cameraAxis}`);
    assertGate(failures, downSample?.cameraAxis === 'y', `${name}: down camera axis is ${downSample?.cameraAxis}`);
    assertGate(failures, ['x', 'y'].includes(diagonalSample?.cameraAxis), `${name}: diagonal camera axis is ${diagonalSample?.cameraAxis}`);
    if (diagonalSample?.cameraAxis === 'x') {
      assertGate(failures, Math.abs(diagonalSample.cameraArc) <= 0.006, `${name}: diagonal leaks vertical arc (${diagonalSample.cameraArc})`);
    }
    if (diagonalSample?.cameraAxis === 'y') {
      assertGate(failures, Math.abs(diagonalSample.cameraOrbit) <= 0.006, `${name}: diagonal leaks horizontal orbit (${diagonalSample.cameraOrbit})`);
    }

    for (const sample of entry.samples) {
      assertGate(failures, sample.sceneReady === 'true', `${name}/${sample.sample}: sceneReady is ${sample.sceneReady}`);
      assertGate(failures, sample.cameraMode === 'constrained-cardinal-arc', `${name}/${sample.sample}: cameraMode is ${sample.cameraMode}`);
      assertGate(failures, sample.cameraRailLock === 'single-axis', `${name}/${sample.sample}: cameraRailLock is ${sample.cameraRailLock}`);
      assertGate(failures, sample.cameraCardinalLock === 'true', `${name}/${sample.sample}: camera cardinal lock is ${sample.cameraCardinalLock}`);
      assertGate(failures, sample.cameraCrossLeak <= 0.055, `${name}/${sample.sample}: camera cross leak too high (${sample.cameraCrossLeak})`);
      if (sample.cameraAxis === 'x') {
        assertGate(failures, Math.abs(sample.cameraArc) <= 0.006, `${name}/${sample.sample}: horizontal rail leaks vertical arc (${sample.cameraArc})`);
      }
      if (sample.cameraAxis === 'y') {
        assertGate(failures, Math.abs(sample.cameraOrbit) <= 0.006, `${name}/${sample.sample}: vertical rail leaks horizontal orbit (${sample.cameraOrbit})`);
      }
      assertGate(failures, sample.arcRevealMode === 'cardinal-environment-reveal', `${name}/${sample.sample}: arc reveal mode is ${sample.arcRevealMode}`);
      assertGate(failures, sample.arcRevealAxis === sample.cameraAxis, `${name}/${sample.sample}: arc reveal axis ${sample.arcRevealAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.focusApertureMode === 'peripheral-depth-focus', `${name}/${sample.sample}: focus aperture mode is ${sample.focusApertureMode}`);
      assertGate(failures, sample.focusApertureAxis === sample.cameraAxis, `${name}/${sample.sample}: focus aperture axis ${sample.focusApertureAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.volumetricDepthMode === 'axis-bound-slit-haze', `${name}/${sample.sample}: volumetric depth mode is ${sample.volumetricDepthMode}`);
      assertGate(failures, sample.volumetricDepthAxis === sample.cameraAxis, `${name}/${sample.sample}: volumetric depth axis ${sample.volumetricDepthAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.thresholdDepthMode === 'private-threshold-depth-lens', `${name}/${sample.sample}: threshold depth mode is ${sample.thresholdDepthMode}`);
      assertGate(failures, sample.thresholdDepthAxis === sample.cameraAxis, `${name}/${sample.sample}: threshold depth axis ${sample.thresholdDepthAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.thresholdPressureMode === 'peripheral-threshold-pressure', `${name}/${sample.sample}: threshold pressure mode is ${sample.thresholdPressureMode}`);
      assertGate(failures, sample.thresholdPressureAxis === sample.cameraAxis, `${name}/${sample.sample}: threshold pressure axis ${sample.thresholdPressureAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.thresholdPressureAlpha >= 0.27 && sample.thresholdPressureAlpha <= 0.42, `${name}/${sample.sample}: threshold pressure alpha out of range (${sample.thresholdPressureAlpha})`);
      assertGate(failures, sample.depthShearMode === 'axis-bound-anamorphic-depth-shear', `${name}/${sample.sample}: depth shear mode is ${sample.depthShearMode}`);
      assertGate(failures, sample.depthShearAxis === sample.cameraAxis, `${name}/${sample.sample}: depth shear axis ${sample.depthShearAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.depthShearAlpha >= 0.12 && sample.depthShearAlpha <= 0.26, `${name}/${sample.sample}: depth shear alpha out of range (${sample.depthShearAlpha})`);
      assertGate(failures, sample.sideSeparationMode === 'cinematic-side-depth-separation', `${name}/${sample.sample}: side separation mode is ${sample.sideSeparationMode}`);
      assertGate(failures, sample.sideSeparationAxis === sample.cameraAxis, `${name}/${sample.sample}: side separation axis ${sample.sideSeparationAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.sideSeparationAlpha >= 0.13 && sample.sideSeparationAlpha <= 0.24, `${name}/${sample.sample}: side separation alpha out of range (${sample.sideSeparationAlpha})`);
      assertGate(failures, sample.presenceTraceMode === 'non-ui-directional-presence-memory', `${name}/${sample.sample}: presence trace mode is ${sample.presenceTraceMode}`);
      assertGate(failures, sample.presenceTraceAxis === sample.cameraAxis, `${name}/${sample.sample}: presence trace axis ${sample.presenceTraceAxis} does not match camera ${sample.cameraAxis}`);
      assertGate(failures, sample.presenceTracePeak >= 0 && sample.presenceTracePeak <= 0.72, `${name}/${sample.sample}: presence trace peak out of range (${sample.presenceTracePeak})`);
      assertGate(failures, sample.subjectMatteMode === 'cinematic-negative-fill-subject-clarity', `${name}/${sample.sample}: subject matte mode is ${sample.subjectMatteMode}`);
      assertGate(failures, sample.subjectMatteAlpha >= 0.09 && sample.subjectMatteAlpha <= 0.17, `${name}/${sample.sample}: subject matte alpha out of range (${sample.subjectMatteAlpha})`);
      assertGate(failures, sample.floorReflectionMode === 'scene-anchored-contact-reflection', `${name}/${sample.sample}: floor reflection mode is ${sample.floorReflectionMode}`);
      assertGate(failures, sample.floorReflectionAlpha >= 0.045 && sample.floorReflectionAlpha <= 0.11, `${name}/${sample.sample}: floor reflection alpha out of range (${sample.floorReflectionAlpha})`);
      assertGate(failures, sample.contactPressureMode === 'scene-anchored-contact-pressure', `${name}/${sample.sample}: contact pressure mode is ${sample.contactPressureMode}`);
      assertGate(failures, sample.contactPressureAlpha >= 0.08 && sample.contactPressureAlpha <= 0.16, `${name}/${sample.sample}: contact pressure alpha out of range (${sample.contactPressureAlpha})`);
      assertGate(failures, sample.characterRimMode === 'dual-tone-silhouette-separation', `${name}/${sample.sample}: character rim mode is ${sample.characterRimMode}`);
      assertGate(failures, isAlphaPairInRange(sample.characterRimAlpha, 0.024, 0.072), `${name}/${sample.sample}: character rim alpha out of range (${sample.characterRimAlpha})`);
      assertGate(failures, sample.subjectLustreMode === 'pose-locked-micro-lustre', `${name}/${sample.sample}: subject lustre mode is ${sample.subjectLustreMode}`);
      assertGate(failures, sample.subjectLustrePeak >= 0.025 && sample.subjectLustrePeak <= 0.13, `${name}/${sample.sample}: subject lustre peak out of range (${sample.subjectLustrePeak})`);
      assertGate(failures, sample.cinematicGrainMode === 'procedural-cinematic-grain', `${name}/${sample.sample}: cinematic grain mode is ${sample.cinematicGrainMode}`);
      assertGate(failures, sample.cinematicGrainAlpha >= 0.024 && sample.cinematicGrainAlpha <= 0.052, `${name}/${sample.sample}: cinematic grain alpha out of range (${sample.cinematicGrainAlpha})`);
      assertGate(failures, sample.anchorLayer === 'backgroundLayer', `${name}/${sample.sample}: anchorLayer is ${sample.anchorLayer}`);
      assertGate(failures, sample.canvas?.width === width && sample.canvas?.height === height, `${name}/${sample.sample}: canvas is ${sample.canvas?.width}x${sample.canvas?.height}`);
      assertGate(failures, isFootInside(sample.subjectFoot, width, height), `${name}/${sample.sample}: subjectFoot out of viewport (${sample.subjectFoot})`);
    }
  }

  return {
    failures,
    thresholds: {
      centerBrightnessMin: 26,
      centerContrastMin: 18,
      floorBrightnessMin: 24,
      edgeRatioMax: { desktop: 0.42, tablet: 0.42, mobile: 0.68 },
      edgeBrightnessMax: { desktop: 16, tablet: 16, mobile: 22 },
      idleMotionMeanChannelDelta: { min: 1.4, max: 7.2 },
      pixelDiffRatioMin: 0.18,
      touchEarlyDragOrbitRange: { min: 0.08, max: 0.48 },
      touchFinalDragOrbitMin: 0.54,
    },
  };
}

function evaluateTouchGates(failures, touchInput) {
  assertGate(failures, touchInput.tapOnly.touchCameraMode === 'relative-drag-smoothed-no-teleport', `touch mode is ${touchInput.tapOnly.touchCameraMode}`);
  assertGate(failures, touchInput.tapOnly.inputMode === 'touch-drag', `touch tap input mode is ${touchInput.tapOnly.inputMode}`);
  assertGate(failures, touchInput.tapOnly.cameraAxis === 'center', `touch tap jumps camera axis to ${touchInput.tapOnly.cameraAxis}`);
  assertGate(failures, Math.abs(touchInput.tapOnly.cameraOrbit) <= 0.05, `touch tap jumps horizontal orbit (${touchInput.tapOnly.cameraOrbit})`);
  assertGate(failures, Math.abs(touchInput.tapOnly.cameraArc) <= 0.05, `touch tap jumps vertical arc (${touchInput.tapOnly.cameraArc})`);
  assertGate(failures, touchInput.dragRightEarly.inputMode === 'touch-drag', `touch early drag input mode is ${touchInput.dragRightEarly.inputMode}`);
  assertGate(failures, touchInput.dragRightEarly.cameraAxis === 'x', `touch early right drag axis is ${touchInput.dragRightEarly.cameraAxis}`);
  assertGate(failures, touchInput.dragRightEarly.cameraOrbit >= 0.08, `touch early right drag does not start moving (${touchInput.dragRightEarly.cameraOrbit})`);
  assertGate(failures, touchInput.dragRightEarly.cameraOrbit <= 0.48, `touch early right drag teleports too far (${touchInput.dragRightEarly.cameraOrbit})`);
  assertGate(failures, Math.abs(touchInput.dragRightEarly.cameraArc) <= 0.006, `touch early right drag leaks vertical arc (${touchInput.dragRightEarly.cameraArc})`);
  assertGate(failures, touchInput.dragRight.inputMode === 'touch-drag', `touch right drag input mode is ${touchInput.dragRight.inputMode}`);
  assertGate(failures, touchInput.dragRight.cameraAxis === 'x', `touch right drag axis is ${touchInput.dragRight.cameraAxis}`);
  assertGate(failures, touchInput.dragRight.cameraOrbit >= 0.54, `touch right drag orbit too weak (${touchInput.dragRight.cameraOrbit})`);
  assertGate(failures, Math.abs(touchInput.dragRight.cameraArc) <= 0.006, `touch right drag leaks vertical arc (${touchInput.dragRight.cameraArc})`);
  assertGate(failures, touchInput.dragUp.inputMode === 'touch-drag', `touch up drag input mode is ${touchInput.dragUp.inputMode}`);
  assertGate(failures, touchInput.dragUp.cameraAxis === 'y', `touch up drag axis is ${touchInput.dragUp.cameraAxis}`);
  assertGate(failures, touchInput.dragUp.cameraArc <= -0.32, `touch up drag arc too weak (${touchInput.dragUp.cameraArc})`);
  assertGate(failures, Math.abs(touchInput.dragUp.cameraOrbit) <= 0.006, `touch up drag leaks horizontal orbit (${touchInput.dragUp.cameraOrbit})`);
}

function assertGate(failures, condition, message) {
  if (!condition) failures.push(message);
}

function isFootInside(value, width, height) {
  const [x, y] = String(value).split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= width && y >= height * 0.35 && y <= height;
}

function isAlphaPairInRange(value, min, max) {
  const items = String(value).split(',').map(Number);
  return items.length === 2 && items.every((item) => Number.isFinite(item) && item >= min && item <= max);
}

function analyzeRegions(png) {
  return {
    center: sampleRegion(png, 0.38, 0.16, 0.3, 0.66),
    floorAnchor: sampleRegion(png, 0.36, 0.72, 0.34, 0.18),
    leftEdge: sampleRegion(png, 0, 0.08, 0.18, 0.84),
    rightEdge: sampleRegion(png, 0.82, 0.08, 0.18, 0.84),
  };
}

function sampleRegion(png, x, y, width, height) {
  const x0 = Math.floor(png.width * x);
  const y0 = Math.floor(png.height * y);
  const x1 = Math.min(png.width, Math.ceil(png.width * (x + width)));
  const y1 = Math.min(png.height, Math.ceil(png.height * (y + height)));
  let count = 0;
  let brightnessTotal = 0;
  let brightnessSqTotal = 0;

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const index = (py * png.width + px) * 4;
      const brightness = (png.data[index] + png.data[index + 1] + png.data[index + 2]) / 3;
      brightnessTotal += brightness;
      brightnessSqTotal += brightness * brightness;
      count += 1;
    }
  }

  const mean = brightnessTotal / Math.max(count, 1);
  const variance = brightnessSqTotal / Math.max(count, 1) - mean * mean;
  return {
    brightness: Number(mean.toFixed(3)),
    contrast: Number(Math.sqrt(Math.max(variance, 0)).toFixed(3)),
  };
}

function compareBuffers(a, b) {
  const comparedBytes = Math.min(a.length, b.length);
  let differingBytes = Math.abs(a.length - b.length);
  for (let i = 0; i < comparedBytes; i += 1) {
    if (a[i] !== b[i]) differingBytes += 1;
  }
  return {
    comparedBytes,
    differingBytes,
    ratio: Number((differingBytes / Math.max(comparedBytes, 1)).toFixed(6)),
  };
}

function comparePngPixels(a, b) {
  const first = PNG.sync.read(a);
  const second = PNG.sync.read(b);
  const width = Math.min(first.width, second.width);
  const height = Math.min(first.height, second.height);
  let changedPixels = 0;
  let deltaTotal = 0;
  const threshold = 4;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const firstIndex = (y * first.width + x) * 4;
      const secondIndex = (y * second.width + x) * 4;
      const dr = Math.abs(first.data[firstIndex] - second.data[secondIndex]);
      const dg = Math.abs(first.data[firstIndex + 1] - second.data[secondIndex + 1]);
      const db = Math.abs(first.data[firstIndex + 2] - second.data[secondIndex + 2]);
      const da = Math.abs(first.data[firstIndex + 3] - second.data[secondIndex + 3]);
      const pixelDelta = dr + dg + db + da;
      deltaTotal += pixelDelta;
      if (pixelDelta > threshold) changedPixels += 1;
    }
  }

  const comparedPixels = width * height;
  return {
    comparedPixels,
    changedPixels,
    ratio: Number((changedPixels / Math.max(comparedPixels, 1)).toFixed(6)),
    meanChannelDelta: Number((deltaTotal / Math.max(comparedPixels * 4, 1)).toFixed(4)),
  };
}

async function readSceneState(page, sample) {
  return page.evaluate((sampleName) => {
    const canvas = document.querySelector('canvas');
    return {
      sample: sampleName,
      sceneReady: document.body.dataset.sceneReady,
      cameraMode: document.body.dataset.cameraMode,
      inputMode: document.body.dataset.inputMode,
      touchCameraMode: document.body.dataset.touchCameraMode,
      cameraAxis: document.body.dataset.cameraAxis,
      cameraRailLock: document.body.dataset.cameraRailLock,
      cameraOrbit: Number(document.body.dataset.cameraOrbit),
      cameraArc: Number(document.body.dataset.cameraArc),
      cameraRadius: Number(document.body.dataset.cameraRadius),
      cameraCrossLeak: Number(document.body.dataset.cameraCrossLeak),
      cameraCardinalLock: document.body.dataset.cameraCardinalLock,
      arcRevealMode: document.body.dataset.arcRevealMode,
      arcRevealAxis: document.body.dataset.arcRevealAxis,
      focusApertureMode: document.body.dataset.focusApertureMode,
      focusApertureAxis: document.body.dataset.focusApertureAxis,
      volumetricDepthMode: document.body.dataset.volumetricDepthMode,
      volumetricDepthAxis: document.body.dataset.volumetricDepthAxis,
      thresholdDepthMode: document.body.dataset.thresholdDepthMode,
      thresholdDepthAxis: document.body.dataset.thresholdDepthAxis,
      thresholdPressureMode: document.body.dataset.thresholdPressureMode,
      thresholdPressureAxis: document.body.dataset.thresholdPressureAxis,
      thresholdPressureAlpha: Number(document.body.dataset.thresholdPressureAlpha),
      depthShearMode: document.body.dataset.depthShearMode,
      depthShearAxis: document.body.dataset.depthShearAxis,
      depthShearAlpha: Number(document.body.dataset.depthShearAlpha),
      sideSeparationMode: document.body.dataset.sideSeparationMode,
      sideSeparationAxis: document.body.dataset.sideSeparationAxis,
      sideSeparationAlpha: Number(document.body.dataset.sideSeparationAlpha),
      presenceTraceMode: document.body.dataset.presenceTraceMode,
      presenceTraceAxis: document.body.dataset.presenceTraceAxis,
      presenceTracePeak: Number(document.body.dataset.presenceTracePeak),
      subjectMatteMode: document.body.dataset.subjectMatteMode,
      subjectMatteAlpha: Number(document.body.dataset.subjectMatteAlpha),
      floorReflectionMode: document.body.dataset.floorReflectionMode,
      floorReflectionAlpha: Number(document.body.dataset.floorReflectionAlpha),
      contactPressureMode: document.body.dataset.contactPressureMode,
      contactPressureAlpha: Number(document.body.dataset.contactPressureAlpha),
      characterRimMode: document.body.dataset.characterRimMode,
      characterRimAlpha: document.body.dataset.characterRimAlpha,
      subjectLustreMode: document.body.dataset.subjectLustreMode,
      subjectLustrePeak: Number(document.body.dataset.subjectLustrePeak),
      cinematicGrainMode: document.body.dataset.cinematicGrainMode,
      cinematicGrainAlpha: Number(document.body.dataset.cinematicGrainAlpha),
      subjectFoot: document.body.dataset.subjectFoot,
      anchorLocal: document.body.dataset.anchorLocal,
      anchorLayer: document.body.dataset.anchorLayer,
      viewport: { width: innerWidth, height: innerHeight },
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    };
  }, sample);
}
