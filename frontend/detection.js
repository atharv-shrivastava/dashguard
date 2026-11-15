(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DashGuardObjectDetection = api.DetectionController;
  root.DashGuardDetectionUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const RELEVANT_LABELS = new Set([
    "person", "bicycle", "car", "motorcycle", "bus", "train", "truck",
    "traffic light", "stop sign", "parking meter"
  ]);
  const MINIMUM_SCORE = 0.35;
  const FRAME_INTERVAL_MS = 180;
  const ASSET_CACHE = "dashguard-ui-v6";
  const MEDIAPIPE_ASSETS = [
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs",
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.js",
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm/vision_wasm_internal.wasm",
    "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite"
  ];

  function filterRelevantDetections(detections, minimumScore = MINIMUM_SCORE) {
    return (Array.isArray(detections) ? detections : [])
      .map(item => ({
        ...item,
        label: String(item.label || "").trim().toLowerCase().replace(/_/g, " ")
      }))
      .filter(item => RELEVANT_LABELS.has(item.label) &&
        Number.isFinite(item.score) && item.score >= minimumScore &&
        item.box && Number.isFinite(item.box.x) && Number.isFinite(item.box.y) &&
        Number.isFinite(item.box.width) && Number.isFinite(item.box.height));
  }

  // The video uses object-fit: cover. Apply the same centered crop to detector
  // coordinates so boxes remain aligned with the visible camera image.
  function mapBoxToCover(box, sourceWidth, sourceHeight, viewWidth, viewHeight) {
    const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
    const offsetX = (viewWidth - sourceWidth * scale) / 2;
    const offsetY = (viewHeight - sourceHeight * scale) / 2;
    return {
      x: offsetX + box.x * scale,
      y: offsetY + box.y * scale,
      width: box.width * scale,
      height: box.height * scale
    };
  }

  class DetectionController {
    constructor(options) {
      const settings = options || {};
      this.video = settings.videoElement;
      this.canvas = settings.canvasElement;
      this.onStatus = typeof settings.onStatus === "function" ? settings.onStatus : function () {};
      this.onDetections = typeof settings.onDetections === "function" ? settings.onDetections : function () {};
      this.onError = typeof settings.onError === "function" ? settings.onError : function () {};
      this.workerFactory = settings.workerFactory || (() =>
        new Worker(new URL("./detection-worker.js", document.baseURI), { type: "module" }));
      this.createBitmap = settings.createBitmap || (typeof createImageBitmap === "function"
        ? createImageBitmap.bind(root) : null);
      this.requestFrame = settings.requestFrame || (callback => requestAnimationFrame(callback));
      this.cancelFrame = settings.cancelFrame || (id => cancelAnimationFrame(id));
      this.worker = null;
      this.running = false;
      this.starting = false;
      this.startPromise = null;
      this.resolveStart = null;
      this.generation = 0;
      this.frameHandle = null;
      this.inFlight = false;
      this.lastCaptureAt = 0;
      this.lastVideoTime = -1;
      this.timestampMs = 0;
      this.lastFrameMeta = null;
    }

    async start() {
      if (this.running) return true;
      if (this.startPromise) return this.startPromise;
      if (!this.video || !this.canvas || !this.createBitmap) {
        const message = "This browser cannot prepare camera frames for local detection.";
        this.onStatus("error", "DETECTION UNSUPPORTED");
        this.onError(message);
        return false;
      }
      if (this.video.readyState < 2 || !this.video.videoWidth || !this.video.videoHeight) {
        const message = "The live camera is not ready yet. Retry after the preview appears.";
        this.onStatus("error", "WAITING FOR CAMERA");
        this.onError(message);
        return false;
      }

      const generation = ++this.generation;
      this.starting = true;
      this.onStatus("loading", "PREPARING LOCAL DETECTOR");
      const pendingStart = new Promise(resolve => { this.resolveStart = resolve; });
      this.startPromise = pendingStart;

      try {
        await this.cacheVisionAssets();
        if (generation !== this.generation || !this.starting) return pendingStart;
        this.onStatus("loading", "LOADING ON-DEVICE MODEL");
        this.worker = this.workerFactory();
        this.worker.onmessage = event => this.handleMessage(event.data, generation);
        this.worker.onerror = event => {
          event.preventDefault?.();
          this.fail(generation, event.message || "The detection worker stopped unexpectedly.");
        };
        this.worker.postMessage({ type: "init" });
      } catch (error) {
        this.fail(generation, error.message || "Could not start the detection worker.");
        return pendingStart;
      }
      return pendingStart;
    }

    async cacheVisionAssets() {
      // Warm the version-pinned runtime/model from the controlled page thread.
      // The service worker stores successful CORS responses for later offline use.
      if (!root.caches || typeof root.fetch !== "function") return;
      const cache = await root.caches.open(ASSET_CACHE);
      for (const url of MEDIAPIPE_ASSETS) {
        if (await cache.match(url)) continue;
        const response = await root.fetch(url, { mode: "cors", cache: "force-cache" });
        if (!response.ok || response.type === "opaque") {
          throw new Error("Could not download a required local detection asset: " + url);
        }
        await cache.put(url, response.clone()).catch(() => {});
      }
    }

    handleMessage(message, generation) {
      if (generation !== this.generation || !message) return;
      if (message.type === "ready") {
        this.starting = false;
        this.running = true;
        this.onStatus("active", "LOCAL DETECTION LIVE");
        const resolve = this.resolveStart;
        this.resolveStart = null;
        if (resolve) resolve(true);
        this.scheduleFrame();
        return;
      }
      if (message.type === "result") {
        this.inFlight = false;
        const detections = filterRelevantDetections(message.detections);
        this.draw(detections, message.imageWidth, message.imageHeight);
        this.onDetections(detections, { inferenceMs: message.inferenceMs });
        return;
      }
      if (message.type === "error") {
        this.inFlight = false;
        if (message.fatal) this.fail(generation, message.message);
        else this.onError(message.message || "A camera frame could not be analysed.");
      }
    }

    fail(generation, message) {
      if (generation !== this.generation) return;
      this.running = false;
      this.starting = false;
      if (this.worker) this.worker.terminate();
      this.worker = null;
      this.clearOverlay();
      this.onStatus("error", "DETECTION UNAVAILABLE");
      this.onError(message);
      const resolve = this.resolveStart;
      this.resolveStart = null;
      if (resolve) resolve(false);
      this.startPromise = null;
    }

    scheduleFrame() {
      if (!this.running) return;
      this.frameHandle = this.requestFrame(() => this.processFrame());
    }

    async processFrame() {
      if (!this.running) return;
      const now = performance.now();
      const ready = this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0;
      const newFrame = this.video.currentTime !== this.lastVideoTime;
      if (ready && newFrame && !this.inFlight && now - this.lastCaptureAt >= FRAME_INTERVAL_MS) {
        this.inFlight = true;
        this.lastCaptureAt = now;
        this.lastVideoTime = this.video.currentTime;
        this.timestampMs = Math.max(this.timestampMs + 1, now);
        try {
          const bitmap = await this.createBitmap(this.video);
          if (!this.running || !this.worker) {
            bitmap.close?.();
            this.inFlight = false;
          } else {
            this.worker.postMessage({ type: "frame", bitmap, timestampMs: this.timestampMs },
              [bitmap]);
          }
        } catch (error) {
          this.inFlight = false;
          this.onError("Could not capture a frame for detection: " + (error.message || "unknown error"));
        }
      }
      this.scheduleFrame();
    }

    draw(detections, imageWidth, imageHeight) {
      if (!this.canvas) return;
      const context = this.canvas.getContext("2d");
      if (!context) return;
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(2, Math.max(1, root.devicePixelRatio || 1));
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      if (!imageWidth || !imageHeight) return;

      context.lineWidth = 2;
      context.font = "700 10px system-ui, sans-serif";
      context.textBaseline = "middle";
      for (const detection of detections) {
        const box = mapBoxToCover(detection.box, imageWidth, imageHeight, rect.width, rect.height);
        if (box.x + box.width < 0 || box.y + box.height < 0 ||
            box.x > rect.width || box.y > rect.height) continue;
        context.strokeStyle = "#d8e8bd";
        context.fillStyle = "rgba(25, 39, 31, 0.86)";
        context.strokeRect(box.x, box.y, box.width, box.height);
        const caption = detection.label.toUpperCase() + " " + Math.round(detection.score * 100) + "%";
        const captionWidth = context.measureText(caption).width;
        const labelX = Math.max(0, Math.min(box.x, rect.width - captionWidth - 14));
        const labelY = Math.max(0, box.y - 19);
        context.fillRect(labelX, labelY, captionWidth + 12, 17);
        context.fillStyle = "#f4f5e9";
        context.fillText(caption, labelX + 6, labelY + 8.5);
      }
    }

    clearOverlay() {
      if (!this.canvas) return;
      const context = this.canvas.getContext("2d");
      if (context) context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.onDetections([], { inferenceMs: null });
    }

    stop() {
      ++this.generation;
      this.running = false;
      this.starting = false;
      if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
      if (this.worker) {
        try { this.worker.postMessage({ type: "close" }); } catch (_) {}
        this.worker.terminate();
      }
      this.worker = null;
      this.inFlight = false;
      const resolve = this.resolveStart;
      this.resolveStart = null;
      if (resolve) resolve(false);
      this.startPromise = null;
      this.clearOverlay();
      this.onStatus("off", "DETECTION OFF");
    }
  }

  return { DetectionController, filterRelevantDetections, mapBoxToCover };
});
