import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const CONTACT_MESSAGES = new Set([
  '😭 결석합니다', '🙇 지각할 것 같아요', '🇨🇳 중국어 잘 하고 싶어요', '✈️ 중국 가고 싶어요',
  '🥲 공부하기 싫어요', '🧠 단어가 안 외워져요', '😵 오늘 머리가 안 돌아가요', '🫠 숙제 미뤘어요',
  '🤯 성조가 또 틀렸어요', '😶‍🌫️ 아는 단어인데 입에서 안 나와요', '🛌 오늘은 쉬고 싶어요',
  '☕ 일단 커피부터요', '🐌 중국어가 안 늘어요', '📚 공부한 건 많은데 기억이 안 나요',
])

const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors })
const fail = (message: string, status = 400) => ok({ error: message }, status)

async function bodyJson(req: Request) {
  try { return await req.json() } catch { return {} }
}

async function currentUser(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data: session } = await supabase
    .from('app_sessions')
    .select('user_id')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!session) return null
  const { data: user } = await supabase
    .from('app_users')
    .select('id,username,role,active')
    .eq('id', session.user_id)
    .eq('active', true)
    .maybeSingle()
  return user || null
}

async function pushConfig() {
  const { data, error } = await supabase
    .from('app_push_config')
    .select('public_key,private_key,subject')
    .eq('id', 1)
    .single()
  if (error || !data) throw new Error('PUSH_CONFIG_MISSING')
  webpush.setVapidDetails(data.subject, data.public_key, data.private_key)
  return data
}

async function sendToUserIds(userIds: string[], payload: Record<string, unknown>) {
  if (!userIds.length) return { sent: 0, failed: 0, removed: 0 }
  await pushConfig()
  const { data: subscriptions, error } = await supabase
    .from('app_push_subscriptions')
    .select('endpoint,p256dh,auth')
    .in('user_id', userIds)
  if (error) throw error

  let sent = 0, failed = 0, removed = 0
  await Promise.all((subscriptions || []).map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60 * 24 })
      sent += 1
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode || 0)
      if (status === 404 || status === 410) {
        await supabase.from('app_push_subscriptions').delete().eq('endpoint', sub.endpoint)
        removed += 1
      } else {
        console.error('push send failed', status, String(error))
        failed += 1
      }
    }
  }))
  return { sent, failed, removed }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const path = new URL(req.url).pathname.replace(/^.*\/push-api\/?/, '/')

  try {
    if (path === '/health' && req.method === 'GET') return ok({ ok: true })

    const user = await currentUser(req)
    if (!user) return fail('로그인이 필요합니다.', 401)

    if (path === '/public-key' && req.method === 'GET') {
      const config = await pushConfig()
      return ok({ publicKey: config.public_key })
    }

    if (path === '/subscribe' && req.method === 'POST') {
      const body = await bodyJson(req)
      const sub = body.subscription || {}
      const endpoint = String(sub.endpoint || '')
      const p256dh = String(sub.keys?.p256dh || '')
      const auth = String(sub.keys?.auth || '')
      if (!endpoint.startsWith('https://') || !p256dh || !auth) return fail('알림 구독정보가 올바르지 않아요.')

      const { error } = await supabase.from('app_push_subscriptions').upsert({
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        expiration_time: sub.expirationTime || null,
        user_agent: String(req.headers.get('user-agent') || '').slice(0, 500),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error
      return ok({ ok: true })
    }

    if (path === '/unsubscribe' && req.method === 'POST') {
      const body = await bodyJson(req)
      const endpoint = String(body.endpoint || '')
      if (endpoint) {
        const { error } = await supabase.from('app_push_subscriptions')
          .delete().eq('user_id', user.id).eq('endpoint', endpoint)
        if (error) throw error
      }
      return ok({ ok: true })
    }

    if (path === '/test' && req.method === 'POST') {
      const result = await sendToUserIds([user.id], {
        title: '린중국어 알림',
        body: '푸시 알림이 정상적으로 연결됐어요.',
        url: '/',
        tag: 'push-test',
      })
      return ok(result)
    }

    if (path === '/send' && req.method === 'POST') {
      const body = await bodyJson(req)
      const kind = String(body.kind || '')
      const title = String(body.title || '').slice(0, 80)
      const message = String(body.body || '').slice(0, 180)
      const url = String(body.url || '/').startsWith('/') ? String(body.url || '/') : '/'
      if (!title || !message) return fail('알림 제목과 내용이 필요합니다.')

      let query = supabase.from('app_users').select('id').eq('active', true)
      if (kind === 'assignment' || kind === 'notice') {
        if (user.role !== 'teacher') return fail('선생님만 보낼 수 있는 알림입니다.', 403)
        query = query.eq('role', 'student')
      } else if (kind === 'feedback') {
        if (user.role !== 'teacher') return fail('선생님만 보낼 수 있는 알림입니다.', 403)
        const target = String(body.targetUsername || '')
        if (!target) return fail('알림을 받을 학생이 필요합니다.')
        query = query.eq('role', 'student').eq('username', target)
      } else if (kind === 'submission') {
        if (user.role !== 'student') return fail('학생만 보낼 수 있는 알림입니다.', 403)
        query = query.eq('role', 'teacher')
      } else if (kind === 'contact') {
        if (user.role !== 'student') return fail('학생만 보낼 수 있는 알림입니다.', 403)
        if (!CONTACT_MESSAGES.has(message)) return fail('허용되지 않은 메시지입니다.')
        const target = String(body.target || '')
        if (target === 'teacher') {
          query = query.eq('role', 'teacher')
        } else if (target === 'students') {
          const targetUsernames = [...new Set(Array.isArray(body.targetUsernames) ? body.targetUsernames.map(String).filter(Boolean) : [])].slice(0, 100)
          if (!targetUsernames.length) return fail('알림을 받을 학생이 필요합니다.')
          query = query.eq('role', 'student').in('username', targetUsernames).neq('username', user.username)
        } else {
          return fail('알림을 받을 대상을 선택해주세요.')
        }
      } else {
        return fail('허용되지 않은 알림 종류입니다.')
      }

      const { data: targets, error } = await query
      if (error) throw error
      const result = await sendToUserIds((targets || []).map((target) => target.id), {
        title: kind === 'contact' ? user.username : title,
        body: message,
        url,
        tag: `${kind}-${String(body.eventId || Date.now())}`.slice(0, 120),
      })
      return ok(result)
    }

    return fail('없는 API입니다.', 404)
  } catch (error) {
    console.error(error)
    return fail('푸시 알림 서버 처리 중 오류가 발생했어요.', 500)
  }
})
