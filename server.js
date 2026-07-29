const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const CONFIGURED_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();
const ADMIN_IDS = String(process.env.ADMIN_IDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const STATE_FILE = path.join(__dirname, "state.json");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_MESSAGE = `⚠️ <b>WARNING</b>

Our admins will never ask for money in private messages.

✅ If you make a deal anywhere other than this official Deal Box, you are at high risk of being scammed.

━━━━━━━━━━━━━━━━━━

⚠️ <b>সতর্কতা</b>

আমাদের কোনো এডমিন কখনো ব্যক্তিগত ইনবক্সে টাকা চাইবে না।

✅ আমাদের এই অফিসিয়াল ডিল বক্স ব্যতীত অন্য কোথাও ডিল করলে প্রতারণার শিকার হওয়ার ঝুঁকি রয়েছে।`;

function defaultState() {
  return {
    reminderText: DEFAULT_MESSAGE,
    intervalMinutes: 1,
    activeOnly: true,
    autoDelete: true,
    autoPin: false,
    enabled: true,
    lastReminderId: null,
    lastReminderAt: 0,
    lastActivityAt: 0,
    lastCheckedActivityAt: 0,
    updateOffset: 0
  };
}

let state = defaultState();
let saveQueue = Promise.resolve();
let reminderQueue = Promise.resolve();

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      state = { ...defaultState(), ...saved };
    }
  } catch (error) {
    console.error("State load error:", error.message);
    state = defaultState();
  }
  return state;
}

function saveState() {
  const snapshot = JSON.stringify(state, null, 2);
  saveQueue = saveQueue
    .then(async () => {
      const tempFile = `${STATE_FILE}.tmp`;
      await fs.promises.writeFile(tempFile, snapshot, "utf8");
      await fs.promises.rename(tempFile, STATE_FILE);
    })
    .catch(error => console.error("State save error:", error.message));
  return saveQueue;
}

function isTargetChat(chatId) {
  // TELEGRAM_CHAT_ID না দিলে /chatid কমান্ড যেকোনো chat থেকে কাজ করবে।
  return CONFIGURED_CHAT_ID && String(chatId) === CONFIGURED_CHAT_ID;
}

function isAdmin(userId) {
  if (ADMIN_IDS.length === 0) return true;
  return ADMIN_IDS.includes(String(userId));
}

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN সেট করা হয়নি।");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.description || `Telegram ${method} failed (${response.status})`);
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function sendText(chatId, text, replyToMessageId = null, useHtml = true) {
  const payload = {
    chat_id: chatId,
    text: String(text),
    disable_web_page_preview: true
  };
  if (useHtml) payload.parse_mode = "HTML";
  if (replyToMessageId) payload.reply_parameters = { message_id: replyToMessageId };

  try {
    return await telegram("sendMessage", payload);
  } catch (error) {
    // ব্যবহারকারীর custom text-এ অসম্পূর্ণ HTML থাকলেও response বন্ধ হবে না।
    if (useHtml && /parse entities|can't parse/i.test(error.message)) {
      delete payload.parse_mode;
      return telegram("sendMessage", payload);
    }
    throw error;
  }
}

async function deleteMessageSafe(chatId, messageId) {
  if (!messageId) return;
  try {
    await telegram("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch (error) {
    console.log("Delete skipped:", error.message);
  }
}

async function unpinMessageSafe(chatId, messageId) {
  if (!messageId) return;
  try {
    await telegram("unpinChatMessage", { chat_id: chatId, message_id: messageId });
  } catch (error) {
    console.log("Unpin skipped:", error.message);
  }
}

async function sendReminder(force = false) {
  if (!state.enabled) return { sent: false, reason: "disabled" };
  if (!BOT_TOKEN || !CONFIGURED_CHAT_ID) return { sent: false, reason: "missing_environment" };

  if (!force && state.activeOnly &&
      (!state.lastActivityAt || state.lastActivityAt <= state.lastCheckedActivityAt)) {
    return { sent: false, reason: "inactive" };
  }

  if (state.lastReminderId && state.autoPin) {
    await unpinMessageSafe(CONFIGURED_CHAT_ID, state.lastReminderId);
  }
  if (state.lastReminderId && state.autoDelete) {
    await deleteMessageSafe(CONFIGURED_CHAT_ID, state.lastReminderId);
  }

  const sent = await sendText(CONFIGURED_CHAT_ID, state.reminderText);

  if (state.autoPin) {
    try {
      await telegram("pinChatMessage", {
        chat_id: CONFIGURED_CHAT_ID,
        message_id: sent.message_id,
        disable_notification: true
      });
    } catch (error) {
      console.log("Pin failed:", error.message);
    }
  }

  state.lastReminderId = sent.message_id;
  state.lastReminderAt = Date.now();
  state.lastCheckedActivityAt = Math.max(state.lastCheckedActivityAt, state.lastActivityAt);
  await saveState();
  return { sent: true, messageId: sent.message_id };
}

function parseOnOff(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["on", "yes", "1", "true"].includes(v)) return true;
  if (["off", "no", "0", "false"].includes(v)) return false;
  return null;
}

function formatDate(timestamp) {
  if (!timestamp) return "এখনও পাঠানো হয়নি";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(new Date(timestamp));
}

function helpText() {
  return `🛡️ <b>Infinity Premium Reminder Bot</b>

<b>Commands</b>

/start অথবা /help — কমান্ড দেখুন
/ping — বট চালু আছে কি না
/chatid — বর্তমান গ্রুপ Chat ID
/status — বর্তমান সেটিংস
/test — এখনই টেস্ট রিমাইন্ডার
/setmessage — নতুন লেখা সেট করুন
/interval 1 — সময় ১ মিনিট
/active on — চ্যাট সক্রিয় থাকলেই পাঠাবে
/active off — চ্যাট শান্ত থাকলেও পাঠাবে
/autodelete on — আগের রিমাইন্ডার ডিলিট
/autopin on — নতুন রিমাইন্ডার Pin
/reminder on — রিমাইন্ডার চালু
/reminder off — রিমাইন্ডার বন্ধ
/showmessage — বর্তমান লেখা দেখুন
/resetmessage — ডিফল্ট লেখা ফিরিয়ে আনুন

<b>নতুন লেখা সেট করার নিয়ম:</b>

<code>/setmessage
আপনার সম্পূর্ণ নতুন লেখা</code>`;
}

const KNOWN_COMMANDS = new Set([
  "/start", "/help", "/ping", "/chatid", "/status", "/test", "/setmessage","/settext",
  "/interval", "/active", "/autodelete", "/autopin", "/reminder",
  "/showmessage","/showtext", "/resetmessage"
]);

async function handleCommand(message) {
  const chatId = String(message.chat?.id || "");
  const text = String(message.text || "");
  const firstLine = text.split("\n")[0].trim();
  const [rawCommand, ...args] = firstLine.split(/\s+/);
  const command = String(rawCommand || "").split("@")[0].toLowerCase();

  if (!KNOWN_COMMANDS.has(command)) return false;

  // ভুল Chat ID হলেও diagnostic command কাজ করবে।
  if (command === "/chatid") {
    await sendText(chatId, `🆔 <b>এই Chat ID:</b> <code>${chatId}</code>`, message.message_id);
    return true;
  }

  if (!CONFIGURED_CHAT_ID) {
    await sendText(chatId,
      `❌ Render-এ <code>TELEGRAM_CHAT_ID</code> সেট করা নেই।\n\nএই গ্রুপের ID: <code>${chatId}</code>`,
      message.message_id);
    return true;
  }

  if (!isTargetChat(chatId)) {
    console.log(`Ignored command from chat ${chatId}; configured chat is ${CONFIGURED_CHAT_ID}`);
    return false;
  }

  if (!isAdmin(message.from?.id)) {
    await sendText(chatId, "⛔ এই কমান্ড শুধু অনুমোদিত অ্যাডমিন ব্যবহার করতে পারবেন।", message.message_id);
    return true;
  }

  if (command === "/start" || command === "/help") {
    await sendText(chatId, helpText(), message.message_id);
    return true;
  }

  if (command === "/ping") {
    await sendText(chatId, "✅ Bot is online and responding.", message.message_id);
    return true;
  }

  if (command === "/status") {
    await sendText(chatId, `🟢 <b>Reminder Bot Status</b>

🤖 Bot: ${state.enabled ? "ON" : "OFF"}
⏱ Interval: ${state.intervalMinutes} minute(s)
💬 Active-only: ${state.activeOnly ? "ON" : "OFF"}
🗑 Auto delete: ${state.autoDelete ? "ON" : "OFF"}
📌 Auto pin: ${state.autoPin ? "ON" : "OFF"}
📢 Last reminder: ${formatDate(state.lastReminderAt)}
🔄 Mode: Polling`, message.message_id);
    return true;
  }

  if (command === "/test") {
    const result = await sendReminder(true);
    await sendText(chatId, result.sent ? "✅ টেস্ট রিমাইন্ডার পাঠানো হয়েছে।" : `❌ পাঠানো যায়নি: ${result.reason}`, message.message_id);
    return true;
  }

  if (command === "/setmessage" || command === "/settext") {
    const newText = text.includes("\n") ? text.substring(text.indexOf("\n") + 1).trim() : "";
    if (!newText) {
      await sendText(chatId, `❌ এভাবে পাঠান:\n\n<code>/setmessage\nআপনার সম্পূর্ণ নতুন লেখা</code>`, message.message_id);
      return true;
    }
    state.reminderText = newText;
    await saveState();
    await sendText(chatId, "✅ নতুন রিমাইন্ডার লেখা সেভ হয়েছে।", message.message_id);
    return true;
  }

  if (command === "/interval") {
    const minutes = Number(args[0]);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      await sendText(chatId, "❌ ১ থেকে ১৪৪০ মিনিটের মধ্যে দিন। উদাহরণ: <code>/interval 1</code>", message.message_id);
      return true;
    }
    state.intervalMinutes = minutes;
    await saveState();
    restartScheduler();
    await sendText(chatId, `✅ রিমাইন্ডার সময় ${minutes} মিনিট করা হয়েছে।`, message.message_id);
    return true;
  }

  const toggleCommands = {
    "/active": ["activeOnly", "Active-only mode"],
    "/autodelete": ["autoDelete", "Auto delete"],
    "/autopin": ["autoPin", "Auto pin"],
    "/reminder": ["enabled", "Reminder"]
  };

  if (toggleCommands[command]) {
    const value = parseOnOff(args[0]);
    if (value === null) {
      await sendText(chatId, `ব্যবহার করুন: <code>${command} on</code> অথবা <code>${command} off</code>`, message.message_id);
      return true;
    }
    const [key, label] = toggleCommands[command];
    state[key] = value;
    await saveState();
    await sendText(chatId, `✅ ${label} ${value ? "ON" : "OFF"} করা হয়েছে।`, message.message_id);
    return true;
  }

  if (command === "/showmessage" || command === "/showtext") {
    await sendText(chatId, `📢 <b>বর্তমান রিমাইন্ডার</b>\n\n${state.reminderText}`, message.message_id);
    return true;
  }

  if (command === "/resetmessage") {
    state.reminderText = DEFAULT_MESSAGE;
    await saveState();
    await sendText(chatId, "✅ ডিফল্ট রিমাইন্ডার ফিরিয়ে আনা হয়েছে।", message.message_id);
    return true;
  }

  return false;
}

function queueImmediateReminder() {
  reminderQueue = reminderQueue
    .then(() => sendReminder(true))
    .catch(error => {
      console.error("Immediate reminder error:", error.stack || error.message);
      return { sent: false, reason: error.message };
    });
  return reminderQueue;
}

async function processUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message || message.from?.is_bot) return;

  const chatId = String(message.chat?.id || "");
  const handled = await handleCommand(message);

  // Target group-এ Admin বা Member যে কেউ যেকোনো সাধারণ message পাঠালেই
  // সঙ্গে সঙ্গে আগের reminder delete করে নতুন reminder পাঠানো হবে।
  if (!handled && isTargetChat(chatId)) {
    state.lastActivityAt = Date.now();
    await saveState();
    await queueImmediateReminder();
  }
}

let pollingRunning = false;
let shuttingDown = false;

async function startPolling() {
  if (pollingRunning || !BOT_TOKEN) return;
  pollingRunning = true;

  try {
    // Pending command মুছে ফেলা হবে না।
    await telegram("deleteWebhook", { drop_pending_updates: false });
    const me = await telegram("getMe");
    console.log(`Polling started as @${me.username} (${me.id})`);
  } catch (error) {
    console.error("Bot startup check failed:", error.message);
  }

  while (!shuttingDown) {
    try {
      const updates = await telegram("getUpdates", {
        offset: Number(state.updateOffset || 0),
        timeout: 50,
        allowed_updates: ["message", "edited_message"]
      });

      for (const update of updates) {
        try {
          await processUpdate(update);
        } catch (error) {
          console.error("Update processing error:", error.stack || error.message);
        } finally {
          state.updateOffset = Math.max(Number(state.updateOffset || 0), update.update_id + 1);
          await saveState();
        }
      }
    } catch (error) {
      console.error("Polling error:", error.message);
      await sleep(5000);
    }
  }

  pollingRunning = false;
}

let scheduler = null;
function restartScheduler() {
  if (scheduler) clearInterval(scheduler);
  const intervalMs = Math.max(1, Number(state.intervalMinutes || 1)) * 60 * 1000;
  scheduler = setInterval(async () => {
    try {
      console.log("Scheduler result:", await sendReminder(false));
    } catch (error) {
      console.error("Scheduler error:", error.message);
    }
  }, intervalMs);
  console.log(`Scheduler started: every ${state.intervalMinutes} minute(s)`);
}

app.get("/", (req, res) => {
  res.status(200).send("Infinity Premium Reminder Bot Polling Mode is running.");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mode: "polling",
    pollingRunning,
    chatIdConfigured: Boolean(CONFIGURED_CHAT_ID),
    tokenConfigured: Boolean(BOT_TOKEN),
    adminRestrictionEnabled: ADMIN_IDS.length > 0,
    lastReminderAt: state.lastReminderAt || null,
    lastActivityAt: state.lastActivityAt || null
  });
});

process.on("SIGTERM", async () => {
  shuttingDown = true;
  if (scheduler) clearInterval(scheduler);
  await saveState();
  process.exit(0);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled rejection:", error?.stack || error);
});

loadState();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!BOT_TOKEN) console.error("Missing TELEGRAM_BOT_TOKEN");
  if (!CONFIGURED_CHAT_ID) console.error("Missing TELEGRAM_CHAT_ID — use /chatid to find it");
  restartScheduler();
  startPolling();
});
