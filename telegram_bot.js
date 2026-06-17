const https = require('https');

const BOT_TOKEN = '8787023077:AAFTmxyyOIBv3DK8V3Pes7FdTQx8cU_5oJY';
const OWNER_CHAT_ID = '986676229';
const GROUP_CHAT_ID = '-1004290700890';
const SB_URL = 'ivhcimcudidwpnwmfvbd.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2aGNpbWN1ZGlkd3Bud21mdmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTI0NTYsImV4cCI6MjA5NTg4ODQ1Nn0.0_rcL5LT0tpei47cIKgqPFfDivylvvP6jbUEgbzXFLE';

// Weekly purchase schedule
const WEEKLY_SCHEDULE = {
  0: { day: 'Sunday',    items: ['Eggs', 'Chicken', 'Mozzarella Cheese'] },
  1: { day: 'Monday',    items: ['Chocolate', 'Tea Bags', 'Yo Creme'] },
  2: { day: 'Tuesday',   items: ['KOJJ Flour', 'Creme Cheese', 'Coffee', 'Mercato Items (Bilen)'] },
  3: { day: 'Wednesday', items: ['Butter', 'Oil', 'Sugar Stick', 'Cacao Powder'] },
  4: { day: 'Thursday',  items: ['Sugar', 'Staff Meal Vegetables', 'Beef'] },
  5: { day: 'Friday',    items: ['Vegetables & Fruits', 'Smoked Salmon', 'Normal Salmon', 'Sausage'] },
  6: { day: 'Saturday',  items: ['Water', 'Sprite & Ambo Water'] },
};

// All purchasable items with emojis and units
const PURCHASE_ITEMS = [
  { name: 'Milk',              emoji: '🥛', unit: 'L'   },
  { name: 'Coffee',            emoji: '☕', unit: 'kg'  },
  { name: 'Ice cream powder',  emoji: '🍦', unit: 'kg'  },
  { name: 'Heavy cream',       emoji: '🧴', unit: 'ml'  },
  { name: 'Eggs',              emoji: '🥚', unit: 'pcs' },
  { name: 'Butter',            emoji: '🧈', unit: 'kg'  },
  { name: 'Chicken',           emoji: '🍗', unit: 'kg'  },
  { name: 'Beef',              emoji: '🥩', unit: 'kg'  },
  { name: 'Salmon',            emoji: '🐟', unit: 'kg'  },
  { name: 'Chocolate',         emoji: '🍫', unit: 'pcs' },
  { name: 'Sugar',             emoji: '🍬', unit: 'kg'  },
  { name: 'Flour',             emoji: '🌾', unit: 'kg'  },
  { name: 'Creme Cheese',      emoji: '🧀', unit: 'kg'  },
  { name: 'Mozzarella Cheese', emoji: '🧀', unit: 'kg'  },
  { name: 'Vegetables',        emoji: '🥦', unit: 'kg'  },
  { name: 'Fruits',            emoji: '🍓', unit: 'kg'  },
  { name: 'Yo Creme',          emoji: '🥛', unit: 'L'   },
  { name: 'Cacao Powder',      emoji: '🍫', unit: 'kg'  },
  { name: 'Oil',               emoji: '🫙', unit: 'L'   },
  { name: 'Honey',             emoji: '🍯', unit: 'kg'  },
  { name: 'Tuna',              emoji: '🐟', unit: 'pcs' },
  { name: 'Sausage',           emoji: '🌭', unit: 'pcs' },
  { name: 'Water',             emoji: '💧', unit: 'pcs' },
  { name: 'Injera',            emoji: '🫓', unit: 'pcs' },
];

// In-memory session state per user
// State machine: 'select_item' -> 'enter_qty' -> 'enter_price' -> done
const sessions = {};

// ── HTTP helper ───────────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Telegram helpers ──────────────────────────────────────────────
async function send(chatId, text, keyboard = null) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (keyboard) payload.reply_markup = keyboard;
  const body = JSON.stringify(payload);
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
}

async function answerCallback(callbackQueryId, text = '') {
  const body = JSON.stringify({ callback_query_id: callbackQueryId, text });
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
}

async function getUpdates(offset) {
  return request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`,
    method: 'GET'
  });
}

// ── Supabase helpers ──────────────────────────────────────────────
async function dbGet(path) {
  return request({
    hostname: SB_URL,
    path: `/rest/v1/${path}`,
    method: 'GET',
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
  });
}

async function dbPost(path, body) {
  const data = JSON.stringify(body);
  return request({
    hostname: SB_URL,
    path: `/rest/v1/${path}`,
    method: 'POST',
    headers: {
      'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data);
}

async function dbPatch(path, body) {
  const data = JSON.stringify(body);
  return request({
    hostname: SB_URL,
    path: `/rest/v1/${path}`,
    method: 'PATCH',
    headers: {
      'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(data)
    }
  }, data);
}

// ── Date helpers ──────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

// ── Build item selection keyboard ─────────────────────────────────
function buildItemKeyboard() {
  const rows = [];
  for (let i = 0; i < PURCHASE_ITEMS.length; i += 2) {
    const row = [];
    const a = PURCHASE_ITEMS[i];
    row.push({ text: `${a.emoji} ${a.name}`, callback_data: `item_${i}` });
    if (PURCHASE_ITEMS[i + 1]) {
      const b = PURCHASE_ITEMS[i + 1];
      row.push({ text: `${b.emoji} ${b.name}`, callback_data: `item_${i+1}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '❌ Cancel', callback_data: 'cancel' }]);
  return { inline_keyboard: rows };
}

// ── Purchase flow ─────────────────────────────────────────────────
async function startBuyFlow(chatId, fromName, sessionKey) {
  sessions[sessionKey] = { step: 'select_item', buyer: fromName, chatId: chatId };
  await send(chatId, `📦 <b>What did you buy?</b>\nSelect an item:`, buildItemKeyboard());
}

async function handleItemSelected(sessionKey, chatId, itemIndex, fromName) {
  const item = PURCHASE_ITEMS[itemIndex];
  if (!item) return;
  sessions[sessionKey] = {
    step: 'enter_qty',
    item: item,
    buyer: fromName,
    chatId: chatId
  };
  await send(chatId, `${item.emoji} <b>${item.name}</b> selected!\n\nHow many <b>${item.unit}</b> did you buy?\n(Type just the number)`);
}

async function handleQtyEntered(sessionKey, qty) {
  const session = sessions[sessionKey];
  if (!session || session.step !== 'enter_qty') return false;
  const chatId = session.chatId;
  const qtyNum = parseFloat(qty);
  if (isNaN(qtyNum) || qtyNum <= 0) {
    await send(chatId, '❌ Please enter a valid number (e.g. 10 or 5.5)');
    return true;
  }
  session.qty = qtyNum;
  session.step = 'enter_price';
  await send(chatId, `📏 <b>${qtyNum} ${session.item.unit}</b> of ${session.item.emoji} ${session.item.name}\n\nWhat was the <b>unit price</b> per ${session.item.unit}? (in ETB)\n(Type just the number)`);
  return true;
}

async function handlePriceEntered(sessionKey, price) {
  const session = sessions[sessionKey];
  if (!session || session.step !== 'enter_price') return false;
  const chatId = session.chatId;
  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum <= 0) {
    await send(chatId, '❌ Please enter a valid price (e.g. 2200)');
    return true;
  }
  session.unitPrice = priceNum;
  session.totalPrice = session.qty * priceNum;

  try {
    // Save to database
    await dbPost('purchases', {
      purchase_date: today(),
      item_name: session.item.name,
      qty: session.qty,
      unit: session.item.unit,
      unit_price: session.unitPrice,
      total_price: session.totalPrice,
      buyer_name: session.buyer
    });

    // Update stock if ingredient exists
    let stockMsg = '';
    try {
      const allIngs = await dbGet('ingredients?order=name');
      if (Array.isArray(allIngs)) {
        const ing = allIngs.find(i => i.name.toLowerCase() === session.item.name.toLowerCase());
        if (ing) {
          const newQty = parseFloat(ing.qty) + session.qty;
          await dbPatch(`ingredients?id=eq.${ing.id}`, { qty: newQty });
          stockMsg = `\n✅ Stock updated: <b>${ing.name} → ${newQty.toFixed(2)} ${ing.unit}</b>`;
        }
      }
    } catch(stockErr) {
      console.error('Stock update error:', stockErr.message);
    }

    // Send confirmation to group
    const confirmMsg = `🛒 <b>Purchase logged by ${session.buyer}</b>

${session.item.emoji} <b>${session.item.name}</b>
📏 Qty: <b>${session.qty} ${session.item.unit}</b>
💵 Unit price: <b>${session.unitPrice.toLocaleString()} ETB/${session.item.unit}</b>
💰 Total: <b>${session.totalPrice.toLocaleString()} ETB</b>
📅 ${today()}${stockMsg}`;

    await send(GROUP_CHAT_ID, confirmMsg);

    // Get the chat where the session started
    const sessionChatId = session.chatId || chatId;
    if (String(sessionChatId) !== GROUP_CHAT_ID) {
      await send(sessionChatId, '✅ Purchase recorded successfully!');
    }

  } catch(e) {
    console.error('Purchase save error:', e.message);
    await send(GROUP_CHAT_ID, `❌ Error saving purchase: ${e.message}`);
  }

  delete sessions[sessionKey];
  return true;
}

// ── Sales & stock helpers ─────────────────────────────────────────
async function getSalesSummary(date) {
  const sales = await dbGet(`sales?sale_date=eq.${date}&select=qty,revenue,item_name`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top };
}

async function getWeeklySummary() {
  const sales = await dbGet(`sales?sale_date=gte.${weekAgo()}&select=qty,revenue,item_name`);
  if (!Array.isArray(sales) || sales.length === 0) return null;
  const totalRev = sales.reduce((a, s) => a + parseFloat(s.revenue), 0);
  const totalQty = sales.reduce((a, s) => a + parseInt(s.qty), 0);
  const itemMap = {};
  sales.forEach(s => { itemMap[s.item_name] = (itemMap[s.item_name] || 0) + parseInt(s.qty); });
  const top = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { totalRev, totalQty, top };
}

async function getStockAlerts() {
  const ings = await dbGet('ingredients?order=name');
  if (!Array.isArray(ings)) return { low: [], out: [] };
  const out = ings.filter(i => parseFloat(i.qty) <= 0 && parseFloat(i.min_qty) > 0);
  const low = ings.filter(i => parseFloat(i.qty) > 0 && parseFloat(i.qty) <= parseFloat(i.min_qty) && parseFloat(i.min_qty) > 0);
  return { low, out };
}

function fmtSales(data, label) {
  if (!data) return `📊 No sales recorded for ${label}.`;
  const icons = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const topLines = data.top.map(([name, qty], i) => `  ${icons[i]} ${name} — ${qty} sold`).join('\n');
  return `☕ <b>The Dessert Bar — ${label}</b>

💰 Revenue: <b>${Math.round(data.totalRev).toLocaleString()} ETB</b>
🛒 Items sold: <b>${data.totalQty}</b>

🏆 <b>Top sellers:</b>
${topLines}`;
}

function fmtStock({ low, out }) {
  if (!low.length && !out.length) return '✅ <b>All stock levels are OK!</b>';
  let msg = '📦 <b>Stock Alerts</b>\n\n';
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

function fmtDailySchedule() {
  const dow = new Date().getDay();
  const schedule = WEEKLY_SCHEDULE[dow];
  const itemLines = schedule.items.map(i => `  • ${i}`).join('\n');
  return `🛒 <b>Today's Purchasing List — ${schedule.day}</b>

${itemLines}

Tap /buy to log what you purchased.`;
}

// ── Command handler ───────────────────────────────────────────────
async function handleCommand(chatId, text, fromName, sessionKey) {
  const cmd = text.trim().toLowerCase().split(' ')[0].split('@')[0];

  if (cmd === '/buy') {
    await startBuyFlow(chatId, fromName, sessionKey);

  } else if (cmd === '/schedule') {
    await send(chatId, fmtDailySchedule());

  } else if (cmd === '/purchases') {
    const since = new Date(); since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().split('T')[0];
    const purchases = await dbGet(`purchases?purchase_date=gte.${sinceStr}&order=purchase_date.desc&limit=30`);
    if (!Array.isArray(purchases) || purchases.length === 0) {
      await send(chatId, '🛒 No purchases recorded this week yet.'); return;
    }
    let total = 0;
    let msg = '🛒 <b>Purchase Log — Last 7 Days</b>\n\n';
    purchases.forEach(p => {
      total += parseFloat(p.total_price || 0);
      msg += `${p.purchase_date} — <b>${p.item_name}</b>\n`;
      msg += `  ${p.qty} ${p.unit} @ ${parseFloat(p.unit_price).toLocaleString()} ETB = <b>${parseFloat(p.total_price).toLocaleString()} ETB</b> (${p.buyer_name})\n\n`;
    });
    msg += `💰 <b>Total: ${total.toLocaleString()} ETB</b>`;
    await send(chatId, msg);

  } else if (cmd === '/stock') {
    const alerts = await getStockAlerts();
    await send(chatId, fmtStock(alerts));

  } else if (cmd === '/fullstock') {
    const ings = await dbGet('ingredients?order=name');
    if (!Array.isArray(ings) || !ings.length) { await send(chatId, '📦 No ingredients yet.'); return; }
    let msg = '📦 <b>Full Stock List</b>\n\n';
    ings.forEach(i => {
      const qty = parseFloat(i.qty), min = parseFloat(i.min_qty);
      const icon = qty <= 0 ? '🔴' : (qty <= min && min > 0) ? '🟡' : '🟢';
      msg += `${icon} ${i.name}: <b>${qty.toFixed(2)} ${i.unit}</b>\n`;
    });
    await send(chatId, msg);

  } else if (cmd === '/today') {
    const data = await getSalesSummary(today());
    await send(chatId, fmtSales(data, `Today (${today()})`));

  } else if (cmd === '/yesterday' || cmd === '/sales') {
    const data = await getSalesSummary(yesterday());
    await send(chatId, fmtSales(data, `Yesterday (${yesterday()})`));

  } else if (cmd === '/weekly') {
    const data = await getWeeklySummary();
    if (!data) { await send(chatId, '📊 No sales data this week yet.'); return; }
    const icons = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    const topLines = data.top.map(([name, qty], i) => `  ${icons[i]} ${name} — ${qty} sold`).join('\n');
    await send(chatId, `☕ <b>The Dessert Bar — This Week</b>

💰 Revenue: <b>${Math.round(data.totalRev).toLocaleString()} ETB</b>
🛒 Items sold: <b>${data.totalQty}</b>

🏆 <b>Top sellers:</b>
${topLines}`);

  } else if (cmd === '/send') {
    await startSendFlow(chatId, fromName, 'main');

  } else if (cmd === '/made') {
    await startSendFlow(chatId, fromName, 'cafe');

  } else if (cmd === '/wastage') {
    await startWastageFlow(chatId, fromName);

  } else if (cmd === '/cakestock') {
    await sendCakeStockReport();

  } else if (cmd === '/help' || cmd === '/start') {
    await send(chatId, `☕ <b>Dessert Bar Bot Commands</b>

🏭 <b>Production:</b>
/send — Main kitchen logs a delivery
/made — Cafe kitchen logs production
/cakestock — Current cake stock report

🛒 <b>Purchasing:</b>
/buy — Log a purchase (interactive)
/schedule — Today's purchase list
/purchases — This week's purchase log

📦 <b>Stock:</b>
/stock — Stock alerts
/fullstock — Full stock list

📊 <b>Sales:</b>
/today — Today's sales
/yesterday — Yesterday's summary
/weekly — This week's summary`);
  }
}

// ── Callback query handler (button taps) ─────────────────────────
async function handleCallback(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data;
  const fromName = callbackQuery.from ? callbackQuery.from.first_name : 'Unknown';

  await answerCallback(callbackQuery.id);

  if (data === 'cancel') {
    const userId3 = String(callbackQuery.from ? callbackQuery.from.id : chatId);
    const sessionKey3 = userId3 + '_' + chatId;
    delete sessions[sessionKey3];
    await send(chatId, '❌ Purchase cancelled.');
    return;
  }

  // Production callbacks
  const handled = await handleProductionCallback(callbackQuery);
  if (handled) return;

  if (data.startsWith('item_')) {
    const idx = parseInt(data.replace('item_', ''));
    const userId2 = String(callbackQuery.from ? callbackQuery.from.id : chatId);
    const sessionKey2 = userId2 + '_' + chatId;
    await handleItemSelected(sessionKey2, chatId, idx, fromName);
    return;
  }
}

// ── Scheduled reports ─────────────────────────────────────────────
async function sendMorningReport() {
  const data = await getSalesSummary(yesterday());
  const alerts = await getStockAlerts();
  let msg = fmtSales(data, `Yesterday (${yesterday()})`);
  if (alerts.out.length || alerts.low.length) msg += '\n\n' + fmtStock(alerts);
  await send(OWNER_CHAT_ID, msg);
  await send(GROUP_CHAT_ID, fmtDailySchedule());
  if (alerts.out.length || alerts.low.length) {
    await send(GROUP_CHAT_ID, fmtStock(alerts));
  }
}

async function sendEveningReport() {
  const data = await getSalesSummary(today());
  await send(OWNER_CHAT_ID, fmtSales(data, `Today (${today()})`));
}

// ── Polling ───────────────────────────────────────────────────────
let offset = 0;
const processedUpdates = new Set();
const processedMessages = new Set();
async function poll() {
  try {
    const data = await getUpdates(offset);
    if (data.ok && data.result && data.result.length) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        if (processedUpdates.has(update.update_id)) continue;
        processedUpdates.add(update.update_id);
        // Also deduplicate by message_id + chat_id
        if (update.message) {
          const msgKey = `${update.message.chat.id}_${update.message.message_id}`;
          if (processedMessages.has(msgKey)) continue;
          processedMessages.add(msgKey);
          if (processedMessages.size > 500) {
            processedMessages.delete([...processedMessages][0]);
          }
        }
        if (processedUpdates.size > 1000) {
          const first = [...processedUpdates][0];
          processedUpdates.delete(first);
        }

        // Handle button taps
        if (update.callback_query) {
          await handleCallback(update.callback_query);
          continue;
        }

        // Handle messages
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        const userId = String(msg.from ? msg.from.id : chatId);
        const sessionKey = userId + '_' + chatId;
        const fromName = msg.from ? msg.from.first_name : 'Unknown';
        const text = msg.text;

        console.log(`[${new Date().toISOString()}] ${fromName} (${chatId}): ${text}`);

        // Check if user is in a production edit session
        global.editSessions = global.editSessions || {};
        if (global.editSessions[chatId] && !text.startsWith('/')) {
          const editSess = global.editSessions[chatId];
          if (editSess.step === 'enter_qty') {
            const qty = parseFloat(text);
            if (isNaN(qty) || qty <= 0) {
              await send(chatId, '❌ Please enter a valid number');
            } else {
              const item = editSess.items[editSess.editingIdx];
              // Update in DB
              await dbPatch(`production_delivery_items?id=eq.${item.id}`, { qty_received: qty });
              editSess.items[editSess.editingIdx].qty_sent = qty;
              editSess.step = 'select_item';
              // Show updated list and options
              const rows = editSess.items.map((it, idx) => ([{
                text: `${it.item_name} — ${it.qty_sent} ${it.unit}`,
                callback_data: `edit_item_${idx}`
              }]));
              rows.push([{ text: '✅ Done editing', callback_data: 'edit_done' }]);
              await send(chatId,
                `✅ <b>${item.item_name}</b> updated to <b>${qty} ${item.unit}</b>\n\nEdit another item or tap Done:`,
                { inline_keyboard: rows }
              );
            }
            continue;
          }
        }

        // Check if user is in a production send session
        if (sendSessions[chatId] && !text.startsWith('/')) {
          if (sendSessions[chatId].step === 'enter_qty') {
            await handleSendQty(chatId, text);
            continue;
          }
        }

        // Check if user is in a wastage session
        if (wasteSessions[chatId] && !text.startsWith('/')) {
          if (wasteSessions[chatId].step === 'enter_qty') {
            await handleWastageQty(chatId, text);
            continue;
          }
        }

        // Check if user is in a buy session and entering qty or price
        if (sessions[sessionKey] && !text.startsWith('/')) {
          const step = sessions[sessionKey].step;
          if (step === 'enter_qty') {
            await handleQtyEntered(sessionKey, text);
            continue;
          }
          if (step === 'enter_price') {
            await handlePriceEntered(sessionKey, text);
            continue;
          }
        }

        // Handle commands
        if (text.startsWith('/')) {
          await handleCommand(chatId, text, fromName, sessionKey);
        }
      }
    }
  } catch(e) {
    console.error('Poll error:', e.message);
  }
  setTimeout(poll, 1500);
}

// ── Scheduler ─────────────────────────────────────────────────────
function startScheduler() {
  setInterval(async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    if (hhmm === '07:00') await sendCakeStockReport();
    if (hhmm === '08:00') await sendMorningReport();
    if (hhmm === '22:00') await sendEveningReport();
  }, 60000);
}

// ── Start ─────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 The Dessert Bar Bot starting...');
  await send(OWNER_CHAT_ID, '🚀 <b>Dessert Bar Bot is online!</b>\nType /help for commands.');
  await send(GROUP_CHAT_ID, `🚀 <b>Dessert Bar Stock Bot updated!</b>

Purchaser — tap /buy to log a purchase.
No typing needed — just tap the buttons!`);
  startScheduler();
  poll();
  console.log('✅ Bot running!');
}

main().catch(console.error);

// ================================================================
// PRODUCTION TRACKING MODULE
// ================================================================

// All cake/production items with units
const PRODUCTION_ITEMS = [
  // Cakes - pcs (names match ingredients table exactly)
  { name: 'Chocolate cake',            emoji: '🍫', unit: 'pcs', source: 'main' },
  { name: 'Oreo Cheesecake',           emoji: '🍰', unit: 'pcs', source: 'main' },
  { name: 'Blueberry cheesecake',      emoji: '🫐', unit: 'pcs', source: 'main' },
  { name: 'Rasberry Cheese Cake',      emoji: '🍰', unit: 'pcs', source: 'main' },
  { name: 'STRAWBERRY CHEESECAKE',     emoji: '🍓', unit: 'pcs', source: 'main' },
  { name: 'OREO MOUSSE CAKE',          emoji: '🍰', unit: 'pcs', source: 'main' },
  { name: 'PISTACHIO MOUSSE CAKE',     emoji: '🟢', unit: 'pcs', source: 'main' },
  { name: 'HAZELNUT MOUSSE CAKE',      emoji: '🍰', unit: 'pcs', source: 'main' },
  { name: 'Red Velvet Cake',           emoji: '❤️',  unit: 'pcs', source: 'main' },
  { name: 'Brownie',                   emoji: '🟫', unit: 'pcs', source: 'main' },
  { name: 'Vegan Chocolate Cake',      emoji: '🌱', unit: 'pcs', source: 'main' },
  { name: 'FASTING CHOCOLATE BROWNIE', emoji: '🌱', unit: 'pcs', source: 'main' },
  { name: 'Chocolate Stuffed Donut',   emoji: '🍩', unit: 'pcs', source: 'main' },
  { name: 'Cream cheese donut',        emoji: '🍩', unit: 'pcs', source: 'main' },
  { name: 'English Cake',              emoji: '🎂', unit: 'pcs', source: 'main' },
  { name: 'Banana Bread',              emoji: '🍌', unit: 'pcs', source: 'main' },
  { name: 'Chocolate Ball',            emoji: '⚫', unit: 'pcs', source: 'main' },
  { name: 'STRAWBERRY TIRAMISU',       emoji: '🍓', unit: 'pcs', source: 'main' },
  { name: 'Customer Cookies',          emoji: '🍪', unit: 'g',   source: 'main' },
  { name: 'Fasting Brownie',           emoji: '🌱', unit: 'pcs', source: 'main' },
  { name: 'Baked Cheesecake',          emoji: '🍰', unit: 'pcs', source: 'main' },
  { name: 'Matilda chocolate cake',    emoji: '🍫', unit: 'pcs', source: 'main' },
  { name: 'Walnut Brownie Cake',       emoji: '🟫', unit: 'pcs', source: 'main' },
  { name: 'Cinnamon Roll',             emoji: '🌀', unit: 'pcs', source: 'main' },
  { name: 'Tiramisu Biscuits',         emoji: '🍪', unit: 'pcs', source: 'main' },
  { name: 'Chocolate Chip Cookies',    emoji: '🍪', unit: 'g',   source: 'main' },
  { name: 'Mascarpone Cream',          emoji: '🥛', unit: 'g',   source: 'main' },
  { name: 'Chocolate Cookies',         emoji: '🍪', unit: 'g',   source: 'main' },
  { name: 'Butter Cookies',            emoji: '🍪', unit: 'g',   source: 'main' },
  { name: 'Cocunt Carrot Cake',        emoji: '🥕', unit: 'pcs', source: 'main' },
  { name: 'Chocolate Donut',           emoji: '🍩', unit: 'pcs', source: 'main' },
  { name: 'Triple Layer Chocolate Cake', emoji: '🍫', unit: 'pcs', source: 'main' },
  { name: 'Donut Fasting',              emoji: '🍩', unit: 'pcs', source: 'main' },
  // Tortas - kg
  { name: 'Chocolate Cake Torta',      emoji: '🎂', unit: 'kg',  source: 'main' },
  { name: 'Blueberry Cheesecake Torta',emoji: '🫐', unit: 'kg',  source: 'main' },
  { name: 'Oreo Cheesecake Torta',     emoji: '🍰', unit: 'kg',  source: 'main' },
  { name: 'Oreo Mousse Torta',         emoji: '🍰', unit: 'kg',  source: 'main' },
  { name: 'Chocolate Mousse Torta',    emoji: '🍫', unit: 'kg',  source: 'main' },
  // Cafe kitchen items
  { name: 'Tiramisu in a Cup',          emoji: '☕', unit: 'pcs', source: 'cafe' },
  { name: 'Lemon cake',                emoji: '🍋', unit: 'pcs', source: 'cafe' },
  { name: 'Croissant',                 emoji: '🥐', unit: 'pcs', source: 'cafe' },
  { name: 'Staff Bread',               emoji: '🍞', unit: 'pcs', source: 'cafe' },
  { name: 'Sandwich Bread',            emoji: '🍞', unit: 'pcs', source: 'cafe' },
  { name: 'Ciabatta',                  emoji: '🥖', unit: 'pcs', source: 'cafe' },
  { name: 'Baguette',                  emoji: '🥖', unit: 'pcs', source: 'cafe' },
  { name: 'Care Bread',                emoji: '🍞', unit: 'pcs', source: 'cafe' },
  { name: 'Slider Bread',              emoji: '🍞', unit: 'pcs', source: 'cafe' },
];

// Pending deliveries waiting for confirmation: { deliveryId, items, from }
const pendingDeliveries = {};
// Send sessions for building delivery item by item
const sendSessions = {};

// ── Build production item keyboard ────────────────────────────────
// ══════════════════════════════════════════════════════════════
// WASTAGE FLOW — log spoilage/giveaways, deducts from stock
// ══════════════════════════════════════════════════════════════
const wasteSessions = {};

async function startWastageFlow(chatId, fromName) {
  wasteSessions[chatId] = { fromName, items: [], step: 'selecting', editingItem: null };
  await send(chatId,
    `🗑️ <b>Log Wastage</b>\n\nTap each item that was wasted/spoiled.\nThis will DEDUCT from stock.`,
    buildWastageKeyboard([])
  );
}

function buildWastageKeyboard(selectedNames = []) {
  // All cake/pcs items from both kitchens (dedup by name)
  const seen = new Set();
  const items = [];
  for (const it of PRODUCTION_ITEMS) {
    if (seen.has(it.name)) continue;
    seen.add(it.name);
    items.push(it);
  }
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const row = [];
    const a = items[i];
    const aSel = selectedNames.includes(a.name);
    row.push({ text: `${aSel ? '✅' : a.emoji} ${a.name}`, callback_data: `waste_${i}` });
    if (items[i+1]) {
      const b = items[i+1];
      const bSel = selectedNames.includes(b.name);
      row.push({ text: `${bSel ? '✅' : b.emoji} ${b.name}`, callback_data: `waste_${i+1}` });
    }
    rows.push(row);
  }
  rows.push([
    { text: '✅ Done — Submit wastage', callback_data: 'waste_submit' },
    { text: '❌ Cancel', callback_data: 'waste_cancel' }
  ]);
  return { inline_keyboard: rows };
}

function wastageItemList() {
  const seen = new Set();
  const items = [];
  for (const it of PRODUCTION_ITEMS) {
    if (seen.has(it.name)) continue;
    seen.add(it.name);
    items.push(it);
  }
  return items;
}

async function handleWastageTap(chatId, itemIdx) {
  const session = wasteSessions[chatId];
  if (!session) return;
  const items = wastageItemList();
  const item = items[itemIdx];
  if (!item) return;
  session.editingItem = item.name;
  session.editingUnit = item.unit;
  session.editingEmoji = item.emoji;
  session.step = 'enter_qty';
  await send(chatId, `How many <b>${item.unit}</b> of ${item.emoji} <b>${item.name}</b> were wasted?\n(Type the number)`);
}

async function handleWastageQty(chatId, text) {
  const session = wasteSessions[chatId];
  if (!session || session.step !== 'enter_qty') return false;
  const qty = parseFloat(text);
  if (isNaN(qty) || qty <= 0) {
    await send(chatId, '❌ Please enter a valid number');
    return true;
  }
  const existing = session.items.find(i => i.name === session.editingItem);
  if (existing) existing.qty = qty;
  else session.items.push({ name: session.editingItem, unit: session.editingUnit, emoji: session.editingEmoji, qty });
  session.step = 'selecting';
  session.editingItem = null;
  const list = session.items.map(i => `  ${i.emoji} ${i.name}: <b>${i.qty} ${i.unit}</b>`).join('\n');
  await send(chatId,
    `✅ Added! Wastage list:\n${list}\n\nTap more or press <b>Done</b>:`,
    buildWastageKeyboard(session.items.map(i => i.name))
  );
  return true;
}

async function submitWastage(chatId, fromName) {
  const session = wasteSessions[chatId];
  if (!session || !session.items.length) {
    await send(chatId, '❌ No wastage items added.');
    return;
  }

  // Save as PENDING wastage record (status pending until manager confirms)
  const rec = await dbPost('production_deliveries', {
    delivery_date: today(),
    source: 'wastage',
    status: 'pending',
    delivered_by: fromName
  });
  const wasteId = rec[0]?.id;
  if (!wasteId) {
    await send(chatId, '❌ Error saving wastage. Try again.');
    return;
  }

  // Save items (negative qty = deduction when confirmed)
  for (const item of session.items) {
    await dbPost('production_delivery_items', {
      delivery_id: wasteId,
      item_name: item.name,
      qty_sent: -item.qty,
      qty_received: -item.qty,
      unit: item.unit
    });
  }

  const logLines = session.items.map(i => `  ${i.emoji} ${i.name}: <b>${i.qty} ${i.unit}</b>`).join('\n');
  pendingDeliveries[wasteId] = { items: session.items, from: fromName, deliveryId: wasteId, isWastage: true };

  await send(GROUP_CHAT_ID,
    `🗑️ <b>Wastage reported by ${fromName}</b>\n📅 ${today()}\n\n${logLines}\n\n<i>Cafe manager — please confirm this wastage:</i>`,
    {
      inline_keyboard: [[
        { text: '✅ Confirm wastage', callback_data: `confirm_wastage_${wasteId}` },
        { text: '❌ Reject', callback_data: `reject_wastage_${wasteId}` }
      ]]
    }
  );
  delete wasteSessions[chatId];
}

// ── Confirm wastage (deducts from stock) — double-lock protected ──
const confirmingWastage = new Set();
async function confirmWastage(wasteId, confirmedBy) {
  if (confirmingWastage.has(wasteId)) return;
  confirmingWastage.add(wasteId);
  try {
    // DB lock: skip only if already 'stocked' (stock applied)
    const existing = await dbGet(`production_deliveries?id=eq.${wasteId}&select=status`);
    if (Array.isArray(existing) && existing.length > 0 && existing[0].status === 'stocked') {
      confirmingWastage.delete(wasteId);
      return;
    }

    // Deduct each item from stock
    const items = await dbGet(`production_delivery_items?delivery_id=eq.${wasteId}`);
    const allIngs = await dbGet('ingredients?order=name');
    if (Array.isArray(items) && Array.isArray(allIngs)) {
      for (const it of items) {
        const ing = allIngs.find(i => i.name.toLowerCase() === it.item_name.toLowerCase());
        if (ing) {
          // qty stored negative; adding it reduces stock
          const newQty = parseFloat(ing.qty) + parseFloat(it.qty_received);
          await dbPatch(`ingredients?id=eq.${ing.id}`, { qty: newQty });
        }
      }
    }
    await dbPatch(`production_deliveries?id=eq.${wasteId}`, {
      status: 'stocked', confirmed_by: confirmedBy
    });
    await send(GROUP_CHAT_ID,
      `✅ <b>Wastage confirmed by ${confirmedBy}</b>\nStock has been reduced.`
    );
  } catch(e) {
    console.error('confirmWastage error:', e.message);
  } finally {
    confirmingWastage.delete(wasteId);
  }
}

async function rejectWastage(wasteId, rejectedBy) {
  await dbPatch(`production_deliveries?id=eq.${wasteId}`, { status: 'rejected', confirmed_by: rejectedBy });
  delete pendingDeliveries[wasteId];
  await send(GROUP_CHAT_ID, `❌ <b>Wastage rejected by ${rejectedBy}</b>\nNo stock change made.`);
}

function buildProductionKeyboard(source, selectedItems = []) {
  const items = PRODUCTION_ITEMS.filter(i => i.source === source);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const row = [];
    const a = items[i];
    const aSelected = selectedItems.includes(i);
    row.push({ text: `${aSelected ? '✅' : a.emoji} ${a.name}`, callback_data: `prod_${source}_${i}` });
    if (items[i+1]) {
      const b = items[i+1];
      const bSelected = selectedItems.includes(i+1);
      row.push({ text: `${bSelected ? '✅' : b.emoji} ${b.name}`, callback_data: `prod_${source}_${i+1}` });
    }
    rows.push(row);
  }
  rows.push([
    { text: '✅ Done — Submit delivery', callback_data: `prod_submit_${source}` },
    { text: '❌ Cancel', callback_data: 'prod_cancel' }
  ]);
  return { inline_keyboard: rows };
}

// ── Start send flow ───────────────────────────────────────────────
async function startSendFlow(chatId, fromName, source) {
  const label = source === 'main' ? '🏭 Main Kitchen' : '☕ Cafe Kitchen';
  sendSessions[chatId] = {
    source, fromName, items: [], step: 'selecting',
    currentItemIdx: null
  };
  await send(chatId,
    `${label} — <b>What are you sending?</b>\n\nTap each item you are sending:`,
    buildProductionKeyboard(source)
  );
}

// ── Handle production item tap ────────────────────────────────────
async function handleProductionItemTap(chatId, source, itemIdx, fromName) {
  const session = sendSessions[chatId];
  if (!session) return;

  const items = PRODUCTION_ITEMS.filter(i => i.source === source);
  const item = items[itemIdx];
  if (!item) return;

  // Check if already added
  const existing = session.items.find(i => i.name === item.name);
  if (existing) {
    // Ask to update qty
    session.editingItem = item.name;
    session.step = 'enter_qty';
    await send(chatId, `How many <b>${item.unit}</b> of ${item.emoji} <b>${item.name}</b>?\n(Type the number)`);
  } else {
    session.editingItem = item.name;
    session.editingUnit = item.unit;
    session.editingEmoji = item.emoji;
    session.step = 'enter_qty';
    await send(chatId, `How many <b>${item.unit}</b> of ${item.emoji} <b>${item.name}</b>?\n(Type the number)`);
  }
}

// ── Handle qty input for send session ────────────────────────────
async function handleSendQty(chatId, text) {
  const session = sendSessions[chatId];
  if (!session || session.step !== 'enter_qty') return false;

  const qty = parseFloat(text);
  if (isNaN(qty) || qty <= 0) {
    await send(chatId, '❌ Please enter a valid number');
    return true;
  }

  // Add or update item
  const existing = session.items.find(i => i.name === session.editingItem);
  if (existing) {
    existing.qty = qty;
  } else {
    session.items.push({
      name: session.editingItem,
      unit: session.editingUnit,
      emoji: session.editingEmoji,
      qty
    });
  }

  session.step = 'selecting';
  session.editingItem = null;

  // Show updated list and keyboard
  const itemList = session.items.map(i => `  ${i.emoji} ${i.name}: <b>${i.qty} ${i.unit}</b>`).join('\n');
  const source = session.source;
  await send(chatId,
    `✅ Added! Current list:\n${itemList}\n\nTap more items or press <b>Done</b>:`,
    buildProductionKeyboard(source)
  );
  return true;
}

// ── Submit delivery ───────────────────────────────────────────────
async function submitDelivery(chatId, source, fromName) {
  const session = sendSessions[chatId];
  if (!session || !session.items.length) {
    await send(chatId, '❌ No items added yet. Tap items first.');
    return;
  }

  // Save to DB
  const delivery = await dbPost('production_deliveries', {
    delivery_date: today(),
    source: source === 'main' ? 'main_production' : 'cafe_kitchen',
    status: source === 'cafe' ? 'confirmed' : 'pending',
    delivered_by: fromName
  });

  const deliveryId = delivery[0]?.id;
  if (!deliveryId) {
    await send(chatId, '❌ Error saving delivery. Try again.');
    return;
  }

  // Save items
  for (const item of session.items) {
    await dbPost('production_delivery_items', {
      delivery_id: deliveryId,
      item_name: item.name,
      qty_sent: item.qty,
      qty_received: item.qty,
      unit: item.unit
    });
  }

  // If cafe kitchen — post to group for manager confirmation (same as main kitchen)
  if (source === 'cafe') {
    const itemList = session.items.map(i => `  ${i.emoji} ${i.name}: <b>${i.qty} ${i.unit}</b>`).join('\n');
    pendingDeliveries[deliveryId] = { items: session.items, from: fromName, deliveryId };

    await send(GROUP_CHAT_ID,
      `☕ <b>Cafe Kitchen Production</b> — logged by ${fromName}\n📅 ${today()}\n\n${itemList}\n\n<i>Cafe manager — please confirm:</i>`,
      {
        inline_keyboard: [[
          { text: '✅ Confirm', callback_data: `confirm_delivery_${deliveryId}` },
          { text: '✏️ Edit quantities', callback_data: `edit_delivery_${deliveryId}` }
        ]]
      }
    );
    delete sendSessions[chatId];
    return;
  }

  // If main kitchen — post to group for cafe manager to confirm
  const itemList = session.items.map(i => `  ${i.emoji} ${i.name}: <b>${i.qty} ${i.unit}</b>`).join('\n');
  pendingDeliveries[deliveryId] = { items: session.items, from: fromName, deliveryId };

  await send(GROUP_CHAT_ID,
    `🏭 <b>Main Production Delivery</b> — sent by ${fromName}\n📅 ${today()}\n\n${itemList}\n\n<i>Cafe manager — please confirm receipt:</i>`,
    {
      inline_keyboard: [[
        { text: '✅ Confirm receipt', callback_data: `confirm_delivery_${deliveryId}` },
        { text: '✏️ Edit quantities', callback_data: `edit_delivery_${deliveryId}` }
      ]]
    }
  );

  delete sendSessions[chatId];
}

// ── Confirm delivery ──────────────────────────────────────────────
const confirmingDeliveries = new Set(); // in-memory lock
async function confirmDelivery(deliveryId, confirmedBy) {
  // LOCK 1: in-memory — block duplicate callback within same run
  if (confirmingDeliveries.has(deliveryId)) {
    console.log(`Delivery ${deliveryId} already being confirmed — ignoring duplicate`);
    return;
  }
  confirmingDeliveries.add(deliveryId);

  try {
    // LOCK 2: database — check if stock was ALREADY APPLIED (status 'stocked')
    // We use a distinct 'stocked' status to mean "stock successfully added".
    // 'confirmed' alone does NOT block re-processing, so a failed run can recover.
    const existing = await dbGet(`production_deliveries?id=eq.${deliveryId}&select=status`);
    if (Array.isArray(existing) && existing.length > 0 && existing[0].status === 'stocked') {
      console.log(`Delivery ${deliveryId} already stocked — skipping`);
      confirmingDeliveries.delete(deliveryId);
      return;
    }

  const pending = pendingDeliveries[deliveryId];
  // Check if edit session has updated quantities
  global.editSessions = global.editSessions || {};
  const editSession = Object.values(global.editSessions).find(s => s.deliveryId === deliveryId);

  if (editSession) {
    // Use edited quantities
    for (const item of editSession.items) {
      await updateCakeStock(item.item_name, item.qty_sent);
    }
    // Update DB quantities if not from memory
    for (const item of editSession.items) {
      if (!item.fromMemory && item.id) {
        await dbPatch(`production_delivery_items?id=eq.${item.id}`, { qty_received: item.qty_sent });
      }
    }
    delete global.editSessions[Object.keys(global.editSessions).find(k => global.editSessions[k].deliveryId === deliveryId)];
  } else if (!pending) {
    // Load from DB
    const items = await dbGet(`production_delivery_items?delivery_id=eq.${deliveryId}`);
    if (!Array.isArray(items)) return;
    for (const item of items) {
      await updateCakeStock(item.item_name, item.qty_received || item.qty_sent);
    }
  } else {
    for (const item of pending.items) {
      await updateCakeStock(item.name, item.qty);
    }
    delete pendingDeliveries[deliveryId];
  }

    // Mark as 'stocked' ONLY after stock successfully updated
    await dbPatch(`production_deliveries?id=eq.${deliveryId}`, {
      status: 'stocked',
      confirmed_by: confirmedBy
    });

    await send(GROUP_CHAT_ID,
      `✅ <b>Delivery confirmed by ${confirmedBy}</b>\nStock has been updated.`
    );
  } catch(e) {
    console.error('confirmDelivery error:', e.message);
    await send(GROUP_CHAT_ID, `⚠️ Error updating stock: ${e.message}. Tap confirm again.`);
  } finally {
    confirmingDeliveries.delete(deliveryId);
  }
}

// ── Update cake stock ─────────────────────────────────────────────
async function updateCakeStock(itemName, qty) {
  try {
    const allIngs = await dbGet('ingredients?order=name');
    if (!Array.isArray(allIngs)) return;
    const ing = allIngs.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    if (ing) {
      const newQty = parseFloat(ing.qty) + parseFloat(qty);
      await dbPatch(`ingredients?id=eq.${ing.id}`, { qty: newQty });
    }
  } catch(e) {
    console.error('Stock update error:', e.message);
  }
}

// ── Morning cake stock report ─────────────────────────────────────
async function sendCakeStockReport() {
  const allIngs = await dbGet('ingredients?order=name');
  if (!Array.isArray(allIngs)) return;

  const cakeNames = PRODUCTION_ITEMS.map(i => i.name.toLowerCase());
  const cakes = allIngs.filter(i => cakeNames.includes(i.name.toLowerCase()));

  if (!cakes.length) return;

  let msg = `🍰 <b>Cake Stock Report — ${today()}</b>\n`;
  msg += '─────────────────────────\n';

  let total = 0;
  cakes.forEach(c => {
    const qty = parseFloat(c.qty);
    if (qty <= 0) return; // Skip zero stock items
    const min = parseFloat(c.min_qty);
    const icon = qty <= min ? '🟡' : '🟢';
    const item = PRODUCTION_ITEMS.find(i => i.name.toLowerCase() === c.name.toLowerCase());
    msg += `${icon} ${item?.emoji || ''} ${c.name}: <b>${qty} ${c.unit}</b>`;
    if (qty <= min) msg += ' — LOW';
    msg += '\n';
    total += qty;
  });

  msg += '─────────────────────────\n';
  msg += `📦 Total pieces in stock: <b>${total}</b>`;

  await send(GROUP_CHAT_ID, msg);
}

// ── Handle production callbacks ───────────────────────────────────
async function handleProductionCallback(callbackQuery) {
  const chatId = String(callbackQuery.message.chat.id);
  const data = callbackQuery.data;
  const fromName = callbackQuery.from ? callbackQuery.from.first_name : 'Unknown';

  await answerCallback(callbackQuery.id);

  if (data === 'prod_cancel') {
    delete sendSessions[chatId];
    await send(chatId, '❌ Delivery cancelled.');
    return true;
  }

  if (data.startsWith('prod_submit_')) {
    const source = data.replace('prod_submit_', '');
    await submitDelivery(chatId, source, fromName);
    return true;
  }

  if (data.startsWith('prod_main_') || data.startsWith('prod_cafe_')) {
    const parts = data.split('_');
    const source = parts[1];
    const idx = parseInt(parts[2]);
    await handleProductionItemTap(chatId, source, idx, fromName);
    return true;
  }

  if (data === 'waste_cancel') {
    delete wasteSessions[chatId];
    await send(chatId, '❌ Wastage cancelled.');
    return true;
  }

  if (data === 'waste_submit') {
    await submitWastage(chatId, fromName);
    return true;
  }

  if (data.startsWith('waste_')) {
    const idx = parseInt(data.replace('waste_', ''));
    await handleWastageTap(chatId, idx);
    return true;
  }

  if (data.startsWith('confirm_delivery_')) {
    const deliveryId = parseInt(data.replace('confirm_delivery_', ''));
    await confirmDelivery(deliveryId, fromName);
    return true;
  }

  if (data.startsWith('confirm_wastage_')) {
    const wasteId = parseInt(data.replace('confirm_wastage_', ''));
    await confirmWastage(wasteId, fromName);
    return true;
  }

  if (data.startsWith('reject_wastage_')) {
    const wasteId = parseInt(data.replace('reject_wastage_', ''));
    await rejectWastage(wasteId, fromName);
    return true;
  }

  if (data.startsWith('edit_delivery_')) {
    const deliveryId = parseInt(data.replace('edit_delivery_', ''));
    global.editSessions = global.editSessions || {};

    // Try memory first, then DB
    let items = [];
    const pending = pendingDeliveries[deliveryId];
    if (pending && pending.items) {
      // Convert from memory format to edit format
      items = pending.items.map((item, idx) => ({
        id: idx, // use index as fake id for memory items
        item_name: item.name,
        qty_sent: item.qty,
        unit: item.unit,
        fromMemory: true
      }));
    } else {
      // Load from DB
      const dbItems = await dbGet(`production_delivery_items?delivery_id=eq.${deliveryId}`);
      if (Array.isArray(dbItems)) items = dbItems;
    }

    if (!items.length) {
      await send(chatId, '❌ Could not load delivery items.');
      return true;
    }

    global.editSessions[chatId] = { deliveryId, items, step: 'select_item', editor: fromName };

    const rows = items.map((item, idx) => ([{
      text: `${item.item_name} — ${item.qty_sent} ${item.unit}`,
      callback_data: `edit_item_${idx}`
    }]));
    rows.push([{ text: '✅ Done editing', callback_data: 'edit_done' }]);
    await send(chatId,
      `✏️ <b>Edit Delivery</b>\n\nWhich item do you want to edit?`,
      { inline_keyboard: rows }
    );
    return true;
  }

  if (data.startsWith('edit_item_')) {
    global.editSessions = global.editSessions || {};
    const editSession = global.editSessions[chatId];
    if (!editSession) return true;
    const idx = parseInt(data.replace('edit_item_', ''));
    const item = editSession.items[idx];
    editSession.editingIdx = idx;
    editSession.step = 'enter_qty';
    await send(chatId,
      `✏️ <b>${item.item_name}</b>\nCurrently: <b>${item.qty_sent} ${item.unit}</b>\n\nEnter the correct quantity received:`
    );
    return true;
  }

  if (data === 'edit_done') {
    global.editSessions = global.editSessions || {};
    const editSession = global.editSessions[chatId];
    if (!editSession) return true;
    // Confirm delivery with edited quantities
    await confirmDelivery(editSession.deliveryId, editSession.editor);
    delete global.editSessions[chatId];
    return true;
  }

  return false;
}

// Export handlers for main bot to use
global.handleProductionCallback = handleProductionCallback;
global.startSendFlow = startSendFlow;
global.handleSendQty = handleSendQty;
global.sendCakeStockReport = sendCakeStockReport;
global.sendSessions = sendSessions;
