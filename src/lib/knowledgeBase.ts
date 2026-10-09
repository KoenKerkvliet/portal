// Kennisbank: artikelen in kb_articles. Gepubliceerde artikelen zijn zonder inloggen te
// lezen via /kennisbank/:slug, zodat je de link ook in een mail kunt zetten.

export interface KbArticle {
  id: string
  title: string
  slug: string
  category: string
  summary: string
  content: string
  published: boolean
  created_at: string
  updated_at: string
}

export const KB_PUBLIC_URL = 'https://portal.designpixels.nl/kennisbank'

export const articlePath = (slug: string) => `/kennisbank/${slug}`

// "Openingstijden aanpassen in WordPress" -> "openingstijden-aanpassen-in-wordpress"
export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // é -> e
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

export const htmlToPlainText = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent || ''

// Zoeken in titel, samenvatting, categorie en tekst; alle woorden moeten voorkomen
export function searchArticles(articles: KbArticle[], query: string): KbArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return articles
  return articles
    .map(a => {
      const title = a.title.toLowerCase()
      const haystack = `${title} ${a.summary} ${a.category} ${htmlToPlainText(a.content)}`.toLowerCase()
      if (!words.every(w => haystack.includes(w))) return null
      // Treffers in de titel eerst
      const score = words.filter(w => title.includes(w)).length
      return { a, score }
    })
    .filter((x): x is { a: KbArticle; score: number } => !!x)
    .sort((x, y) => y.score - x.score)
    .map(x => x.a)
}

// Artikelen per categorie, categorieën alfabetisch
export function groupByCategory(articles: KbArticle[]): [string, KbArticle[]][] {
  const map = new Map<string, KbArticle[]>()
  for (const a of articles) {
    const key = a.category || 'Algemeen'
    map.set(key, [...(map.get(key) || []), a])
  }
  return [...map.entries()].sort(([x], [y]) => x.localeCompare(y, 'nl'))
}
