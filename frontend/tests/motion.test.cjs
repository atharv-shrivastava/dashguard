const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "motion.js"), "utf8");

function makeMonitor({ permission = null } = {}) {
  let now = 1000;
  let motionListener = null;
  const statuses = [];
  const samples = [];
  const errors = [];

  class MockDeviceMotionEvent {}
  if (permission) MockDeviceMotionEvent.requestPermission = permission;

  const mockWindow = {
    isSecureContext: true,
    DeviceMotionEvent: MockDeviceMotionEvent,
    addEventListener(name, listener) {
      if (name === "devicemotion") motionListener = listener;
    },
    removeEventListener(name, listener) {
      if (name === "devicemotion" && motionListener === listener) motionListener = null;
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {}
  };

  const context = {
    window: mockWindow,
    performance: { now: () => now },
    Number,
    Math
  };
  vm.runInNewContext(source, context);

  const monitor = new mockWindow.DashGuardMotionMonitor({
    onStatus: (state, label) => statuses.push({ state, label }),
    onSample: sample => samples.push(sample),
    onError: message => errors.push(message)
  });

  return {
    monitor,
    statuses,
    samples,
    errors,
    hasListener: () => motionListener !== null,
    emit(time, event) {
      now = time;
      assert.ok(motionListener, "motion listener should be attached before emitting");
      motionListener(event);
    }
  };
}

const motionEvent = (x, rotation = 0) => ({
  acceleration: { x, y: 0, z: 0 },
  accelerationIncludingGravity: null,
  rotationRate: { alpha: 0, beta: 0, gamma: rotation }
});

test("reads acceleration, calculates jerk and receives gyroscope rate", async () => {
  const harness = makeMonitor();
  assert.equal(await harness.monitor.start(), true);
  assert.equal(harness.hasListener(), true);

  harness.emit(1000, motionEvent(0));
  harness.emit(1250, motionEvent(0));
  harness.emit(1500, motionEvent(4, 10));
  harness.emit(1750, motionEvent(10, 15));

  assert.ok(harness.samples.length >= 2);
  assert.ok(harness.samples.some(sample => sample.jerk > 0));
  assert.ok(harness.samples.every(sample => Number.isFinite(sample.acceleration)));
  assert.ok(harness.samples.every(sample => Number.isFinite(sample.gyro)));
  assert.equal(harness.samples.at(-1).gyro, 15);

  harness.monitor.stop();
  assert.equal(harness.hasListener(), false);
});

test("uses gravity-compensated acceleration when linear acceleration is unavailable", async () => {
  const harness = makeMonitor();
  assert.equal(await harness.monitor.start(), true);

  const withGravity = { acceleration: null, accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 }, rotationRate: null };
  harness.emit(1000, withGravity);
  harness.emit(1250, withGravity);
  harness.emit(1500, { ...withGravity, accelerationIncludingGravity: { x: 1, y: 0, z: 9.8 } });

  assert.ok(harness.samples.length >= 2);
  assert.ok(harness.samples.every(sample => Number.isFinite(sample.acceleration)));
  assert.equal(harness.samples.at(-1).gyro, null);

  harness.monitor.stop();
});

test("does not start when the user denies motion permission", async () => {
  const harness = makeMonitor({ permission: async () => "denied" });
  assert.equal(await harness.monitor.start(), false);
  assert.equal(harness.hasListener(), false);
  assert.equal(harness.statuses.at(-1).state, "error");
  assert.equal(harness.errors.length, 1);
});

test("stops cleanly when the sensor provides no usable acceleration fields", async () => {
  const harness = makeMonitor();
  assert.equal(await harness.monitor.start(), true);
  harness.emit(1000, motionEvent(0));
  harness.emit(1250, { acceleration: null, accelerationIncludingGravity: null, rotationRate: null });
  assert.equal(harness.monitor.active, false);
  assert.equal(harness.hasListener(), false);
  assert.equal(harness.errors.length, 1);
});
