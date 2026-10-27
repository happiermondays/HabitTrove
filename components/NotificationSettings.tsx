'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, BellOff, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { getVapidPublicKey, sendTestNotification, subscribeUser, unsubscribeUser } from '@/app/actions/push'

type Status = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function getRegistration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js')
}

export default function NotificationSettings() {
  const t = useTranslations('NotificationSettings')
  const [status, setStatus] = useState<Status>('loading')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setStatus('denied')
        return
      }
      const registration = await getRegistration()
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Re-register so the server links this device to the current user
        await subscribeUser(subscription.toJSON() as Parameters<typeof subscribeUser>[0])
      }
      setStatus(subscription ? 'subscribed' : 'unsubscribed')
    })()
  }, [])

  const enable = async () => {
    setIsBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'unsubscribed')
        return
      }
      const registration = await getRegistration()
      await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(await getVapidPublicKey()),
      })
      const result = await subscribeUser(subscription.toJSON() as Parameters<typeof subscribeUser>[0])
      if (!result.success) throw new Error(result.error)
      setStatus('subscribed')
      toast({ title: t('enabledTitle'), description: t('enabledDescription') })
    } catch (error) {
      console.error('Failed to enable notifications:', error)
      toast({ title: t('errorTitle'), description: t('errorDescription'), variant: 'destructive' })
    } finally {
      setIsBusy(false)
    }
  }

  const disable = async () => {
    setIsBusy(true)
    try {
      const registration = await getRegistration()
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await unsubscribeUser(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setStatus('unsubscribed')
    } finally {
      setIsBusy(false)
    }
  }

  const test = async () => {
    setIsBusy(true)
    try {
      const result = await sendTestNotification(t('testTitle'), t('testBody'))
      if (!result.success) {
        toast({ title: t('errorTitle'), description: t('testFailedDescription'), variant: 'destructive' })
      }
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label>{t('deviceLabel')}</Label>
            <div className="text-sm text-muted-foreground">
              {status === 'unsupported' && t('unsupportedDescription')}
              {status === 'denied' && t('deniedDescription')}
              {status === 'subscribed' && t('subscribedDescription')}
              {(status === 'unsubscribed' || status === 'loading') && t('unsubscribedDescription')}
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            {status === 'subscribed' && (
              <>
                <Button variant="outline" size="sm" onClick={test} disabled={isBusy}>
                  <Send className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('testButton')}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={disable} disabled={isBusy}>
                  <BellOff className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('disableButton')}</span>
                </Button>
              </>
            )}
            {status === 'unsubscribed' && (
              <Button size="sm" onClick={enable} disabled={isBusy}>
                <Bell className="h-4 w-4 mr-2" />
                {t('enableButton')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
