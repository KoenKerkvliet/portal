import type { FormField } from '../types'
import type { FormAnswers } from '../lib/formAnswers'

const inputClass = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed'

// De vragen van één stap van een formulier. Gedeeld door de formulierpagina in het
// portaal en de vragenlijst via de link in de mail.
export default function FormStepFields({ fields, values, onChange, disabled = false, missing }: {
  fields: FormField[]
  values: FormAnswers
  onChange: (fieldId: string, value: string | string[] | boolean) => void
  disabled?: boolean
  missing?: Set<string>
}) {
  return (
    <div className="space-y-5">
      {fields.map((field) => {
        if (field.type === 'heading') {
          return (
            <h3 key={field.id} className="text-sm font-bold text-gray-700 pt-3 pb-1 border-b border-gray-100">
              {field.label}
            </h3>
          )
        }

        const value = values[field.id] ?? ''
        const isMissing = missing?.has(field.id)

        return (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {field.label}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>

            {field.type === 'text' && (
              <input type="text" value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder || ''} className={inputClass} />
            )}

            {field.type === 'textarea' && (
              <textarea value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder || ''} rows={4} className={`${inputClass} resize-none`} />
            )}

            {field.type === 'email' && (
              <input type="email" value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder || 'naam@voorbeeld.nl'} className={inputClass} />
            )}

            {field.type === 'phone' && (
              <input type="tel" value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder || '06 12345678'} className={inputClass} />
            )}

            {field.type === 'number' && (
              <input type="number" value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder || ''} className={inputClass} />
            )}

            {field.type === 'date' && (
              <input type="date" value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)} className={inputClass} />
            )}

            {field.type === 'select' && field.options && (
              <select value={value as string} disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)} className={inputClass}>
                <option value="">{field.placeholder || 'Maak een keuze...'}</option>
                {field.options.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            )}

            {field.type === 'radio' && field.options && (
              <div className="space-y-2.5 mt-1">
                {field.options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                    <input type="radio" name={field.id} checked={value === opt.id} disabled={disabled}
                      onChange={() => onChange(field.id, opt.id)}
                      className="w-4 h-4 text-primary border-gray-300 focus:ring-primary/30" />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}

            {field.type === 'checkbox' && field.options && (
              <div className="space-y-2.5 mt-1">
                {field.options.map((opt) => {
                  const current = Array.isArray(values[field.id]) ? (values[field.id] as string[]) : []
                  const checked = current.includes(opt.id)
                  return (
                    <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                      <input type="checkbox" checked={checked} disabled={disabled}
                        onChange={() => onChange(field.id, checked ? current.filter(id => id !== opt.id) : [...current, opt.id])}
                        className="w-4 h-4 rounded text-primary border-gray-300 focus:ring-primary/30" />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{opt.label}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {isMissing && <p className="mt-1 text-xs text-red-600">Deze vraag is verplicht.</p>}
          </div>
        )
      })}
    </div>
  )
}

