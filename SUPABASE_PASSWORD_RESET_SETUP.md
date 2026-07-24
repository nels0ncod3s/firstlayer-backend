# Fixing password reset — Supabase dashboard setup

The reset-password flow is already fully implemented in code:

```
forgot-password page → supabase.auth.resetPasswordForEmail()
  → Supabase sends an email
  → user clicks the link → /auth/confirm (verifies the token, sets a session)
  → redirected to /reset-password → supabase.auth.updateUser({ password })
```

It doesn't work end-to-end because of **Supabase project configuration**, not code — specifically the email template and the URL allow-list. None of this can be done from the codebase; it has to be set in the Supabase dashboard for project `rctkwjzkimwrnhgknoij`.

Your project's auth settings live here:
`https://supabase.com/dashboard/project/rctkwjzkimwrnhgknoij/auth/templates`

---

## 1. Fix the "Reset Password" email template (the actual bug)

By default, Supabase's email templates link to `{{ .ConfirmationURL }}`, which points at **Supabase's own hosted verify endpoint**, not your app. That endpoint verifies the token itself and redirects back to you with different parameters than your `/auth/confirm` route expects (`token_hash` + `type`) — so the link either silently fails or lands on `/reset-password` without a valid session.

**Steps:**

1. Go to **Authentication → Email Templates → Reset Password**.
2. Replace the body's link/button `href` so it points at your own `/auth/confirm` route, passing the raw token hash directly:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
     Reset your password
   </a>
   ```

3. Save the template.

This is exactly what `src/routes/auth/confirm/+server.js` in the Svelte app is built to receive (`token_hash` + `type` query params), so no code changes are needed once the template is updated.

---

## 2. Set the URL allow-list

Go to **Authentication → URL Configuration**.

- **Site URL**: set to your app's canonical URL (e.g. `http://localhost:5173` for local dev, or your production domain).
- **Redirect URLs**: add every origin you test from, e.g.:
  - `http://localhost:5173/**`
  - `https://your-production-domain.com/**`

If the origin that generated the reset link isn't in this list, Supabase rejects the redirect outright — this is a common cause of links that "just don't work."

---

## 3. Check email rate limits (likely the actual reason it "seemed broken")

Supabase's built-in email sending (the shared/default SMTP) is capped at a **small number of auth emails per hour** on free/low tiers. Repeated testing during development can easily exhaust this — new reset requests silently stop sending, which looks identical to "it's broken."

**Recommended fix — connect your own SMTP:**

1. Go to **Project Settings → Authentication → SMTP Settings**.
2. Enable **Custom SMTP** and connect a provider (Resend, Postmark, SES, your own domain's mail server, etc.).
3. This also resolves the earlier ask about auth emails coming from your own domain/address instead of Supabase's shared sender — once custom SMTP is on, the "From" address and domain are entirely yours.
4. This same SMTP config also applies to the signup-confirmation email, magic links, and any other auth email — one setup covers all of them.

---

## Quick verification checklist

- [ ] Reset Password email template updated to use `{{ .TokenHash }}` (step 1)
- [ ] Site URL set correctly (step 2)
- [ ] Your dev/prod origin(s) added to Redirect URLs (step 2)
- [ ] Custom SMTP connected, or you've confirmed you're within the default rate limit (step 3)
- [ ] Test: request a reset from `/forgot-password`, click the emailed link, confirm it lands on `/reset-password` already signed in, and that setting a new password redirects to `/dashboard`
