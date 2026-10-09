import { BookOpenText, Cpu, FileText, KeyRound, LayoutDashboard, LifeBuoy, Mail, PartyPopper, PenLine, Rocket, Search, ShieldCheck, Ticket } from 'lucide-react'

const ICONS: Record<string, typeof BookOpenText> = {
  'Je project': Rocket,
  'Je klantportaal': LayoutDashboard,
  'Na de oplevering': PartyPopper,
  'Je website bewerken': PenLine,
  'Strippen': Ticket,
  'Facturen en betalen': FileText,
  'Support': LifeBuoy,
  'E-mail': Mail,
  'Vindbaarheid': Search,
  'Techniek uitgelegd': Cpu,
  'Veiligheid en privacy': ShieldCheck,
  'Wachtwoorden': KeyRound,
}

// Icoon bij een kennisbankcategorie; onbekende categorieën krijgen een boek
export default function KbCategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS[category] || BookOpenText
  return <Icon className={className} />
}
