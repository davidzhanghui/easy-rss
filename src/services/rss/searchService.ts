import { ArticleRepository, type ArticleFilter } from '../../db/database';

/**
 * SearchService — local full-text search over title / snippet / author.
 * Keeps query logic out of components; backed by IndexedDB.
 */
export const SearchService = {
  search(query: string, opts?: Omit<ArticleFilter, 'query'>) {
    return ArticleRepository.list({ ...opts, query: query.trim(), limit: opts?.limit ?? 100 });
  },
};
