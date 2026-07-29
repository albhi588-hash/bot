# Infinity Premium Reminder Bot — Immediate Response Version

## কাজ
- গ্রুপে Admin বা Member যে কেউ যেকোনো সাধারণ message পাঠালেই সঙ্গে সঙ্গে reminder পাঠাবে।
- শুধু `.`, `o`, `hi`, sticker, photo বা অন্য message হলেও কাজ করবে।
- নতুন reminder পাঠানোর আগে আগের reminder delete করবে।
- প্রতি ১ মিনিটের scheduler-ও চালু থাকবে।
- Polling mode; webhook প্রয়োজন নেই।

## Render Environment Variables
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ADMIN_IDS` (ঐচ্ছিক, শুধু command restriction-এর জন্য)

## Test
গ্রুপে শুধু `.` পাঠান। বট সঙ্গে সঙ্গে reminder পাঠাবে।
