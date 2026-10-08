import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Lock, Mail, Eye, EyeOff, User, CheckCircle, KeyRound } from 'lucide-react'

type Mode = 'login' | 'register' | 'forgot' | 'code'

// Foutmelding uit een Edge Function (ook bij een 4xx-status) leesbaar maken
async function functionErrorMessage(fnError: unknown, data: { error?: string } | null, fallback: string) {
  if (data?.error) return data.error
  if (fnError instanceof FunctionsHttpError) {
    try {
      const body = await fnError.context.json()
      if (body?.error) return body.error as string
    } catch { /* standaardmelding */ }
  }
  return fallback
}

export default function Login() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [successMessage] = useState(() => {
    // Show success message if redirected after email verification
    if (searchParams.get('verified') === 'true') {
      return 'Je e-mail is bevestigd! Je kunt nu inloggen.'
    }
    return ''
  })
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setError('')
    setRegistered(false)
    setResetSent(false)
    setCode('')
    setCodeSent(false)
  }

  // Inloggen met een code: eerst een code per mail aanvragen, dan de code controleren
  const requestCode = async () => {
    const { data, error: fnError } = await supabase.functions.invoke('login-code', {
      body: { action: 'request', email },
    })
    if (fnError || !data?.success) {
      setError(await functionErrorMessage(fnError, data, 'Versturen mislukt. Probeer het opnieuw.'))
      return false
    }
    setCode('')
    setCodeSent(true)
    return true
  }

  const verifyCode = async () => {
    const { data, error: fnError } = await supabase.functions.invoke('login-code', {
      body: { action: 'verify', email, code },
    })
    if (fnError || !data?.success || !data.token_hash) {
      setError(await functionErrorMessage(fnError, data, 'Inloggen mislukt. Probeer het opnieuw.'))
      return false
    }
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
    if (otpError) {
      setError('Inloggen mislukt. Vraag een nieuwe code aan.')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'code') {
      if (!codeSent) {
        await requestCode()
        setLoading(false)
        return
      }
      if (!(await verifyCode())) {
        setLoading(false)
        return
      }
      setTimeout(() => {
        navigate('/', { replace: true })
      }, 100)
      return
    }

    if (mode === 'forgot') {
      const { data, error: fnError } = await supabase.functions.invoke('send-password-reset-email', {
        body: { email },
      })
      if (fnError || (data && !data.success)) {
        setError('Versturen mislukt. Probeer het opnieuw.')
        setLoading(false)
        return
      }
      setResetSent(true)
      setLoading(false)
      return
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setError('Wachtwoord moet minimaal 6 tekens bevatten.')
        setLoading(false)
        return
      }

      // Create user and send branded verification email via Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('send-verification-email', {
        body: { email, password, fullName },
      })

      if (fnError) {
        setError('Registratie mislukt. Probeer het opnieuw.')
        setLoading(false)
        return
      }

      if (data && !data.success) {
        if (data.error?.includes('already been registered')) {
          setError('Dit e-mailadres is al geregistreerd. Probeer in te loggen.')
        } else {
          setError(data.error || 'Registratie mislukt. Probeer het opnieuw.')
        }
        setLoading(false)
        return
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

  // Success screen after sending reset email
  if (resetSent) {
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
            <h2 className="text-xl font-bold text-gray-900 mb-2">Check je inbox</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Als er een account bestaat voor <strong className="text-gray-700">{email}</strong>,
              hebben we een e-mail gestuurd met een link om je wachtwoord opnieuw in te stellen.
            </p>
            <button
              onClick={() => switchMode('login')}
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
            <p className="text-gray-500 text-sm leading-relaxed mb-3">
              We hebben een bevestigingsmail gestuurd naar <strong className="text-gray-700">{email}</strong>.
              Klik op de link in de e-mail om je account te activeren.
            </p>
            <p className="text-amber-700 bg-amber-50 border border-amber-100 text-xs leading-relaxed px-3 py-2 rounded-lg mb-6">
              Geen mail gevonden? Check ook even je <strong>spam-</strong> of <strong>ongewenste-mail</strong>-map.
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
              ) : mode === 'code' ? (
                <KeyRound className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              ) : (
                <User className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {mode === 'login' ? 'Welkom terug' : mode === 'register' ? 'Account aanmaken' : mode === 'code' ? 'Inloggen met een code' : 'Wachtwoord vergeten?'}
            </h2>
            <p className="text-gray-400 mt-1 text-sm">
              {mode === 'login'
                ? 'Log in op je portaal'
                : mode === 'register'
                  ? 'Registreer je voor het portaal'
                  : mode === 'code'
                    ? (codeSent ? 'Vul de code uit de mail in' : 'We sturen je een code per mail')
                    : 'We sturen je een link om je wachtwoord opnieuw in te stellen'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {successMessage && (
              <div className="bg-green-50 border border-green-100 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                {successMessage}
              </div>
            )}
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
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-sm disabled:text-gray-500"
                  placeholder="naam@voorbeeld.nl"
                  required
                  disabled={mode === 'code' && codeSent}
                />
              </div>
            </div>

            {/* Code uit de mail — alleen bij inloggen met een code, na het versturen */}
            {mode === 'code' && codeSent && (
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-white transition-all text-center text-2xl font-semibold tracking-[0.5em] font-mono"
                  placeholder="000000"
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Als er een account is voor dit adres, staat de code in je mail. Hij is 10 minuten geldig. Check ook je spammap.
                </p>
              </div>
            )}

            {mode !== 'forgot' && mode !== 'code' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Wachtwoord
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-primary hover:text-primary-600 font-medium transition-colors"
                    >
                      Vergeten?
                    </button>
                  )}
                </div>
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
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] text-sm sm:text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' || (mode === 'code' && codeSent) ? 'Bezig met inloggen...' : mode === 'register' ? 'Account aanmaken...' : 'Versturen...'}
                </span>
              ) : (
                mode === 'login' ? 'Inloggen' : mode === 'register' ? 'Registreren' : mode === 'code' ? (codeSent ? 'Inloggen' : 'Stuur code') : 'Stuur reset-link'
              )}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => switchMode('code')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <KeyRound className="w-4 h-4 text-gray-400" />
                Inloggen met een code per mail
              </button>
            )}

            {mode === 'code' && codeSent && (
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setCodeSent(false); setCode(''); setError('') }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Ander e-mailadres
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => { setError(''); setLoading(true); await requestCode(); setLoading(false) }}
                  className="text-primary hover:text-primary-600 font-medium transition-colors disabled:opacity-50"
                >
                  Nieuwe code sturen
                </button>
              </div>
            )}
          </form>

          {/* Toggle login/register */}
          <div className="mt-6 pt-5 border-t border-gray-100 text-center">
            {mode === 'login' && (
              <p className="text-sm text-gray-500">
                Nog geen account?{' '}
                <button
                  onClick={() => switchMode('register')}
                  className="text-primary hover:text-primary-600 font-semibold transition-colors"
                >
                  Registreer je hier
                </button>
              </p>
            )}
            {mode === 'register' && (
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
            {mode === 'code' && (
              <p className="text-sm text-gray-500">
                Liever met je wachtwoord?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="text-primary hover:text-primary-600 font-semibold transition-colors"
                >
                  Terug naar inloggen
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <p className="text-sm text-gray-500">
                Wachtwoord weer paraat?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="text-primary hover:text-primary-600 font-semibold transition-colors"
                >
                  Terug naar inloggen
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
