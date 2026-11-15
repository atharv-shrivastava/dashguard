(() => {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("./sw.js").catch(() => {})
    );
  }

  const screens = [...document.querySelectorAll(".screen")];
  const navItems = [...document.querySelectorAll(".nav")];
  const toast = document.getElementById("toast");
  let startedAt = 0;
  let timerId = null;
  let muted = false;
  let toastId;
  let lastSpikeAt = 0;
  let cameraPreview = null;

  const showToast = message => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastId);
    toastId = setTimeout(() => toast.classList.remove("show"), 2600);
  };

  const go = name => {
    if (name !== "drive" && cameraPreview) cameraPreview.stop();
    screens.forEach(screen => screen.classList.toggle("active", screen.id === name));
    navItems.forEach(item => {
      const active = item.dataset.screen === name;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  document.querySelectorAll("[data-screen]").forEach(button =>
    button.addEventListener("click", () => go(button.dataset.screen))
  );
  document.querySelectorAll("[data-go]").forEach(button =>
    button.addEventListener("click", () => go(button.dataset.go))
  );

  const cameraStatus = document.getElementById("cameraStatus");
  const enableCameraButton = document.getElementById("enableCamera");
  const cameraStage = document.getElementById("cameraStage");
  const cameraLiveBadge = document.getElementById("cameraLiveBadge");
  const cameraVideo = document.getElementById("cameraPreview");

  const setCameraStatus = (state, label) => {
    cameraStatus.className = "sensor-status camera-sensor-status " + state;
    cameraStatus.replaceChildren();
    const dot = document.createElement("i");
    dot.className = "dot " + (state === "active" ? "sage" : state === "error" ? "amber" : "muted-dot");
    cameraStatus.append(dot, document.createTextNode(" " + label));
    enableCameraButton.disabled = state === "waiting";
    enableCameraButton.textContent =
      state === "active" ? "STOP CAMERA" :
      state === "waiting" ? "OPENING CAMERA…" : "ENABLE CAMERA";
    cameraStage.classList.toggle("is-live", state === "active");
    cameraLiveBadge.hidden = state !== "active";
  };

  cameraPreview = window.DashGuardCameraPreview
    ? new window.DashGuardCameraPreview({
        videoElement: cameraVideo,
        onStatus: setCameraStatus,
        onError: message => showToast(message)
      })
    : null;

  enableCameraButton.addEventListener("click", async () => {
    if (!cameraPreview) {
      showToast("Camera module failed to load. Refresh the page and try again.");
      return;
    }
    if (cameraPreview.active) {
      cameraPreview.stop();
      return;
    }
    await cameraPreview.start();
  });

  const timer = document.getElementById("timer");
  const updateTimer = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    timer.textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(value => String(value).padStart(2, "0"))
      .join(":");
  };

  const motionStatus = document.getElementById("motionStatus");
  const motionFootnote = document.getElementById("motionFootnote");
  const enableMotionButton = document.getElementById("enableMotion");
  const jerkValue = document.getElementById("jerk");
  const accelerationValue = document.getElementById("accelerationValue");
  const gyroValue = document.getElementById("gyroValue");
  const chartLine = document.getElementById("chartLine");
  const chartArea = document.getElementById("chartArea");

  const graphPoints = Array.from({ length: 80 }, () => 0);
  const renderGraph = () => {
    const points = graphPoints.map((value, index) => {
      const x = (index / (graphPoints.length - 1)) * 320;
      const y = 90 - (Math.min(Math.max(value, 0), 12) / 12) * 76;
      return [x, y];
    });
    const path = points.map(([x, y], index) =>
      (index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1)
    ).join(" ");
    chartLine.setAttribute("d", path);
    chartArea.setAttribute("d", path + " L320 100 L0 100Z");
  };

  const setMotionStatus = (state, label) => {
    motionStatus.className = "sensor-status " + state;
    motionStatus.innerHTML = '<i class="dot"></i> ' + label;
    enableMotionButton.disabled = state === "waiting";
    if (state === "active" || state === "spike") {
      enableMotionButton.textContent = "STOP SENSORS";
      motionFootnote.textContent = "Last 20 seconds · live";
    } else if (state === "waiting") {
      enableMotionButton.textContent = "CONNECTING…";
      motionFootnote.textContent = "Waiting for device readings";
    } else {
      enableMotionButton.textContent = "ENABLE MOTION";
      if (state === "error") motionFootnote.textContent = "Sensor readings unavailable";
      else motionFootnote.textContent = "Waiting for permission";
    }
  };

  const motionMonitor = window.DashGuardMotionMonitor
    ? new window.DashGuardMotionMonitor({
        onStatus: (state, label) => {
          if (state === "active" && Date.now() - lastSpikeAt < 1200) {
            setMotionStatus("spike", "MOTION SPIKE");
          } else {
            setMotionStatus(state, label);
          }
        },
        onError: message => {
          motionFootnote.textContent = message;
          showToast(message);
        },
        onSample: sample => {
          graphPoints.shift();
          graphPoints.push(sample.jerk);
          renderGraph();

          jerkValue.textContent = sample.jerk.toFixed(2);
          accelerationValue.textContent = sample.acceleration.toFixed(2) + " m/s²";
          gyroValue.textContent = sample.gyro === null ? "Unavailable" : sample.gyro.toFixed(1) + " °/s";

          if (sample.isSpike) {
            lastSpikeAt = Date.now();
            setMotionStatus("spike", "MOTION SPIKE");
            motionFootnote.textContent = "High jerk sample · prototype threshold";
          }
        }
      })
    : null;

  enableMotionButton.addEventListener("click", async () => {
    if (!motionMonitor) {
      showToast("Motion monitor failed to load. Refresh the page and try again.");
      return;
    }
    if (motionMonitor.active) {
      motionMonitor.stop();
      return;
    }
    enableMotionButton.disabled = true;
    setMotionStatus("waiting", "REQUESTING PERMISSION");
    await motionMonitor.start();
  });

  document.getElementById("startDrive").addEventListener("click", () => {
    startedAt = Date.now();
    clearInterval(timerId);
    updateTimer();
    timerId = setInterval(updateTimer, 1000);
    go("drive");
    if (cameraPreview) cameraPreview.start();
    showToast("Drive Mode started. Allow camera access to show the live view.");
  });

  document.getElementById("endDrive").addEventListener("click", () => {
    clearInterval(timerId);
    if (motionMonitor) motionMonitor.stop();
    if (cameraPreview) cameraPreview.stop();
    go("home");
    showToast("Drive Mode ended. Camera and motion monitoring stopped.");
  });

  document.getElementById("mute").addEventListener("click", () => {
    muted = !muted;
    document.getElementById("soundLabel").textContent = muted ? "Sound off" : "Sound on";
    showToast(muted ? "Sound preference turned off." : "Sound preference turned on.");
  });

  document.getElementById("voice").addEventListener("change", event =>
    showToast(event.target.checked ? "Voice alerts preference on." : "Voice alerts preference off.")
  );
})();