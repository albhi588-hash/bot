# Infinity Premium Reminder Bot — Polling Mode v4

Webhook লাগবে না।

## Environment Variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ADMIN_IDS` — ঐচ্ছিক, কিন্তু নিরাপত্তার জন্য নিজের Telegram numeric ID দিন

`RENDER_EXTERNAL_URL` এই ভার্সনে দরকার নেই।

## Render Commands

Build Command:

`npm install`

Start Command:

`npm start`

## Commands

- `/start`
- `/status`
- `/test`
- `/interval 1`
- `/active on`
- `/autodelete on`
- `/autopin on`
- `/reminder on`
- `/showmessage`
- `/resetmessage`

নতুন লেখা:

`/setmessage`
এর পরের লাইনে সম্পূর্ণ লেখা দিন।

## গুরুত্বপূর্ণ

1. BotFather → `/setprivacy` → Disable
2. বটকে গ্রুপে Admin করুন
3. Delete Messages অনুমতি দিন
4. Pin ব্যবহার করলে Pin Messages অনুমতি দিন
5. গ্রুপে Rose Bot থাকলে নিজের বটের username সহ কমান্ড দিন:
   `/status@YourBotUsername`

## Render Free

Render Free service inactivity-তে sleep করতে পারে। তখন polling বন্ধ থাকবে যতক্ষণ সার্ভিস আবার জাগে।