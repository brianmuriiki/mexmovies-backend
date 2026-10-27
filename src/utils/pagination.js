export function pageResult(data, total, page, limit) {
  return { data, page, limit, total, pages: Math.ceil(total / limit) || 1 };
}
