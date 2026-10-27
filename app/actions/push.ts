'use server'

import { getCurrentUser } from '@/lib/server-helpers'
import { getVapidKeys, loadPushSubscriptions, savePushSubscriptions, sendPushToUsers } from '@/lib/push'

export async function getVapidPublicKey(): Promise<string> {
  const { publicKey } = await getVapidKeys()
  return publicKey
}

export async function subscribeUser(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'User not authenticated' }

  const data = await loadPushSubscriptions()
  // One device (endpoint) belongs to whoever subscribed it most recently
  const subscriptions = data.subscriptions.filter(s => s.endpoint !== sub.endpoint)
  subscriptions.push({
    userId: user.id,
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    createdAt: new Date().toISOString(),
  })
  await savePushSubscriptions({ subscriptions })
  return { success: true }
}

export async function unsubscribeUser(endpoint: string) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'User not authenticated' }

  const data = await loadPushSubscriptions()
  await savePushSubscriptions({
    subscriptions: data.subscriptions.filter(s => !(s.endpoint === endpoint && s.userId === user.id))
  })
  return { success: true }
}

export async function sendTestNotification(title: string, body: string) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'User not authenticated' }

  const sent = await sendPushToUsers([user.id], { title, body, url: '/habits', tag: 'test' })
  return sent > 0 ? { success: true } : { success: false, error: 'No subscribed devices' }
}
