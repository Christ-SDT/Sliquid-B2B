import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import { Gift, Lock, Loader2 } from 'lucide-react'

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']

interface Props {
  userName: string
  onComplete: () => void
}

export default function CertRewardForm({ userName, onComplete }: Props) {
  const [productOptions, setProductOptions] = useState<string[]>([])
  const [product, setProduct] = useState('')
  const [shirtSize, setShirtSize] = useState('')
  const [address1, setAddress1] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ name: string }[]>('/products')
      .then(data => setProductOptions(data.map(p => p.name)))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/certificates/reward', { product, shirtSize, address1, address2, city, state, zip })
      onComplete()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 overflow-y-auto max-h-[75vh]">
      {/* Congrats banner */}
      <div className="flex items-start gap-3 mb-5 p-4 bg-portal-accent/10 border border-portal-accent/30 rounded-xl">
        <Gift className="w-5 h-5 text-portal-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-on-canvas font-semibold text-sm">Congratulations, {userName}!</p>
          <p className="text-on-canvas-muted text-xs mt-0.5 leading-relaxed">
            You've earned a <span className="text-on-canvas font-medium">free Sliquid product</span> and{' '}
            <span className="text-on-canvas font-medium">t-shirt</span> for completing the Sliquid Certified Expert Course.
            Fill in the details below and we'll ship them to you.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name — read-only */}
        <div>
          <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Your Name</label>
          <input
            value={userName}
            readOnly
            className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas-muted text-sm cursor-not-allowed"
          />
        </div>

        {/* Free product */}
        <div>
          <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
            Free Product of Your Choice <span className="text-portal-accent">*</span>
          </label>
          <input
            list="product-options"
            value={product}
            onChange={e => setProduct(e.target.value)}
            required
            placeholder="Type to search products…"
            className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
          />
          <datalist id="product-options">
            {productOptions.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="text-on-canvas-muted text-xs mt-1">One Sliquid product of your choice, on us.</p>
        </div>

        {/* Shirt size */}
        <div>
          <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
            T-Shirt Size <span className="text-portal-accent">*</span>
          </label>
          <select
            value={shirtSize}
            onChange={e => setShirtSize(e.target.value)}
            required
            className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
          >
            <option value="">Select a size…</option>
            {SHIRT_SIZES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Address */}
        <div>
          <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
            Shipping Address <span className="text-portal-accent">*</span>
          </label>
          <div className="space-y-2">
            <input
              value={address1}
              onChange={e => setAddress1(e.target.value)}
              required
              placeholder="Street address"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
            />
            <input
              value={address2}
              onChange={e => setAddress2(e.target.value)}
              placeholder="Apt, suite, unit (optional)"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
            />
            <div className="grid grid-cols-5 gap-2">
              <input
                value={city}
                onChange={e => setCity(e.target.value)}
                required
                placeholder="City"
                className="col-span-3 bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
              />
              <input
                value={state}
                onChange={e => setState(e.target.value.toUpperCase())}
                required
                placeholder="State"
                maxLength={2}
                className="col-span-1 bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent uppercase"
              />
              <input
                value={zip}
                onChange={e => setZip(e.target.value)}
                required
                placeholder="ZIP"
                className="col-span-1 bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent"
              />
            </div>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="flex items-start gap-2.5 p-3 bg-surface-elevated rounded-lg border border-portal-border">
          <Lock className="w-3.5 h-3.5 text-on-canvas-muted flex-shrink-0 mt-0.5" />
          <p className="text-on-canvas-muted text-xs leading-relaxed">
            Your information is used <span className="text-on-canvas font-medium">only to ship your rewards</span> and
            will never be sold, shared, or used for any other purpose.
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Submit & View My Certificate
        </button>
      </form>
    </div>
  )
}
