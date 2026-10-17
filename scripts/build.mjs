// 공개 사이트 생성
//   NOTION_TOKEN=... node scripts/build.mjs
// 결과는 dist/ 폴더에 만들어지고, GitHub Actions 가 그대로 게시한다.

import { mkdir, writeFile, rm, cp, readFile } from "node:fs/promises";
import { existsSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNotion } from "../lib/notion.mjs";
import { loadAll } from "../lib/data.mjs";
import { parseCurriculum, parseInstructor } from "../lib/parse.mjs";
import { renderIndex, renderCurriculum, renderInstructor, renderReport } from "../lib/render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function build({ notion, fetchBinary = defaultFetchBinary, outDir = path.join(ROOT, "dist"), now = new Date(), quiet = false } = {}) {
  const config = JSON.parse(await readFile(path.join(ROOT, "config.json"), "utf8"));
  const log = (...a) => { if (!quiet) console.log(...a); };
  const warnings = [];
  const ctx = {
    log,
    warn: (m) => warnings.push(m),
    scope: (name) => ({ log, warn: (m) => warnings.push(`${name}: ${m}`), scope: ctx.scope }),
  };

  const data = await loadAll(notion, config, ctx);
  const { subjects, curricula, instructors, deptColors } = data;

  // 이미지 저장 (노션 이미지 주소는 1시간 뒤 만료되므로 파일로 내려받아 둔다)
  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "img"), { recursive: true });
  await mkdir(path.join(outDir, "c"), { recursive: true });
  await mkdir(path.join(outDir, "t"), { recursive: true });
  const saved = new Map(); // key -> "img/xxx.ext"
  const queue = [];
  const want = (key, url) => { if (url && !saved.has(key)) { saved.set(key, null); queue.push({ key, url }); } };

  const curModels = new Map();
  const curIssues = new Map();
  for (const c of curricula.values()) {
    const issues = new Set();
    const m = parseCurriculum(c, issues);
    curModels.set(c.id, m);
    curIssues.set(c.id, issues);
    [...m.gallery.images, ...m.days.flatMap((d) => d.images)].forEach((i) => want(i.blockId, i.url));
    collectBlockImages([...m.prep, ...m.misc, ...m.sections.flatMap((s) => s.nodes), ...m.gallery.notes, ...m.days.flatMap((d) => d.extra)], want);
  }
  const insModels = new Map();
  const insIssues = new Map();
  for (const t of instructors.values()) {
    const issues = new Set();
    const m = parseInstructor(t, issues);
    insModels.set(t.id, m);
    insIssues.set(t.id, issues);
    const photo = t.photos[0] ? { key: `${t.id}-photo`, url: t.photos[0].url } : m.photos[0] ? { key: m.photos[0].blockId, url: m.photos[0].url } : null;
    t.photoKey = photo ? photo.key : null;
    if (photo) want(photo.key, photo.url);
    else issues.add("프로필 사진이 없음");
    collectBlockImages([...m.intro, ...m.boxes.flatMap((b) => b.blocks)], want);
  }

  log(`이미지 ${queue.length}개 저장 중…`);
  await runPool(queue, 4, async ({ key, url }) => {
    try {
      const { buf, type } = await fetchBinary(url);
      const ext = extFrom(type, url);
      const rel = `img/${key}.${ext}`;
      await writeFile(path.join(outDir, rel), buf);
      saved.set(key, rel);
    } catch (e) {
      warnings.push(`이미지를 내려받지 못했습니다 (${key}): ${e.message}`);
    }
  });
  const imgSrc = (key) => { const rel = saved.get(key); return rel ? `../${rel}` : null; };

  const builtAt = formatKST(now);
  const subjectOfCurriculum = new Map();
  for (const s of subjects) for (const id of s.curriculumIds) if (!subjectOfCurriculum.has(id)) subjectOfCurriculum.set(id, s);

  await writeFile(path.join(outDir, "index.html"), renderIndex({ config, subjects, curricula, instructors, deptColors, builtAt }));
  for (const c of curricula.values()) {
    const subject = subjectOfCurriculum.get(c.id);
    if (!subject) curIssues.get(c.id).add("과목 목록에 연결되지 않아 메인 페이지에서 보이지 않음");
    const html = renderCurriculum({ config, c, m: curModels.get(c.id), subject, deptColor: deptColors[c.dept || subject?.dept], imgSrc });
    await writeFile(path.join(outDir, "c", `${c.id}.html`), html);
  }
  for (const t of instructors.values()) {
    const html = renderInstructor({ config, t, m: insModels.get(t.id), deptColors, photoSrc: t.photoKey ? imgSrc(t.photoKey) : null, imgSrc });
    await writeFile(path.join(outDir, "t", `${t.id}.html`), html);
  }

  // 점검 리포트
  const subjectIssues = subjects
    .map((s) => ({ id: s.id, name: s.name, issues: [
      ...(s.curriculumIds.length ? [] : ["연결된 커리큘럼이 없음"]),
      ...(s.instructorIds.length ? [] : ["연결된 강사가 없음"]),
      ...(s.dept ? [] : ["학과가 비어 있음"]),
    ] }))
    .filter((x) => x.issues.length);
  const groups = [
    { title: "과목", items: subjectIssues },
    { title: "커리큘럼", items: [...curricula.values()].map((c) => ({ id: c.id, name: c.title, issues: [...curIssues.get(c.id)] })).filter((x) => x.issues.length) },
    { title: "강사", items: [...instructors.values()].map((t) => ({ id: t.id, name: t.name, issues: [...insIssues.get(t.id)] })).filter((x) => x.issues.length) },
    { title: "기타", items: warnings.length ? [{ id: "", name: "갱신 중 경고", issues: warnings }] : [] },
  ];
  const stats = { subjects: subjects.length, curricula: curricula.size, instructors: instructors.size, images: [...saved.values()].filter(Boolean).length };
  await writeFile(path.join(outDir, "report.html"), renderReport({ config, groups, builtAt, stats }));
  await writeFile(path.join(outDir, "404.html"), notFound(config));
  await writeFile(path.join(outDir, ".nojekyll"), "");
  await cp(path.join(ROOT, "assets"), path.join(outDir, "assets"), { recursive: true });

  const summary = `## 공개 페이지 갱신 완료 (${builtAt})\n\n- 과목 ${stats.subjects} · 커리큘럼 ${stats.curricula} · 강사 ${stats.instructors} · 이미지 ${stats.images}\n- 점검 항목: 과목 ${groups[0].items.length} · 커리큘럼 ${groups[1].items.length} · 강사 ${groups[2].items.length} · 경고 ${warnings.length}\n- 자세한 내용은 사이트의 report.html 에서 확인하세요.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  log(summary);
  return { stats, groups, warnings, outDir };
}

function collectBlockImages(blocks, want) {
  for (const b of blocks || []) {
    if (b.type === "image") {
      const v = b.image || {};
      want(String(b.id).replace(/-/g, ""), v.type === "external" ? v.external?.url : v.file?.url);
    }
    if (b.children) collectBlockImages(b.children, want);
  }
}

async function defaultFetchBinary(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function extFrom(type, url) {
  const t = String(type).toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("svg")) return "svg";
  const m = String(url).split("?")[0].match(/\.(png|jpe?g|webp|gif|svg)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

async function runPool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

function formatKST(d) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

function notFound(config) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>페이지를 찾을 수 없습니다</title><style>body{font-family:system-ui,sans-serif;background:#f3f5f9;color:#1d2433;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}a{color:#4f68b3}</style></head><body><div><h1>페이지를 찾을 수 없습니다</h1><p>주소가 바뀌었거나 공개가 중단된 페이지입니다.</p><p><a href="./">${config.site.title}으로 이동</a></p></div></body></html>`;
}

// 직접 실행할 때
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error("NOTION_TOKEN 이 설정되지 않았습니다. GitHub 저장소 Settings → Secrets 에 NOTION_TOKEN 을 추가하세요.");
    process.exit(1);
  }
  const notion = createNotion({ token, log: (m) => console.log(m) });
  build({ notion }).then(() => console.log(`노션 호출 ${notion.calls}회`)).catch((e) => {
    console.error("갱신 실패:", e.message);
    if (e.status === 404 || e.status === 403) console.error("노션 연결(통합)이 「교육과정 안내」 페이지에 추가됐는지 확인하세요.");
    if (e.status === 401) console.error("NOTION_TOKEN 이 올바르지 않습니다. 노션 통합의 키를 다시 복사해 넣으세요.");
    process.exit(1);
  });
}
