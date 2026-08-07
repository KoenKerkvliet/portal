import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type Status = 'loading' | 'success' | 'unable'

export default function Verify() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')
  const navigate = useNavigate()

  useEffect(() => {
    let resolved = false
    const finish = (s: Status) => {
      if (!resolved) {
        resolved = true
        setStatus(s)
      }
    }

    // Supabase JS pakt hash-tokens (#access_token=...) automatisch op via
    // detectSessionInUrl en wist de hash. Daarna vuurt 'ie SIGNED_IN — luister daarop.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') finish('success')
    })

    // PKCE-flow: query-params met token_hash + type. Daar moeten we zelf verifyOtp doen.
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    if (tokenHash && type) {
      supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'signup' | 'email',
      }).then(({ error }) => {
        if (!error) finish('success')
      })
    }

    // Snelle check: als Supabase de hash al verwerkt had vóór wij gemount waren,
    // bestaat de sessie al — kijk of die er is.
    const quickCheck = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) finish('success')
    }, 200)

    // Eindfallback: als na 2s niks heeft geresolved, toon vriendelijke fallback.
    const finalTimeout = setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      finish(data.session ? 'success' : 'unable')
    }, 2000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(quickCheck)
      clearTimeout(finalTimeout)
    }
  }, [searchParams])

  // Auto-redirect na succesvolle verificatie: gebruiker is al ingelogd, breng 'm naar het portaal.
  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => navigate('/', { replace: true }), 1500)
      return () => clearTimeout(t)
    }
  }, [status, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-primary-50 to-accent-50 px-4 py-8">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            <span className="text-primary">Design</span>
            <span className="text-gray-900">Pixels</span>
          </h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-primary/5 border border-gray-100 p-6 sm:p-8 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">E-mail verifiëren...</h2>
              <p className="text-gray-500 text-sm">Even geduld terwijl we je e-mail bevestigen.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">E-mail bevestigd!</h2>
              <p className="text-gray-500 text-sm mb-6">
                Je account is geactiveerd. Je wordt doorgestuurd naar je portaal...
              </p>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/25 text-sm sm:text-base"
              >
                Naar je portaal
              </button>
            </>
          )}

          {status === 'unable' && (
            <>
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Niet automatisch kunnen verifiëren</h2>
              <p className="text-gray-500 text-sm mb-6">
                Mogelijk is je e-mailadres al bevestigd of is de link verlopen. Probeer in te loggen — als dat lukt, ben je verder.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/25 text-sm sm:text-base"
              >
                Naar inloggen
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} DesignPixels
        </p>
      </div>
    </div>
  )
}
