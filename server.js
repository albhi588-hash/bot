const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "");
const ADMIN_IDS = String(process.env.ADMIN_IDS || "")
  .split(",")
  .map(v => v.trim())
  .filter(Boolean);

const STATE_FILE = path.join(__dirname, "state.json");

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

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...defaultState(), ...saved };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isAdmin(userId) {
  if (ADMIN_IDS.length === 0) return true;
  return ADMIN_IDS.includes(String(userId));
}

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN সেট করা হয়নি।");

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || `${method} failed`);
  }

  return data.result;
}

async function sendText(chatId, text, replyToMessageId = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (replyToMessageId) {
    payload.reply_parameters = { message_id: replyToMessageId };
  }

  return telegram("sendMessage", payload);
}

async function deleteMessageSafe(chatId, messageId) {
  if (!messageId) return;

  try {
    await telegram("deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (error) {
    console.log("Delete skipped:", error.message);
  }
}

async function unpinMessageSafe(chatId, messageId) {
  if (!messageId) return;

  try {
    await telegram("unpinChatMessage", {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (error) {
    console.log("Unpin skipped:", error.message);
  }
}

async function sendReminder(force = false) {
  const state = loadState();

  if (!state.enabled) return { sent: false, reason: "disabled" };

  if (!BOT_TOKEN || !CHAT_ID) {
    return { sent: false, reason: "missing_environment" };
  }

  if (
    !force &&
    state.activeOnly &&
    (!state.lastActivityAt || state.lastActivityAt <= state.lastCheckedActivityAt)
  ) {
    return { sent: false, reason: "inactive" };
  }

  if (state.lastReminderId && state.autoPin) {
    await unpinMessageSafe(CHAT_ID, state.lastReminderId);
  }

  if (state.lastReminderId && state.autoDelete) {
    await deleteMessageSafe(CHAT_ID, state.lastReminderId);
  }

  const sent = await sendText(CHAT_ID, state.reminderText);

  if (state.autoPin) {
    try {
      await telegram("pinChatMessage", {
        chat_id: CHAT_ID,
        message_id: sent.message_id,
        disable_notification: true
      });
    } catch (error) {
      console.log("Pin failed:", error.message);
    }
  }

  state.lastReminderId = sent.message_id;
  state.lastReminderAt = Date.now();
  state.lastCheckedActivityAt = Math.max(
    state.lastCheckedActivityAt,
    state.lastActivityAt
  );
  saveState(state);

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

async function handleCommand(message) {
  const chatId = String(message.chat?.id || "");

  if (chatId !== CHAT_ID) return false;

  const text = String(message.text || "");
  const firstLine = text.split("\n")[0].trim();
  const [rawCommand, ...args] = firstLine.split(/\s+/);
  const command = String(rawCommand || "").split("@")[0].toLowerCase();

  const knownCommands = [
    "/start", "/help", "/status", "/test", "/setmessage",
    "/interval", "/active", "/autodelete", "/autopin",
    "/reminder", "/showmessage", "/resetmessage"
  ];

  if (!knownCommands.includes(command)) return false;

  if (!isAdmin(message.from?.id)) {
    await sendText(
      chatId,
      "⛔ এই কমান্ড শুধু অনুমোদিত অ্যাডমিন ব্যবহার করতে পারবেন।",
      message.message_id
    );
    return true;
  }

  const state = loadState();

  if (command === "/start" || command === "/help") {
    await sendText(chatId, helpText(), message.message_id);
    return true;
  }

  if (command === "/status") {
    await sendText(
      chatId,
      `🟢 <b>Reminder Bot Status</b>

🤖 Bot: ${state.enabled ? "ON" : "OFF"}
⏱ Interval: ${state.intervalMinutes} minute(s)
💬 Active-only: ${state.activeOnly ? "ON" : "OFF"}
🗑 Auto delete: ${state.autoDelete ? "ON" : "OFF"}
📌 Auto pin: ${state.autoPin ? "ON" : "OFF"}
📢 Last reminder: ${formatDate(state.lastReminderAt)}
🔄 Mode: Polling`,
      message.message_id
    );
    return true;
  }

  if (command === "/test") {
    const result = await sendReminder(true);

    await sendText(
      chatId,
      result.sent
        ? "✅ টেস্ট রিমাইন্ডার পাঠানো হয়েছে।"
        : `❌ পাঠানো যায়নি: ${result.reason}`,
      message.message_id
    );
    return true;
  }

  if (command === "/setmessage") {
    const newText = text.includes("\n")
      ? text.substring(text.indexOf("\n") + 1).trim()
      : "";

    if (!newText) {
      await sendText(
        chatId,
        `❌ এভাবে পাঠান:

<code>/setmessage
আপনার সম্পূর্ণ নতুন লেখা</code>`,
        message.message_id
      );
      return true;
    }

    state.reminderText = newText;
    saveState(state);

    await sendText(
      chatId,
      "✅ নতুন রিমাইন্ডার লেখা সেভ হয়েছে।",
      message.message_id
    );
    return true;
  }

  if (command === "/interval") {
    const minutes = Number(args[0]);

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      await sendText(
        chatId,
        "❌ ১ থেকে ১৪৪০ মিনিটের মধ্যে দিন। উদাহরণ: <code>/interval 1</code>",
        message.message_id
      );
      return true;
    }

    state.intervalMinutes = minutes;
    saveState(state);
    restartScheduler();

    await sendText(
      chatId,
      `✅ রিমাইন্ডার সময় ${minutes} মিনিট করা হয়েছে।`,
      message.message_id
    );
    return true;
  }

  if (command === "/active") {
    const value = parseOnOff(args[0]);

    if (value === null) {
      await sendText(
        chatId,
        "ব্যবহার করুন: <code>/active on</code> অথবা <code>/active off</code>",
        message.message_id
      );
      return true;
    }

    state.activeOnly = value;
    saveState(state);

    await sendText(
      chatId,
      `✅ Active-only mode ${value ? "ON" : "OFF"} করা হয়েছে।`,
      message.message_id
    );
    return true;
  }

  if (command === "/autodelete") {
    const value = parseOnOff(args[0]);

    if (value === null) {
      await sendText(
        chatId,
        "ব্যবহার করুন: <code>/autodelete on</code> অথবা <code>/autodelete off</code>",
        message.message_id
      );
      return true;
    }

    state.autoDelete = value;
    saveState(state);

    await sendText(
      chatId,
      `✅ Auto delete ${value ? "ON" : "OFF"} করা হয়েছে।`,
      message.message_id
    );
    return true;
  }

  if (command === "/autopin") {
    const value = parseOnOff(args[0]);

    if (value === null) {
      await sendText(
        chatId,
        "ব্যবহার করুন: <code>/autopin on</code> অথবা <code>/autopin off</code>",
        message.message_id
      );
      return true;
    }

    state.autoPin = value;
    saveState(state);

    await sendText(
      chatId,
      `✅ Auto pin ${value ? "ON" : "OFF"} করা হয়েছে।`,
      message.message_id
    );
    return true;
  }

  if (command === "/reminder") {
    const value = parseOnOff(args[0]);

    if (value === null) {
      await sendText(
        chatId,
        "ব্যবহার করুন: <code>/reminder on</code> অথবা <code>/reminder off</code>",
        message.message_id
      );
      return true;
    }

    state.enabled = value;
    saveState(state);

    await sendText(
      chatId,
      `✅ Reminder ${value ? "ON" : "OFF"} করা হয়েছে।`,
      message.message_id
    );
    return true;
  }

  if (command === "/showmessage") {
    await sendText(
      chatId,
      `📢 <b>বর্তমান রিমাইন্ডার</b>

${state.reminderText}`,
      message.message_id
    );
    return true;
  }

  if (command === "/resetmessage") {
    state.reminderText = DEFAULT_MESSAGE;
    saveState(state);

    await sendText(
      chatId,
      "✅ ডিফল্ট রিমাইন্ডার ফিরিয়ে আনা হয়েছে।",
      message.message_id
    );
    return true;
  }

  return false;
}

async function processUpdate(update) {
  const message = update.message || update.edited_message;

  if (!message) return;
  if (String(message.chat?.id || "") !== CHAT_ID) return;
  if (message.from?.is_bot) return;

  const handled = await handleCommand(message);

  if (!handled) {
    const state = loadState();
    state.lastActivityAt = Date.now();
    saveState(state);
  }
}

let pollingRunning = false;

async function startPolling() {
  if (pollingRunning) return;
  pollingRunning = true;

  try {
    await telegram("deleteWebhook", {
      drop_pending_updates: true
    });

    console.log("Webhook removed. Polling mode started.");
  } catch (error) {
    console.error("Webhook remove error:", error.message);
  }

  while (true) {
    try {
      const state = loadState();

      const updates = await telegram("getUpdates", {
        offset: state.updateOffset || 0,
        timeout: 50,
        allowed_updates: ["message", "edited_message"]
      });

      for (const update of updates) {
        try {
          await processUpdate(update);
        } catch (error) {
          console.error("Update processing error:", error.message);
        }

        const latest = loadState();
        latest.updateOffset = update.update_id + 1;
        saveState(latest);
      }
    } catch (error) {
      console.error("Polling error:", error.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

let scheduler = null;

function restartScheduler() {
  if (scheduler) clearInterval(scheduler);

  const state = loadState();
  const intervalMs = Math.max(1, state.intervalMinutes) * 60 * 1000;

  scheduler = setInterval(async () => {
    try {
      const result = await sendReminder(false);
      console.log("Scheduler result:", result);
    } catch (error) {
      console.error("Scheduler error:", error.message);
    }
  }, intervalMs);

  console.log(`Scheduler started: every ${state.intervalMinutes} minute(s)`);
}

app.get("/", (req, res) => {
  res.send("Infinity Premium Reminder Bot Polling Mode is running.");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mode: "polling",
    chatIdConfigured: Boolean(CHAT_ID),
    tokenConfigured: Boolean(BOT_TOKEN)
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  restartScheduler();
  startPolling();
});