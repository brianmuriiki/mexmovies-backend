export function slugify(text) {
  return (
    text
      .toString()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

// Returns a slug that no document in `Model` uses yet (adds -2, -3, ... if needed).
export async function uniqueSlug(Model, text) {
  const base = slugify(text);
  let slug = base;
  let n = 1;
  while (await Model.exists({ slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}
