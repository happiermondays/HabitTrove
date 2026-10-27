import webpush from 'web-push'
import fs from 'fs/promises'
import path from 'path'
import { PushSubscriptionRecord, PushSubscriptionsData, UserId } from './types'

const dataDir = path.join(process.cwd(), 'data')
const subscriptionsPath = path.join(dataDir, 'push-subscriptions.json')
const vapidKeysPath = path.join(dataDir, 'vapid-keys.json')

type VapidKeys = { publicKey: string; privateKey: string }

let vapidKeys: VapidKeys | null = null

// Use VAPID keys from env when provided, otherwise generate a pair once and persist it in /data
export async function getVapidKeys(): Promise<VapidKeys> {
  if (vapidKeys) return vapidKeys

  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = {
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    }
  } else {
    try {
      vapidKeys = JSON.parse(await fs.readFile(vapidKeysPath, 'utf8')) as VapidKeys
    } catch {
      vapidKeys = webpush.generateVAPIDKeys()
      await fs.mkdir(dataDir, { recursive: true })
      await fs.writeFile(vapidKeysPath, JSON.stringify(vapidKeys, null, 2))
    }
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:mydohsimpson@gmail.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  )
  return vapidKeys
}

export async function loadPushSubscriptions(): Promise<PushSubscriptionsData> {
  try {
    return JSON.parse(await fs.readFile(subscriptionsPath, 'utf8')) as PushSubscriptionsData
  } catch {
    return { subscriptions: [] }
  }
}

export async function savePushSubscriptions(data: PushSubscriptionsData): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(subscriptionsPath, JSON.stringify(data, null, 2))
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

// Send a notification to every device the given users subscribed. Returns the number of devices reached.
export async function sendPushToUsers(userIds: UserId[], payload: PushPayload): Promise<number> {
  await getVapidKeys()
  const data = await loadPushSubscriptions()
  const targets = data.subscriptions.filter(s => userIds.includes(s.userId))
  const expired: string[] = []
  let sent = 0

  await Promise.all(targets.map(async (sub: PushSubscriptionRecord) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ icon: '/icons/web-app-manifest-192x192.png', ...payload })
      )
      sent++
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Subscription is gone (browser unsubscribed or expired)
        expired.push(sub.endpoint)
      } else {
        console.error('Error sending push notification:', error)
      }
    }
  }))

  if (expired.length > 0) {
    await savePushSubscriptions({
      subscriptions: data.subscriptions.filter(s => !expired.includes(s.endpoint))
    })
  }
  return sent
}
