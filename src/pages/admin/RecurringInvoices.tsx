import { Repeat } from 'lucide-react'

export default function RecurringInvoices() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Terugkerende facturen</h1>
        <p className="text-sm text-gray-500 mt-1">Stel automatisch terugkerende facturen in voor lopende diensten.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Repeat className="w-7 h-7 text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Binnenkort beschikbaar</p>
        <p className="text-xs text-gray-400">Hier kun je straks terugkerende facturen instellen die automatisch worden aangemaakt.</p>
      </div>
    </div>
  )
}
