import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Lock, Mail, Eye, EyeOff, User, CheckCircle } from 'lucide-react'

type Mode = 'login' | 'register'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setError('')
    setRegistered(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'register') {
      if (password.length < 6) {
        setError('Wachtwoord moet minimaal 6 tekens bevatten.')
        setLoading(false)
        return
      }

      const { error: signUpError } = await signUp(email, password, fullName)

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('Dit e-mailadres is al geregistreerd. Probeer in te loggen.')
        } else {
          setError('Registratie mislukt. Probeer het opnieuw.')
        }
        setLoading(false)
        return
      }

      // Small delay to let the Supabase trigger create the profile
      await new Promise((r) => setTimeout(r, 1500))

      // Send verification email via server-side database function
      try {
        const { data, error: rpcError } = await supabase.rpc('send_verification_email', {
          user_email: email,
          user_name: fullName,
        })
        if (rpcError) {
          console.error('Failed to send verification email:', rpcError)
        } else {
          console.log('Verification email sent:', data)
        }
      } catch (err) {
        console.error('Failed to send verification email:', err)
      }

      setRegistered(true)
      setLoading(false)
      return
    }

    // Login
    const { error: loginError } = await signIn(email, password)

    if (loginError) {
      setError('Ongeldige inloggegevens. Probeer het opnieuw.')
      setLoading(false)
      return
    }

    setTimeout(() => {
      navigate('/', { replace: true })
    }, 100)
  }

  // Success screen after registration
  if (registered) {
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
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Account aangemaakt!</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              We hebben een bevestigingsmail gestuurd naar <strong className="text-gray-700">{email}</strong>.
              Klik op de link in de e-mail om je account te activeren.
            </p>
            <button
              onClick={() => { setRegistered(false); switchMode('login') }}
              className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/25 text-sm sm:text-base"
            >
              Terug naar inloggen
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            &copy; {new Date().getFullYear()} DesignPixels
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-primary-50 to-accent-50 px-4 py-8">
      <div className="w-full max-w-sm sm:max-w-md">
        {/* Brand */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            <span className="text-primary">Design</span>
            <span className="text-gray-900">Pixels</span>
          </h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-primary/5 border border-gray-100 p-6 sm:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-primary to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
              {mode === 'login' ? (
                <Lock className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              ) : (
                <User className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {mode === 'login' ? 'Welkom terug' : 'Account aanmaken'}
            </h2>
            <p className="text-gray-400 mt-1 text-sm">
              {mode === 'login' ? 'Log in op je portaal' : 'Registreer je voor het portaal'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Full name — only for register */}
            {mode === 'register' && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Volledige naam
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                    placeholder="Jan de Vries"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                E-mailadres
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  placeholder="naam@voorbeeld.nl"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Wachtwoord
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm"
                  placeholder="••••••••"
                  required
                  minLength={mode === 'register' ? 6 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-xs text-gray-400 mt-1.5">Minimaal 6 tekens</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] text-sm sm:text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' ? 'Bezig met inloggen...' : 'Account aanmaken...'}
                </span>
              ) : (
                mode === 'login' ? 'Inloggen' : 'Registreren'
              )}
            </button>
          </form>

          {/* Toggle login/register */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            {mode === 'login' ? (
              <p className="text-sm text-gray-500">
                Nog geen account?{' '}
                <button
                  onClick={() => switchMode('register')}
                  className="text-primary hover:text-primary-600 font-semibold transition-colors"
                >
                  Registreer je hier
                </button>
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Al een account?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="text-primary hover:text-primary-600 font-semibold transition-colors"
                >
                  Log hier in
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} DesignPixels
        </p>
      </div>
    </div>
  )
}
