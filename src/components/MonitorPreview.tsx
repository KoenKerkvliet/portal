import { useState, type CSSProperties } from 'react'

// Positie van het scherm in /mockups/monitor.webp (in procenten van de afbeelding);
// het ontwerp ligt onder de monitor en is zichtbaar door het uitgespaarde scherm.
// Rondom 0,25-0,3% ruimer dan het gat (valt weg onder de zwarte rand), zodat door
// afronding nergens een kier langs het ontwerp ontstaat.
const MONITOR_SCREEN = { left: '3.788%', top: '4.971%', width: '92.295%', height: '63.313%' }

// Het bovenste stuk van het ontwerp (16:9, de hero) in een monitor, als op een laptop:
// van het 1920px brede ontwerp alleen het middelste stuk van 1440px (breedte 133,3%,
// links en rechts 16,7% buiten beeld), zodat de content het scherm vult. Op apparaten met
// een muis scrolt het scherm bij hover langzaam door het hele ontwerp; op een telefoon
// niet (Tailwind past hover: alleen toe op apparaten die kunnen hoveren).
export default function MonitorPreview({ imageUrl, title }: { imageUrl: string; title: string }) {
  const [scrollMs, setScrollMs] = useState(8000)
  return (
    <div className="group relative w-full max-w-[760px] mx-auto">
      <div className="absolute overflow-hidden bg-black" style={MONITOR_SCREEN}>
        <img src={imageUrl} alt={`${title} in een monitor`}
          onLoad={(e) => {
            // Langer ontwerp = langzamer scrollen: ongeveer 2,5 seconde per schermhoogte
            const { naturalWidth, naturalHeight } = e.currentTarget
            // Zichtbaar stuk is 1440 breed, dus één schermhoogte = 1440 × 9/16 van het ontwerp
            const screens = naturalWidth ? (naturalHeight / (naturalWidth * 0.75)) / (9 / 16) - 1 : 0
            setScrollMs(Math.min(20000, Math.max(2500, Math.round(screens * 2500))))
          }}
          style={{ '--scroll-ms': `${scrollMs}ms` } as CSSProperties}
          className="max-w-none w-[133.333%] -ml-[16.667%] h-full object-cover object-top transition-[object-position] duration-700 ease-out group-hover:object-bottom group-hover:duration-(--scroll-ms) group-hover:ease-in-out" />
      </div>
      <img src="/mockups/monitor.webp" alt="" aria-hidden="true" className="relative w-full h-auto pointer-events-none select-none" />
    </div>
  )
}
