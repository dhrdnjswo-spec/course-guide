/**
 * 공개 페이지 갱신 링크 (Google Apps Script 웹 앱)
 *
 * 노션의 갱신 링크를 누르면 이 웹 앱이 GitHub 에 「갱신 시작」 신호를 보내고,
 * 진행 상황을 보여준 뒤 완료되면 공개 페이지 링크를 띄웁니다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)에 아래 4개를 넣어 주세요.
 *   GITHUB_TOKEN : GitHub 세분화된 토큰 (이 저장소만, Actions 읽기·쓰기 + Contents 읽기·쓰기)
 *   REPO         : 계정이름/저장소이름   예) nowon-edu/course-guide
 *   KEY          : 갱신 링크용 비밀 문자열 (아무 영문·숫자 20자 이상)
 *   SITE_URL     : 공개 페이지 주소   예) https://nowon-edu.github.io/course-guide/
 */

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name) || "";
}

function github_(method, path, body) {
  var res = UrlFetchApp.fetch("https://api.github.com/repos/" + prop_("REPO") + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + prop_("GITHUB_TOKEN"),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    contentType: "application/json",
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  return { code: code, json: text ? JSON.parse(text) : {} };
}

// 가장 최근 갱신 실행 상태
function latestRun_() {
  var r = github_("get", "/actions/runs?per_page=1");
  var run = (r.json.workflow_runs || [])[0];
  if (!run) return null;
  return { id: run.id, status: run.status, conclusion: run.conclusion, created: run.created_at, url: run.html_url };
}

function doGet(e) {
  var key = (e && e.parameter && e.parameter.key) || "";
  if (!prop_("KEY") || key !== prop_("KEY")) {
    return HtmlService.createHtmlOutput("<p style='font-family:sans-serif'>링크가 올바르지 않습니다. 노션의 갱신 링크를 다시 눌러 주세요.</p>");
  }
  var started = false;
  var message = "";
  var before = latestRun_();
  if (before && before.status !== "completed") {
    message = "이미 갱신이 진행 중입니다. 끝날 때까지 기다려 주세요.";
  } else {
    var r = github_("post", "/dispatches", { event_type: "refresh" });
    if (r.code === 204) { started = true; message = "갱신을 시작했습니다."; }
    else message = "갱신을 시작하지 못했습니다 (오류 " + r.code + "). 담당자에게 알려 주세요.";
  }
  var t = HtmlService.createTemplate(PAGE_);
  t.message = message;
  t.started = started;
  t.since = before ? before.id : 0;
  t.site = prop_("SITE_URL");
  return t.evaluate().setTitle("공개 페이지 갱신").addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// 페이지에서 몇 초마다 호출: 새 실행의 진행 상태
function status(sinceId) {
  var run = latestRun_();
  if (!run || run.id === sinceId) return { state: "waiting" };
  if (run.status !== "completed") return { state: "running" };
  return { state: run.conclusion === "success" ? "done" : "failed", url: run.url };
}

var PAGE_ = [
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  'body{font-family:"Noto Sans KR",system-ui,sans-serif;background:#f3f5f9;color:#1d2433;margin:0;padding:40px 16px}',
  '.box{max-width:520px;margin:0 auto;background:#fff;border-top:8px solid #4f68b3;border-radius:6px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
  'h1{font-size:22px;margin:0 0 8px}p{margin:8px 0;line-height:1.6}.s{color:#6b7385;font-size:14px}',
  'a.btn{display:inline-block;margin-top:12px;background:#4f68b3;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px}',
  '</style></head><body><div class="box">',
  '<h1>공개 페이지 갱신</h1><p><?= message ?></p>',
  '<p class="s" id="st"><? if (started) { ?>노션 내용을 읽는 중입니다. 보통 5~10분 걸립니다. 이 창을 닫아도 갱신은 계속됩니다.<? } ?></p>',
  '<div id="go"></div></div>',
  '<script>',
  'var since = <?!= JSON.stringify(since) ?>; var site = <?!= JSON.stringify(site) ?>; var started = <?!= JSON.stringify(started) ?>;',
  'function poll(){ google.script.run.withSuccessHandler(function(r){',
  ' var st=document.getElementById("st"), go=document.getElementById("go");',
  ' if(r.state==="done"){ st.textContent="갱신이 끝났습니다. 공개 페이지를 새로고침하면 바뀐 내용이 보입니다.";',
  '   go.innerHTML = site ? \'<a class="btn" href="\'+site+\'" target="_blank">공개 페이지 열기</a> <a class="btn" style="background:#5b6576" href="\'+site+\'report.html" target="_blank">점검 결과 보기</a>\' : ""; return; }',
  ' if(r.state==="failed"){ st.textContent="갱신에 실패했습니다. 공개 페이지는 이전 내용 그대로입니다. 담당자에게 알려 주세요."; return; }',
  ' st.textContent = r.state==="running" ? "사이트를 만드는 중입니다… (5~10분)" : "갱신 준비 중입니다…";',
  ' setTimeout(poll, 8000); }).status(since); }',
  'if (started) setTimeout(poll, 5000);',
  '</script></body></html>',
].join("\n");
