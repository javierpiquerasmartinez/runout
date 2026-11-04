import { Rejected } from '../rejection/rejection.js';

export const ADMIN_PAGE_SIZE = 50;
export const ADMIN_PAGE_SIZE_MAX = 200;

/** A page of a list, as the Library pages its Hands. */
export interface AdminPage {
  page: number;
  pageSize: number;
}

/** `page` and `pageSize` from a query string, or `invalid-admin-query`. */
export function adminPage(query: {
  page?: unknown;
  pageSize?: unknown;
}): AdminPage {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize =
    query.pageSize === undefined ? ADMIN_PAGE_SIZE : Number(query.pageSize);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > ADMIN_PAGE_SIZE_MAX
  ) {
    throw new Rejected('invalid-admin-query');
  }
  return { page, pageSize };
}

/** One of `allowed`, defaulting to the first; `invalid-admin-query` for anything else. */
export function oneOf<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T {
  if (raw === undefined) return allowed[0];
  if (!allowed.includes(raw as T)) throw new Rejected('invalid-admin-query');
  return raw as T;
}
