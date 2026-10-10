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
  view_count?: number // aantal keer gelezen (anoniem)
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

// Categorieën in een logische volgorde (van project naar techniek), met een korte
// omschrijving voor de categoriekaarten. Onbekende categorieën komen daarna, alfabetisch.
export const KB_CATEGORIES: { name: string; description: string }[] = [
  { name: 'Je project', description: 'Hoe een websiteproject verloopt en wat ik van je nodig heb.' },
  { name: 'Je klantportaal', description: 'Inloggen en alles wat je zonder inloggen kunt bekijken.' },
  { name: 'Na de oplevering', description: 'Websitebeheer, nazorg en zelf beheren.' },
  { name: 'Je website bewerken', description: 'Zelf teksten en foto’s aanpassen.' },
  { name: 'Strippen', description: 'Hoe de strippenkaart werkt en hoe je strippen koopt.' },
  { name: 'Facturen en betalen', description: 'Wanneer je welke factuur krijgt en hoe je betaalt.' },
  { name: 'Support', description: 'Een vraag stellen, bereikbaarheid en hulp bij problemen.' },
  { name: 'E-mail', description: 'Je mail instellen en berichten van je website.' },
  { name: 'Vindbaarheid', description: 'Beter gevonden worden in Google.' },
  { name: 'Een goede website', description: 'Mobiel, snel en bruikbaar voor iedereen.' },
  { name: 'Webshop', description: 'Online verkopen met je website.' },
  { name: 'Techniek uitgelegd', description: 'WordPress, hosting, back-ups en meer in gewone taal.' },
  { name: 'Veiligheid en privacy', description: 'Wachtwoorden, phishing, privacy en auteursrecht.' },
]

export const categorySlug = (name: string) => slugify(name)

export const categoryPath = (name: string) => `/kennisbank/categorie/${categorySlug(name)}`

export interface KbCategorySummary {
  name: string
  slug: string
  description: string
  count: number
}

// Categorieën met het aantal artikelen, in de vaste volgorde
export function categorySummaries(articles: KbArticle[]): KbCategorySummary[] {
  const counts = new Map<string, number>()
  for (const a of articles) {
    const name = a.category || 'Algemeen'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  const known = KB_CATEGORIES.filter(c => counts.has(c.name))
  const unknown = [...counts.keys()].filter(n => !KB_CATEGORIES.some(c => c.name === n)).sort((x, y) => x.localeCompare(y, 'nl'))
  return [...known, ...unknown.map(name => ({ name, description: '' }))]
    .map(c => ({ ...c, slug: categorySlug(c.name), count: counts.get(c.name) || 0 }))
}
