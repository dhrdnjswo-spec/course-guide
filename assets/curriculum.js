// 커리큘럼 페이지: A4 이미지·PDF 저장, 이미지 크게 보기
(function () {
  var A4 = 297 / 210, SCALE = 2;
  var saveBtn = document.getElementById("saveBtn");
  var pdfBtn = document.getElementById("pdfBtn");
  var modal = document.getElementById("modal");
  var pagesEl = document.getElementById("pages");
  var msg = document.getElementById("saveMsg");
  var sheet = document.getElementById("sheet");
  var title = saveBtn ? saveBtn.getAttribute("data-title") : document.title;
  var fileBase = title.replace(/[\\/:*?"<>|]+/g, "").replace(/\s*·\s*/g, "_").replace(/\s+/g, "_") + "_커리큘럼";
  var canvases = [], blobs = [], urls = [];

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
        return cv;
      });
      return jobs;
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

  function toBlobs(list) {
    return Promise.all(list.map(function (cv) { return new Promise(function (r) { cv.toBlob(r, "image/png"); }); }));
  }

  // 쪽 이미지를 만들어 두고(한 번만) 다시 씀
  var ready = null;
  function pages() {
    if (!ready) ready = Promise.resolve().then(build).then(function (list) {
      canvases = list;
      return toBlobs(list).then(function (b) {
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        blobs = b;
        urls = blobs.map(function (x) { return URL.createObjectURL(x); });
        return canvases;
      });
    }).catch(function (e) { ready = null; throw e; });
    return ready;
  }

  function savePdf() {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) return Promise.reject(new Error("no jspdf"));
    return pages().then(function (list) {
      var doc = new J({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      list.forEach(function (cv, i) {
        if (i > 0) doc.addPage("a4", "portrait");
        doc.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      });
      var url = URL.createObjectURL(doc.output("blob"));
      var a = document.createElement("a");
      a.href = url;
      a.download = fileBase + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  function busy(btn, label) {
    btn.disabled = true;
    btn.textContent = "만드는 중…";
    return function () { btn.disabled = false; btn.textContent = label; };
  }

  if (saveBtn && window.html2canvas) {
    saveBtn.addEventListener("click", function () {
      var done = busy(saveBtn, "이미지로 저장 (A4)");
      pages().then(function () {
        document.getElementById("modalSub").textContent = "A4 비율 " + blobs.length + "쪽";
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
    var modalPdf = document.getElementById("savePdfBtn");
    [pdfBtn, modalPdf].forEach(function (btn) {
      if (!btn) return;
      if (!window.jspdf) { btn.hidden = true; return; }
      btn.addEventListener("click", function () {
        var done = busy(btn, btn.getAttribute("data-label"));
        savePdf().then(done).catch(function () {
          done();
          alert("PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        });
      });
    });
    document.getElementById("closeBtn").addEventListener("click", function () { modal.hidden = true; saveBtn.focus(); });
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });
  } else {
    if (saveBtn) saveBtn.hidden = true;
    if (pdfBtn) pdfBtn.hidden = true;
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
