import { Info } from 'lucide-react'

const alignClasses = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
}

type Align = keyof typeof alignClasses

// Uitlegballon boven het element; verschijnt bij hover en bij focus (tikken op mobiel)
export function Tooltip({ text, align = 'left', children }: { text: string; align?: Align; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex group/tip align-middle">
      {children}
      <span role="tooltip"
        className={`pointer-events-none absolute bottom-full mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case tracking-normal leading-relaxed text-white shadow-lg opacity-0 invisible transition-opacity z-50 group-hover/tip:opacity-100 group-hover/tip:visible group-focus-within/tip:opacity-100 group-focus-within/tip:visible ${alignClasses[align]}`}>
        {text}
      </span>
    </span>
  )
}

export default function HelpTip({ text, align = 'left' }: { text: string; align?: Align }) {
  return (
    <Tooltip text={text} align={align}>
      <button type="button" aria-label={text}
        className="text-gray-300 hover:text-gray-500 focus:text-gray-500 focus:outline-none transition-colors">
        <Info className="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  )
}
