/**
 * Standalone script — renders both certificate designs to PDF files.
 * Run: npx tsx portal/client/scripts/render-test-certs.tsx
 */
import React from 'react'
import {
  Document, Page, Text, View, Image, StyleSheet, Font, renderToFile,
} from '@react-pdf/renderer'

// ─── Absolute paths (no web server needed) ────────────────────────────────────
const FONTS_DIR   = '/Users/dropingtons/Desktop/Sliquid-B2B/portal/client/public/fonts'
const ASSETS_DIR  = '/Users/dropingtons/Desktop/Sliquid-B2B/portal/client/public/downloads'
const OUTPUT_DIR  = '/Users/dropingtons/Desktop/Sliquid/test_certificates'

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK = {
  firstName:      'Jane',
  lastName:       'Smith',
  completionDate: 'April 21, 2026',
  certNumber:     'SLQ-2026-A1B2C3',
  verifyUrl:      'https://sliquid-portal.pages.dev/verify',
}

// ─── Font registration ────────────────────────────────────────────────────────
Font.register({
  family: 'Poppins',
  fonts: [
    { src: `${FONTS_DIR}/Poppins-Light.ttf`,   fontWeight: 300 },
    { src: `${FONTS_DIR}/Poppins-Regular.ttf`, fontWeight: 400 },
  ],
})
Font.register({
  family: 'MonsieurLaDoulaise',
  src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/monsieurladoulaise/MonsieurLaDoulaise-Regular.ttf',
})
Font.register({
  family: 'Dynalight',
  src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/dynalight/Dynalight-Regular.ttf',
})

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIC CERTIFICATE (v1)
// ═══════════════════════════════════════════════════════════════════════════════
const SLIQUID_BLUE     = '#0A84C0'
const SLIQUID_LIGHT_BLUE = '#E8F4FB'
const GOLD             = '#C9A84C'
const NEAR_WHITE       = '#FAFCFE'
const DARK_TEXT        = '#1A1A2E'
const MID_GRAY         = '#6B7280'
const WHITE            = '#FFFFFF'

const c = StyleSheet.create({
  page:            { backgroundColor: NEAR_WHITE, padding: 0, position: 'relative' },
  outerBorder:     { position: 'absolute', top: 25, left: 25, right: 25, bottom: 25, borderWidth: 3, borderColor: SLIQUID_BLUE, borderStyle: 'solid' },
  innerBorder:     { position: 'absolute', top: 36, left: 36, right: 36, bottom: 36, borderWidth: 1, borderColor: GOLD, borderStyle: 'solid' },
  topBar:          { position: 'absolute', top: 36, left: 36, right: 36, height: 72, backgroundColor: SLIQUID_BLUE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  brandName:       { color: WHITE, fontSize: 28, fontFamily: 'Poppins', fontWeight: 300, letterSpacing: 1 },
  tagline:         { color: WHITE, fontSize: 9, fontFamily: 'Poppins', fontWeight: 400, marginTop: 3, opacity: 0.9 },
  goldLine:        { position: 'absolute', top: 108, left: 36, right: 36, height: 2, backgroundColor: GOLD },
  body:            { position: 'absolute', top: 118, left: 36, right: 36, bottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  certHeader:      { color: SLIQUID_BLUE, fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 4, marginTop: 18 },
  certHeaderLine2: { color: SLIQUID_BLUE, fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 4, marginTop: 4 },
  thisText:        { color: MID_GRAY, fontSize: 11, fontFamily: 'Helvetica-Oblique', marginTop: 14 },
  recipientName:   { color: DARK_TEXT, fontSize: 32, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  nameUnderline:   { height: 1.5, backgroundColor: SLIQUID_BLUE, marginTop: 4, width: '60%' },
  bodyText:        { color: MID_GRAY, fontSize: 10, fontFamily: 'Helvetica', marginTop: 12, textAlign: 'center' },
  expertBadge:     { backgroundColor: SLIQUID_LIGHT_BLUE, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 8, marginTop: 10 },
  expertText:      { color: SLIQUID_BLUE, fontSize: 18, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  dateText:        { color: DARK_TEXT, fontSize: 9, fontFamily: 'Helvetica', marginTop: 8 },
  bottomSection:   { position: 'absolute', bottom: 50, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sigBlock:        { width: 180, alignItems: 'center' },
  sigLine:         { width: 160, height: 1, backgroundColor: DARK_TEXT, marginBottom: 4 },
  sigCursive:      { color: DARK_TEXT, fontSize: 26, fontFamily: 'MonsieurLaDoulaise', marginBottom: 4 },
  sigName:         { color: DARK_TEXT, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  sigTitle:        { color: MID_GRAY, fontSize: 8, fontFamily: 'Helvetica', marginTop: 1, textAlign: 'center' },
  certNumberLabel: { color: MID_GRAY, fontSize: 8, fontFamily: 'Helvetica' },
  certNumber:      { color: DARK_TEXT, fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  verifyUrl:       { color: MID_GRAY, fontSize: 7, fontFamily: 'Helvetica', marginTop: 1 },
  footerBar:       { position: 'absolute', bottom: 36, left: 36, right: 36, height: 14, backgroundColor: SLIQUID_BLUE, alignItems: 'center', justifyContent: 'center' },
  footerText:      { color: WHITE, fontSize: 6, fontFamily: 'Helvetica', letterSpacing: 0.5 },
})

function ClassicCertPDF() {
  const { firstName, lastName, completionDate, certNumber, verifyUrl } = MOCK
  return (
    <Document title="Classic Certificate — Jane Smith" author="Sliquid">
      <Page size="LETTER" orientation="landscape" style={c.page}>
        <View style={c.outerBorder} />
        <View style={c.innerBorder} />
        {/* Corner accents */}
        {([{ top: 0, left: 0 }, { top: 0, right: 0 }, { bottom: 0, left: 0 }, { bottom: 0, right: 0 }] as const).map((pos, i) => (
          <View key={i} style={{ position: 'absolute', width: 43, height: 43, backgroundColor: SLIQUID_BLUE, ...pos }} />
        ))}
        <View style={c.topBar}>
          <Text style={c.brandName}>sliquid</Text>
          <Text style={c.tagline}>an intimate wellness company</Text>
        </View>
        <View style={c.goldLine} />
        <View style={c.body}>
          <Text style={c.certHeader}>C E R T I F I C A T E</Text>
          <Text style={c.certHeaderLine2}>O F   C O M P L E T I O N</Text>
          <Text style={c.thisText}>This certifies that</Text>
          <Text style={c.recipientName}>{firstName} {lastName}</Text>
          <View style={c.nameUnderline} />
          <Text style={c.bodyText}>has successfully completed the</Text>
          <View style={c.expertBadge}>
            <Text style={c.expertText}>SLIQUID CERTIFIED EXPERT TRAINING COURSE</Text>
          </View>
          <Text style={c.dateText}>Completed on  {completionDate}</Text>
          <Image src={`${ASSETS_DIR}/badge.png`} style={{ width: 88, height: 110, alignSelf: 'center', marginTop: 10 }} />
        </View>
        <View style={c.bottomSection}>
          <View style={c.sigBlock}>
            <Text style={c.sigCursive}>Erik Vasquez</Text>
            <View style={[c.sigLine, { marginTop: 0 }]} />
            <Text style={c.sigName}>Erik Vasquez</Text>
            <Text style={c.sigTitle}>VP of Marketing</Text>
          </View>
          <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: SLIQUID_BLUE, borderWidth: 3, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: WHITE, fontSize: 20, fontFamily: 'Helvetica-Bold' }}>S</Text>
            <Text style={{ color: WHITE, fontSize: 6, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginTop: 1 }}>CERTIFIED</Text>
          </View>
          <View style={[c.sigBlock, { alignItems: 'center' }]}>
            <Text style={c.certNumberLabel}>Certificate No.</Text>
            <Text style={c.certNumber}>{certNumber}</Text>
            <Text style={c.verifyUrl}>{verifyUrl}</Text>
          </View>
        </View>
        <View style={c.footerBar}>
          <Text style={c.footerText}>Sliquid, LLC  •  Dallas, TX  •  sliquid.com  •  This certificate validates completion of the Sliquid Expert Certification Program</Text>
        </View>
      </Page>
    </Document>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODERN CERTIFICATE (v2)
// ═══════════════════════════════════════════════════════════════════════════════
const BLUE       = '#3C9DC5'
const BLACK      = '#000000'
const LIGHT      = 'rgba(255,255,255,0.60)'

const m = StyleSheet.create({
  page:               { position: 'relative' },
  bgImage:            { position: 'absolute', top: 0, left: 0, width: 792, height: 612 },
  titleBlock:         { position: 'absolute', top: 66, left: 296, right: 52 },
  certTitle:          { color: BLUE, fontSize: 56, fontFamily: 'Poppins', fontWeight: 300, letterSpacing: 3, lineHeight: 1.0 },
  certSubTitle:       { color: BLUE, fontSize: 20, fontFamily: 'Poppins', fontWeight: 400, letterSpacing: 1, marginTop: 3 },
  middleBlock:        { position: 'absolute', top: 228, left: 296, right: 52 },
  pill:               { backgroundColor: BLUE, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3, alignSelf: 'flex-start', marginBottom: 10 },
  pillText:           { color: WHITE, fontSize: 11, fontFamily: 'Poppins', fontWeight: 400 },
  recipientName:      { color: BLACK, fontSize: 50, fontFamily: 'Poppins', fontWeight: 300, letterSpacing: 2, lineHeight: 1.05 },
  completedText:      { color: BLACK, fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 10, letterSpacing: 1 },
  completedUnderline: { height: 1.5, backgroundColor: BLUE, marginTop: 6, alignSelf: 'stretch' },
  certNumber:         { color: BLACK, fontSize: 14, fontFamily: 'Poppins', fontWeight: 300, marginTop: 6, letterSpacing: 2 },
  footer:             { position: 'absolute', bottom: 28, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end' },
  footerCol:          { width: 180, alignItems: 'center' },
  footerSig:          { color: BLACK, fontSize: 20, fontFamily: 'Dynalight', marginBottom: 4 },
  footerLine:         { width: 80, height: 1, backgroundColor: BLUE, marginBottom: 7 },
  footerLabel:        { color: BLUE, fontSize: 10, fontFamily: 'Poppins', fontWeight: 400, letterSpacing: 2 },
  footerValue:        { color: BLACK, fontSize: 8, fontFamily: 'Poppins', fontWeight: 300, marginTop: 2 },
})

function ModernCertPDF() {
  const { firstName, lastName, completionDate, certNumber } = MOCK
  const fullName = `${firstName} ${lastName}`.toUpperCase()
  return (
    <Document title="Modern Certificate — Jane Smith" author="Sliquid">
      <Page size="LETTER" orientation="landscape" style={m.page}>
        <Image src={`${ASSETS_DIR}/cert-v2-decoration.jpg`} style={m.bgImage} />
        <View style={m.titleBlock}>
          <Text style={m.certTitle}>CERTIFICATE</Text>
          <Text style={m.certSubTitle}>OF COMPLETION</Text>
        </View>
        <View style={m.middleBlock}>
          <View style={m.pill}><Text style={m.pillText}>Proudly Presented To</Text></View>
          <Text style={m.recipientName}>{fullName}</Text>
          <Text style={m.completedText}>for completing the Sliquid Certified Expert Training Course</Text>
          <View style={m.completedUnderline} />
          <Text style={m.certNumber}>Certificate No.  {certNumber}</Text>
        </View>
        <View style={m.footer}>
          <View style={m.footerCol}>
            <Text style={m.footerSig}>{completionDate}</Text>
            <View style={m.footerLine} />
            <Text style={m.footerLabel}>DATE</Text>
            <Text style={m.footerValue}></Text>
            <Text style={m.footerValue}></Text>
            <Text style={[m.footerValue, { marginTop: 10 }]}></Text>
          </View>
          <View style={m.footerCol}>
            <Text style={m.footerSig}>Erik Vasquez</Text>
            <View style={m.footerLine} />
            <Text style={m.footerLabel}>SIGNATURE</Text>
            <Text style={m.footerValue}>Erik Vasquez, VP of Marketing</Text>
          </View>
          <View style={m.footerCol}>
            <Text style={m.footerSig}>Michelle Marcus</Text>
            <View style={m.footerLine} />
            <Text style={m.footerLabel}>SIGNATURE</Text>
            <Text style={m.footerValue}>Michelle Marcus, VP of Sales</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ─── Render both to file ──────────────────────────────────────────────────────
async function main() {
  console.log('Rendering Classic certificate…')
  await renderToFile(
    <ClassicCertPDF />,
    `${OUTPUT_DIR}/certificate_classic_jane_smith.pdf`,
  )
  console.log('✓ Classic saved')

  console.log('Rendering Modern certificate…')
  await renderToFile(
    <ModernCertPDF />,
    `${OUTPUT_DIR}/certificate_modern_jane_smith.pdf`,
  )
  console.log('✓ Modern saved')

  console.log(`\nBoth PDFs saved to: ${OUTPUT_DIR}`)
}

main().catch(err => { console.error(err); process.exit(1) })
