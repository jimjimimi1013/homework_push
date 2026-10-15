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
  '😭 결석합니다', '🙇 지각할 것 같아요', '🙏 숙제 알려주세요 선생님', '😎 훗 오늘 공부 좀 했어요', '✅ 숙제 완료!',
  '🔥 의욕(만) 넘치는 하루', '🀄 단어 외우는 중', '🥳 오늘 수업 너무 재밌고 유익했어요',
  '💪 예습 복습 완료!', '🇨🇳 중국어 잘 하고 싶어요', '✈️ 중국 가고 싶어요',
  '🙌 칭찬이 필요한 늙크크..', '🧠 단어가 안 외워져요', '😵 오늘 머리가 안 돌아가요',
  '😶‍🌫️ 아는 단어인데 입에서 안 나와요', '🐌 중국어가 안 늘어요',
  '📚 공부한 건 많은데 기억이 안 나요', '😭 중국어가 너무 어려워요',
])
const TEACHER_ONLY_CONTACT_MESSAGES = new Set(['😭 결석합니다', '🙇 지각할 것 같아요', '🙏 숙제 알려주세요 선생님'])
const FREE_MESSAGE_MAX_LENGTH = 180
const NOTICES_KEY = 'lin-homework-v3-notices'
const isTeacherUser = (user: { role?: string }) => user.role === 'teacher'
const isStudentUser = (user: { role?: string }) => user.role === 'student'

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
    .select('id,username,role,is_admin,active')
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

function noticeTime(now: number) {
  const date = new Date(now + 9 * 60 * 60 * 1000)
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

async function sendFreeMessage(user: { id: string, username: string, role?: string, is_admin?: boolean }, body: Record<string, unknown>) {
  const message = String(body.body || '').trim()
  if (!message) return fail('메시지를 입력해주세요.')
  if (message.length > FREE_MESSAGE_MAX_LENGTH) return fail(`메시지는 ${FREE_MESSAGE_MAX_LENGTH}자까지 입력할 수 있어요.`)

  const targetTeacher = body.targetTeacher === true
  const senderMode = String(body.senderMode || '')
  const targetUsernames = [...new Set(Array.isArray(body.targetUsernames) ? body.targetUsernames.map(String).map(name => name.trim()).filter(Boolean) : [])].slice(0, 100)
  let teacherTargets: Array<{ id: string }> = []
  let studentTargets: Array<{ id: string, username: string }> = []

  if (senderMode === 'student' && isStudentUser(user)) {
    if (targetTeacher) {
      const { data, error } = await supabase.from('app_users').select('id').eq('active', true).eq('role', 'teacher').neq('id', user.id)
      if (error) throw error
      teacherTargets = data || []
      if (!teacherTargets.length) return fail('메시지를 받을 선생님 계정을 찾을 수 없어요.')
    }
    if (targetUsernames.length) {
      const { data, error } = await supabase.from('app_users').select('id,username').eq('active', true).eq('role', 'student').in('username', targetUsernames).neq('id', user.id)
      if (error) throw error
      studentTargets = data || []
    }
  } else if (senderMode === 'teacher' && isTeacherUser(user)) {
    if (targetTeacher) return fail('선생님은 학생에게만 메시지를 보낼 수 있어요.', 403)
    if (targetUsernames.length) {
      const { data, error } = await supabase.from('app_users').select('id,username').eq('active', true).eq('role', 'student').in('username', targetUsernames).neq('id', user.id)
      if (error) throw error
      studentTargets = data || []
    }
  } else {
    return fail('메시지를 보낼 권한이 없습니다.', 403)
  }

  const foundUsernames = new Set(studentTargets.map(target => target.username))
  if (targetUsernames.some(username => username === user.username || !foundUsernames.has(username))) {
    return fail('보낼 수 없는 대상이 포함되어 있어요.', 403)
  }
  if (!teacherTargets.length && !studentTargets.length) return fail('메시지를 받을 대상을 선택해주세요.')

  const targetKey = [...(teacherTargets.length ? ['teacher'] : []), ...studentTargets.map(target => target.username).sort()].join('|')
  const sentAt = Date.now()
  const { data: stateRow, error: stateError } = await supabase.from('app_shared_state').select('value').eq('key', NOTICES_KEY).maybeSingle()
  if (stateError) throw stateError
  const notices = Array.isArray(stateRow?.value) ? stateRow.value : []
  const duplicate = notices.some((notice: Record<string, unknown>) => notice.kind === 'contact' && notice.sender === user.username && notice.contactMessage === message && notice.contactTargetKey === targetKey && sentAt - Number(notice.contactSentAt || 0) < 60000)
  if (duplicate) return fail('같은 메시지는 1분 후에 다시 보낼 수 있어요.', 409)

  const base = { createdAt: noticeTime(sentAt), kind: 'contact', student: user.username, sender: user.username, contactMessage: message, contactTargetKey: targetKey, contactSentAt: sentAt, freeMessage: true }
  const baseId = sentAt * 1000 + Math.floor(Math.random() * 800)
  const recipientNotices = [
    ...(teacherTargets.length ? [{ ...base, id: baseId, message: `[${user.username}] ${message}`, audience: 'teacher' }] : []),
    ...studentTargets.map((target, index) => ({ ...base, id: baseId + index + 1, message: `[${user.username}] ${message}`, user: target.username })),
  ]
  const { error: saveError } = await supabase.from('app_shared_state').upsert({ key: NOTICES_KEY, value: [...notices, ...recipientNotices], updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (saveError) throw saveError

  const result = await sendToUserIds([...teacherTargets, ...studentTargets].map(target => target.id), {
    title: user.username,
    body: message,
    url: String(body.url || '/').startsWith('/') ? String(body.url || '/') : '/',
    tag: `free-message-${String(body.eventId || sentAt)}`.slice(0, 120),
  })
  return ok({ ...result, notices: recipientNotices.length })
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
      if (kind === 'free-message') return await sendFreeMessage(user, body)
      const title = String(body.title || '').slice(0, 80)
      const message = String(body.body || '').slice(0, 180)
      const url = String(body.url || '/').startsWith('/') ? String(body.url || '/') : '/'
      if (!title || !message) return fail('알림 제목과 내용이 필요합니다.')

      let query = supabase.from('app_users').select('id').eq('active', true)
      if (kind === 'assignment' || kind === 'notice') {
        if (!isTeacherUser(user)) return fail('선생님만 보낼 수 있는 알림입니다.', 403)
        query = query.eq('role', 'student')
      } else if (kind === 'review') {
        if (user.is_admin !== true) return fail('관리자만 보낼 수 있는 알림입니다.', 403)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.reviewId || ''))) {
          return fail('복습을 확인해 주세요.')
        }
        query = query.eq('role', 'student')
      } else if (kind === 'feedback') {
        if (!isTeacherUser(user)) return fail('선생님만 보낼 수 있는 알림입니다.', 403)
        const target = String(body.targetUsername || '')
        if (!target) return fail('알림을 받을 학생이 필요합니다.')
        query = query.eq('role', 'student').eq('username', target)
      } else if (kind === 'submission') {
        if (!isStudentUser(user)) return fail('학생만 보낼 수 있는 알림입니다.', 403)
        query = query.eq('role', 'teacher').neq('id', user.id)
      } else if (kind === 'contact') {
        if (!isStudentUser(user)) return fail('학생만 보낼 수 있는 알림입니다.', 403)
        if (!CONTACT_MESSAGES.has(message)) return fail('허용되지 않은 메시지입니다.')
        const target = String(body.target || '')
        if (TEACHER_ONLY_CONTACT_MESSAGES.has(message) && target !== 'teacher') {
          return fail('선생님 전용 메시지는 선생님에게만 보낼 수 있습니다.', 403)
        }
        if (target === 'teacher') {
          query = query.eq('role', 'teacher').neq('id', user.id)
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
