/**
 * Resolve um JSONPath simples (apenas dot/bracket access — $ raiz, .field, [N], [&quot;field&quot;]).
 * Não suporta wildcards, filtros ou recursão. Suficiente pra payload_mapping de webhook.
 */
export function getJsonPath(root: unknown, path: string): unknown {
  if (!path || !path.startsWith("$")) return undefined;
  let cur: unknown = root;
  let i = 1;
  while (i < path.length) {
    const c = path[i];
    if (c === ".") {
      i += 1;
      let end = i;
      while (end < path.length && path[end] !== "." && path[end] !== "[") end += 1;
      const key = path.slice(i, end);
      if (key.length === 0) return undefined;
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
      i = end;
    } else if (c === "[") {
      const close = path.indexOf("]", i);
      if (close < 0) return undefined;
      let key = path.slice(i + 1, close).trim();
      if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[key];
      } else {
        const idx = Number(key);
        if (!Number.isFinite(idx)) return undefined;
        if (!Array.isArray(cur)) return undefined;
        cur = cur[idx];
      }
      i = close + 1;
    } else {
      return undefined;
    }
  }
  return cur;
}

export function applyPayloadMapping(
  body: unknown,
  mapping: Record<string, string> | undefined,
): Record<string, unknown> {
  if (!mapping || Object.keys(mapping).length === 0) {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(mapping)) {
    const value = getJsonPath(body, path);
    if (value !== undefined) result[key] = value;
  }
  return result;
}
