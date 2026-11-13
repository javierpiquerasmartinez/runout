/** The most Hands one Bulk Import may hold; past it, it ends adding none. */
export const BULK_IMPORT_LIMIT = Symbol('BULK_IMPORT_LIMIT');

export const DEFAULT_BULK_IMPORT_LIMIT = 2_000_000;

/**
 * The most text one Bulk Import's files may hold, in characters once decoded
 * and unpacked; past it, it ends adding none, without reading the rest.
 */
export const BULK_IMPORT_TEXT_LIMIT = Symbol('BULK_IMPORT_TEXT_LIMIT');

export const DEFAULT_BULK_IMPORT_TEXT_LIMIT = 5 * 1024 ** 3;
