import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

export default function Terms() {
  const navigate = useNavigate()

  return (
    <div className="bg-[#f8f7fc] min-h-[calc(100vh-64px)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 py-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Algemene Voorwaarden</h1>
                <p className="text-sm text-gray-500 mt-0.5">DesignPixels</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-8">
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-700 mb-1">Binnenkort beschikbaar</p>
              <p className="text-xs text-gray-400">De algemene voorwaarden worden hier binnenkort gepubliceerd.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
