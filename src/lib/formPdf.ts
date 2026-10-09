// PDF met de vragen en antwoorden van een ingevulde vragenlijst (vector-tekst via jsPDF)
import type { Form } from '../types'
import { answerText, type FormAnswers } from './formAnswers'

export async function downloadFormAnswersPdf(opts: {
  form: Pick<Form, 'title' | 'description' | 'steps'>
  answers: FormAnswers
  projectName: string
  submittedAt: string | null
}) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const width = pageWidth - margin * 2
  const bottom = 280
  let y = 22

  const ensure = (height: number) => {
    if (y + height > bottom) { doc.addPage(); y = 22 }
  }
  const write = (text: string, size: number, style: 'normal' | 'bold', color: [number, number, number], lineHeight: number) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
    doc.setTextColor(...color)
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      ensure(lineHeight)
      doc.text(line, margin, y)
      y += lineHeight
    }
  }

  write('DesignPixels', 9, 'normal', [140, 140, 150], 5)
  y += 2
  write(opts.form.title, 18, 'bold', [20, 20, 30], 8)
  // Alleen tekens uit de standaardfont van de PDF (geen · of —)
  if (opts.projectName) write(`Domein: ${opts.projectName}`, 10, 'normal', [110, 110, 120], 5)
  if (opts.submittedAt) {
    const when = new Date(opts.submittedAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    write(`Ingevuld op ${when}`, 10, 'normal', [110, 110, 120], 5)
  }
  y += 3
  doc.setDrawColor(225, 225, 230)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  for (const step of opts.form.steps || []) {
    if (step.title) {
      ensure(14)
      write(step.title, 13, 'bold', [91, 33, 182], 6)
      y += 2
    }
    for (const field of step.fields) {
      if (field.type === 'heading') {
        ensure(10)
        y += 1
        write(field.label, 11, 'bold', [50, 50, 60], 5.5)
        y += 1
        continue
      }
      ensure(12)
      write(field.label, 10, 'bold', [60, 60, 70], 5)
      const answer = answerText(field, opts.answers[field.id])
      write(answer || '(niet ingevuld)', 10, 'normal', answer ? [30, 30, 35] : [170, 170, 175], 5)
      y += 3
    }
    y += 3
  }

  const safe = (s: string) => s.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-')
  doc.save(`Vragenlijst-${safe(opts.form.title)}-${safe(opts.projectName) || 'domein'}.pdf`)
}
