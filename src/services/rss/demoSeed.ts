import { ArticleRepository, FeedRepository, FolderRepository } from '../../db/database';
import type { Article, Feed } from '../../types';
import { stableArticleId, uid } from '../../utils/helpers';

const H = 3600_000;
const BASE = Date.now();

interface DemoDef {
  folder: string;
  title: string;
  url: string;
  siteUrl: string;
  desc: string;
}

const DEMO_FEEDS: DemoDef[] = [
  { folder: 'Technology', title: 'Hacker News', url: 'https://news.ycombinator.com/rss', siteUrl: 'https://news.ycombinator.com', desc: 'Tech news and discussions' },
  { folder: 'Technology', title: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', siteUrl: 'https://arstechnica.com', desc: 'In-depth tech reporting' },
  { folder: 'Technology', title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', siteUrl: 'https://www.theverge.com', desc: 'Tech culture and gadgets' },
  { folder: 'AI', title: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml', siteUrl: 'https://openai.com/blog', desc: 'OpenAI research and product updates' },
  { folder: 'AI', title: 'Anthropic News', url: 'https://www.anthropic.com/news/rss.xml', siteUrl: 'https://www.anthropic.com', desc: 'Anthropic announcements' },
  { folder: 'Programming', title: 'GitHub Blog', url: 'https://github.blog/feed/', siteUrl: 'https://github.blog', desc: 'Engineering and open source' },
  { folder: 'Programming', title: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', siteUrl: 'https://css-tricks.com', desc: 'Frontend tips and tricks' },
];

const DEMO_ARTICLES: Array<{ feed: number; title: string; author: string; hoursAgo: number; snippet: string; body: string; image?: string }> = [
  {
    feed: 0, title: 'A local-first RSS reader that runs entirely in your browser', author: 'Demo', hoursAgo: 2,
    snippet: 'No backend, no tracking — feeds, articles and read state all live in IndexedDB…',
    body: `<p><strong>Local-first software</strong> keeps your data on your device. This demo article shows what the reader looks like with rich content.</p><blockquote><p>“The fastest database is the one already on your device.”</p></blockquote><h2>Why IndexedDB?</h2><ul><li>Works offline</li><li>Stores tens of thousands of articles</li><li>No server bills</li></ul><pre><code>const db = new Dexie('easy-rss-db');\nawait db.articles.where('isRead').equals(0).count();</code></pre>`,
  },
  {
    feed: 3, title: 'Sample post: a reasoning model with a longer context window', author: 'Demo', hoursAgo: 5,
    snippet: 'Sample content showing headings, lists, links and tables in the reader…',
    body: `<p>This is <em>sample content</em> (not a real announcement) showing how headings, lists and tables render.</p><h2>Highlights</h2><ol><li>Longer context for whole-codebase reasoning</li><li>Fewer hallucinations on retrieval tasks</li><li>Native multimodal inputs</li></ol><p>Links open in a new tab, e.g. <a href="https://example.com">example.com</a>.</p><table><thead><tr><th>Metric</th><th>Before</th><th>After</th></tr></thead><tbody><tr><td>Example A</td><td>1</td><td>2</td></tr><tr><td>Example B</td><td>3</td><td>4</td></tr></tbody></table>`,
    image: 'https://picsum.photos/seed/rss-ai/800/400',
  },
  {
    feed: 1, title: 'Sample post: inside the chips powering the next wave of laptops', author: 'Demo', hoursAgo: 8,
    snippet: 'Efficiency cores, NPUs, and the slow death of the fan…',
    body: `<p>Laptop chips are going through their biggest transition in a decade. Here is what actually matters:</p><h2>Battery life is the benchmark</h2><p>Performance-per-watt now decides winners more than peak single-thread scores.</p>`,
    image: 'https://picsum.photos/seed/rss-chip/800/400',
  },
  {
    feed: 5, title: 'Sample post: shipping a preview for every pull request', author: 'Demo', hoursAgo: 14,
    snippet: 'Ephemeral environments, content hashing, and fast rollbacks…',
    body: `<p>Every pull request gets its own ephemeral environment. The pipeline looks like this:</p><pre><code>on: pull_request\njobs:\n  preview:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci &amp;&amp; npm run build</code></pre><p>Key lesson: <em>make previews disposable</em> so developers trust them.</p>`,
  },
  {
    feed: 2, title: 'Sample post: the quiet return of the personal blog', author: 'Demo', hoursAgo: 26,
    snippet: 'RSS never died — it just waited for the algorithm era to burn out…',
    body: `<p>After a decade of algorithmic feeds, readers are rebuilding personal information diets with RSS.</p><blockquote><p>Own your sources. Own your attention.</p></blockquote>`,
    image: 'https://picsum.photos/seed/rss-blog/800/400',
  },
  {
    feed: 4, title: 'Sample post: training assistants with explicit principles', author: 'Demo', hoursAgo: 30,
    snippet: 'Sample content about principles-based training and evaluation…',
    body: `<p>Constitutional AI trains models against an explicit set of principles rather than implicit human preferences alone.</p><h2>Takeaways</h2><ul><li>Principles make behavior more predictable</li><li>Evaluation still matters more than vibes</li></ul>`,
  },
  {
    feed: 6, title: 'Sample post: modern fluid type with clamp()', author: 'Demo', hoursAgo: 50,
    snippet: 'One line of CSS for type that scales beautifully…',
    body: `<p>Fluid typography in one line:</p><pre><code>h1 { font-size: clamp(1.8rem, 4vw + 1rem, 3.5rem); }</code></pre><p>Pair it with <code>text-wrap: balance</code> for headlines.</p>`,
  },
  {
    feed: 0, title: 'Sample thread: which RSS feeds can you not live without?', author: 'Demo', hoursAgo: 55,
    snippet: 'Hundreds of readers share their essential subscriptions…',
    body: `<p>Readers tend to mention a few big names plus a long tail of niche engineering blogs.</p>`,
  },
  {
    feed: 3, title: 'Sample post: evaluating long-context reasoning', author: 'Demo', hoursAgo: 80,
    snippet: 'Needles, haystacks, and multi-hop questions…',
    body: `<p>Long-context evaluation needs more than needle-in-a-haystack retrieval. We test multi-hop reasoning across entire documents.</p>`,
    image: 'https://picsum.photos/seed/rss-eval/800/400',
  },
  {
    feed: 5, title: 'Sample post: open-source projects worth a look this week', author: 'Demo', hoursAgo: 100,
    snippet: 'From terminal UIs to tiny vector databases…',
    body: `<p>This week developers are starring terminal file managers, local-first sync engines, and a 200-line vector DB.</p>`,
  },
];

export async function ensureDemoSeeded(): Promise<void> {
  // Claim synchronously to survive React StrictMode double-effects and
  // concurrent tabs: only the first caller proceeds past this line.
  try {
    if (localStorage.getItem('rss-demo-seed-v1')) return;
    localStorage.setItem('rss-demo-seed-v1', '1');
  } catch {
    // storage unavailable -> fall through to DB check
  }
  const existing = await FeedRepository.all();
  if (existing.length > 0) return;
  const folderIds = new Map<string, string>();
  for (const name of [...new Set(DEMO_FEEDS.map((f) => f.folder))]) {
    const id = uid('folder');
    folderIds.set(name, id);
    await FolderRepository.put({ id, name, createdAt: Date.now() });
  }
  const feeds: Feed[] = DEMO_FEEDS.map((d) => {
    const id = uid('feed');
    const now = Date.now();
    return {
      id, title: d.title, description: d.desc, url: d.url, siteUrl: d.siteUrl,
      icon: undefined, folderId: folderIds.get(d.folder), isDemo: true,
      lastFetchedAt: now, createdAt: now, updatedAt: now,
    };
  });
  for (const f of feeds) await FeedRepository.put(f);
  const articles: Article[] = DEMO_ARTICLES.map((d, i) => {
    const feed = feeds[d.feed];
    const publishedAt = BASE - d.hoursAgo * H - i * 1000;
    return {
      id: stableArticleId(feed.id, d.title, `demo:${i}`),
      feedId: feed.id,
      title: d.title,
      url: feed.siteUrl ?? feed.url,
      author: d.author,
      content: d.body,
      contentSnippet: d.snippet,
      publishedAt,
      image: d.image,
      isRead: i > 4,
      isStarred: i === 1 || i === 5,
      isReadLater: i === 2,
      isDemo: true,
      createdAt: publishedAt,
    };
  });
  await ArticleRepository.bulkUpsert(articles);
}
