These files are generated for Meta App Review pages (Privacy, Terms, Data Deletion) and a small global CSS/JS helper.

Instructions:
1. Copy the contents of the `public/` folder into your frontend project's `public/` directory so the files are served at the root domain.
   - privacy-policy -> /privacy-policy
   - terms -> /terms
   - data-deletion -> /data-deletion
2. Ensure your hosting rewrites `/privacy-policy` to `/privacy-policy/index.html` (many static hosts do this automatically).
3. Optional: move CSS to your main stylesheet and import `scripts/vw.js` early in your app.

Backend notes (Parent Dashboard bug):
- The backend parent endpoints are under `backend/src/controllers/parents.controller.ts`.
- If you still see "Failed to load children's results" in the Parent Portal, check frontend network request (URL, Authorization header) and server logs. If you want, I can add additional server logging to help debug.

Files included:
- public/privacy-policy/index.html
- public/terms/index.html
- public/data-deletion/index.html
- public/styles/global.css
- public/scripts/vw.js

Deploy these to https://kautix.in/privacy-policy etc.
