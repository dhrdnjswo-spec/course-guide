// 커리큘럼 페이지: A4 이미지 저장, 이미지 크게 보기
(function () {
  var A4 = 297 / 210, SCALE = 2;
  var saveBtn = document.getElementById("saveBtn");
  var modal = document.getElementById("modal");
  var pagesEl = document.getElementById("pages");
  var msg = document.getElementById("saveMsg");
  var sheet = document.getElementById("sheet");
  var title = saveBtn ? saveBtn.getAttribute("data-title") : document.title;
  var fileBase = title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s*·\s*/g, "_").replace(/\s+/g, "_") + "_커리큘럼";
  var blobs = [], urls = [];

  function blocks() {
    var top = sheet.getBoundingClientRect().top;
    var list = sheet.querySelectorAll(".summary, .prep, .extra, .plan-h, .day, .pending, details.gallery .fig, details.gallery summary, .sheet-foot");
    return Array.prototype.map.call(list, function (el) {
      var r = el.getBoundingClientRect();
      return { top: (r.top - top) * SCALE, bottom: (r.bottom - top) * SCALE };
    }).sort(function (a, b) { return a.top - b.top; });
  }

  function build() {
    var gallery = sheet.querySelector("details.gallery");
    var wasOpen = gallery ? gallery.open : false;
    if (gallery) gallery.open = true;
    var bl = blocks();
    return html2canvas(sheet, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true }).then(function (full) {
      if (gallery) gallery.open = wasOpen;
      var W = full.width, H = Math.round(W * A4);
      var marginTop = 40 * SCALE, marginBottom = 44 * SCALE;
      var accent = getComputedStyle(sheet).getPropertyValue("--accent").trim() || "#4f68b3";
      var cuts = [], start = 0, first = true;
      for (var i = 0; i < bl.length; i++) {
        var cap = (first ? H : H - marginTop) - marginBottom;
        if (bl[i].bottom - start > cap && bl[i].top > start + 10) {
          cuts.push([start, bl[i].top - 8 * SCALE]);
          start = bl[i].top - 4 * SCALE;
          first = false;
          i--; // 같은 블록이 다음 쪽 기준으로도 들어가는지 다시 확인
          continue;
        }
        if (bl[i].bottom - start > cap) { // 블록 하나가 한 쪽보다 큰 경우: 그 자리에서 자름
          var cutAt = start + cap;
          cuts.push([start, cutAt]);
          start = cutAt;
          first = false;
          i--;
        }
      }
      cuts.push([start, full.height]);
      var jobs = cuts.map(function (c, p) {
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
        var y = 0;
        if (p > 0) { ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 4 * SCALE); y = marginTop; }
        var h = Math.min(c[1] - c[0], H - y - marginBottom);
        if (h > 0) ctx.drawImage(full, 0, c[0], W, h, 0, y, W, h);
        ctx.fillStyle = "#8a91a2";
        ctx.font = (11 * SCALE) + 'px "Noto Sans KR", sans-serif';
        ctx.textAlign = "right";
        ctx.fillText(title + "   " + (p + 1) + " / " + cuts.length, W - 40 * SCALE, H - 20 * SCALE);
        return new Promise(function (r) { cv.toBlob(r, "image/png"); });
      });
      return Promise.all(jobs);
    });
  }

  function fileName(i) {
    return blobs.length > 1 ? fileBase + "_" + (i + 1) + "of" + blobs.length + ".png" : fileBase + ".png";
  }

  function save(i) {
    var a = document.createElement("a");
    a.href = urls[i];
    a.download = fileName(i);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (saveBtn && window.html2canvas) {
    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true;
      saveBtn.textContent = "만드는 중…";
      var done = function () { saveBtn.disabled = false; saveBtn.textContent = "이미지로 저장 (A4)"; };
      build().then(function (out) {
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        blobs = out;
        urls = blobs.map(function (b) { return URL.createObjectURL(b); });
        document.getElementById("modalSub").textContent = "A4 비율 PNG " + blobs.length + "장";
        pagesEl.innerHTML = "";
        urls.forEach(function (u, i) {
          var d = document.createElement("div"); d.className = "pg";
          var img = document.createElement("img"); img.src = u; img.alt = (i + 1) + "쪽";
          var b = document.createElement("button"); b.type = "button"; b.textContent = (i + 1) + "쪽 저장";
          b.addEventListener("click", function () { save(i); });
          d.appendChild(img); d.appendChild(b); pagesEl.appendChild(d);
        });
        msg.textContent = "회차 카드가 중간에 잘리지 않게 쪽을 나눴습니다.";
        modal.hidden = false;
        document.getElementById("closeBtn").focus();
        done();
      }).catch(function () {
        msg.textContent = "이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
        modal.hidden = false;
        done();
      });
    });
    document.getElementById("saveAllBtn").addEventListener("click", function () {
      blobs.forEach(function (_, i) { setTimeout(function () { save(i); }, i * 400); });
    });
    document.getElementById("closeBtn").addEventListener("click", function () { modal.hidden = true; saveBtn.focus(); });
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });
  } else if (saveBtn) {
    saveBtn.hidden = true;
  }

  // 이미지 크게 보기
  var lb = document.getElementById("lightbox");
  if (lb) {
    var lbImg = lb.querySelector("img");
    document.addEventListener("click", function (e) {
      var img = e.target.closest && e.target.closest(".fig img");
      if (!img) return;
      lbImg.src = img.src; lbImg.alt = img.alt;
      lb.hidden = false;
    });
    lb.addEventListener("click", function () { lb.hidden = true; });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { if (modal) modal.hidden = true; if (lb) lb.hidden = true; }
  });
})();
