// 공개 페이지 HTML 생성

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ESC[m]);

const COLOR_NAMES = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
export const colorClass = (c) => (COLOR_NAMES.includes(c) ? c : "gray");

export function richHtml(arr) {
  return (arr || [])
    .map((t) => {
      let s = esc(t.plain_text ?? t.text?.content ?? "").replace(/\n/g, "<br>");
      const a = t.annotations || {};
      if (a.code) s = `<code>${s}</code>`;
      if (a.bold) s = `<strong>${s}</strong>`;
      if (a.italic) s = `<em>${s}</em>`;
      if (a.underline) s = `<u>${s}</u>`;
      if (a.strikethrough) s = `<s>${s}</s>`;
      const href = t.href || t.text?.link?.url;
      if (href && /^https?:\/\//.test(href)) s = `<a href="${esc(href)}" target="_blank" rel="noopener">${s}</a>`;
      return s;
    })
    .join("");
}

const rt = (b) => (b[b.type] && b[b.type].rich_text) || [];

// 일반 블록 렌더링 (과정 안내 표, 교육 목표 목록, 강사 이력 등)
export function renderBlocks(blocks, imgSrc) {
  const out = [];
  let list = null; // { tag, items }
  const flush = () => {
    if (list) out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`);
    list = null;
  };
  for (const b of blocks || []) {
    const kids = b.children && b.children.length ? renderBlocks(b.children, imgSrc) : "";
    if (b.type === "bulleted_list_item" || b.type === "numbered_list_item" || b.type === "to_do") {
      const tag = b.type === "numbered_list_item" ? "ol" : "ul";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      const mark = b.type === "to_do" ? (b.to_do.checked ? "☑ " : "☐ ") : "";
      list.items.push(`<li>${mark}${richHtml(rt(b))}${kids}</li>`);
      continue;
    }
    flush();
    switch (b.type) {
      case "paragraph": {
        const h = richHtml(rt(b));
        if (h || kids) out.push(`<p>${h}</p>${kids}`);
        break;
      }
      case "heading_1":
      case "heading_2":
      case "heading_3":
        if (b[b.type].is_toggleable) out.push(`<details class="tg"><summary>${richHtml(rt(b))}</summary>${kids}</details>`);
        else out.push(`<h4 class="sub-h">${richHtml(rt(b))}</h4>${kids}`);
        break;
      case "quote":
        out.push(`<blockquote>${richHtml(rt(b))}${kids}</blockquote>`);
        break;
      case "callout":
        out.push(`<div class="note-box">${richHtml(rt(b))}${kids}</div>`);
        break;
      case "toggle":
        out.push(`<details class="tg"><summary>${richHtml(rt(b))}</summary>${kids}</details>`);
        break;
      case "divider":
        out.push(`<hr>`);
        break;
      case "code":
        out.push(`<pre><code>${esc((b.code.rich_text || []).map((t) => t.plain_text).join(""))}</code></pre>`);
        break;
      case "table": {
        const head = b.table.has_column_header;
        const rows = (b.children || []).filter((r) => r.type === "table_row");
        const trs = rows.map((r, i) => {
          const tag = head && i === 0 ? "th" : "td";
          return `<tr>${(r.table_row.cells || []).map((c, j) => {
            const t = b.table.has_row_header && j === 0 && tag === "td" ? "th" : tag;
            return `<${t}>${richHtml(c)}</${t}>`;
          }).join("")}</tr>`;
        });
        out.push(`<div class="table-wrap"><table>${trs.join("")}</table></div>`);
        break;
      }
      case "column_list":
        out.push(`<div class="cols">${(b.children || []).map((c) => `<div>${renderBlocks(c.children, imgSrc)}</div>`).join("")}</div>`);
        break;
      case "column":
        out.push(`<div>${kids}</div>`);
        break;
      case "image": {
        const id = String(b.id).replace(/-/g, "");
        const src = imgSrc(id);
        const cap = (b.image.caption || []).map((t) => t.plain_text).join("");
        if (src) out.push(`<figure class="fig"><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}</figure>`);
        break;
      }
      case "bookmark":
      case "embed":
      case "link_preview": {
        const url = b[b.type].url;
        if (url) out.push(`<p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>`);
        break;
      }
      default:
        if (kids) out.push(kids);
    }
  }
  flush();
  return out.join("\n");
}

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap">`;

export function layout({ title, description, body, root = "", scripts = [], noindex = false, accent = "blue" }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ""}
${noindex ? `<meta name="robots" content="noindex">` : ""}
<meta name="color-scheme" content="light">
${FONT}
<link rel="stylesheet" href="${root}assets/site.css">
</head>
<body class="c-${colorClass(accent)}">
${body}
${scripts.map((s) => `<script src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

const TYPE_CLASS = { "평일(정규반)": "t-weekday", "격일반": "t-alt", "주말반": "t-weekend", "금요·특강·기타": "t-etc" };
const typeClass = (t) => TYPE_CLASS[t] || "t-etc";
export const classTypeOf = (c) => c.classType || (c.title.split(" · ").slice(1).join(" · ") || "기타");

export function renderIndex({ config, subjects, curricula, instructors, deptColors, builtAt }) {
  const S = config.site;
  const placed = new Set([...config.departments.left, ...config.departments.right]);
  const extraDepts = [...new Set(subjects.map((s) => s.dept).filter((d) => d && !placed.has(d)))];
  const cols = [config.departments.left, [...config.departments.right, ...extraDepts]];
  const noDept = subjects.filter((s) => !s.dept);
  if (noDept.length) cols[1].push("기타");

  const deptCard = (d) => {
    const list = subjects
      .filter((s) => (d === "기타" ? !s.dept : s.dept === d))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    if (!list.length) return "";
    const rows = list.map((s) => {
      const ins = s.instructorIds.map((id) => instructors.get(id)).filter(Boolean);
      const curs = s.curriculumIds.map((id) => curricula.get(id)).filter(Boolean);
      const types = [...new Set([...curs.map(classTypeOf), ...s.classTypes])];
      const insHtml = ins.length
        ? ins.map((t) => `<a class="ins" href="t/${t.id}.html">${esc(t.name)}${t.role && t.role !== "강사" ? ` <span class="role">${esc(t.role)}</span>` : ""}</a>`).join('<span class="sep">·</span>')
        : `<span class="muted">미정</span>`;
      const curHtml = curs.length
        ? curs.map((c) => `<a class="cur ${typeClass(classTypeOf(c))}" href="c/${c.id}.html" data-type="${esc(classTypeOf(c))}">${esc(classTypeOf(c))}</a>`).join("")
        : `<span class="muted">준비 중</span>`;
      return `<div class="row" data-search="${esc([s.name, ...ins.map((t) => t.name)].join(" ").toLowerCase())}" data-types="${esc(types.join("|"))}">
  <div class="subj">${esc(s.name)}</div>
  <div class="line"><span class="lab">강사</span><span class="vals">${insHtml}</span></div>
  <div class="line"><span class="lab">커리큘럼</span><span class="vals">${curHtml}</span></div>
</div>`;
    });
    return `<details class="dept c-${colorClass(deptColors[d])}" data-dept="${esc(d)}">
<summary><span class="dname">${esc(d)}</span><span class="count" data-total="${list.length}">${list.length}과목</span><span class="chev"></span></summary>
<div class="rows">${rows.join("\n")}<div class="empty" hidden>조건에 맞는 과목이 없습니다.</div></div>
</details>`;
  };

  const filters = ["전체", ...config.classTypes]
    .map((t, i) => `<button type="button" class="fbtn" data-type="${i ? esc(t) : ""}" aria-pressed="${i ? "false" : "true"}">${esc(t)}</button>`)
    .join("");

  const body = `<div class="wrap">
<header class="intro sheet-top c-blue">
  <p class="eyebrow">${esc(S.brand)} &nbsp;|&nbsp; COURSE GUIDE</p>
  <h1>${esc(S.title)}</h1>
  <p class="sub">${esc(S.lead)}</p>
  <div class="guide">${S.guide.map(([a, b]) => `<span><b>${esc(a)}</b> → ${esc(b)}</span>`).join("")}</div>
  <div class="tools">
    <label class="sr" for="q">과목·강사 검색</label>
    <input id="q" class="search" type="search" placeholder="과목명이나 강사명으로 찾기" autocomplete="off">
    <div class="filters" role="group" aria-label="수업 구분">${filters}</div>
  </div>
</header>
<p class="no-result" id="noResult" hidden>찾는 과목이 없습니다. 다른 이름으로 검색해 보세요.</p>
<div class="grid">
  ${cols.map((c) => `<div class="col">${c.map(deptCard).join("\n")}</div>`).join("\n")}
</div>
<div class="legend" aria-label="수업 구분 색">
  ${config.classTypes.map((t) => `<span class="${typeClass(t)}"><i></i>${esc(t)}</span>`).join("")}
</div>
<p class="stamp">마지막 갱신 ${esc(builtAt)}</p>
</div>`;
  return layout({ title: S.title, description: S.lead, body, scripts: ["assets/main.js"] });
}

export function renderCurriculum({ config, c, m, subject, deptColor, imgSrc }) {
  const accent = colorClass(deptColor);
  const name = subject?.name || c.subjectText || c.title.split(" · ")[0];
  const type = classTypeOf(c);
  const total = c.total || m.days.length;
  const prepHtml = m.prep.length ? renderBlocks(m.prep, imgSrc) : "";
  const anyFilled = m.filledDays > 0;

  const dayHtml = m.days
    .map((d) => {
      const items = d.items.length ? `<ul>${d.items.map((b) => `<li>${richHtml(rt(b))}</li>`).join("")}</ul>` : "";
      const extra = d.extra.length ? `<div class="day-extra">${renderBlocks(d.extra, imgSrc)}</div>` : "";
      const imgs = d.images.map((i) => imgSrc(i.blockId)).filter(Boolean);
      const gallery = imgs.length ? `<div class="day-imgs">${d.images.filter((i) => imgSrc(i.blockId)).map((i) => figure(i, imgSrc)).join("")}</div>` : "";
      const topic = d.topic ? esc(d.topic) : `<span class="muted">내용 준비 중</span>`;
      return `<article class="day">
  <div class="day-head"><span class="badge">${d.n}일차</span><h2>${topic}</h2></div>
  ${items}${extra}${gallery}
</article>`;
    })
    .join("\n");

  const galleryImgs = m.gallery.images.filter((i) => imgSrc(i.blockId));
  const galleryNotes = m.gallery.notes.length ? renderBlocks(m.gallery.notes, imgSrc) : "";
  const galleryHtml = galleryImgs.length || galleryNotes
    ? `<details class="gallery" open>
  <summary>실습 이미지 · 결과물</summary>
  <div class="gallery-body">${galleryNotes}<div class="grid2">${galleryImgs.map((i) => figure(i, imgSrc)).join("")}</div></div>
</details>`
    : "";

  const sections = m.sections.map((s) => `<section class="extra"><h3>${esc(s.title)}</h3>${renderBlocks(s.nodes, imgSrc)}</section>`).join("\n");
  const misc = m.misc.length ? `<section class="extra">${renderBlocks(m.misc, imgSrc)}</section>` : "";

  const body = `<div class="topbar">
  <a href="../index.html">← 교육과정 안내</a>
  <button type="button" class="save-btn" id="saveBtn" data-title="${esc(c.title)}">이미지로 저장 (A4)</button>
</div>
<main class="sheet c-${accent}" id="sheet">
  <p class="eyebrow">${esc(c.dept || subject?.dept || "")} &nbsp;|&nbsp; COURSE OUTLINE</p>
  <h1>${esc(name)}</h1>
  ${c.intro ? `<p class="sub">${esc(c.intro)}</p>` : ""}
  <div class="summary">${esc(type)} <span>/</span> 총 ${esc(total)}일차</div>
  ${prepHtml ? `<div class="prep"><b>준비 사항</b><div>${prepHtml}</div></div>` : ""}
  ${misc}
  ${sections}
  ${m.days.length ? `<h3 class="plan-h">회차별 학습 계획</h3>` : ""}
  ${anyFilled || !m.days.length ? `<section class="days">${dayHtml}</section>` : `<div class="pending">상세 커리큘럼을 준비하고 있습니다.</div>`}
  ${galleryHtml}
  <footer class="sheet-foot">
    <span>${c.flow ? `학습 흐름 &nbsp;${esc(c.flow)}` : ""}</span>
    <span class="brand">CURRICULUM</span>
  </footer>
</main>
<div class="modal" id="modal" hidden role="dialog" aria-modal="true" aria-labelledby="modalTitle">
  <div class="modal-box">
    <div class="modal-head"><div><b id="modalTitle">A4 이미지 미리보기</b><small id="modalSub"></small></div><button type="button" class="x-btn" id="closeBtn" aria-label="닫기">×</button></div>
    <div class="pages" id="pages"></div>
    <div class="modal-foot"><span id="saveMsg">회차 카드가 중간에 잘리지 않게 쪽을 나눴습니다.</span><button type="button" class="save-btn" id="saveAllBtn">모두 저장</button></div>
  </div>
</div>
<div class="lightbox" id="lightbox" hidden><img alt=""><button type="button" class="x-btn" aria-label="닫기">×</button></div>`;
  return layout({
    title: `${c.title} | ${config.site.title}`,
    description: c.intro || `${name} ${type} 커리큘럼 · 총 ${total}일차`,
    body,
    root: "../",
    accent,
    scripts: ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", "../assets/curriculum.js"],
  });
}

function figure(i, imgSrc) {
  const src = imgSrc(i.blockId);
  return `<figure class="fig"><img src="${esc(src)}" alt="${esc(i.caption)}" loading="lazy">${i.caption ? `<figcaption>${esc(i.caption)}</figcaption>` : ""}</figure>`;
}

export function renderInstructor({ config, t, m, deptColors, photoSrc, imgSrc }) {
  const known = t.depts.filter((d) => deptColors[d]);
  const accent = known.length === 1 ? colorClass(deptColors[known[0]]) : "slate";
  const intro = m.intro.length ? renderBlocks(m.intro, imgSrc) : "";
  const body = `<div class="topbar"><a href="../index.html">← 교육과정 안내</a></div>
<main class="sheet c-${accent}">
  <p class="eyebrow">INSTRUCTOR &nbsp;|&nbsp; PROFILE</p>
  <section class="hero">
    ${photoSrc ? `<img class="photo" src="${esc(photoSrc)}" alt="${esc(t.name)} 사진">` : `<div class="photo photo-empty" aria-hidden="true">${esc(t.name.slice(0, 1))}</div>`}
    <div class="hero-text">
      <h1>${esc(t.name)}<span>${esc(t.role || "강사")}</span></h1>
      ${t.depts.length ? `<div class="depts">${t.depts.map((d) => `<span class="dept-tag c-${colorClass(deptColors[d])}">${esc(d)}</span>`).join("")}</div>` : ""}
      ${intro ? `<div class="intro-box"><b>소개</b>${intro}</div>` : ""}
    </div>
  </section>
  ${m.boxes.length ? `<div class="boxes">${m.boxes.map((b) => `<section class="box"><h2>${esc(b.title)}</h2>${renderBlocks(b.blocks, imgSrc)}</section>`).join("")}</div>` : ""}
  ${!intro && !m.boxes.length && !m.subjects.length ? `<div class="pending" style="margin-top:22px">소개와 이력을 준비하고 있습니다.</div>` : ""}
  ${m.subjects.length ? `<section class="box subjects"><h2>강의 가능 과목</h2><div class="tags">${m.subjects.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div></section>` : ""}
  <footer class="sheet-foot"><span></span><span class="brand">INSTRUCTOR</span></footer>
</main>`;
  return layout({
    title: `${t.name} ${t.role || "강사"} | ${config.site.title}`,
    description: `${t.name} ${t.role || "강사"} 소개와 이력`,
    body,
    root: "../",
    accent,
  });
}

export function renderReport({ config, groups, builtAt, stats }) {
  const notionUrl = (id) => `https://www.notion.so/${id}`;
  const sec = groups
    .filter((g) => g.items.length)
    .map((g) => `<section class="box"><h2>${esc(g.title)} <small>${g.items.length}</small></h2><ul class="report">${g.items
      .map((it) => `<li><a href="${notionUrl(it.id)}" target="_blank" rel="noopener">${esc(it.name)}</a><ul>${it.issues.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></li>`)
      .join("")}</ul></section>`)
    .join("");
  const body = `<div class="topbar"><a href="index.html">← 교육과정 안내</a></div>
<main class="sheet c-slate">
  <p class="eyebrow">INTERNAL &nbsp;|&nbsp; 갱신 점검</p>
  <h1>갱신 점검 결과</h1>
  <p class="sub">${esc(builtAt)} 갱신 · 과목 ${stats.subjects} · 커리큘럼 ${stats.curricula} · 강사 ${stats.instructors} · 이미지 ${stats.images}</p>
  <div class="summary">아래 항목은 공개 페이지에서 비어 보이거나 빠진 부분입니다. 이름을 누르면 노션 페이지가 열립니다.</div>
  ${sec || `<p>점검할 항목이 없습니다.</p>`}
</main>`;
  return layout({ title: `갱신 점검 | ${config.site.title}`, body, noindex: true });
}
