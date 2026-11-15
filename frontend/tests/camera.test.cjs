const test = require("node:test");
const assert = require("node:assert/strict");
const { CameraPreviewController } = require("../camera.js");

function makeTrack() {
  let stopped = 0;
  const listeners = {};
  return {
    stop() { stopped += 1; },
    addEventListener(name, callback) { listeners[name] = callback; },
    end() { if (listeners.ended) listeners.ended(); },
    get stopped() { return stopped; }
  };
}

function makeStream(track) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track]
  };
}

function makeVideo() {
  return {
    srcObject: null,
    muted: false,
    playsInline: false,
    playCalls: 0,
    pauseCalls: 0,
    async play() { this.playCalls += 1; },
    pause() { this.pauseCalls += 1; }
  };
}

test("opens a video-only rear-camera-preferred stream and attaches it to the preview", async () => {
  const track = makeTrack();
  const stream = makeStream(track);
  const video = makeVideo();
  const statuses = [];
  let requested;
  const camera = new CameraPreviewController({
    videoElement: video,
    secureContext: true,
    mediaDevices: { getUserMedia: async constraints => { requested = constraints; return stream; } },
    onStatus: state => statuses.push(state)
  });

  const result = await camera.start();
  assert.equal(result.ok, true);
  assert.equal(camera.active, true);
  assert.equal(video.srcObject, stream);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.playCalls, 1);
  assert.equal(requested.audio, false);
  assert.deepEqual(requested.video.facingMode, { ideal: "environment" });
  assert.deepEqual(statuses, ["waiting", "active"]);
});

test("stops every track and clears the preview", async () => {
  const track = makeTrack();
  const stream = makeStream(track);
  const video = makeVideo();
  const camera = new CameraPreviewController({
    videoElement: video,
    secureContext: true,
    mediaDevices: { getUserMedia: async () => stream }
  });

  await camera.start();
  camera.stop();
  assert.equal(camera.active, false);
  assert.equal(video.srcObject, null);
  assert.equal(video.pauseCalls, 1);
  assert.equal(track.stopped, 1);
});

test("refuses camera access on an insecure origin", async () => {
  const video = makeVideo();
  let requested = false;
  const errors = [];
  const camera = new CameraPreviewController({
    videoElement: video,
    secureContext: false,
    mediaDevices: { getUserMedia: async () => { requested = true; } },
    onError: message => errors.push(message)
  });

  const result = await camera.start();
  assert.equal(result.ok, false);
  assert.equal(requested, false);
  assert.match(errors[0], /HTTPS or localhost/);
});

test("handles permission denial without leaving the camera active", async () => {
  const video = makeVideo();
  const statuses = [];
  const errors = [];
  const camera = new CameraPreviewController({
    videoElement: video,
    secureContext: true,
    mediaDevices: { getUserMedia: async () => { const error = new Error("denied"); error.name = "NotAllowedError"; throw error; } },
    onStatus: state => statuses.push(state),
    onError: message => errors.push(message)
  });

  const result = await camera.start();
  assert.equal(result.ok, false);
  assert.equal(camera.active, false);
  assert.equal(video.srcObject, null);
  assert.equal(statuses.at(-1), "error");
  assert.match(errors[0], /permission was denied/i);
});

test("releases a stream if Stop is tapped while permission is pending", async () => {
  const track = makeTrack();
  const stream = makeStream(track);
  let resolveRequest;
  const video = makeVideo();
  const camera = new CameraPreviewController({
    videoElement: video,
    secureContext: true,
    mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveRequest = resolve; }) }
  });

  const opening = camera.start();
  camera.stop();
  resolveRequest(stream);
  const result = await opening;
  assert.equal(result.cancelled, true);
  assert.equal(camera.active, false);
  assert.equal(video.srcObject, null);
  assert.equal(track.stopped, 1);
});

test("releases the preview if the camera track ends unexpectedly", async () => {
  const track = makeTrack();
  const stream = makeStream(track);
  const video = makeVideo();
  const statuses = [];
  const camera = new CameraPreviewController({
    videoElement: video,
    secureContext: true,
    mediaDevices: { getUserMedia: async () => stream },
    onStatus: state => statuses.push(state)
  });

  await camera.start();
  track.end();
  assert.equal(camera.active, false);
  assert.equal(video.srcObject, null);
  assert.equal(track.stopped, 1);
  assert.equal(statuses.at(-1), "error");
});
