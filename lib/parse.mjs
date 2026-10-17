// 노션 본문(블록)을 공개 페이지용 구조로 해석한다.
// 규칙
//  - 노란 배경 박스(콜아웃)는 내부 안내용이라 공개하지 않는다.
//  - 템플릿 안내 문구(「학습 주제 입력」 등)는 공개하지 않고 점검 리포트에 남긴다.
//  - 회색 박스 중 「NN일차」로 시작하는 것은 회차 카드로 본다.

import { rich } from "./data.mjs";

const PLACEHOLDERS = [
  "학습 주제 입력",
  "주요 학습 내용 · 실습 과제 입력",
  "사용 프로그램 · 준비물 · 선수 학습 내용을 입력해 주세요.",
  "사용 프로그램·준비물을 입력",
  "이 위치에 이미지를 업로드하고 설명을 입력해 주세요.",
  "이 위치에 해당 과목의 이미지를 업로드하고 설명을 입력",
  "이미지 업로드 영역",
  "왼쪽 이미지 영역",
  "오른쪽 이미지 영역",
  "강사 소개 입력",
  "경력·자격·수상 입력",
  "프로젝트 및 포트폴리오 입력",
  "강의 특징 입력",
  "과목명 입력 (예: Illustrator · Photoshop)",
].map(squash);

function squash(s) {
  return String(s || "").replace(/\s+/g, " ").replace(/\s*·\s*/g, "·").trim();
}

export function isPlaceholder(text) {
  const t = squash(text);
  if (!t) return true;
  if (PLACEHOLDERS.includes(t)) return true;
  if (/업로드 영역/.test(t)) return true;
  if (t.length <= 40 && /입력(해 ?주세요|하세요)?\.?$/.test(t)) return true;
  return false;
}

const TEXT_TYPES = ["paragraph", "bulleted_list_item", "numbered_list_item", "quote", "to_do", "heading_1", "heading_2", "heading_3", "toggle", "callout"];

export function blockText(b) {
  const v = b[b.type] || {};
  return rich(v.rich_text || []);
}

const color = (b) => (b[b.type] && b[b.type].color) || "default";
const isYellow = (b) => b.type === "callout" && /yellow/.test(color(b));
const isHeading = (b) => /^heading_[123]$/.test(b.type);

// 동기화 블록은 껍데기를 벗기고 안의 블록을 그 자리에 둔다
export function unwrap(blocks) {
  const out = [];
  for (const b of blocks || []) {
    if (b.type === "synced_block") out.push(...unwrap(b.children));
    else out.push(b);
  }
  return out;
}

function imageOf(b) {
  const v = b.image || {};
  const url = v.type === "external" ? v.external?.url : v.file?.url;
  if (!url) return null;
  return { blockId: String(b.id).replace(/-/g, ""), url, caption: rich(v.caption || []).trim() };
}

// 안쪽까지 모든 이미지를 모은다 (열 나누기·토글 안 포함)
function collectImages(blocks, out = []) {
  for (const b of unwrap(blocks)) {
    if (b.type === "image") {
      const img = imageOf(b);
      if (img) out.push(img);
    } else if (b.children && b.children.length) {
      collectImages(b.children, out);
    }
  }
  return out;
}

// 이미지와 안내 문구를 뺀 나머지 블록 (공개용 일반 렌더링 대상)
export function cleanBlocks(blocks, issues) {
  const out = [];
  for (const b of unwrap(blocks)) {
    if (isYellow(b)) continue;
    if (b.type === "child_page" || b.type === "child_database" || b.type === "unsupported") continue;
    if (TEXT_TYPES.includes(b.type) && b.type !== "toggle" && b.type !== "callout") {
      const t = blockText(b);
      if (!t.trim() && !(b.children && b.children.length)) continue;
      if (isPlaceholder(t) && !(b.children && b.children.length)) {
        if (t.trim() && issues) issues.add(`안내 문구가 남아 있음: 「${t.trim()}」`);
        continue;
      }
    }
    const copy = { ...b, children: b.children ? cleanBlocks(b.children, issues) : [] };
    if (b.type === "column_list" || b.type === "column") {
      if (!copy.children.length) continue;
    }
    if (b.type === "callout" || b.type === "toggle") {
      const t = blockText(b);
      if (isPlaceholder(t) && !copy.children.length) continue;
    }
    out.push(copy);
  }
  return out;
}

const DAY_RE = /^\s*(\d{1,3})\s*(일차|회차|회)/;

function dayFromCallout(b) {
  if (b.type !== "callout") return null;
  let text = blockText(b);
  let children = b.children || [];
  if (!text.trim() && children[0] && children[0].type === "paragraph") {
    text = blockText(children[0]);
    children = children.slice(1);
  }
  const m = text.match(DAY_RE);
  if (!m) return null;
  let topic = text.slice(m[0].length).replace(/^[\s　:·\-–|]+/, "").trim();
  return { n: Number(m[1]), topic, children };
}

export function parseCurriculum(c, issues) {
  const top = unwrap(c.blocks);
  const model = { prep: [], sections: [], days: [], gallery: { images: [], notes: [] }, misc: [] };
  let mode = null; // 'prep' | 'plan' | section object
  let lastDay = null;

  const pushGeneric = (b) => {
    if (mode === "prep") model.prep.push(b);
    else if (mode && typeof mode === "object") mode.nodes.push(b);
    else if (mode === "plan" && lastDay) lastDay.extra.push(b);
    else model.misc.push(b);
  };

  for (const b of top) {
    if (isYellow(b)) continue;
    if (b.type === "divider" || b.type === "child_page" || b.type === "child_database") continue;

    const text = blockText(b);

    if (isHeading(b) && !b[b.type].is_toggleable) {
      if (/COURSE\s*OUTLINE/i.test(text)) { mode = null; continue; }
      if (/준비\s*사항/.test(text)) { mode = "prep"; continue; }
      if (/회차별|학습\s*계획/.test(text)) { mode = "plan"; continue; }
      if (/실습\s*이미지|결과물/.test(text)) { mode = "gallery"; continue; }
      const sec = { title: text.trim(), nodes: [] };
      model.sections.push(sec);
      mode = sec;
      continue;
    }

    const day = dayFromCallout(b);
    if (day) {
      const items = [];
      const extra = [];
      for (const ch of unwrap(day.children)) {
        if (ch.type === "image") { const img = imageOf(ch); if (img) extra.push({ __image: img }); continue; }
        const t = blockText(ch);
        if (["bulleted_list_item", "numbered_list_item", "paragraph", "to_do"].includes(ch.type)) {
          if (isPlaceholder(t)) { if (t.trim()) issues.add(`${day.n}일차: 안내 문구가 남아 있음 「${t.trim()}」`); continue; }
          items.push(ch);
        } else {
          extra.push(ch);
        }
      }
      let topic = day.topic;
      if (isPlaceholder(topic)) {
        if (topic) issues.add(`${day.n}일차: 주제가 아직 입력되지 않음`);
        topic = "";
      }
      lastDay = { n: day.n, topic, items, images: extra.filter((e) => e.__image).map((e) => e.__image), extra: cleanBlocks(extra.filter((e) => !e.__image), issues) };
      model.days.push(lastDay);
      mode = "plan";
      continue;
    }

    if (b.type === "callout" && /gray/.test(color(b)) && /총\s*\d+\s*일차|\/\s*총/.test(text)) continue; // 요약 박스

    const isToggle = b.type === "toggle" || (isHeading(b) && b[b.type].is_toggleable);
    if (isToggle) {
      const imgs = collectImages(b.children);
      const galleryLike = /실습\s*이미지|결과물|이미지/.test(text);
      if (imgs.length || galleryLike) {
        model.gallery.images.push(...imgs);
        const notes = cleanBlocks(stripImages(b.children), issues);
        model.gallery.notes.push(...notes);
        continue;
      }
      const cleaned = cleanBlocks([b], issues);
      cleaned.forEach(pushGeneric);
      continue;
    }

    if (b.type === "image") {
      const img = imageOf(b);
      if (!img) continue;
      if (mode === "plan" && lastDay) lastDay.images.push(img);
      else model.gallery.images.push(img);
      continue;
    }

    if (b.type === "column_list") {
      const imgs = collectImages([b]);
      const rest = cleanBlocks(stripImages([b]), issues);
      if (mode === "plan" && lastDay) lastDay.images.push(...imgs);
      else model.gallery.images.push(...imgs);
      rest.forEach(pushGeneric);
      continue;
    }

    const cleaned = cleanBlocks([b], issues);
    cleaned.forEach(pushGeneric);
  }

  model.sections = model.sections.filter((s) => s.nodes.length);
  const filled = model.days.filter((d) => d.topic || d.items.length).length;
  model.filledDays = filled;
  if (!model.days.length) issues.add("회차 카드가 없습니다");
  else if (!filled) {
    // 전부 비어 있으면 회차별 알림 대신 한 줄로 정리
    for (const x of [...issues]) if (/^\d+일차:/.test(x)) issues.delete(x);
    issues.add("회차 내용이 아직 입력되지 않음 (공개 페이지에는 ‘준비 중’으로 표시)");
  }
  else if (filled < model.days.length) issues.add(`회차 ${model.days.length}개 중 ${model.days.length - filled}개가 비어 있음`);
  if (c.total && model.days.length && c.total !== model.days.length) issues.add(`총 회차는 ${c.total}인데 회차 카드는 ${model.days.length}개`);
  const nums = model.days.map((d) => d.n);
  if (nums.some((n, i) => i > 0 && n <= nums[i - 1])) issues.add("회차 번호 순서가 맞지 않음");
  if (!model.prep.length) issues.add("준비 사항이 비어 있음");
  return model;
}

function stripImages(blocks) {
  return unwrap(blocks)
    .filter((b) => b.type !== "image")
    .map((b) => ({ ...b, children: b.children ? stripImages(b.children) : [] }));
}

export function parseInstructor(t, issues) {
  const top = unwrap(t.blocks);
  const photos = [];
  const sections = [];
  let cur = null;
  const before = [];
  for (const b of top) {
    if (isYellow(b)) continue;
    if (isHeading(b)) {
      cur = { name: blockText(b).trim(), blocks: [] };
      sections.push(cur);
      if (b.children && b.children.length) cur.blocks.push(...unwrap(b.children));
      continue;
    }
    if (b.type === "image" && (!cur || /사진/.test(cur.name))) {
      const img = imageOf(b);
      if (img) photos.push(img);
      continue;
    }
    if (b.type === "column_list" && (!cur || /사진/.test(cur.name))) {
      photos.push(...collectImages([b]));
      continue;
    }
    if (cur) cur.blocks.push(b);
    else before.push(b);
  }
  const beforeText = before.map(blockText).filter((s) => s.trim() && !isPlaceholder(s));
  if (beforeText.length) issues.add(`제목 위쪽 글은 공개하지 않음: 「${beforeText.join(" / ").slice(0, 60)}」`);

  let intro = [];
  let subjects = [];
  const boxes = [];
  for (const s of sections) {
    if (/사진/.test(s.name)) continue;
    const cleaned = cleanBlocks(s.blocks, issues);
    if (/^소개/.test(s.name)) { intro = cleaned; continue; }
    if (/강의\s*가능\s*과목|담당\s*과목/.test(s.name)) {
      const text = s.blocks.map(blockText).filter((x) => !isPlaceholder(x)).join("\n");
      subjects = splitTags(text);
      continue;
    }
    if (cleaned.length) boxes.push({ title: s.name, blocks: cleaned });
  }
  if (!intro.length && !boxes.length && !subjects.length) {
    for (const x of [...issues]) if (/^안내 문구/.test(x)) issues.delete(x);
    issues.add("소개·이력이 아직 입력되지 않음");
  } else {
    if (!intro.length) issues.add("소개가 비어 있음");
    if (!boxes.length) issues.add("이력이 비어 있음");
  }
  return { photos, intro, subjects, boxes };
}

export function splitTags(text) {
  const parts = String(text || "")
    .split(/[,，·•/\n]+/)
    .map((s) => s.trim())
    .filter((s) => s && !isPlaceholder(s));
  // 「AI프롬프트 1, 2」처럼 숫자만 남은 조각은 앞 과목에 붙인다
  const out = [];
  for (const p of parts) {
    if (/^\d+$/.test(p) && out.length) out[out.length - 1] += `, ${p}`;
    else out.push(p);
  }
  return out;
}
