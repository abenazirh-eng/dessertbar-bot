// The Dessert Bar — Telegram Bot
// Run with: node telegram_bot.js
// Requires: npm install node-fetch

const BOT_TOKEN = '8787023077:AAFTmxyyOIBv3DK8V3Pes7FdTQx8cU_5oJY';
const OWNER_CHAT_ID = '986676229';
const SB_URL = 'https://ivhcimcudidwpnwmfvbd.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2aGNpbWN1ZGlkd3Bud21mdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTI0NTYsImV4cCI6MjA5NTg4ODQ1Nn0.0_rcL5LT0tpei47cIKgqPFfDivylvvP6jbUEgbzXFLE';

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;
const HEADERS = { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` };

// ── Supabase helpers ──────────────────────────────────────────────
async function db(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: HEADERS });
  return r.json();
}

// ── Telegram helpers ──────────────────────────────────────────────
async function send(chatId, text, extra = {}) {
  await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
  });
}

// ── Data builders ─────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

async function getSalesSummary(date) {
  const sales = await db(`sales?sale_date=eq.${date}&select=qty,revenue,item_name`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top, date };
}

async function getStockAlerts() {
  const ings = await db('ingredients?order=name');
  if (!Array.isArray(ings)) return { low: [], out: [] };
  const out = ings.filter(i => parseFloat(i.qty) <= 0 && parseFloat(i.min_qty) > 0);
  const low = ings.filter(i => parseFloat(i.qty) > 0 && parseFloat(i.qty) <= parseFloat(i.min_qty) && parseFloat(i.min_qty) > 0);
  return { low, out };
}

async function getWeeklySummary() {
  const sales = await db(`sales?sale_date=gte.${weekAgo()}&select=qty,revenue,item_name,sale_date`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top };
}

// ── Message formatters ────────────────────────────────────────────
function fmtSales(data, label) {
  if (!data) return `📊 No sales recorded for ${label}.`;
  const topLines = data.top.map(([ name, qty], i) =>
    `  ${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${name} — ${qty} sold`
  ).join('\n');
  return `☕ <b>The Dessert Bar</b>
📅 <b>${label}</b>

💰 Revenue: <b>${data.totalRev.toLocaleString('en', {maximumFractionDigits:0})} ETB</b>
🛒 Items sold: <b>${data.totalQty}</b>

🏆 <b>Top sellers:</b>
${topLines}`;
}

function fmtStock({ low, out }) {
  if (!low.length && !out.length) return '✅ <b>All stock levels are OK!</b>';
  let msg = '📦 <b>Stock Status</b>\n\n';
  if (out.length) {
    msg += '🔴 <b>OUT OF STOCK:</b>\n';
    out.forEach(i => { msg += `  • ${i.name}\n`; });
    msg += '\n';
  }
  if (low.length) {
    msg += '🟡 <b>RUNNING LOW:</b>\n';
    low.forEach(i => { msg += `  • ${i.name} — ${parseFloat(i.qty).toFixed(2)} ${i.unit} left\n`; });
  }
  return msg;
}

function fmtFullStock(ings) {
  if (!ings.length) return '📦 No ingredients in stock yet.';
  let msg = '📦 <b>Full Stock List</b>\n\n';
  ings.forEach(i => {
    const qty = parseFloat(i.qty);
    const min = parseFloat(i.min_qty);
    const icon = qty <= 0 ? '🔴' : qty <= min && min > 0 ? '🟡' : '🟢';
    msg += `${icon} ${i.name}: <b>${qty.toFixed(2)} ${i.unit}</b>\n`;
  });
  return msg;
}

// ── Command handler ───────────────────────────────────────────────
async function handleCommand(chatId, text) {
  const cmd = text.trim().toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    await send(chatId, `☕ <b>Welcome to The Dessert Bar Bot!</b>

Here are the available commands:

📊 <b>Sales</b>
/today — Today's sales summary
/yesterday — Yesterday's summary
/weekly — This week's summary

📦 <b>Stock</b>
/stock — Stock alerts (low &amp; out)
/fullstock — Complete stock list
/low — Only low/out items

ℹ️ Reports are also sent automatically every morning at 8am.`);

  } else if (cmd === '/today') {
    const data = await getSalesSummary(today());
    await send(chatId, fmtSales(data, 'Today'));

  } else if (cmd === '/yesterday') {
    const data = await getSalesSummary(yesterday());
    await send(chatId, fmtSales(data, 'Yesterday'));

  } else if (cmd === '/weekly') {
    const data = await getWeeklySummary();
    if (!data) { await send(chatId, '📊 No sales data for this week yet.'); return; }
    const topLines = data.top.map(([name, qty], i) =>
      `  ${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${name} — ${qty} sold`
    ).join('\n');
    await send(chatId, `☕ <b>The Dessert Bar — Weekly Summary</b>

💰 Revenue: <b>${data.totalRev.toLocaleString('en', {maximumFractionDigits:0})} ETB</b>
🛒 Items sold: <b>${data.totalQty}</b>

🏆 <b>Top sellers this week:</b>
${topLines}`);

  } else if (cmd === '/stock' || cmd === '/low') {
    const alerts = await getStockAlerts();
    await send(chatId, fmtStock(alerts));

  } else if (cmd === '/fullstock') {
    const ings = await db('ingredients?order=name');
    await send(chatId, fmtFullStock(Array.isArray(ings) ? ings : []));

  } else {
    await send(chatId, `❓ Unknown command. Type /help to see available commands.`);
  }
}

// ── Scheduled reports ─────────────────────────────────────────────
async function sendMorningReport() {
  const data = await getSalesSummary(yesterday());
  const alerts = await getStockAlerts();
  let msg = fmtSales(data, `Yesterday (${yesterday()})`);
  if (alerts.out.length || alerts.low.length) {
    msg += '\n\n' + fmtStock(alerts);
  }
  await send(OWNER_CHAT_ID, msg);
}

async function sendEveningReport() {
  const data = await getSalesSummary(today());
  await send(OWNER_CHAT_ID, fmtSales(data, `Today (${today()})`));
}

// ── Polling loop ──────────────────────────────────────────────────
let offset = 0;
async function poll() {
  try {
    const r = await fetch(`${TG}/getUpdates?offset=${offset}&timeout=30`);
    const data = await r.json();
    if (data.ok && data.result.length) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (msg && msg.text) {
          console.log(`[${new Date().toISOString()}] Message from ${msg.chat.id}: ${msg.text}`);
          await handleCommand(String(msg.chat.id), msg.text);
        }
      }
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 1000);
}

// ── Scheduler (checks every minute) ──────────────────────────────
function startScheduler() {
  setInterval(async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    if (hhmm === '08:00') await sendMorningReport();
    if (hhmm === '22:00') await sendEveningReport();
  }, 60000);
}

// ── Start ─────────────────────────────────────────────────────────
async function main() {
  // Check node version supports fetch (Node 18+), otherwise load node-fetch
  if (typeof fetch === 'undefined') {
    const { default: f } = await import('node-fetch');
    global.fetch = f;
  }

  console.log('🚀 The Dessert Bar Telegram Bot started!');
  console.log(`📱 Sending startup message to Ab...`);

  await send(OWNER_CHAT_ID, `🚀 <b>The Dessert Bar Bot is now online!</b>

Type /help to see all available commands.`);

  startScheduler();
  poll();
}

main().catch(console.error);
