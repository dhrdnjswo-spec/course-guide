// 메인 페이지: 과목·강사 검색과 수업 구분 필터
(function () {
  var q = document.getElementById("q");
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".fbtn"));
  var depts = Array.prototype.slice.call(document.querySelectorAll("details.dept"));
  var noResult = document.getElementById("noResult");
  var type = "";
  var openBefore = null;

  function apply() {
    var text = (q.value || "").trim().toLowerCase();
    var filtering = !!(text || type);
    if (filtering && !openBefore) openBefore = depts.map(function (d) { return d.open; });
    var anyVisible = false;
    depts.forEach(function (d, i) {
      var rows = Array.prototype.slice.call(d.querySelectorAll(".row"));
      var shown = 0;
      rows.forEach(function (r) {
        var ok = (!text || r.getAttribute("data-search").indexOf(text) !== -1) &&
          (!type || r.getAttribute("data-types").split("|").indexOf(type) !== -1);
        r.hidden = !ok;
        if (ok) shown++;
        r.querySelectorAll(".cur").forEach(function (a) {
          a.hidden = !!type && a.getAttribute("data-type") !== type;
        });
      });
      var count = d.querySelector(".count");
      count.textContent = (filtering ? shown + " / " : "") + count.getAttribute("data-total") + "과목";
      d.querySelector(".empty").hidden = shown > 0;
      d.hidden = filtering && shown === 0;
      if (filtering) d.open = shown > 0;
      else if (openBefore) d.open = openBefore[i];
      if (shown) anyVisible = true;
    });
    if (!filtering) openBefore = null;
    noResult.hidden = anyVisible;
  }

  q.addEventListener("input", apply);
  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      type = b.getAttribute("data-type") || "";
      buttons.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      apply();
    });
  });
})();
