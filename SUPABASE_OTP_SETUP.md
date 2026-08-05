# Switching signup verification to a 6-digit code

The signup page now shows a 6-digit code entry screen instead of "click the link in your email." The code is already fully wired up on the app side (`supabase.auth.verifyOtp()` in `src/lib/services/auth.js`, the `OtpInput` component, the signup page's flow) — the only thing left is telling Supabase to actually **send a code** instead of a link. That's a dashboard setting, not code, so it has to be done here.

Your project's email templates live at:
`https://supabase.com/dashboard/project/rctkwjzkimwrnhgknoij/auth/templates`

---

## 1. Update the "Confirm signup" template

Go to **Authentication → Email Templates → Confirm signup**.

By default, the template body links to `{{ .ConfirmationURL }}` — a clickable link. Supabase always generates a `{{ .Token }}` value alongside it (a 6-digit numeric code), it's just not shown in the default template. Replace the template body so it displays that code instead of (or alongside) the link, for example:

```html
<h2>Confirm your signup</h2>
<p>Enter this code to finish creating your First Layer account:</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">{{ .Token }}</p>
<p>This code expires in 1 hour.</p>
```

You can drop the `{{ .ConfirmationURL }}` link entirely, or leave it in as a fallback — the app only uses the code now, but the link would still work if someone clicked it (Supabase's own hosted verify endpoint handles it independently of what the app does).

## 2. Confirm OTP expiry (optional)

**Authentication → Providers → Email** has an "OTP expiry" setting (default 3600 seconds / 1 hour). Shorten it if you want codes to expire faster; the app's "Resend code" button works regardless of what you pick here.

## 3. That's it — no other settings change

Everything else (Site URL, Redirect URLs from the password-reset setup) is unrelated to this — OTP codes are entered directly in the app, there's no redirect involved.

---

## Test it

1. Go to `/signup`, create an account with a real email address you can check.
2. You should receive an email with a 6-digit code (not just a link) within a minute or two — same rate-limit caveats as the password-reset email apply (see `SUPABASE_PASSWORD_RESET_SETUP.md` if it doesn't arrive).
3. Enter the code on the signup page. Correct code → redirected straight to `/dashboard`. Wrong code → the boxes flash red and shake, then clear so you can retype.
