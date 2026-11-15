(() => {
  const screens = [...document.querySelectorAll(".screen")];
  const navItems = [...document.querySelectorAll(".nav")];
  const toast = document.getElementById("toast");
  let startedAt = 0, timerId = null, muted = false, toastId;
  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastId);
    toastId = setTimeout(() => toast.classList.remove("show"), 2200);
  };
  const go = (name) => {
    screens.forEach(s => s.classList.toggle("active", s.id === name));
    navItems.forEach(n => {
      const active = n.dataset.screen === name;
      n.classList.toggle("active", active);
      if (active) n.setAttribute("aria-current", "page");
      else n.removeAttribute("aria-current");
    });
    window.scrollTo({top:0,behavior:"smooth"});
  };
  document.querySelectorAll("[data-screen]").forEach(b => b.addEventListener("click", () => go(b.dataset.screen)));
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  const timer = document.getElementById("timer");
  const updateTimer = () => {
    const seconds = Math.floor((Date.now()-startedAt)/1000);
    timer.textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,"0")).join(":");
  };
  document.getElementById("startDrive").addEventListener("click", () => {
    startedAt = Date.now();
    clearInterval(timerId);
    updateTimer();
    timerId = setInterval(updateTimer,1000);
    go("drive");
    showToast("Drive preview started. Camera engine is not connected yet.");
  });
  document.getElementById("endDrive").addEventListener("click", () => {
    clearInterval(timerId);
    go("home");
    showToast("Drive preview ended.");
  });
  document.getElementById("mute").addEventListener("click", () => {
    muted = !muted;
    document.getElementById("soundLabel").textContent = muted ? "Sound off" : "Sound on";
    showToast(muted ? "Demo sound muted." : "Demo sound enabled.");
  });
  document.getElementById("voice").addEventListener("change", e => showToast(e.target.checked ? "Voice alerts preference on." : "Voice alerts preference off."));
  const area = document.getElementById("chartArea"), line = document.getElementById("chartLine"), jerk = document.getElementById("jerk");
  const points = Array.from({length:17}, (_,i)=>[i*20,50]);
  setInterval(() => {
    points.shift();
    const spike = Math.random() > .9;
    const y = 50 + (Math.random()-.5)*(spike?45:14);
    points.push([320,y]);
    points.forEach(p=>p[0]-=20);
    const d = points.map((p,i)=>(i?"L":"M")+p[0].toFixed(0)+" "+p[1].toFixed(1)).join(" ");
    line.setAttribute("d",d);
    area.setAttribute("d",d+" L320 100 L0 100Z");
    jerk.textContent = (Math.random()*(spike?.9:.14)).toFixed(2);
  },950);
})();