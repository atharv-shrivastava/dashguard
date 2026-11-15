(() => {
  "use strict";

  const finite = value => Number.isFinite(value);
  const magnitude = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

  class DashGuardMotionMonitor {
    constructor({ onStatus = () => {}, onSample = () => {}, onError = () => {} } = {}) {
      this.onStatus = onStatus;
      this.onSample = onSample;
      this.onError = onError;
      this.active = false;
      this.lastEventAt = 0;
      this.lastUiAt = 0;
      this.lastAcceleration = null;
      this.filteredAcceleration = null;
      this.gravityEstimate = null;
      this.filteredJerk = 0;
      this.timeoutId = null;
      this.handleMotion = this.handleMotion.bind(this);
      this.spikeThreshold = 8; // Prototype visual cue only; not a validated incident threshold.
      this.uiIntervalMs = 250;
    }

    async start() {
      if (this.active) return true;

      if (!window.isSecureContext) {
        this.fail("Motion sensors need HTTPS or localhost.");
        return false;
      }

      const MotionEvent = window.DeviceMotionEvent;
      if (!MotionEvent) {
        this.fail("This browser does not expose motion sensors.");
        return false;
      }

      try {
        if (typeof MotionEvent.requestPermission === "function") {
          const permission = await MotionEvent.requestPermission();
          if (permission !== "granted") {
            this.fail("Motion permission was not granted.");
            return false;
          }
        }
      } catch (error) {
        this.fail("Could not request motion permission.");
        return false;
      }

      this.active = true;
      this.lastEventAt = 0;
      this.lastUiAt = 0;
      this.lastAcceleration = null;
      this.filteredAcceleration = null;
      this.gravityEstimate = null;
      this.filteredJerk = 0;
      window.addEventListener("devicemotion", this.handleMotion, { passive: true });
      this.onStatus("waiting", "WAITING FOR SENSOR");
      this.armWatchdog();
      return true;
    }

    armWatchdog() {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = window.setTimeout(() => {
        if (!this.active) return;
        const silenceMs = this.lastEventAt ? performance.now() - this.lastEventAt : Infinity;
        const message = this.lastEventAt
          ? "Motion readings stopped. Check that the browser is still allowed to use the sensors."
          : "No sensor readings received. Check browser permission and device support.";
        if (silenceMs >= 3500) this.fail(message);
      }, 4000);
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      window.removeEventListener("devicemotion", this.handleMotion);
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
      this.onStatus("off", "SENSOR OFF");
    }

    fail(message) {
      this.stop();
      this.onStatus("error", "SENSOR UNAVAILABLE");
      this.onError(message);
    }

    readLinearAcceleration(event, dt) {
      const linear = event.acceleration;
      if (linear && finite(linear.x) && finite(linear.y) && finite(linear.z)) {
        return [linear.x, linear.y, linear.z];
      }

      const inclusive = event.accelerationIncludingGravity;
      if (!inclusive || !finite(inclusive.x) || !finite(inclusive.y) || !finite(inclusive.z)) {
        return null;
      }

      const raw = [inclusive.x, inclusive.y, inclusive.z];
      if (!this.gravityEstimate) {
        this.gravityEstimate = raw.slice();
      }
      const alpha = dt > 0 ? dt / (0.8 + dt) : 0;
      this.gravityEstimate = this.gravityEstimate.map((gravity, index) =>
        gravity + alpha * (raw[index] - gravity)
      );
      return raw.map((value, index) => value - this.gravityEstimate[index]);
    }

    handleMotion(event) {
      if (!this.active) return;

      const now = performance.now();
      const dt = this.lastEventAt ? (now - this.lastEventAt) / 1000 : 0;
      this.lastEventAt = now;
      this.armWatchdog();

      if (!dt || dt < 0.005 || dt > 1) return;
      const acceleration = this.readLinearAcceleration(event, dt);
      if (!acceleration) {
        this.fail("The browser provided no usable accelerometer values.");
        return;
      }

      const accelTau = 0.08;
      const accelAlpha = dt / (accelTau + dt);
      if (!this.filteredAcceleration) {
        this.filteredAcceleration = acceleration.slice();
      } else {
        this.filteredAcceleration = this.filteredAcceleration.map((value, index) =>
          value + accelAlpha * (acceleration[index] - value)
        );
      }

      let jerk = 0;
      if (this.lastAcceleration) {
        const delta = this.filteredAcceleration.map((value, index) =>
          (value - this.lastAcceleration[index]) / dt
        );
        const rawJerk = magnitude(delta);
        const jerkAlpha = dt / (0.16 + dt);
        this.filteredJerk += jerkAlpha * (rawJerk - this.filteredJerk);
        jerk = this.filteredJerk;
      }
      this.lastAcceleration = this.filteredAcceleration.slice();

      const rotation = event.rotationRate;
      let gyro = null;
      if (rotation && [rotation.alpha, rotation.beta, rotation.gamma].every(finite)) {
        gyro = magnitude([rotation.alpha, rotation.beta, rotation.gamma]);
      }

      if (now - this.lastUiAt < this.uiIntervalMs) return;
      this.lastUiAt = now;

      this.onSample({
        acceleration: magnitude(this.filteredAcceleration),
        jerk,
        gyro,
        isSpike: jerk >= this.spikeThreshold,
        timestamp: Date.now()
      });
      this.onStatus("active", "MOTION ACTIVE");
    }
  }

  window.DashGuardMotionMonitor = DashGuardMotionMonitor;
})();