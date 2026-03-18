import { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

async function getVapidKey(): Promise<string | null> {
  try {
    const r = await api.get('/push/vapid-public-key')
    return r.data.vapid_public_key || null
  } catch {
    return null
  }
}

export function usePushNotifications() {
  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!isSupported) return
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      setRegistration(reg)
      reg.pushManager.getSubscription().then((sub) => setIsSubscribed(!!sub))
    })
  }, [isSupported])

  const subscribe = useCallback(async () => {
    if (!registration) return
    const vapidKey = await getVapidKey()
    try {
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        ...(vapidKey ? { applicationServerKey: urlBase64ToUint8Array(vapidKey) } : {}),
      })
      const json = sub.toJSON() as any
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh || '',
        auth: json.keys?.auth || '',
      })
      setIsSubscribed(true)
    } catch (e) {
      console.warn('Push subscribe failed:', e)
    }
  }, [registration])

  const unsubscribe = useCallback(async () => {
    if (!registration) return
    const sub = await registration.pushManager.getSubscription()
    if (!sub) return
    const json = sub.toJSON() as any
    await sub.unsubscribe()
    try {
      await api.delete('/push/subscribe', {
        data: { endpoint: json.endpoint, p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
      })
    } catch {}
    setIsSubscribed(false)
  }, [registration])

  /** Send a local (non-server) notification — works without VAPID setup */
  const notifyLocal = useCallback((title: string, body: string, url = '/') => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico', data: { url } })
    }
  }, [])

  return { isSupported, isSubscribed, subscribe, unsubscribe, notifyLocal }
}
