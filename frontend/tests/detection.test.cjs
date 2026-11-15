const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DetectionController,
  filterRelevantDetections,
  mapBoxToCover,
  normalizeFaceDetections
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


const { GreedyObjectTracker } = require("../detection.js");

function detection(label, x, y = 100, width = 80, height = 60, score = 0.9) {
  return { label, score, box: { x, y, width, height } };
}

test("keeps the same track ID as an object moves between frames", () => {
  const tracker = new GreedyObjectTracker();
  const first = tracker.update([detection("car", 100)], 1000, { width: 1280, height: 720 });
  const next = tracker.update([detection("car", 112)], 1180, { width: 1280, height: 720 });

  assert.equal(first[0].trackId, next[0].trackId);
  assert.equal(next[0].trackingConfirmed, true);
  assert.equal(next[0].trackHits, 2);
});

test("keeps two same-class objects on separate IDs when detector order changes", () => {
  const tracker = new GreedyObjectTracker();
  const first = tracker.update([
    detection("car", 100),
    detection("car", 700)
  ], 1000, { width: 1280, height: 720 });
  const next = tracker.update([
    detection("car", 688),
    detection("car", 112)
  ], 1180, { width: 1280, height: 720 });

  assert.equal(next[0].trackId, first[1].trackId);
  assert.equal(next[1].trackId, first[0].trackId);
});

test("recovers the same ID after a short detector miss", () => {
  const tracker = new GreedyObjectTracker();
  const first = tracker.update([detection("person", 200)], 1000, { width: 1280, height: 720 });
  tracker.update([], 1180, { width: 1280, height: 720 });
  const recovered = tracker.update([detection("person", 208)], 1360, { width: 1280, height: 720 });

  assert.equal(recovered[0].trackId, first[0].trackId);
});

test("expires stale tracks after the missed-frame budget", () => {
  const tracker = new GreedyObjectTracker({ maxMissedFrames: 2 });
  const first = tracker.update([detection("truck", 300)], 1000, { width: 1280, height: 720 });
  tracker.update([], 1180, { width: 1280, height: 720 });
  tracker.update([], 1360, { width: 1280, height: 720 });
  tracker.update([], 1540, { width: 1280, height: 720 });
  const reappeared = tracker.update([detection("truck", 300)], 1720, { width: 1280, height: 720 });

  assert.notEqual(reappeared[0].trackId, first[0].trackId);
});

test("does not associate objects with a different class label", () => {
  const tracker = new GreedyObjectTracker();
  const car = tracker.update([detection("car", 300)], 1000, { width: 1280, height: 720 });
  const person = tracker.update([detection("person", 300)], 1180, { width: 1280, height: 720 });

  assert.notEqual(person[0].trackId, car[0].trackId);
});

test("resets track IDs when a new detection session begins", () => {
  const tracker = new GreedyObjectTracker();
  const first = tracker.update([detection("bus", 300)], 1000, { width: 1280, height: 720 });
  tracker.reset();
  const next = tracker.update([detection("bus", 300)], 2000, { width: 1280, height: 720 });

  assert.equal(first[0].trackId, 1);
  assert.equal(next[0].trackId, 1);
});


test("expires a track after the elapsed-time budget even if missed-frame budget remains", () => {
  const tracker = new GreedyObjectTracker({ maxMissedFrames: 20, maxMissedMs: 300 });
  const first = tracker.update([detection("car", 120)], 1000, { width: 1280, height: 720 });
  tracker.update([], 1180, { width: 1280, height: 720 });
  tracker.update([], 1360, { width: 1280, height: 720 });
  const reappeared = tracker.update([detection("car", 120)], 1540, { width: 1280, height: 720 });

  assert.notEqual(reappeared[0].trackId, first[0].trackId);
});


test("normalizes MediaPipe face results into pixel bounding boxes", () => {
  const faces = normalizeFaceDetections([
    {
      categories: [{ score: 0.91 }],
      boundingBox: { originX: 120, originY: 70, width: 90, height: 110 }
    },
    {
      categories: [{ score: 0.2 }],
      boundingBox: { originX: 10, originY: 10, width: 30, height: 30 }
    },
    {
      categories: [{ score: 0.88 }],
      boundingBox: null
    }
  ]);

  assert.equal(faces.length, 1);
  assert.equal(faces[0].label, "face");
  assert.equal(faces[0].score, 0.91);
  assert.deepEqual(faces[0].box, { x: 120, y: 70, width: 90, height: 110 });
});

test("accepts face as a supported tracked detection class", () => {
  const faces = filterRelevantDetections([
    { label: "face", score: 0.86, box: { x: 20, y: 30, width: 80, height: 95 } }
  ]);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].label, "face");
});

test("assigns a stable tracking ID to a face across adjacent frames", () => {
  const tracker = new GreedyObjectTracker();
  const first = tracker.update([detection("face", 220, 90, 90, 110)], 1000, { width: 1280, height: 720 });
  const next = tracker.update([detection("face", 224, 92, 90, 110)], 1180, { width: 1280, height: 720 });
  assert.equal(first[0].trackId, next[0].trackId);
  assert.equal(next[0].trackingConfirmed, true);
});
