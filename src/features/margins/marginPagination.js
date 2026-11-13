export const MARGIN_PAGE_SIZE_OPTIONS = [25, 50, 100];
export const DEFAULT_MARGIN_PAGE_SIZE = 25;

/** Página de ofertas (1-based), con la página ajustada al rango válido. */
export function paginateOffers(offers = [], page = 1, pageSize = DEFAULT_MARGIN_PAGE_SIZE) {
  const size = MARGIN_PAGE_SIZE_OPTIONS.includes(Number(pageSize)) ? Number(pageSize) : DEFAULT_MARGIN_PAGE_SIZE;
  const total = offers.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), totalPages);
  const start = (current - 1) * size;
  const items = offers.slice(start, start + size);
  return {
    items,
    page: current,
    pageSize: size,
    total,
    totalPages,
    from: total ? start + 1 : 0,
    to: start + items.length,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
  };
}
