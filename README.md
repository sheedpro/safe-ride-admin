# SafeRide Admin Console

React and Fluent UI operations console for SafeRide staff. It is intentionally separate from the passenger WhatsApp bot.

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` to create the production bundle in `dist/`.

## Supabase configuration

Copy `.env.example` to `.env`, then add your Supabase project URL, browser-safe anon key, and deployed SAFERIDE backend URL. Set `ADMIN_ALLOWED_ORIGIN` in the backend to this console's URL.

Run the bot migration `supabase/migrations/005_admin_console.sql`. Create the first user in Supabase Authentication, then insert the matching `admin_users` record with role `super_admin`. This bootstrap remains manual so the first administrator cannot create their own elevated account through the browser.

## Implemented interface

- Command dashboard with report, dispatch, roster and moderation metrics
- Live operations corridor view with reported, checkpoint and interception states
- Checkpoint and roster table with active/inactive state controls
- Privacy-safe report table. No reporter phone data is rendered.
- Role-oriented navigation and responsive layout

The console uses Supabase Auth and the protected `/admin/api/*` routes in the SafeRide backend. It never queries or renders a reporter's raw phone number.
