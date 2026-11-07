import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GROUP_LABELS, PARENT_GROUP, scheduleKeyboard } from '../_shared/schedule-groups.ts'
import { findNextLesson } from './next-lesson.ts'

interface TelegramMessage {
  chat: { id: number; type: string }
  from?: { id: number; is_bot: boolean }
  sender_chat?: unknown
  message_thread_id?: number
  text?: string
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })

  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!webhookSecret || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
    return new Response(null, { status: 403 })
  }

  let message: TelegramMessage | undefined
  try {
    message = (await request.json())?.message
  } catch {
    return new Response(null, { status: 400 })
  }

  if (!message || !['group', 'supergroup'].includes(message.chat.type) || message.from?.is_bot) {
    return new Response('ok')
  }
  const chatId = message.chat.id
  const [command, ...args] = message.text?.trim().split(/\s+/) ?? []
  const match = command?.match(/^\/(next|bindgroup|unbindgroup)(?:@([a-z0-9_]+))?$/i)
  const botUsername = Deno.env.get('TELEGRAM_BOT_USERNAME') || 'opezdolibot'
  if (!match || (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase())) {
    return new Response('ok')
  }

  const action = match[1].toLowerCase()
  const reply = (text: string, group?: string) => Response.json({
    method: 'sendMessage',
    chat_id: chatId,
    ...(message.message_thread_id ? { message_thread_id: message.message_thread_id } : {}),
    text,
    ...(group ? { reply_markup: scheduleKeyboard(group) } : {}),
  })

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    if (action !== 'next') {
      if (!message.from || message.sender_chat) {
        return reply('Для цієї команди вимкніть анонімність адміністратора.')
      }
      const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
      if (!token) throw new Error('Missing Telegram bot token')
      const response = await fetch(`https://api.telegram.org/bot${token}/getChatAdministrators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      }).catch(() => null)
      if (!response?.ok) throw new Error('Telegram administrator lookup failed')
      const admins = await response.json()
      if (!admins.ok || !Array.isArray(admins.result)) throw new Error('Invalid administrator lookup result')
      if (!admins.result.some((admin: { user: { id: number } }) => admin.user.id === message.from?.id)) {
        return reply('Змінити прив’язку може лише адміністратор цього чату.')
      }

      if (action === 'unbindgroup') {
        const { error } = await db.from('telegram_schedule_chats').delete().eq('chat_id', chatId)
        if (error) throw error
        return reply('Прив’язку видалено. Сповіщення про зміни розкладу вимкнено.')
      }

      const group = Object.keys(GROUP_LABELS).find(code => code.toLowerCase() === args[0]?.toLowerCase())
      if (!group || args.length !== 1) {
        return reply(`Вкажіть групу після /bindgroup. Доступні коди: ${Object.keys(GROUP_LABELS).join(', ')}.`)
      }
      const { error } = await db.from('telegram_schedule_chats')
        .upsert({ chat_id: chatId, group_code: group, updated_at: new Date().toISOString() })
      if (error) throw error
      return reply(`Чат прив’язано до групи ${GROUP_LABELS[group]}. Спробуйте /next.`, group)
    }

    const { data: binding, error: bindingError } = await db.from('telegram_schedule_chats')
      .select('group_code').eq('chat_id', chatId).maybeSingle()
    if (bindingError) throw bindingError
    if (!binding) return reply('Адміністратор чату може прив’язати групу командою /bindgroup AR-26-1.')

    const group = binding.group_code
    const { data: rows, error } = await db.from('schedule_lessons')
      .select('group_code, day_of_week, pair_number, subject, classroom')
      .in('group_code', [group, PARENT_GROUP[group]].filter(Boolean))
    if (error) throw error
    const next = findNextLesson(rows ?? [], group)
    if (!next) return reply(`${GROUP_LABELS[group]} · У розкладі поки немає наступної пари.`, group)

    return reply(
      `${GROUP_LABELS[group]} · ${next.date}, ${next.time}\n${next.subject}${next.classroom ? `\nАуд. ${next.classroom}` : ''}`,
      group,
    )
  } catch {
    console.error('Telegram group command failed:', action)
    return new Response('Temporary failure', { status: 503 })
  }
})
