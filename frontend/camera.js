(function (root, factory) {
  "use strict";
  const CameraPreviewController = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CameraPreviewController };
  }
  root.DashGuardCameraPreview = CameraPreviewController;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CAMERA_CONSTRAINTS = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  function messageFor(error) {
    switch (error && error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Camera permission was denied. Allow camera access in browser settings, then retry.";
      case "NotFoundError":
        return "No usable camera was found on this device.";
      case "NotReadableError":
      case "AbortError":
        return "The camera could not be opened. Close other camera apps and retry.";
      case "OverconstrainedError":
        return "The requested camera settings are unavailable on this device.";
      default:
        return error && error.message
          ? "Could not start the camera: " + error.message
          : "Could not start the camera. Check browser permissions and retry.";
    }
  }

  class CameraPreviewController {
    constructor(options) {
      const settings = options || {};
      this.videoElement = settings.videoElement;
      this.mediaDevices = settings.mediaDevices ||
        (typeof navigator !== "undefined" ? navigator.mediaDevices : null);
      this.secureContext = settings.secureContext !== undefined
        ? settings.secureContext
        : (typeof isSecureContext !== "undefined" && isSecureContext);
      this.onStatus = typeof settings.onStatus === "function" ? settings.onStatus : function () {};
      this.onError = typeof settings.onError === "function" ? settings.onError : function () {};
      this.stream = null;
      this.pending = null;
      this.generation = 0;
    }

    get active() {
      return Boolean(this.stream);
    }

    get opening() {
      return Boolean(this.pending);
    }

    async start() {
      if (this.stream) return { ok: true };
      if (this.pending) return this.pending;

      if (!this.secureContext) {
        const error = new Error("Camera access requires HTTPS or localhost. Open DashGuard from a secure address and retry.");
        this.onStatus("error", "CAMERA NEEDS HTTPS");
        this.onError(error.message);
        return { ok: false, error };
      }

      if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== "function") {
        const error = new Error("This browser does not provide camera access. Try a current mobile browser.");
        this.onStatus("error", "CAMERA UNSUPPORTED");
        this.onError(error.message);
        return { ok: false, error };
      }

      const generation = ++this.generation;
      this.onStatus("waiting", "REQUESTING CAMERA");
      const pending = this.openStream(generation);
      this.pending = pending;
      try {
        return await pending;
      } finally {
        if (this.pending === pending) this.pending = null;
      }
    }

    async openStream(generation) {
      let stream = null;
      try {
        stream = await this.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (generation !== this.generation) {
          stream.getTracks().forEach(track => track.stop());
          return { ok: false, cancelled: true };
        }

        const videoTracks = stream.getVideoTracks();
        if (!videoTracks || videoTracks.length === 0) {
          throw new Error("The camera returned a stream without a video track.");
        }

        this.stream = stream;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.srcObject = stream;
        await this.videoElement.play();

        if (generation !== this.generation) {
          this.releaseStream(stream);
          return { ok: false, cancelled: true };
        }

        const activeTrack = videoTracks[0];
        if (typeof activeTrack.addEventListener === "function") {
          activeTrack.addEventListener("ended", () => {
            if (this.stream !== stream) return;
            this.releaseStream(stream);
            this.onStatus("error", "CAMERA DISCONNECTED");
            this.onError("The camera stream ended. Reconnect the camera to continue.");
          }, { once: true });
        }

        this.onStatus("active", "CAMERA LIVE");
        return { ok: true };
      } catch (error) {
        if (stream) stream.getTracks().forEach(track => track.stop());
        if (generation === this.generation) {
          this.stream = null;
          this.videoElement.srcObject = null;
          this.onStatus("error", "CAMERA UNAVAILABLE");
          this.onError(messageFor(error));
        }
        return { ok: false, error };
      }
    }

    releaseStream(stream) {
      if (this.stream === stream) this.stream = null;
      if (this.videoElement.srcObject === stream) {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
      }
      stream.getTracks().forEach(track => track.stop());
    }

    stop() {
      ++this.generation;
      this.pending = null;
      const stream = this.stream;
      this.stream = null;

      if (stream) {
        if (this.videoElement.srcObject === stream) {
          this.videoElement.pause();
          this.videoElement.srcObject = null;
        }
        stream.getTracks().forEach(track => track.stop());
      }
      this.onStatus("off", "CAMERA OFF");
    }
  }

  CameraPreviewController.constraints = CAMERA_CONSTRAINTS;
  return CameraPreviewController;
});
