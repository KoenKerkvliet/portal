import { useState, type CSSProperties } from 'react'

const MONITOR_SRC = '/mockups/monitor.webp'

// Positie van het scherm in /mockups/monitor.webp (in procenten van de afbeelding);
// het ontwerp ligt onder de monitor en is zichtbaar door het uitgespaarde scherm.
// Rondom 0,25-0,3% ruimer dan het gat (valt weg onder de zwarte rand), zodat door
// afronding nergens een kier langs het ontwerp ontstaat.
const SCREEN = { left: 3.788, top: 4.971, width: 92.295, height: 63.313 }
const MONITOR_SCREEN = {
  left: `${SCREEN.left}%`, top: `${SCREEN.top}%`, width: `${SCREEN.width}%`, height: `${SCREEN.height}%`,
}

// Het bovenste stuk van het ontwerp (16:9, de hero) in een monitor. Standaard als op een
// laptop: van het 1920px brede ontwerp alleen het middelste stuk van 1440px (breedte
// 133,3%, links en rechts 16,7% buiten beeld), zodat de content het scherm vult. Met
// fullWidth de hele breedte van het ontwerp, zodat er links en rechts niets wegvalt.
// Op apparaten met een muis scrolt het scherm bij hover langzaam door het hele ontwerp;
// op een telefoon niet (Tailwind past hover: alleen toe op apparaten die kunnen hoveren).
export default function MonitorPreview({ imageUrl, title, fullWidth = false }: {
  imageUrl: string
  title: string
  fullWidth?: boolean
}) {
  const [scrollMs, setScrollMs] = useState(8000)
  // Welk deel van de ontwerpbreedte in beeld is
  const visible = fullWidth ? 1 : 0.75
  return (
    <div className="group relative w-full max-w-[760px] mx-auto">
      <div className="absolute overflow-hidden bg-black" style={MONITOR_SCREEN}>
        <img src={imageUrl} alt={`${title} in een monitor`}
          onLoad={(e) => {
            // Langer ontwerp = langzamer scrollen: ongeveer 2,5 seconde per schermhoogte
            const { naturalWidth, naturalHeight } = e.currentTarget
            // Eén schermhoogte = zichtbare breedte × 9/16 van het ontwerp
            const screens = naturalWidth ? (naturalHeight / (naturalWidth * visible)) / (9 / 16) - 1 : 0
            setScrollMs(Math.min(20000, Math.max(2500, Math.round(screens * 2500))))
          }}
          style={{ '--scroll-ms': `${scrollMs}ms` } as CSSProperties}
          className={`max-w-none ${fullWidth ? 'w-full' : 'w-[133.333%] -ml-[16.667%]'} h-full object-cover object-top transition-[object-position] duration-700 ease-out group-hover:object-bottom group-hover:duration-(--scroll-ms) group-hover:ease-in-out`} />
      </div>
      <img src={MONITOR_SRC} alt="" aria-hidden="true" className="relative w-full h-auto pointer-events-none select-none" />
    </div>
  )
}

const loadImage = (src: string, crossOrigin = false) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image()
  if (crossOrigin) img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error(`Afbeelding laden mislukt: ${src}`))
  img.src = src
})

// Dezelfde monitor als afbeelding (JPG, witte achtergrond), met de bovenkant van het
// ontwerp op volle breedte in het scherm. Voor in een mail.
export async function renderMonitorImage(imageUrl: string): Promise<Blob> {
  // Eigen query, zodat de browser geen eerder (zonder CORS) geladen kopie uit de cache
  // pakt; die zou het canvas onbruikbaar maken voor export
  const corsUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}export=1`
  const [monitor, design] = await Promise.all([loadImage(MONITOR_SRC), loadImage(corsUrl, true)])

  const canvas = document.createElement('canvas')
  canvas.width = monitor.naturalWidth
  canvas.height = monitor.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas niet beschikbaar')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const x = canvas.width * SCREEN.left / 100
  const y = canvas.height * SCREEN.top / 100
  const w = canvas.width * SCREEN.width / 100
  const h = canvas.height * SCREEN.height / 100
  ctx.fillStyle = '#000000'
  ctx.fillRect(x, y, w, h)
  // Bovenste stuk van het ontwerp met dezelfde verhouding als het scherm
  const sourceHeight = Math.min(design.naturalHeight, design.naturalWidth * (h / w))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(design, 0, 0, design.naturalWidth, sourceHeight, x, y, w, w * (sourceHeight / design.naturalWidth))
  ctx.drawImage(monitor, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Exporteren mislukt'))), 'image/jpeg', 0.9)
  })
}
