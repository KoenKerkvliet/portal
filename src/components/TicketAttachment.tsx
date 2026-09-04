import { useEffect, useState } from 'react'
import { getTicketAttachmentUrl } from '../lib/ticketAttachments'

interface Props {
  /** Storage-pad (nieuw) of een volledige URL (oude rijen). */
  value: string
  /** Extra classes voor de afbeelding, bijv. een randkleur per bericht. */
  imageClassName?: string
}

/**
 * Toont een ticketbijlage. De bucket is niet publiek, dus de URL wordt per
 * weergave als tijdelijke signed URL opgehaald.
 */
export default function TicketAttachment({ value, imageClassName = '' }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setUrl(null)
    setFailed(false)
    getTicketAttachmentUrl(value).then((resolved) => {
      if (!active) return
      if (resolved) setUrl(resolved)
      else setFailed(true)
    })
    return () => {
      active = false
    }
  }, [value])

  if (failed) {
    return <p className="mt-2 text-[11px] opacity-70">Bijlage kan niet worden geladen.</p>
  }

  if (!url) {
    return <div className="mt-2 h-24 w-32 rounded-lg bg-black/5 animate-pulse" />
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
      <img src={url} alt="Bijlage" className={`max-w-full max-h-48 rounded-lg ${imageClassName}`} />
    </a>
  )
}
