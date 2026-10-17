// 노션 API 클라이언트 (외부 패키지 없이 Node 내장 fetch 사용)
// - 초당 약 3회 요청 제한에 맞춰 순서대로 호출
// - 429(요청 과다)·5xx 오류는 잠시 기다렸다가 다시 시도
// - 테스트에서는 transport 를 바꿔 끼워 실제 API 없이 실행

const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";
const MIN_GAP_MS = 350;

export function createNotion({ token, transport, log = () => {} } = {}) {
  let last = 0;
  let calls = 0;

  const send = transport || (async (method, path, body) => {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
    return { status: res.status, json, retryAfter: Number(res.headers.get("retry-after")) || 0 };
  });

  async function request(method, path, body) {
    for (let attempt = 1; ; attempt++) {
      const wait = last + MIN_GAP_MS - Date.now();
      if (!transport && wait > 0) await sleep(wait);
      last = Date.now();
      calls++;
      const { status, json, retryAfter } = await send(method, path, body);
      if (status >= 200 && status < 300) return json;
      const retryable = status === 429 || status >= 500;
      if (retryable && attempt < 6) {
        const ms = retryAfter ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1);
        log(`노션 응답 ${status}, ${Math.round(ms / 1000)}초 후 다시 시도 (${path})`);
        await sleep(ms);
        continue;
      }
      const msg = json && (json.message || json.code) || "";
      const err = new Error(`노션 API 오류 ${status} ${method} ${path} ${msg}`);
      err.status = status;
      throw err;
    }
  }

  // 목록형 응답을 끝까지 모아 반환
  async function paginate(fetchPage) {
    const out = [];
    let cursor;
    do {
      const page = await fetchPage(cursor);
      out.push(...(page.results || []));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  return {
    get calls() { return calls; },
    request,
    getDataSource: (id) => request("GET", `/data_sources/${id}`),
    queryDataSource: (id) =>
      paginate((cursor) => request("POST", `/data_sources/${id}/query`, cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 })),
    blockChildren: (id) =>
      paginate((cursor) => request("GET", `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`)),
    propertyItems: (pageId, propId) =>
      paginate((cursor) => request("GET", `/pages/${pageId}/properties/${encodeURIComponent(propId)}${cursor ? `?start_cursor=${cursor}` : ""}`)),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
