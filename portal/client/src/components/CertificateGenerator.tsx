import { useState, useEffect } from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  PDFDownloadLink,
  Font,
} from '@react-pdf/renderer'
import { api } from '@/api/client'
import { CertificatePDFV2 } from './CertificateGeneratorV2'

// ─── Active design — change 'classic' to 'modern' to switch the default ───────
// This can also be toggled via the UI button below.
const DEFAULT_VARIANT: 'classic' | 'modern' = 'modern'

// ─── Font Registration ────────────────────────────────────────────────────────
Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Light.ttf',   fontWeight: 300 },
    { src: '/fonts/Poppins-Regular.ttf', fontWeight: 400 },
  ],
})

Font.register({
  family: 'MonsieurLaDoulaise',
  src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/monsieurladoulaise/MonsieurLaDoulaise-Regular.ttf',
})

// ─── Colors ──────────────────────────────────────────────────────────────────
const SLIQUID_BLUE = '#0A84C0'
const SLIQUID_LIGHT_BLUE = '#E8F4FB'
const GOLD = '#C9A84C'
const NEAR_WHITE = '#FAFCFE'
const DARK_TEXT = '#1A1A2E'
const MID_GRAY = '#6B7280'
const WHITE = '#FFFFFF'

// Badge served from public/downloads/badge.png (place file there before generating PDFs)
const BADGE_URL = '/downloads/badge.png'

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
    fontFamily: 'Poppins',
    fontWeight: 300,
    letterSpacing: 1,
  },
  tagline: {
    color: WHITE,
    fontSize: 9,
    fontFamily: 'Poppins',
    fontWeight: 400,
    marginTop: 3,
    opacity: 0.9,
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
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 4,
    marginTop: 18,
  },
  certHeaderLine2: {
    color: SLIQUID_BLUE,
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 4,
    marginTop: 4,
  },
  thisText: {
    color: MID_GRAY,
    fontSize: 11,
    fontFamily: 'Helvetica-Oblique',
    marginTop: 14,
  },
  recipientName: {
    color: DARK_TEXT,
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
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
    marginTop: 12,
    textAlign: 'center',
  },
  expertBadge: {
    backgroundColor: SLIQUID_LIGHT_BLUE,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 8,
    marginTop: 10,
  },
  expertText: {
    color: SLIQUID_BLUE,
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  dateText: {
    color: DARK_TEXT,
    fontSize: 9,
    fontFamily: 'Helvetica',
    marginTop: 8,
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
  sigCursive: {
    color: DARK_TEXT,
    fontSize: 26,
    fontFamily: 'MonsieurLaDoulaise',
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
          <Text style={styles.brandName}>sliquid</Text>
          <Text style={styles.tagline}>an intimate wellness company</Text>
        </View>

        <View style={styles.goldLine} />

        {/* Body Content */}
        <View style={styles.body}>
          {/* Two-line certificate header */}
          <Text style={styles.certHeader}>C E R T I F I C A T E</Text>
          <Text style={styles.certHeaderLine2}>O F   C O M P L E T I O N</Text>

          <Text style={styles.thisText}>This certifies that</Text>
          <Text style={styles.recipientName}>
            {firstName} {lastName}
          </Text>
          <View style={styles.nameUnderline} />
          <Text style={styles.bodyText}>
            has successfully completed the
          </Text>

          {/* Course name pill */}
          <View style={styles.expertBadge}>
            <Text style={styles.expertText}>SLIQUID CERTIFIED EXPERT TRAINING COURSE</Text>
          </View>

          <Text style={styles.dateText}>Completed on  {completionDate}</Text>

          {/* Gold badge — place badge.png at public/downloads/badge.png */}
          <Image
            src={BADGE_URL}
            style={{
              width: 88,
              height: 110,
              alignSelf: 'center',
              marginTop: 10,
            }}
          />
        </View>

        {/* Bottom Signature Section */}
        <View style={styles.bottomSection}>
          {/* Erik's signature block */}
          <View style={styles.sigBlock}>
            <Text style={styles.sigCursive}>Erik Vasquez</Text>
            <View style={styles.sigLine} />
            <Text style={styles.sigName}>Erik Vasquez</Text>
            <Text style={styles.sigTitle}>VP of Marketing</Text>
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
  const variant = 'modern'

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
            key={variant}
            document={
              variant === 'modern'
                ? <CertificatePDFV2
                    firstName={userData.firstName}
                    lastName={userData.lastName}
                    completionDate={userData.completionDate}
                    certNumber={userData.certificateNumber}
                    verifyUrl={verifyUrl}
                  />
                : <CertificatePDF
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
