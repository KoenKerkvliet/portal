import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../types'
import { Plus, Package, Trash2, Pencil, X, Search, Repeat } from 'lucide-react'
import RichTextEditor from '../../components/RichTextEditor'

const emptyForm = {
  code: '',
  name: '',
  description: '',
  quantity_value: 1,
  quantity_unit: 'stuks',
  price: '',
  is_recurring: false,
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyForm)
  const [search, setSearch] = useState('')

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('name')
    setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      code: formData.code,
      name: formData.name,
      description: formData.description,
      quantity_value: formData.quantity_value,
      quantity_unit: formData.quantity_unit,
      price: parseFloat(formData.price) || 0,
      is_recurring: formData.is_recurring,
    }

    if (editingId) {
      await supabase.from('products').update(payload).eq('id', editingId)
    } else {
      await supabase.from('products').insert(payload)
    }

    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
    fetchProducts()
  }

  const handleEdit = (product: Product) => {
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description,
      quantity_value: product.quantity_value,
      quantity_unit: product.quantity_unit,
      price: String(product.price),
      is_recurring: product.is_recurring,
    })
    setEditingId(product.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit product wilt verwijderen?')) return
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData(emptyForm)
  }

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '')

  const filtered = products.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || stripHtml(p.description).toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Producten & Diensten</h1>
          <p className="text-gray-500 mt-1">Beheer je producten en diensten voor facturen en offertes.</p>
        </div>
        <button
          onClick={() => { setFormData(emptyForm); setEditingId(null); setShowForm(!showForm) }}
          className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuw product
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              {editingId ? 'Product bewerken' : 'Nieuw product toevoegen'}
            </h2>
            <button type="button" onClick={handleCancel} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Productcode</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all font-mono"
                placeholder="PROD-001"
                required
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dienst / Product</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                placeholder="Website ontwikkeling"
                required
              />
            </div>
            <div className="lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
              <RichTextEditor
                value={formData.description}
                onChange={(html) => setFormData({ ...formData, description: html })}
                placeholder="Omschrijving van het product of de dienst..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aantal</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={formData.quantity_value}
                  onChange={(e) => setFormData({ ...formData, quantity_value: parseInt(e.target.value) || 1 })}
                  className="w-24 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                />
                <input
                  type="text"
                  value={formData.quantity_unit}
                  onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="stuks, maanden, uren..."
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prijs (excl. BTW)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">&euro;</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white text-sm transition-all"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jaarlijkse kosten</label>
              <div className="flex gap-2 mt-0.5">
                {[
                  { value: false, label: 'Nee, eenmalig' },
                  { value: true, label: 'Ja, jaarlijks' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={String(opt.value)}
                    onClick={() => setFormData({ ...formData, is_recurring: opt.value })}
                    className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                      formData.is_recurring === opt.value
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button type="submit" className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors text-sm">
              {editingId ? 'Opslaan' : 'Toevoegen'}
            </button>
            <button type="button" onClick={handleCancel} className="px-5 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      {!loading && products.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-all"
            placeholder="Zoek op code, naam of omschrijving..."
          />
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse"><div className="h-16" /></div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nog geen producten</h3>
          <p className="text-gray-500 mt-1">Voeg je eerste product of dienst toe.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Code</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Product / Dienst</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Aantal</th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Prijs</th>
                <th className="px-5 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="px-5 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {product.code}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    {product.description && stripHtml(product.description).trim() && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[300px]">{stripHtml(product.description)}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <span className="text-sm text-gray-600">
                      {product.quantity_value} {product.quantity_unit}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      &euro;{product.price.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                    {product.is_recurring ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                        <Repeat className="w-3 h-3" />
                        Jaarlijks
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                        Eenmalig
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                        title="Bewerken"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="Verwijderen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {search && filtered.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">Geen producten gevonden voor "{search}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
