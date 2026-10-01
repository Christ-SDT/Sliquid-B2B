/**
 * English email copy — the source of truth for every other language.
 * Strings are the EmailJS templates' original wording. `{name}` placeholders
 * are filled server-side; EmailJS HTML-escapes the result.
 */
export const en = {
  "templates": {
    "portal_quiz_pass": {
      "t_subject": "You passed {quiz_title} — {score}%",
      "t_tagline": "B2B Partner Portal",
      "t_badge": "Module Complete",
      "t_heading": "Nice work, {user_name}!",
      "t_intro_before": "You passed the",
      "t_intro_middle": "module with a score of",
      "t_intro_after": ". Keep going — you're one step closer to becoming a Sliquid Certified Expert.",
      "t_label_module": "Module",
      "t_label_score": "Score",
      "t_cta": "Continue Training →",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_cert_issued": {
      "t_subject": "Your Sliquid Certified Expert Certificate",
      "t_tagline": "B2B Partner Portal",
      "t_heading": "You're a Sliquid Certified Expert!",
      "t_intro_before": "Congratulations,",
      "t_intro_after": ". You've successfully completed the entire Sliquid Certified Expert Training Course. Your certificate has been issued and is ready to download from your portal.",
      "t_label_issued_to": "Issued To",
      "t_label_completed": "Completed",
      "t_label_cert_number": "Certificate Number",
      "t_cta": "View & Download Certificate",
      "t_verify": "You can also verify this certificate at any time at",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_register_confirm": {
      "t_subject": "Your Sliquid B2B Portal registration",
      "t_tagline": "B2B Partner Portal",
      "t_heading": "Welcome, {user_name}!",
      "t_intro_before": "Thank you for registering with the",
      "t_intro_after": ". Your account has been received and is currently under review by our team.",
      "t_badge": "Pending Review",
      "t_pending": "Our team will review your application and grant portal access shortly. You'll receive a confirmation email once your account is approved.",
      "t_details_heading": "Your Registration Details",
      "t_label_name": "Name",
      "t_label_email": "Email",
      "t_help": "If you have any questions in the meantime, feel free to reach out at",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_approved": {
      "t_subject": "Your Sliquid B2B Portal account is approved",
      "t_tagline": "B2B Partner Portal",
      "t_badge": "Account Approved",
      "t_heading": "You're in, {user_name}!",
      "t_intro": "Your Sliquid B2B Partner Portal account has been approved. You can now log in and access all the resources available to your account type.",
      "t_label_role": "Account Type",
      "t_cta": "Log In to Your Portal →",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_declined": {
      "t_subject": "An update on your Sliquid B2B Portal application",
      "t_tagline": "B2B Partner Portal",
      "t_heading": "An update on your application",
      "t_intro": "Hi {user_name}, thank you for your interest in the Sliquid B2B Partner Portal. After reviewing your application, we're unable to approve portal access at this time.",
      "t_body": "If you believe this is an error or would like to discuss your application, please reach out to our support team — we're happy to help.",
      "t_cta": "Contact Support",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_reward_confirm": {
      "t_subject": "Your Sliquid reward is on its way!",
      "t_tagline": "B2B Partner Portal",
      "t_badge": "Reward Submitted",
      "t_heading": "Your reward is on the way, {user_name}!",
      "t_intro": "We've received your reward claim. Our team will process and ship your items to the address on file. Keep an eye on your inbox for a shipping notification.",
      "t_label_product": "Free Product",
      "t_label_shirt": "T-Shirt Size",
      "t_label_ship_to": "Ship To",
      "t_update_before": "Need to update your shipping address? Contact",
      "t_update_after": "as soon as possible.",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_marketing_user": {
      "t_subject": "Your marketing asset request was received",
      "t_tagline": "B2B Partner Portal",
      "t_badge": "Request Received",
      "t_heading": "We got your request, {user_name}!",
      "t_intro": "Your marketing request has been submitted. Our team will review it and reach out to confirm details.",
      "t_label_items": "Requested Items",
      "t_help": "Questions about your request? Reach out at",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_medical_user": {
      "t_subject": "Your medical marketing request was received",
      "t_tagline": "Health Practitioners Program",
      "t_badge": "Request Received",
      "t_heading": "We got your request, {user_name}!",
      "t_intro": "Your medical marketing materials request has been submitted. Our health practitioners team will review it and reach out to confirm fulfillment and shipping details.",
      "t_label_items": "Requested Items",
      "t_help": "Questions about your request? Reach out at",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "portal_password_reset": {
      "t_subject": "Reset your Sliquid Partner Portal password",
      "t_tagline": "Partner Portal",
      "t_heading": "Reset your password",
      "t_greeting": "Hi {user_name},",
      "t_intro": "We received a request to reset your password for your Sliquid Partner Portal account. Click the button below to choose a new password.",
      "t_cta": "Reset Password",
      "t_expiry_before": "This link expires in",
      "t_expiry_duration": "1 hour",
      "t_expiry_after": ". If you don't use it in time, you'll need to request a new one.",
      "t_fallback": "If the button above doesn't work, copy and paste this URL into your browser:",
      "t_ignore": "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
      "t_confidential": "Sliquid Partner Portal — Confidential",
      "t_rights": "All rights reserved."
    },
    "portal_asset_broadcast": {
      "t_subject": "New in the Sliquid Product Library: {asset_name}",
      "t_tagline": "B2B Partner Portal",
      "t_badge": "New in Product Library",
      "t_heading": "New assets just dropped, {user_name}!",
      "t_intro": "Fresh content is now available in your Product Library. Head to the portal to preview and download it for your store.",
      "t_label_asset": "Asset",
      "t_label_brand": "Brand",
      "t_cta": "View Product Library →",
      "t_footer_sent": "This email was sent by the Sliquid B2B Partner Portal.",
      "t_footer_questions": "Questions? Contact"
    },
    "b2b_contact_reply": {
      "t_subject": "We received your message — Sliquid",
      "t_tagline": "B2B Partnerships",
      "t_heading": "Thanks for reaching out, {to_name}!",
      "t_intro_before": "We've received your message and a member of our B2B team will review it shortly. We typically respond within",
      "t_intro_duration": "2 business days",
      "t_portal": "In the meantime, you're welcome to explore our partner portal where you can access product information, marketing assets, and training resources.",
      "t_cta": "Visit Partner Portal",
      "t_next_heading": "What happens next",
      "t_step1": "Our team reviews your inquiry and matches it to the right contact.",
      "t_step2": "We'll reach out by email (or phone if you provided a number).",
      "t_step3": "You'll receive a tailored proposal or follow-up based on your inquiry type.",
      "t_footer_reply": "Questions? Reply to this email or contact",
      "t_rights": "All rights reserved."
    },
    "b2b_retailer_confirm": {
      "t_subject": "Your Sliquid Retailer / Distributor Application",
      "t_tagline": "Retailer & Distributor Program",
      "t_badge": "Application Received",
      "t_heading": "Thanks for applying, {contact_name}!",
      "t_intro_before": "We've received your application for",
      "t_intro_after": "to become a Sliquid retailer or distributor. A member of our sales team will review your submission and reach out to you shortly.",
      "t_label_brands": "Brands You Selected",
      "t_next_heading": "What happens next",
      "t_step1_before": "Our sales team reviews your application — typically within",
      "t_step1_duration": "2–3 business days",
      "t_step2": "We'll reach out via email or phone to discuss next steps and answer any questions.",
      "t_step3": "Once approved, you'll receive access to the Sliquid B2B Partner Portal with ordering, training, and marketing resources.",
      "t_cta": "Learn More About Sliquid B2B",
      "t_help": "Have questions in the meantime? Contact our sales team at",
      "t_submitted": "Submitted via",
      "t_rights": "All rights reserved."
    },
    "b2b_retailer_checkin_confirm": {
      "t_subject": "Thanks for checking in, {contact_name} — {reference_number}",
      "t_tagline": "Partner Check-In",
      "t_reference": "Reference",
      "t_heading": "Thank you, {contact_name}.",
      "t_intro_before": "We got your check-in for",
      "t_intro_after": "— and more than that, thank you for the shelf space. Partners like you are the reason a small, ingredient-obsessed brand got to have a twenty-year run.",
      "t_followup": "will follow up with you shortly.",
      "t_asked_heading": "What you asked us for",
      "t_next_heading": "What happens next",
      "t_step1_before": "Your contact reviews the check-in — usually within",
      "t_step1_duration": "1–2 business days",
      "t_step2": "Anything you asked for — marketing materials, product images, training — gets sent your way.",
      "t_step3_before": "Quote",
      "t_step3_after": "in any reply and we'll pull your check-in straight up.",
      "t_cta": "Open the Partner Portal",
      "t_help": "Need something sooner? Email",
      "t_submitted": "Submitted via",
      "t_rights": "All rights reserved."
    }
  },
  "roleLabels": {
    "tier1": "Retail Store Employee",
    "tier2": "Retail Management",
    "tier3": "Distributor",
    "tier4": "Prospect",
    "tier5": "Admin",
    "tier6": "Medical Partner",
    "tier7": "Media",
    "tier8": "Legal (Read-Only)"
  },
  "defaults": {
    "pointOfContact": "a member of our sales team",
    "interests": "None selected"
  }
} as const
