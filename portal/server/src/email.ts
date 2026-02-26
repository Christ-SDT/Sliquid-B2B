import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Sliquid Partner Portal <noreply@sliquid.com>'

const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS)

const transporter = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null

export async function sendQuizPassEmail(opts: {
  toName: string
  toEmail: string
  quizTitle: string
  score: number
}): Promise<void> {
  const { toName, toEmail, quizTitle, score } = opts

  if (!transporter) {
    console.log(`[email] SMTP not configured — skipping pass email to ${toEmail} (${quizTitle}, ${score}%)`)
    return
  }

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: toEmail,
    subject: `Congratulations — You passed "${quizTitle}"!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
        <div style="background:#0f172a;padding:28px 32px;border-radius:8px 8px 0 0">
          <p style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:2px;margin:0 0 6px">SLIQUID PARTNER PORTAL</p>
          <h1 style="color:#fff;font-size:22px;margin:0">Training Completed</h1>
        </div>
        <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <p style="font-size:15px;margin:0 0 16px">Hi ${toName},</p>
          <p style="font-size:15px;margin:0 0 16px">
            Great work! You've successfully completed <strong>${quizTitle}</strong> with a score of
            <strong style="color:#2563eb">${score}%</strong>.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px 18px;margin:0 0 20px">
            <p style="color:#15803d;font-weight:700;margin:0;font-size:14px">✓ Passed — Score: ${score}%</p>
          </div>
          <p style="font-size:13px;color:#64748b;margin:0">
            Continue building your expertise in the Sliquid Partner Portal under the <strong>Trainings</strong> tab.
          </p>
        </div>
      </div>
    `,
  })

  console.log(`[email] Pass email sent to ${toEmail} (${quizTitle}, ${score}%)`)
}
