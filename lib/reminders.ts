import fs from 'fs/promises'
import path from 'path'
import { HabitsData, Settings, getDefaultSettings } from './types'
import { getNow, isHabitCompleted, isHabitDueToday } from './utils'
import { sendPushToUsers } from './push'

// "habitId@HH:mm" -> ISO date the reminder was last sent, so each reminder fires at most once a day
const lastSent = new Map<string, string>()

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', file), 'utf8')) as T
  } catch {
    return fallback
  }
}

async function getReminderBodyTemplate(language: string): Promise<string> {
  const fallback = "{name} isn't done yet today"
  try {
    const messages = await import(`../messages/${language}.json`)
    return messages.default?.Reminders?.notificationBody ?? fallback
  } catch {
    return fallback
  }
}

// Runs every minute: notify owners of habits whose reminder time has arrived and that aren't done yet today
export async function checkHabitReminders(): Promise<void> {
  const settings = await readJson<Settings>('settings.json', getDefaultSettings())
  const { habits } = await readJson<HabitsData>('habits.json', { habits: [] })
  const timezone = settings.system.timezone
  const now = getNow({ timezone })
  const today = now.toISODate()!
  const currentTime = now.toFormat('HH:mm')
  const bodyTemplate = await getReminderBodyTemplate(settings.system.language)

  for (const habit of habits) {
    if (!habit.reminderTime || habit.archived || !habit.userIds?.length) continue
    const key = `${habit.id}@${habit.reminderTime}`
    if (habit.reminderTime > currentTime || lastSent.get(key) === today) continue
    // Only catch up on reminders missed within the last hour (e.g. after a restart)
    if (now.diff(now.set({
      hour: Number(habit.reminderTime.slice(0, 2)),
      minute: Number(habit.reminderTime.slice(3, 5)),
    }), 'minutes').minutes > 60) continue

    lastSent.set(key, today)
    if (!isHabitDueToday({ habit, timezone }) || isHabitCompleted(habit, timezone)) continue

    await sendPushToUsers(habit.userIds, {
      title: habit.name,
      body: habit.description || bodyTemplate.replace('{name}', habit.name),
      url: '/habits',
      tag: `habit-${habit.id}`,
    })
  }
}
