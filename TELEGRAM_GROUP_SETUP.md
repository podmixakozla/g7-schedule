# Telegram-група

1. Застосуйте міграцію `014_telegram_schedule_chats.sql` у проєкті Supabase.
2. Додайте секрет `TELEGRAM_WEBHOOK_SECRET` у Supabase. Згенеруйте випадкове значення, наприклад `openssl rand -hex 32`. Функція використовує наявний `TELEGRAM_BOT_TOKEN`. Якщо username бота змінився, задайте `TELEGRAM_BOT_USERNAME` без `@`.
3. Розгорніть Edge Functions `telegram-group-bot` і `sync-schedule`. Для `telegram-group-bot` JWT-перевірка вимкнена в `supabase/config.toml`, оскільки запити Telegram перевіряються за заголовком секрету.
4. Перевірте `getWebhookInfo` для бота. Якщо він уже використовує інший webhook або long polling, узгодьте перенесення прийому повідомлень перед зміною. Викличте `setWebhook` з URL `https://<project-ref>.supabase.co/functions/v1/telegram-group-bot`, `secret_token` з кроку 2 та `allowed_updates: ["message"]`.
5. Додайте бота в чат. Адміністратор чату виконує `/bindgroup@opezdolibot AR-26-1` (також доступні `AR-26-2` і `AR-26sk-1`). Учасники можуть викликати `/next@opezdolibot`. Команда `/unbindgroup@opezdolibot` вимикає прив’язку та сповіщення.

Сповіщення надходять після звичайної синхронізації, коли змінився розклад прив’язаної групи. Перший імпорт не розсилається. Команда `/next` шукає заняття за київським часом у межах наявного навчального календаря.
