# Infinity Premium Reminder Bot v3

Telegram গ্রুপ থেকেই সব নিয়ন্ত্রণ করা যাবে।

## Commands

- `/start`
- `/help`
- `/status`
- `/test`
- `/setmessage`
- `/interval 1`
- `/active on`
- `/active off`
- `/autodelete on`
- `/autodelete off`
- `/autopin on`
- `/autopin off`
- `/reminder on`
- `/reminder off`
- `/showmessage`
- `/resetmessage`

## Environment Variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RENDER_EXTERNAL_URL`
- `ADMIN_IDS` — ঐচ্ছিক; একাধিক Telegram numeric user ID কমা দিয়ে লিখুন

উদাহরণ:

`123456789,987654321`

ADMIN_IDS ফাঁকা রাখলে গ্রুপের সবাই কমান্ড ব্যবহার করতে পারবে। নিরাপত্তার জন্য অবশ্যই নিজের Telegram numeric ID দিন।

## Render

Build Command:

`npm install`

Start Command:

`npm start`

Deploy হওয়ার পর খুলুন:

`https://আপনার-সার্ভিস.onrender.com/set-webhook`

## Telegram Bot Permissions

- Delete Messages
- Pin Messages
- BotFather → `/setprivacy` → Disable