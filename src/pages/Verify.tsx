import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

type Status = 'loading' | 'success' | 'error'

export default function Verify() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')
  const navigate = useNavigate()

  useEffect(() => {
    const handleVerification = async () => {
      // Check for Supabase auth tokens in URL hash (automatic after email confirmation)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        // Supabase redirected here after email confirmation
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          setStatus('error')
          return
        }

        setStatus('success')
        return
      }

      // Check for token_hash and type (newer Supabase PKCE flow)
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'signup' | 'email',
        })

        if (error) {
          setStatus('error')
          return
        }

        setStatus('success')
        return
      }

      // No valid tokens found
      setStatus('error')
    }

    handleVerification()
  }, [searchParams])

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
                Je account is geactiveerd. Je wordt nu doorgestuurd...
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/25 text-sm sm:text-base"
              >
                Naar inloggen
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Verificatie mislukt</h2>
              <p className="text-gray-500 text-sm mb-6">
                De verificatielink is ongeldig of verlopen. Probeer opnieuw te registreren of neem contact met ons op.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/25 text-sm sm:text-base"
              >
                Terug naar inloggen
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
