// 노션 데이터베이스 3개(과목 목록 · 반별 커리큘럼 · 강사 이력)를 읽어
// 사이트 생성에 필요한 형태로 정리한다.

const norm = (id) => String(id || "").replace(/-/g, "");

export const rich = (arr) => (arr || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");

function prop(page, name) {
  return page.properties ? page.properties[name] : undefined;
}

export const P = {
  title(page) {
    const p = Object.values(page.properties || {}).find((v) => v && v.type === "title");
    return p ? rich(p.title).trim() : "";
  },
  text(page, name) {
    const p = prop(page, name);
    if (!p) return "";
    if (p.type === "rich_text") return rich(p.rich_text).trim();
    if (p.type === "title") return rich(p.title).trim();
    return "";
  },
  select(page, name) {
    const p = prop(page, name);
    return p && p.type === "select" && p.select ? p.select.name : "";
  },
  multi(page, name) {
    const p = prop(page, name);
    if (!p) return [];
    if (p.type === "multi_select") return (p.multi_select || []).map((o) => o.name);
    if (p.type === "select") return p.select ? [p.select.name] : [];
    return [];
  },
  number(page, name) {
    const p = prop(page, name);
    return p && p.type === "number" && typeof p.number === "number" ? p.number : null;
  },
  checkbox(page, name) {
    const p = prop(page, name);
    return !!(p && p.type === "checkbox" && p.checkbox);
  },
  files(page, name) {
    const p = prop(page, name);
    if (!p || p.type !== "files") return [];
    return (p.files || [])
      .map((f) => ({ url: f.type === "external" ? f.external?.url : f.file?.url, name: f.name || "" }))
      .filter((f) => f.url);
  },
};

async function relationIds(notion, page, name) {
  const p = prop(page, name);
  if (!p || p.type !== "relation") return [];
  let ids = (p.relation || []).map((r) => norm(r.id));
  if (p.has_more && p.id) {
    const items = await notion.propertyItems(page.id, p.id);
    ids = items.map((it) => norm(it.relation?.id)).filter(Boolean);
  }
  return ids;
}

// 데이터베이스 선택 속성의 색 (예: 학과 → red)
function optionColors(schema, name) {
  const p = schema?.properties?.[name];
  const opts = p?.select?.options || p?.multi_select?.options || [];
  return Object.fromEntries(opts.map((o) => [o.name, o.color || "default"]));
}

// 블록 트리 전체를 가져온다. 동기화 블록은 원본 내용을 펼쳐서 넣는다.
export async function fetchTree(notion, blockId, ctx, depth = 0) {
  const blocks = await notion.blockChildren(blockId);
  for (const b of blocks) {
    if (b.type === "synced_block" && b.synced_block?.synced_from?.block_id) {
      const src = b.synced_block.synced_from.block_id;
      try {
        b.children = await fetchTree(notion, src, ctx, depth + 1);
      } catch (e) {
        ctx.warn(`동기화 블록 원본을 읽지 못했습니다 (${src}). 원본 페이지가 노션 연결에 포함됐는지 확인하세요.`);
        b.children = [];
      }
    } else if (b.has_children && b.type !== "child_page" && b.type !== "child_database" && depth < 8) {
      b.children = await fetchTree(notion, b.id, ctx, depth + 1);
    } else {
      b.children = [];
    }
  }
  return blocks;
}

const isTemplate = (title) => /^\s*📄/.test(title) || /^\s*템플릿/.test(title);

export async function loadAll(notion, config, ctx) {
  const ds = config.dataSources;
  ctx.log("노션 데이터베이스 구조를 읽는 중…");
  const [subjectSchema, curriculumSchema, instructorSchema] = [
    await notion.getDataSource(ds.subjects),
    await notion.getDataSource(ds.curricula),
    await notion.getDataSource(ds.instructors),
  ];
  const deptColors = optionColors(subjectSchema, "학과");
  // 수업 구분: 커리큘럼 DB 태그 순서·색을 기준으로, 과목 목록 DB에만 있는 태그는 뒤에 붙인다
  const typeColors = { ...optionColors(subjectSchema, "수업 구분"), ...optionColors(curriculumSchema, "수업 구분") };
  const typeOrder = [...new Set([...Object.keys(optionColors(curriculumSchema, "수업 구분")), ...Object.keys(optionColors(subjectSchema, "수업 구분"))])];

  ctx.log("과목 · 커리큘럼 · 강사 목록을 읽는 중…");
  const [subjectRows, curriculumRows, instructorRows] = [
    await notion.queryDataSource(ds.subjects),
    await notion.queryDataSource(ds.curricula),
    await notion.queryDataSource(ds.instructors),
  ];

  const curricula = new Map();
  for (const pg of curriculumRows) {
    if (pg.in_trash || pg.archived) continue;
    const title = P.title(pg);
    if (!title || isTemplate(title) || P.checkbox(pg, "숨기기")) continue;
    curricula.set(norm(pg.id), {
      id: norm(pg.id),
      title,
      subjectText: P.text(pg, "과목"),
      dept: P.select(pg, "학과"),
      // 수업 구분: 여러 개 선택 가능 (예: 격일반 + 주말반이 같은 커리큘럼). 예전 단일 선택도 그대로 읽음
      classTypes: (() => { const m = P.multi(pg, "수업 구분"); if (m.length) return m; const one = P.select(pg, "수업 구분"); return one ? [one] : []; })(),
      total: P.number(pg, "총 회차"),
      intro: P.text(pg, "한 줄 소개"),
      flow: P.text(pg, "학습 흐름"),
      edited: pg.last_edited_time,
      blocks: null,
    });
  }

  const instructors = new Map();
  for (const pg of instructorRows) {
    if (pg.in_trash || pg.archived) continue;
    const name = P.title(pg);
    if (!name || isTemplate(name) || P.checkbox(pg, "숨기기")) continue;
    instructors.set(norm(pg.id), {
      id: norm(pg.id),
      name,
      role: P.select(pg, "직책") || "강사",
      depts: P.multi(pg, "소속 표시"),
      photos: P.files(pg, "프로필 사진"),
      edited: pg.last_edited_time,
      blocks: null,
    });
  }

  const subjects = [];
  for (const pg of subjectRows) {
    if (pg.in_trash || pg.archived) continue;
    const name = P.title(pg);
    if (!name || isTemplate(name) || P.checkbox(pg, "숨기기")) continue;
    const curIds = await relationIds(notion, pg, "커리큘럼");
    const insIds = await relationIds(notion, pg, "강사명");
    subjects.push({
      id: norm(pg.id),
      name,
      dept: P.select(pg, "학과"),
      classTypes: P.multi(pg, "수업 구분"),
      curriculumIds: curIds.filter((id) => curricula.has(id)),
      instructorIds: insIds.filter((id) => instructors.has(id)),
      hiddenLinks: curIds.filter((id) => !curricula.has(id)).length + insIds.filter((id) => !instructors.has(id)).length,
    });
  }

  ctx.log(`본문 읽는 중… 커리큘럼 ${curricula.size}개, 강사 ${instructors.size}명`);
  for (const c of curricula.values()) c.blocks = await fetchTree(notion, c.id, ctx.scope(`커리큘럼 「${c.title}」`));
  for (const t of instructors.values()) t.blocks = await fetchTree(notion, t.id, ctx.scope(`강사 「${t.name}」`));

  return { subjects, curricula, instructors, deptColors, typeColors, typeOrder };
}
