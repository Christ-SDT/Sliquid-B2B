import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'

// ─── Font Registration ────────────────────────────────────────────────────────
Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Light.ttf',   fontWeight: 300 },
    { src: '/fonts/Poppins-Regular.ttf', fontWeight: 400 },
  ],
})
Font.register({
  family: 'Dynalight',
  src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/dynalight/Dynalight-Regular.ttf',
})

// ─── Colors ───────────────────────────────────────────────────────────────────
const BLUE        = '#3C9DC5'
const DARK        = '#2C3347'
const WHITE       = '#FFFFFF'
const BLACK       = '#000000'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CertificatePDFV2Props {
  firstName: string
  lastName: string
  completionDate: string
  certNumber: string
  verifyUrl: string
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Landscape LETTER: 792 × 612 pt
const s = StyleSheet.create({
  page: {
    position: 'relative',
  },

  // Full-page background image (already contains decoration + social icons)
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 792,
    height: 612,
  },

  // ── Title block ───────────────────────────────────────────────────────────
  titleBlock: {
    position: 'absolute',
    top: 66,
    left: 296,
    right: 52,
  },
  certTitle: {
    color: BLUE,
    fontSize: 56,
    fontFamily: 'Poppins',
    fontWeight: 300,
    letterSpacing: 3,
    lineHeight: 1.0,
  },
  certSubTitle: {
    color: BLUE,
    fontSize: 20,
    fontFamily: 'Poppins',
    fontWeight: 400,
    letterSpacing: 1,
    marginTop: 3,
  },

  // ── Middle content block ──────────────────────────────────────────────────
  middleBlock: {
    position: 'absolute',
    top: 228,
    left: 296,
    right: 52,
  },
  pill: {
    backgroundColor: BLUE,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 3,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  pillText: {
    color: WHITE,
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: 400,
  },
  recipientName: {
    color: BLACK,
    fontSize: 50,
    fontFamily: 'Poppins',
    fontWeight: 300,
    letterSpacing: 2,
    lineHeight: 1.05,
  },
  completedText: {
    color: BLACK,
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    letterSpacing: 1,
  },
  completedUnderline: {
    height: 1.5,
    backgroundColor: BLUE,
    marginTop: 6,
    alignSelf: 'stretch',
  },
  certNumber: {
    color: BLACK,
    fontSize: 14,
    fontFamily: 'Poppins',
    fontWeight: 300,
    marginTop: 6,
    letterSpacing: 2,
  },

  // ── Bottom footer (3 columns) ─────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 52,
    right: 52,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
  },
  footerCol: {
    width: 180,
    alignItems: 'center',
  },
  footerLine: {
    width: 80,
    height: 1,
    backgroundColor: BLUE,
    marginBottom: 7,
  },
  footerSig: {
    color: BLACK,
    fontSize: 20,
    fontFamily: 'Dynalight',
    marginBottom: 4,
  },
  footerLabel: {
    color: BLUE,
    fontSize: 10,
    fontFamily: 'Poppins',
    fontWeight: 400,
    letterSpacing: 2,
  },
  footerValue: {
    color: BLACK,
    fontSize: 8,
    fontFamily: 'Poppins',
    fontWeight: 300,
    marginTop: 2,
  },
})

// ─── PDF Document ─────────────────────────────────────────────────────────────
export function CertificatePDFV2({
  firstName, lastName, completionDate, certNumber,
}: CertificatePDFV2Props) {
  const fullName = `${firstName} ${lastName}`.toUpperCase()

  return (
    <Document
      title={`Sliquid Certificate — ${firstName} ${lastName}`}
      author="Sliquid"
      subject="Sliquid Certified Expert Certificate"
    >
      <Page size="LETTER" orientation="landscape" style={s.page}>

        {/* Full background image — includes decoration + social icons */}
        <Image src="/downloads/cert-v2-decoration.jpg" style={s.bgImage} />

        {/* CERTIFICATE / OF COMPLETION */}
        <View style={s.titleBlock}>
          <Text style={s.certTitle}>CERTIFICATE</Text>
          <Text style={s.certSubTitle}>OF COMPLETION</Text>
        </View>

        {/* Proudly Presented To + name + cert number */}
        <View style={s.middleBlock}>
          <View style={s.pill}>
            <Text style={s.pillText}>Proudly Presented To</Text>
          </View>
          <Text style={s.recipientName}>{fullName}</Text>
          <Text style={s.completedText}>for completing the Sliquid Certified Expert Training Course</Text>
          <View style={s.completedUnderline} />
          <Text style={s.certNumber}>Certificate No. {certNumber}</Text>
        </View>

        {/* Footer: DATE | Erik Vasquez | Michelle Marcus */}
        <View style={s.footer}>
          <View style={s.footerCol}>
            <Text style={s.footerSig}>{completionDate}</Text>
            <View style={s.footerLine} />
            <Text style={s.footerLabel}>DATE</Text>
            <Text style={s.footerValue}></Text>
            <Text style={s.footerValue}></Text>
            <Text style={[s.footerValue, { marginTop: 10 }]}></Text>
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerSig}>Erik Vasquez</Text>
            <View style={s.footerLine} />
            <Text style={s.footerLabel}>SIGNATURE</Text>
            <Text style={s.footerValue}>Erik Vasquez, VP of Marketing</Text>
          </View>
          <View style={s.footerCol}> 
            <Text style={s.footerSig}>Michelle Marcus</Text>
            <View style={s.footerLine} />
            <Text style={s.footerLabel}>SIGNATURE</Text>
            <Text style={s.footerValue}>Michelle Marcus, VP of Sales</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
