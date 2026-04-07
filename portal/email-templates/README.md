# Sliquid B2B — Email Templates

HTML email templates for the portal's EmailJS integration. All templates use the portal's warm cream design system (matching the light-mode UI colors).

## Setup in EmailJS

1. Log in to [emailjs.com](https://www.emailjs.com)
2. Create an **Email Service** (Gmail, SMTP, etc.) and note the **Service ID**
3. For each template below, click **Create New Template**, paste the HTML, and set the **Template ID** exactly as listed
4. Set **To Email** in each template to `{{to_email}}` (or your admin email for admin-only templates)
5. Set the **Subject** as suggested below
6. Add your API keys to Railway env vars: `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `EMAILJS_SERVICE_ID`

---

## Templates

| File | Template ID | Trigger | Variables |
|---|---|---|---|
| `portal_quiz_pass.html` | `portal_quiz_pass` | User passes a quiz module | `user_name`, `quiz_title`, `score`, `portal_url`, `to_email` |
| `portal_cert_issued.html` | `portal_cert_issued` | All modules passed — cert auto-issued | `user_name`, `cert_number`, `completion_date`, `verify_url`, `to_email` |
| `portal_register_confirm.html` | `portal_register_confirm` | New user registers | `user_name`, `user_email`, `to_email` |
| `portal_register_admin.html` | `portal_register_admin` | New user registers (admin copy) | `user_name`, `user_email`, `user_company` |
| `portal_approved.html` | `portal_approved` | Admin approves a user | `user_name`, `role_label`, `portal_url`, `to_email` |
| `portal_declined.html` | `portal_declined` | Admin declines a user | `user_name`, `support_email`, `to_email` |
| `portal_reward_confirm.html` | `portal_reward_confirm` | Certified user claims reward | `user_name`, `product`, `shirt_size`, `address`, `to_email` |
| `portal_marketing_user.html` | `portal_marketing_user` | User submits marketing asset request | `user_name`, `requested_items`, `to_email` |
| `portal_marketing_admin.html` | `portal_marketing_admin` | Marketing request (admin copy) | `user_name`, `user_email`, `company`, `requested_items`, `notes` |
| `portal_asset_broadcast.html` | `portal_asset_broadcast` | Admin adds a new asset | `user_name`, `asset_name`, `brand`, `portal_url`, `to_email` |
| `portal_password_reset.html` | `portal_password_reset` | User requests a password reset | `user_name`, `reset_url`, `to_email` |

---

## Suggested Email Subjects

| Template ID | Subject |
|---|---|
| `portal_quiz_pass` | `You passed {{quiz_title}} — {{score}}%` |
| `portal_cert_issued` | `Your Sliquid Certified Expert Certificate` |
| `portal_register_confirm` | `Your Sliquid B2B Portal registration` |
| `portal_register_admin` | `[Portal] New registration: {{user_name}}` |
| `portal_approved` | `Your Sliquid B2B Portal account is approved` |
| `portal_declined` | `An update on your Sliquid B2B Portal application` |
| `portal_reward_confirm` | `Your Sliquid reward is on its way!` |
| `portal_marketing_user` | `Your marketing asset request was received` |
| `portal_marketing_admin` | `[Portal] Marketing request: {{user_name}}` |
| `portal_asset_broadcast` | `New in the Sliquid Product Library: {{asset_name}}` |
| `portal_password_reset` | `Reset your Sliquid Partner Portal password` |

---

---

## B2B Site Templates (Main sliquid.com)

These templates are used by the main marketing site (`@emailjs/browser`). Set the env vars in Cloudflare Pages for the **sliquid-b2b** project.

| File | Template ID (env var) | Trigger | Variables |
|---|---|---|---|
| `b2b_contact_admin.html` | `VITE_EMAILJS_CONTACT_ADMIN_TID` | Contact form submission (admin copy) | `from_name`, `from_email`, `company`, `phone`, `subject`, `message` |
| `b2b_contact_reply.html` | `VITE_EMAILJS_CONTACT_REPLY_TID` | Contact form submission (auto-reply to sender) | `to_name`, `reply_to` |
| `b2b_newsletter.html` | `VITE_EMAILJS_NEWSLETTER_TID` | Newsletter signup | `subscriber_email` |
| `b2b_hp_application.html` | `VITE_EMAILJS_HP_TID` | Health Practitioners application | `practice_type`, `practice_name`, `practice_address`, `practice_phone`, `practice_website`, `contact_name`, `relationship`, `email`, `contact_phone`, `preferred_contact`, `add_to_directory`, `to_email` |

**B2B site EmailJS env vars** (set in Cloudflare Pages → sliquid-b2b → Settings → Environment Variables):
```
VITE_EMAILJS_PUBLIC_KEY=your_public_key
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_CONTACT_ADMIN_TID=b2b_contact_admin
VITE_EMAILJS_CONTACT_REPLY_TID=b2b_contact_reply
VITE_EMAILJS_NEWSLETTER_TID=b2b_newsletter
VITE_EMAILJS_HP_TID=b2b_hp_application
```

Note: the B2B site uses the same EmailJS account/service as the portal. Only the template IDs differ.

---

## Admin-only Templates

`portal_register_admin` and `portal_marketing_admin` do **not** use `{{to_email}}`.
Set the **To Email** field in EmailJS to your fixed admin address (e.g. `admin@sliquid.com`).

---

## Design Tokens (inline styles)

| Token | Value | Used for |
|---|---|---|
| Page background | `#f7efe3` | Email outer background |
| Card background | `#fefaf4` | Main content card |
| Card surface elevated | `#f0e5d4` | Info boxes, footer strip |
| Border | `#ddc9ae` | Card borders, dividers |
| Accent blue | `#0A84C0` | Header, buttons, links |
| Text primary | `#2c1a0a` | Headlines, strong values |
| Text secondary | `#6b4c30` | Body copy |
| Text muted | `#a08060` | Labels, footer, hints |

See `_base.html` for the reusable header/footer structure.
