import { ArticleRepository } from '../../db/database';

/** ArticleService — read/star/read-later state mutations + batch ops (optimistic-UI friendly). */
export const ArticleService = {
  markRead(id: string) {
    return ArticleRepository.update(id, { isRead: true });
  },
  markUnread(id: string) {
    return ArticleRepository.update(id, { isRead: false });
  },
  toggleStar(id: string, value: boolean) {
    return ArticleRepository.update(id, { isStarred: value });
  },
  toggleReadLater(id: string, value: boolean) {
    return ArticleRepository.update(id, { isReadLater: value });
  },
  markManyRead(ids: string[]) {
    return ArticleRepository.bulkUpdate(ids, { isRead: true });
  },
  markManyUnread(ids: string[]) {
    return ArticleRepository.bulkUpdate(ids, { isRead: false });
  },
  starMany(ids: string[], value: boolean) {
    return ArticleRepository.bulkUpdate(ids, { isStarred: value });
  },
  deleteMany(ids: string[]) {
    return ArticleRepository.deleteMany(ids);
  },
  markFeedRead(feedId: string) {
    return ArticleRepository.markFeedRead(feedId);
  },
  markAllRead() {
    return ArticleRepository.markAllRead();
  },
};
