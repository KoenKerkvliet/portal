// RSA-2048 helpers voor de Bunq API (PKCS8 / SPKI / RSASSA-PKCS1-v1_5 / SHA-256).
// Deno's Web Crypto kan dit alles native — geen externe deps nodig.

const ALGO = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function pemEncode(label: string, der: Uint8Array): string {
  const b64 = bytesToB64(der)
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`
}

function pemDecode(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s/g, '')
  return b64ToBytes(body)
}

export async function generateKeypair(): Promise<{ privatePem: string; publicPem: string }> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  return {
    privatePem: pemEncode('PRIVATE KEY', pkcs8),
    publicPem: pemEncode('PUBLIC KEY', spki),
  }
}

export async function signBody(privatePem: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemDecode(privatePem),
    ALGO,
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(ALGO.name, key, new TextEncoder().encode(body))
  return bytesToB64(new Uint8Array(sig))
}
