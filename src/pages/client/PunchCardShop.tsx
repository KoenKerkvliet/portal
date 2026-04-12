import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, Check, Clock, Shield, Zap, Eye, CreditCard } from 'lucide-react'

interface PricingPlan {
  name: string
  minutes: number
  strips: number
  price: number
  popular: boolean
  description: string
}

// TEST PLAN — verwijder na Stripe test
const TEST_PLAN: PricingPlan = {
  name: 'Test',
  minutes: 60,
  strips: 12,
  price: 1,
  popular: false,
  description: 'Stripe test — verwijder na testen',
}

const plans: PricingPlan[] = [
  TEST_PLAN,
  {
    name: '60 minuten',
    minutes: 60,
    strips: 12,
    price: 40,
    popular: false,
    description: 'Perfect voor kleine aanpassingen',
  },
  {
    name: '180 minuten',
    minutes: 180,
    strips: 36,
    price: 100,
    popular: true,
    description: 'Ideaal voor regelmatige ondersteuning',
  },
  {
    name: '300 minuten',
    minutes: 300,
    strips: 60,
    price: 160,
    popular: false,
    description: 'Geschikt voor uitgebreide projecten',
  },
]

const features = [
  {
    title: 'Flexibel gebruik',
    description: 'Gebruik je strippen wanneer het jou uitkomt. Elk strip is 5 minuten service die je kunt inzetten voor support, updates of nieuwe features.',
    icon: Zap,
  },
  {
    title: 'Lange geldigheid',
    description: 'Alle strippenkaarten zijn 2 jaar geldig. Ruim de tijd om je strippen in te zetten voor wat jij nodig hebt.',
    icon: Clock,
  },
  {
    title: 'Transparant',
    description: 'Je ziet precies hoeveel strippen je hebt gebruikt en waarvoor. Geen verrassingen achteraf.',
    icon: Eye,
  },
  {
    title: 'Geen abonnement',
    description: 'Je betaalt alleen voor wat je gebruikt. Geen maandelijkse verplichtingen of opzegtermijnen.',
    icon: Shield,
  },
]

export default function PunchCardShop() {
  const { profile } = useAuth()
  const [projectName, setProjectName] = useState('')
  const [projectUrl, setProjectUrl] = useState('')

  useEffect(() => {
    const fetchProject = async () => {
      if (!profile) return
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('profile_id', profile.id)
        .single()
      if (!client) return
      const { data: project } = await supabase
        .from('projects')
        .select('name, url')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .limit(1)
        .single()
      if (project) {
        setProjectName(project.name)
        setProjectUrl(project.url || '')
      }
    }
    fetchProject()
  }, [profile])

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-[#f8f7fc] to-white">
      {/* Header bar */}
      {projectName && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-500 text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 text-sm">
            <CreditCard className="w-4 h-4 flex-shrink-0" />
            <span>Je koopt strippen voor: <strong>{projectName}</strong>{projectUrl ? ` (${projectUrl})` : ''}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Terug naar portaal
        </Link>

        {/* Disclaimer */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-10 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>Let op:</strong> Strippenkaarten zijn uitsluitend bedoeld voor onderhoud en aanpassingen aan je bestaande website.
            Het bouwen van een geheel nieuwe website valt hier niet onder en kan niet met een strippenkaart worden afgerekend.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl overflow-hidden transition-shadow ${
                plan.popular
                  ? 'border-2 border-purple-400 shadow-lg shadow-purple-100'
                  : 'border border-gray-200 shadow-sm hover:shadow-md'
              }`}
            >
              {plan.popular && (
                <div className="bg-purple-500 text-white text-center py-1.5 text-xs font-bold uppercase tracking-wider">
                  Meest gekozen
                </div>
              )}
              <div className="bg-white p-8 text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500 mb-6">{plan.description}</p>

                <div className="mb-2">
                  <span className="text-4xl font-extrabold text-purple-600">&euro;{plan.price}</span>
                </div>
                <p className="text-sm text-gray-400 mb-8">{plan.strips} strippen</p>

                <div className="space-y-3 text-left mb-8">
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700">{plan.strips} strippen van 5 minuten</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <span className="text-sm text-gray-700">2 jaar geldig</span>
                  </div>
                </div>

                <button
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.popular
                      ? 'bg-purple-500 hover:bg-purple-600 text-white'
                      : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-purple-300 hover:text-purple-600'
                  }`}
                >
                  Kopen
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Why section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-10">
          <h2 className="text-xl font-bold text-gray-900 mb-8">Waarom kiezen voor strippenkaarten?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {features.map((feature) => (
              <div key={feature.title}>
                <div className="flex items-center gap-2.5 mb-2">
                  <feature.icon className="w-5 h-5 text-purple-500" />
                  <h3 className="font-semibold text-gray-900">{feature.title}</h3>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
