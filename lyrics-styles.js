// ================= Şarkı sözü görünümleri =================
// Hem player.html (gerçek şarkı) hem index.html (Ayarlar önizlemesi) kullanır.
// Stiller: classic | spotify | apple | soundcloud
// Animasyonların neredeyse tamamı CSS ile yapılır (lyrics-styles.css), bu yüzden
// GSAP'a bağımlı değildir ve "hareketi azalt" ayarına saygı gösterir.

class LyricsRenderer {
  /**
   * @param {HTMLElement} root    sözlerin çizileceği kutu
   * @param {object}      opts    { style, onSeek(time), compact }
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.onSeek = opts.onSeek || null;
    this.compact = !!opts.compact;
    this.style = "classic";
    this.lines = [];
    this.index = -2;          // -2: hiç çizilmedi, -1: ilk satırdan önce
    this.paused = false;
    this.lineEls = [];
    this.track = null;
    this.classicEl = null;
    this.classicTimer = null;
    this.anchor = 0.4;

    this._onResize = () => this._recenter(true);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(root);
    }
    this.setStyle(opts.style || "classic");
  }

  // ---------- Genel API ----------
  setStyle(style) {
    this.style = ["classic", "spotify", "apple", "soundcloud"].includes(style) ? style : "classic";
    this.root.className = this.root.className
      .split(/\s+/).filter(c => c && !c.startsWith("lr-style-") && c !== "lr")
      .concat(["lr", `lr-style-${this.style}`, this.compact ? "lr-compact" : ""]).filter(Boolean).join(" ");
    this.anchor = this.style === "soundcloud" ? 0.5 : 0.4;
    this._build();
  }

  setLines(lines) {
    this.lines = Array.isArray(lines) ? lines : [];
    this.index = -2;
    this._build();
  }

  setPaused(paused) {
    this.paused = !!paused;
    this.root.classList.toggle("lr-paused", this.paused);
  }

  clear() {
    this.lines = [];
    this.index = -2;
    this._build();
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
    clearTimeout(this.classicTimer);
    this.root.innerHTML = "";
    this.root.className = this.root.className
      .split(/\s+/).filter(c => c && !c.startsWith("lr")).join(" ");
  }

  update(time) {
    if (!this.lines.length) return;
    let idx = -1;
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].time <= time + 0.15) idx = i;
      else break;
    }
    if (idx === this.index) return;
    const prev = this.index;
    this.index = idx;
    if (this.style === "classic") this._classicShow(idx);
    else this._listActivate(idx, prev, time);
  }

  // ---------- İç: kurulum ----------
  _build() {
    clearTimeout(this.classicTimer);
    this.root.innerHTML = "";
    this.lineEls = [];
    this.track = null;
    this.classicEl = null;
    this.root.classList.toggle("lr-paused", this.paused);
    if (!this.lines.length) return;

    if (this.style === "classic") {
      this.classicEl = document.createElement("p");
      this.classicEl.className = "lr-classic-line";
      this.root.appendChild(this.classicEl);
      return;
    }

    this.track = document.createElement("div");
    this.track.className = "lr-track";
    const frag = document.createDocumentFragment();

    this.lines.forEach((line, i) => {
      const el = document.createElement("div");
      el.className = "lr-line";
      el.dataset.i = String(i);
      const text = (line.text || "").trim();

      if (!text) {
        el.classList.add("lr-gap");
        el.innerHTML = '<span class="lr-dots"><i></i><i></i><i></i></span>';
      } else if (this.style === "soundcloud") {
        el.appendChild(this._buildWords(text, line, this.lines[i + 1]));
        const wave = document.createElement("span");
        wave.className = "lr-wave";
        wave.setAttribute("aria-hidden", "true");
        wave.innerHTML = "<i></i><i></i><i></i><i></i>";
        el.appendChild(wave);
      } else {
        el.textContent = text;
      }

      if (this.onSeek) {
        el.addEventListener("click", () => this.onSeek(line.time));
      }
      frag.appendChild(el);
      this.lineEls.push(el);
    });

    this.track.appendChild(frag);
    this.root.appendChild(this.track);
    // İlk yerleşim: bir sonraki karede ölç (görünür olduktan sonra)
    requestAnimationFrame(() => this._recenter(true));
  }

  // SoundCloud: her kelimeye, satırın süresine göre dağıtılmış bir dolum gecikmesi ver
  _buildWords(text, line, nextLine) {
    const wrap = document.createElement("span");
    wrap.className = "lr-words";
    const dur = Math.max(0.8, Math.min(8, (nextLine ? nextLine.time - line.time : 4) * 0.92));
    const words = text.split(/\s+/);
    const total = words.reduce((n, w) => n + w.length + 1, 0);
    let acc = 0;
    words.forEach((w, i) => {
      const span = document.createElement("span");
      span.className = "lr-w";
      span.textContent = w;
      span.style.setProperty("--ws", `${((acc / total) * dur).toFixed(3)}s`);
      span.style.setProperty("--wd", `${(((w.length + 1) / total) * dur).toFixed(3)}s`);
      acc += w.length + 1;
      wrap.appendChild(span);
      if (i < words.length - 1) wrap.appendChild(document.createTextNode(" "));
    });
    return wrap;
  }

  // ---------- İç: klasik tek satır ----------
  _classicShow(idx) {
    const el = this.classicEl;
    if (!el) return;
    const next = idx >= 0 ? (this.lines[idx].text || "♪") : "";
    clearTimeout(this.classicTimer);
    el.classList.remove("lr-in");
    el.classList.add("lr-out");
    this.classicTimer = setTimeout(() => {
      el.textContent = next;
      el.classList.remove("lr-out");
      // reflow: animasyonu baştan başlat
      void el.offsetWidth;
      el.classList.add("lr-in");
    }, 170);
  }

  // ---------- İç: liste stilleri ----------
  _listActivate(idx, prev, time) {
    const els = this.lineEls;
    if (!els.length) return;
    const n = els.length;
    const MAXD = 6;

    for (let i = 0; i < n; i++) {
      const el = els[i];
      const rel = idx < 0 ? i + 1 : i - idx;
      const d = Math.min(Math.abs(rel), MAXD);
      el.style.setProperty("--d", String(d));
      // Apple: aktif satırın altındakiler sırayla (şelale gibi) kayar
      el.style.setProperty("--rel", String(rel > 0 ? Math.min(rel, 8) : 0));
      el.classList.toggle("is-active", i === idx);
      el.classList.toggle("is-past", i < idx);
      el.classList.toggle("is-next", i > idx);

      if (this.style === "soundcloud" && i === idx) {
        // Seek / geç başlama durumunda dolumu doğru yerden sürdür
        const elapsed = Math.max(0, time - this.lines[i].time);
        el.style.setProperty("--off", `${(-elapsed).toFixed(3)}s`);
      }
    }
    this._recenter(false);
  }

  _recenter(instant) {
    if (!this.track || !this.lineEls.length) return;
    const h = this.root.clientHeight;
    if (!h) return;
    const idx = Math.max(0, this.index < 0 ? 0 : this.index);
    const el = this.lineEls[Math.min(idx, this.lineEls.length - 1)];
    const center = el.offsetTop + el.offsetHeight / 2;
    const y = Math.round(h * this.anchor - center);
    if (instant) {
      this.track.style.transition = "none";
      this.track.style.transform = `translate3d(0, ${y}px, 0)`;
      void this.track.offsetWidth;
      this.track.style.transition = "";
    } else {
      this.track.style.transform = `translate3d(0, ${y}px, 0)`;
    }
  }
}

window.LyricsRenderer = LyricsRenderer;
