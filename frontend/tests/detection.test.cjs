const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DetectionController,
  filterRelevantDetections,
  mapBoxToCover
} = require("../detection.js");

test("keeps relevant road classes and drops low-confidence or unrelated labels", () => {
  const result = filterRelevantDetections([
    { label: "person", score: 0.92, box: { x: 10, y: 20, width: 30, height: 50 } },
    { label: "car", score: 0.61, box: { x: 100, y: 90, width: 80, height: 40 } },
    { label: "cat", score: 0.99, box: { x: 1, y: 1, width: 10, height: 10 } },
    { label: "truck", score: 0.20, box: { x: 1, y: 1, width: 10, height: 10 } },
    { label: "bus", score: 0.80, box: null }
  ]);

  assert.deepEqual(result.map(item => item.label), ["person", "car"]);
});

test("maps detector coordinates through the same centered object-fit cover crop", () => {
  const mapped = mapBoxToCover(
    { x: 100, y: 100, width: 200, height: 100 },
    1280, 720, 400, 240
  );

  assert.ok(Math.abs(mapped.x - 20) < 0.01);
  assert.ok(Math.abs(mapped.y - 33.3333) < 0.01);
  assert.ok(Math.abs(mapped.width - 66.6667) < 0.01);
  assert.ok(Math.abs(mapped.height - 33.3333) < 0.01);
});

test("starts the worker-backed detector and shuts it down cleanly", async () => {
  const statuses = [];
  let createdWorker;
  let cancelledFrame = null;
  const workerFactory = () => {
    createdWorker = {
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage(message) {
        if (message.type === "init") {
          queueMicrotask(() => this.onmessage({ data: { type: "ready" } }));
        }
      },
      terminate() { this.terminated = true; }
    };
    return createdWorker;
  };
  const detector = new DetectionController({
    videoElement: { readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 1 },
    canvasElement: { getContext: () => ({ clearRect() {} }) },
    workerFactory,
    createBitmap: async () => ({ close() {} }),
    requestFrame: () => 7,
    cancelFrame: id => { cancelledFrame = id; },
    onStatus: (state, label) => statuses.push([state, label])
  });

  assert.equal(await detector.start(), true);
  assert.equal(detector.running, true);
  assert.equal(statuses.at(-1)[0], "active");

  detector.stop();
  assert.equal(detector.running, false);
  assert.equal(createdWorker.terminated, true);
  assert.equal(cancelledFrame, 7);
  assert.equal(statuses.at(-1)[0], "off");
});

test("reports a model initialization failure without leaving the worker running", async () => {
  const statuses = [];
  const detector = new DetectionController({
    videoElement: { readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 1 },
    canvasElement: { getContext: () => ({ clearRect() {} }) },
    workerFactory: () => ({
      onmessage: null,
      onerror: null,
      postMessage(message) {
        if (message.type === "init") {
          queueMicrotask(() => this.onmessage({
            data: { type: "error", fatal: true, message: "model unavailable" }
          }));
        }
      },
      terminate() {}
    }),
    createBitmap: async () => ({ close() {} }),
    requestFrame: () => 1,
    cancelFrame() {},
    onStatus: (state, label) => statuses.push([state, label])
  });

  assert.equal(await detector.start(), false);
  assert.equal(detector.running, false);
  assert.equal(statuses.at(-1)[0], "error");
});
