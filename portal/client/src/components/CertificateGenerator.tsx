import { useState, useEffect } from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  PDFDownloadLink,
} from '@react-pdf/renderer'
import { api } from '@/api/client'

// ─── Colors ──────────────────────────────────────────────────────────────────
const SLIQUID_BLUE = '#0A84C0'
const SLIQUID_LIGHT_BLUE = '#E8F4FB'
const GOLD = '#C9A84C'
const NEAR_WHITE = '#FAFCFE'
const DARK_TEXT = '#1A1A2E'
const MID_GRAY = '#6B7280'
const WHITE = '#FFFFFF'

// ─── Types ───────────────────────────────────────────────────────────────────
interface CertData {
  firstName: string
  lastName: string
  completionDate: string
  certificateNumber: string
}

interface CertificatePDFProps {
  firstName: string
  lastName: string
  completionDate: string
  certNumber: string
  verifyUrl: string
}

// ─── PDF Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    backgroundColor: NEAR_WHITE,
    padding: 0,
    position: 'relative',
  },
  outerBorder: {
    position: 'absolute',
    top: 25,
    left: 25,
    right: 25,
    bottom: 25,
    borderWidth: 3,
    borderColor: SLIQUID_BLUE,
    borderStyle: 'solid',
  },
  innerBorder: {
    position: 'absolute',
    top: 36,
    left: 36,
    right: 36,
    bottom: 36,
    borderWidth: 1,
    borderColor: GOLD,
    borderStyle: 'solid',
  },
  topBar: {
    position: 'absolute',
    top: 36,
    left: 36,
    right: 36,
    height: 72,
    backgroundColor: SLIQUID_BLUE,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: WHITE,
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 4,
  },
  tagline: {
    color: '#B0D9F0',
    fontSize: 8,
    fontFamily: 'Helvetica',
    letterSpacing: 3,
    marginTop: 2,
  },
  goldLine: {
    position: 'absolute',
    top: 108,
    left: 36,
    right: 36,
    height: 2,
    backgroundColor: GOLD,
  },
  body: {
    position: 'absolute',
    top: 118,
    left: 36,
    right: 36,
    bottom: 36,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  certHeader: {
    color: SLIQUID_BLUE,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 4,
    marginTop: 18,
  },
  thisText: {
    color: MID_GRAY,
    fontSize: 11,
    fontFamily: 'Helvetica-Oblique',
    marginTop: 16,
  },
  recipientName: {
    color: DARK_TEXT,
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
  },
  nameUnderline: {
    height: 1.5,
    backgroundColor: SLIQUID_BLUE,
    marginTop: 4,
    width: '60%',
  },
  bodyText: {
    color: MID_GRAY,
    fontSize: 10,
    fontFamily: 'Helvetica',
    marginTop: 14,
    textAlign: 'center',
  },
  expertBadge: {
    backgroundColor: SLIQUID_LIGHT_BLUE,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 8,
    marginTop: 12,
  },
  expertText: {
    color: SLIQUID_BLUE,
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  supportingText: {
    color: MID_GRAY,
    fontSize: 9,
    fontFamily: 'Helvetica',
    marginTop: 8,
    textAlign: 'center',
  },
  dateText: {
    color: DARK_TEXT,
    fontSize: 9,
    fontFamily: 'Helvetica',
    marginTop: 10,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 50,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sigBlock: {
    width: 180,
    alignItems: 'center',
  },
  sigLine: {
    width: 160,
    height: 1,
    backgroundColor: DARK_TEXT,
    marginBottom: 4,
  },
  sigName: {
    color: DARK_TEXT,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  sigTitle: {
    color: MID_GRAY,
    fontSize: 8,
    fontFamily: 'Helvetica',
    marginTop: 1,
    textAlign: 'center',
  },
  certNumberLabel: {
    color: MID_GRAY,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  certNumber: {
    color: DARK_TEXT,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginTop: 2,
  },
  verifyUrl: {
    color: MID_GRAY,
    fontSize: 7,
    fontFamily: 'Helvetica',
    marginTop: 1,
  },
  footerBar: {
    position: 'absolute',
    bottom: 36,
    left: 36,
    right: 36,
    height: 14,
    backgroundColor: SLIQUID_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: WHITE,
    fontSize: 6,
    fontFamily: 'Helvetica',
    letterSpacing: 0.5,
  },
})

// ─── PDF Document Component ──────────────────────────────────────────────────
function CertificatePDF({ firstName, lastName, completionDate, certNumber, verifyUrl }: CertificatePDFProps) {
  return (
    <Document
      title={`Sliquid Expert Certificate — ${firstName} ${lastName}`}
      author="Sliquid"
      subject="Sliquid Certified Expert Certificate"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        {/* Borders */}
        <View style={styles.outerBorder} />
        <View style={styles.innerBorder} />

        {/* Corner accents */}
        {([
          { top: 0, left: 0 },
          { top: 0, right: 0 },
          { bottom: 0, left: 0 },
          { bottom: 0, right: 0 },
        ] as const).map((pos, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: 43,
              height: 43,
              backgroundColor: SLIQUID_BLUE,
              ...pos,
            }}
          />
        ))}

        {/* Top Bar */}
        <View style={styles.topBar}>
          <Text style={styles.brandName}>SLIQUID</Text>
          <Text style={styles.tagline}>PREMIUM INTIMATE WELLNESS</Text>
        </View>

        <View style={styles.goldLine} />

        {/* Body Content */}
        <View style={styles.body}>
          <Text style={styles.certHeader}>
            C E R T I F I C A T E   O F   A C H I E V E M E N T
          </Text>
          <Text style={styles.thisText}>This certifies that</Text>
          <Text style={styles.recipientName}>
            {firstName} {lastName}
          </Text>
          <View style={styles.nameUnderline} />
          <Text style={styles.bodyText}>
            has successfully demonstrated expert-level knowledge and proficiency in
          </Text>
          <View style={styles.expertBadge}>
            <Text style={styles.expertText}>SLIQUID CERTIFIED EXPERT</Text>
          </View>
          <Text style={styles.supportingText}>
            covering product education, intimate wellness expertise, and Sliquid brand standards.
          </Text>
          <Text style={styles.dateText}>Completed on  {completionDate}</Text>
        </View>

        {/* Bottom Signature Section */}
        <View style={styles.bottomSection}>
          {/* Erik's signature block */}
          <View style={styles.sigBlock}>
            <View style={[styles.sigLine, { marginTop: 36 }]} />
            <Text style={styles.sigName}>Erik</Text>
            <Text style={styles.sigTitle}>Director of Education & Training</Text>
            <Text style={styles.sigTitle}>Sliquid</Text>
          </View>

          {/* Seal */}
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              backgroundColor: SLIQUID_BLUE,
              borderWidth: 3,
              borderColor: GOLD,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: WHITE, fontSize: 20, fontFamily: 'Helvetica-Bold' }}>
              S
            </Text>
            <Text style={{ color: WHITE, fontSize: 6, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginTop: 1 }}>
              CERTIFIED
            </Text>
          </View>

          {/* Certificate number */}
          <View style={[styles.sigBlock, { alignItems: 'center' }]}>
            <Text style={styles.certNumberLabel}>Certificate No.</Text>
            <Text style={styles.certNumber}>{certNumber}</Text>
            <Text style={styles.verifyUrl}>{verifyUrl}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footerBar}>
          <Text style={styles.footerText}>
            Sliquid, LLC  •  Dallas, TX  •  sliquid.com  •  This certificate validates completion of the Sliquid Expert Certification Program
          </Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function CertificateGenerator() {
  const [userData, setUserData] = useState<CertData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUserData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<CertData>('/certificates/mine')
      setUserData(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load certificate')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUserData()
  }, [])

  const verifyUrl = `${window.location.origin}/verify`

  return (
    <div className="p-5">
      {loading && (
        <p className="text-on-canvas-muted text-sm text-center py-4">Fetching your certificate…</p>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {userData && (
        <div className="space-y-4">
          {/* Summary rows */}
          <div className="space-y-0">
            {([
              ['Recipient', `${userData.firstName} ${userData.lastName}`],
              ['Completed', userData.completionDate],
              ['Certificate #', userData.certificateNumber],
              ['Status', '✓ Verified'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between py-2.5 border-b border-portal-border text-sm">
                <span className="text-on-canvas-muted">{label}</span>
                <span className="text-on-canvas font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Download link */}
          <PDFDownloadLink
            document={
              <CertificatePDF
                firstName={userData.firstName}
                lastName={userData.lastName}
                completionDate={userData.completionDate}
                certNumber={userData.certificateNumber}
                verifyUrl={verifyUrl}
              />
            }
            fileName={`Sliquid_Expert_${userData.firstName}_${userData.lastName}.pdf`}
          >
            {({ loading: pdfLoading }) => (
              <button
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
                disabled={pdfLoading}
              >
                {pdfLoading ? 'Building PDF…' : '⬇  Download Certificate PDF'}
              </button>
            )}
          </PDFDownloadLink>
        </div>
      )}
    </div>
  )
}
