import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')!, SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}})
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Content-Type':'application/json; charset=utf-8'}
const ok=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:cors}); const fail=(m:string,s=400)=>ok({error:m},s)
async function bj(r:Request){try{return await r.json()}catch{return{}}}
async function au(r:Request){const t=(r.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!t)return null;const{data:s}=await supabase.from('app_sessions').select('user_id').eq('token',t).gt('expires_at',new Date().toISOString()).maybeSingle();if(!s)return null;const{data:u}=await supabase.from('app_users').select('id,username,role,is_admin,avatar_url,active,vocab').eq('id',s.user_id).eq('active',true).maybeSingle();return u||null}
const staff=(u:any)=>u?.role==='teacher'
const learner=(u:any)=>u?.role==='student'
const strip=(v:any)=>Array.isArray(v)?v.map((x:any)=>{if(!x||typeof x!=='object')return x;const y={...x};delete y.password;return y}):v
const teacherSubKey=(k:string)=>k==='comment'||k.startsWith('feedback')
// 학생 저장: 피드백이 시작된 답안은 서버 값 유지, 그 외에는 선생님 필드(comment, feedback*)만 서버 값으로 보존
function mergeSub(old:any,inc:any){const o=old&&typeof old==='object'?old:null;if(!inc||typeof inc!=='object')return o??inc;if(o&&(o.feedbackStarted||o.comment))return o;const c:any={};for(const k of Object.keys(inc))if(!teacherSubKey(k))c[k]=inc[k];if(o)for(const k of Object.keys(o))if(teacherSubKey(k))c[k]=o[k];return c}
function mergeA(old:any,inc:any,n:string){if(!Array.isArray(old))return Array.isArray(inc)?inc:[];if(!Array.isArray(inc))return old;const m=new Map(inc.map((a:any)=>[String(a?.id),a]));return old.map((a:any)=>{const z:any=m.get(String(a?.id));if(!z)return a;const os=a?.subs&&typeof a.subs==='object'?a.subs:{},is=z?.subs&&typeof z.subs==='object'?z.subs:{};return n in is?{...a,subs:{...os,[n]:mergeSub(os[n],is[n])}}:a})}
function mergeS(old:any,inc:any,n:string){const o=Array.isArray(old)?old:[],i=Array.isArray(inc)?inc:[],own=i.find((x:any)=>x?.name===n||x?.username===n);if(!own)return strip(o);const c={...own};delete c.password;const k=o.findIndex((x:any)=>x?.name===n||x?.username===n);return k<0?[...strip(o),c]:o.map((x:any,j:number)=>j===k?{...x,...c}:x)}
async function gs(k:string){const{data}=await supabase.from('app_shared_state').select('value').eq('key',k).maybeSingle();return data?.value??null}
async function ps(k:string,v:any){const{error}=await supabase.from('app_shared_state').upsert({key:k,value:v,updated_at:new Date().toISOString()},{onConflict:'key'});if(error)throw error}
const uuid=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''))
const normAnswer=(v:any)=>String(v??'').replace(/[\s\p{P}]+/gu,'').toLowerCase()
// 정답칸에 ' / '로 여러 답을 적으면 그중 하나만 맞아도 정답 (예: 어순이 여러 개 가능한 문장)
const answerMatches=(given:any,key:any)=>{const g=normAnswer(given);return !!g&&String(key??'').split('/').some(k=>{const n=normAnswer(k);return !!n&&n===g})}
const generatedReviewTypes=new Set(['vocab','writing','note'])
const ungradedReviewTypes=new Set(['writing'])
function bytesToBase64(bytes:Uint8Array){let value='';const size=0x8000;for(let i=0;i<bytes.length;i+=size)value+=String.fromCharCode(...bytes.subarray(i,i+size));return btoa(value)}
function validateGeneratedQuestions(value:any){
  if(!value||!Array.isArray(value.questions)||value.questions.length<1||value.questions.length>20)throw new Error('INVALID_GENERATED_QUESTIONS')
  return value.questions.map((question:any)=>{
    const type=String(question?.type||''),prompt=String(question?.question||'').trim(),answer=String(question?.answer||'').trim(),explanation=String(question?.explanation||'').trim()
    if(!generatedReviewTypes.has(type)||!prompt||(!answer&&!explanation)||prompt.length>1000||answer.length>(type==='writing'?1000:300)||explanation.length>1000)throw new Error('INVALID_GENERATED_QUESTIONS')
    return{type,prompt,answer,explanation,audioPath:null,audioName:null}
  })
}
// 학생은 교재 사진을 볼 수 없으므로, 질문·설명에 사진/교재/필기 같은 출처 표현을 쓰지 않게 한다
const reviewQuestionStyle=`학생은 교재 사진을 볼 수 없습니다. question, answer, explanation 어디에도 '사진', '교재', '필기', '옆에 적힌', '수업에서 배운', '~에 따르면' 같은 출처나 위치를 언급하지 말고, 사진 없이도 이해되는 문장으로만 쓰세요. question에는 답을 쓰는 데 꼭 필요한 정보만 넣고, 그 외의 설명·배경·힌트·맥락은 넣지 마세요. question은 '무엇을 쓰세요'와 그 대상만 담은 한 문장입니다. 좋은 예: '다음 뜻의 중국어 단어를 쓰세요: 파트너, 동료', '结伴의 뜻을 쓰세요', '빈칸에 들어갈 단어를 쓰세요: 我想___。' 나쁜 예: '结伴 옆에 필기된 단어로 파트너를 뜻하는 중국어 단어를 쓰세요.' 단어·표현의 뜻: 교재에 인쇄된 뜻은 글자 그대로 옮겨 쓰고, 줄이거나 다른 말로 바꾸지 마세요. 사람이 손으로 필기한 뜻은 필기의 의미를 살려 자연스럽게 의역하거나 더 정확한 해석을 덧붙여도 됩니다. 어느 경우든 뜻이 여러 개면 빠뜨리지 말고 모두 씁니다. '짧고 단순하게'는 질문 문장의 형식에 대한 규칙이지 뜻 내용을 줄이라는 뜻이 아닙니다. explanation에는 출처 표현 없이 뜻과 쓰임, 짧은 예문처럼 학습에 필요한 내용을 씁니다. 좋은 예: '伙伴(huǒbàn): 함께 일하거나 노는 동료, 파트너.' 나쁜 예: '结伴 옆에 伙伴이 필기되어 있습니다.'`
async function generateReviewQuestions(userId:string,lessonDate:any,sourceImagePaths:any){
  const date=String(lessonDate||''),paths=Array.isArray(sourceImagePaths)?sourceImagePaths.map(String):[]
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('LESSON_DATE_REQUIRED')
  if(paths.length<1||paths.length>5||paths.some(path=>!path.startsWith(`reviews/${userId}/`)))throw new Error('INVALID_SOURCE_IMAGES')
  const key=Deno.env.get('GEMINI_API_KEY')
  if(!key)throw new Error('GEMINI_NOT_CONFIGURED')
  const parts:any[]=[{text:`다음 이미지는 ${date} 중국어 수업의 필기된 교재 사진입니다. 사진에 실제로 보이는 인쇄 내용, 필기, 강조, 체크된 단어와 표현만 근거로 복습 문제 초안을 만드세요. 사진에 없는 내용은 추측하거나 지어내지 마세요. 아래 세 유형만 사용하고, 이 순서(단어 → 쓰기 → 필기 질문)로 배치하세요. 1) 단어(vocab) 3~6개: 단어 뜻 묻기와 빈칸 채우기를 모두 이 유형으로 만듭니다. 정답은 하나로 정해지는 짧은 문자열이어야 합니다. 단, 중국어 단어의 한국어 뜻을 쓰게 하는 문제는 answer를 빈 문자열로 두고 뜻은 explanation에 씁니다. 2) 쓰기(writing) 2~3개: 교재 안에 실제로 있는 질문을 골라 학생이 중국어로 작문하게 합니다. question에는 그 질문을, answer는 빈 문자열로 두고, 교재 수준에 맞는 짧은 예시 답안은 explanation에 씁니다. 여기에 더해 예문 해석 문제 1~2개도 쓰기(writing) 유형으로 만듭니다. 교재에 실제로 있는 중국어 예문을 글자 그대로 골라 question은 '다음 문장을 한국어로 해석하세요: (예문)'처럼 쓰고, answer는 빈 문자열로 두고 자연스러운 한국어 해석은 explanation에 씁니다. 3) 필기 질문(note) 2~4개: 선생님이 필기로 강조한 문법·단어·표현을 골라, 정답이 하나로 정해지는 짧은 답 문제를 만듭니다. 단어 뜻이나 문법 의미를 한국어로 설명하게 하는 문제처럼 학생마다 표현이 달라질 답은 answer를 빈 문자열로 두고, 채점 기준이 될 참고 답안을 explanation에 쓰세요. 중국어 단어·표현을 쓰는 문제처럼 정답이 하나로 정해지면 answer에 정답을 씁니다. 병음을 쓰게 하는 문제는 만들지 마세요. 질문(question)은 '다음 단어를 중국어로 쓰세요: 뜻밖에', '意外의 뜻을 쓰세요', '빈칸에 들어갈 단어를 쓰세요: 我想___。'처럼 짧고 단순하게 씁니다. '교재 속', '사진에서', '필기한 내용에 따르면', '수업에서 배운' 같은 출처 설명이나 불필요한 수식어는 넣지 마세요. 사진 내용이 적으면 정해진 개수보다 적게 만들어도 됩니다. 개수를 맞추려고 비슷한 문제를 반복하지 마세요. 설명은 필요한 경우에만 짧게 작성하세요.`}]
  for(const path of paths){
    const{data,error}=await supabase.storage.from('homework-images').download(path)
    if(error||!data)throw new Error('SOURCE_IMAGE_DOWNLOAD_FAILED')
    const bytes=new Uint8Array(await data.arrayBuffer())
    if(!bytes.byteLength||bytes.byteLength>5*1024*1024)throw new Error('INVALID_SOURCE_IMAGES')
    parts.push({inlineData:{mimeType:data.type||'image/webp',data:bytesToBase64(bytes)}})
  }
  const model=Deno.env.get('GEMINI_MODEL')||'gemini-3.8-flash'
  let response:Response
  try{
    response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:reviewQuestionStyle}]},contents:[{role:'user',parts}],generationConfig:{temperature:0.2,responseMimeType:'application/json',responseJsonSchema:{type:'object',additionalProperties:false,required:['questions'],properties:{questions:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['type','question','answer','explanation'],properties:{type:{type:'string',enum:['vocab','writing','note']},question:{type:'string'},answer:{type:'string'},explanation:{type:'string'}}}}}}}}),signal:AbortSignal.timeout(45000)})
  }catch{throw new Error('GEMINI_NETWORK_ERROR')}
  if(!response.ok){console.error('Gemini review generation failed with status',response.status);throw new Error('GEMINI_API_ERROR')}
  let payload:any
  try{payload=await response.json()}catch{throw new Error('GEMINI_RESPONSE_ERROR')}
  const text=(payload?.candidates?.[0]?.content?.parts||[]).map((part:any)=>part?.text||'').join('').trim()
  if(!text)throw new Error('GEMINI_EMPTY_RESULT')
  let parsed:any
  try{parsed=JSON.parse(text)}catch{throw new Error('GEMINI_RESPONSE_ERROR')}
  return{questions:validateGeneratedQuestions(parsed),model}
}
async function reviewWithAI(writings:{id:string,prompt:string,answer:string}[],grades:{id:string,prompt:string,answer:string,reference:string}[]){
  const empty={corrections:{} as Record<string,{corrected:string,note:string}>,grades:{} as Record<string,{correct:boolean,note:string}>}
  const key=Deno.env.get('GEMINI_API_KEY');if(!key||(!writings.length&&!grades.length))return empty
  const model=Deno.env.get('GEMINI_MODEL')||'gemini-3.8-flash'
  const text=`중국어 학원 학생의 복습 답안입니다. 두 가지 작업을 해 주세요. 피드백(note)은 장황한 설명 대신 그 답안에 지금 가장 도움이 되는 핵심(더 나은 표현, 꼭 필요한 내용) 한두 가지만 짧고 구체적으로 씁니다.\n1) writings: 쓰기 답안을 첨삭해 주세요. 학생이 말하려는 내용(의미)은 바꾸지 말고 새로운 내용을 추가하지 마세요. 문법·어순·오탈자 오류는 고치고, 뜻은 통하지만 어색하거나 더 자연스러운 표현이 있으면 그 부분을 더 자연스러운 표현으로 바꿔 corrected에 씁니다. note에는 무엇을 왜 바꿨는지 한국어 1~3문장으로 알려 주세요. 표현을 바꿨다면 'A보다 B가 더 자연스러워요'처럼 원래 표현과 추천 표현을 함께 보여 줍니다. 문법과 표현이 모두 자연스러우면 억지로 고치지 말고 corrected에 원문을 그대로 쓰고, note에는 '문법과 표현이 훌륭해요.'처럼 짧은 칭찬을 씁니다. 중국어 문장을 한국어로 해석하는 문제라면 학생 해석이 원문 의미와 맞는지 보고, corrected에는 학생 해석을 바탕으로 다듬은 자연스러운 해석을, note에는 잘못 해석했거나 놓친 부분을 짚어 줍니다. 의미가 정확하면 짧게 칭찬합니다. 결과는 corrections에 넣습니다.\n2) grades: 뜻·문법 설명처럼 표현이 학생마다 다를 수 있는 답안입니다. reference(참고 답안)와 문제를 기준으로 학생 답의 의미가 맞으면 correct를 true로 합니다. 표현이나 어미가 달라도 핵심 의미가 같으면 정답입니다. 의미가 틀리거나 핵심이 빠지면 false입니다. note에는 '맞았습니다'처럼 결과만 말하지 말고 학습에 도움이 되는 내용을 한국어 1~2문장으로 씁니다. 맞았으면 더 정확하거나 자연스러운 뜻, 뉘앙스, 자주 쓰는 표현이나 예시처럼 보충할 점을 짧게 알려 주고, 틀렸으면 올바른 뜻과 헷갈린 부분을 짧게 설명합니다. 결과는 grades에 넣습니다.\n${JSON.stringify({writings:writings.map(item=>({id:item.id,question:item.prompt,answer:item.answer})),grades:grades.map(item=>({id:item.id,question:item.prompt,answer:item.answer,reference:item.reference}))})}`
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json',responseJsonSchema:{type:'object',additionalProperties:false,required:['corrections','grades'],properties:{corrections:{type:'array',items:{type:'object',additionalProperties:false,required:['id','corrected','note'],properties:{id:{type:'string'},corrected:{type:'string'},note:{type:'string'}}}},grades:{type:'array',items:{type:'object',additionalProperties:false,required:['id','correct','note'],properties:{id:{type:'string'},correct:{type:'boolean'},note:{type:'string'}}}}}}}}),signal:AbortSignal.timeout(25000)})
    if(!response.ok){console.error('Gemini review check failed with status',response.status);return empty}
    const payload:any=await response.json()
    const raw=(payload?.candidates?.[0]?.content?.parts||[]).map((part:any)=>part?.text||'').join('').trim()
    const parsed:any=JSON.parse(raw),writingIds=new Set(writings.map(item=>item.id)),gradeIds=new Set(grades.map(item=>item.id))
    for(const c of Array.isArray(parsed?.corrections)?parsed.corrections:[]){const id=String(c?.id||''),corrected=String(c?.corrected||'').trim(),note=String(c?.note||'').trim();if(writingIds.has(id)&&corrected&&corrected.length<=2000&&note.length<=500)empty.corrections[id]={corrected,note}}
    for(const g of Array.isArray(parsed?.grades)?parsed.grades:[]){const id=String(g?.id||''),note=String(g?.note||'').trim();if(gradeIds.has(id)&&typeof g?.correct==='boolean'&&note.length<=500)empty.grades[id]={correct:g.correct,note}}
    return empty
  }catch(error){console.error('Gemini review check error',String(error));return empty}
}
// 공개된 복습의 정답·설명을 고친 뒤 학생 답은 유지하고 바뀐 기준으로 다시 채점한다 (payloadQs[i].id = newQs[i]에 대응하는 이전 문제 id)
async function loadReviewQuestionRows(setId:string){const{data,error}=await supabase.from('review_questions').select('id,type,prompt,answer,explanation').eq('review_set_id',setId).order('position',{ascending:true});if(error)throw error;return data||[]}
async function regradeReviewResults(setId:string,oldQs:any[],payloadQs:any[]){
  const oldById=new Map(oldQs.map((q:any)=>[String(q.id),q]))
  if(!payloadQs.some((q:any)=>oldById.has(String(q?.id||''))))return
  const{data:results,error}=await supabase.from('review_results').select('id,answers,correctness,corrections').eq('review_set_id',setId);if(error)throw error;if(!results?.length)return
  const newQs=await loadReviewQuestionRows(setId)
  for(const r of results){
    const oa=r.answers||{},oc=r.correctness||{},ocr=r.corrections||{},answers:Record<string,string>={},correctness:Record<string,boolean>={},corrections:Record<string,any>={},aiGrades:{id:string,prompt:string,answer:string,reference:string}[]=[];let score=0,total=0
    newQs.forEach((q:any,i:number)=>{
      const oldId=String(payloadQs[i]?.id||''),old:any=oldById.get(oldId),id=String(q.id)
      if(!old)return
      const answer=String(oa[oldId]??'');answers[id]=answer
      if(ungradedReviewTypes.has(q.type)){if(ocr[oldId])corrections[id]=ocr[oldId];return}
      if(String(q.answer||'').trim()){total++;const correct=answerMatches(answer,q.answer);correctness[id]=correct;if(correct)score++;return}
      if(!answer.trim()){total++;correctness[id]=false;return}
      const unchanged=!String(old.answer||'').trim()&&old.prompt===q.prompt&&String(old.explanation||'')===String(q.explanation||'')
      if(unchanged&&typeof oc[oldId]==='boolean'){total++;correctness[id]=oc[oldId];if(oc[oldId])score++;if(ocr[oldId])corrections[id]=ocr[oldId];return}
      aiGrades.push({id,prompt:q.prompt,answer:answer.trim(),reference:String(q.explanation||'')})
    })
    if(aiGrades.length){const checked=await reviewWithAI([],aiGrades);for(const item of aiGrades){const g=checked.grades[item.id];if(!g)continue;total++;correctness[item.id]=g.correct;if(g.correct)score++;corrections[item.id]={note:g.note}}}
    const{error:ue}=await supabase.from('review_results').update({answers,correctness,corrections,score,total}).eq('id',r.id);if(ue)throw ue
  }
}
// 교재 사진은 AI 문제 생성용: 학생 공개 시 삭제하고, 어떤 복습에도 연결되지 않은 채 1시간 넘게 남은 사진은 정리
async function removeReviewSources(setId:string){const{data:set}=await supabase.from('review_sets').select('source_image_paths').eq('id',setId).maybeSingle();const paths=(set?.source_image_paths||[]).filter(Boolean);if(!paths.length)return;const{error}=await supabase.storage.from('homework-images').remove(paths);if(error){console.error('review source remove failed',String(error.message||error));return}await supabase.from('review_sets').update({source_image_paths:[]}).eq('id',setId)}
async function cleanupOrphanReviewSources(userId:string){try{const folder=`reviews/${userId}`;const{data:files,error}=await supabase.storage.from('homework-images').list(folder,{limit:1000});if(error||!files?.length)return;const{data:sets}=await supabase.from('review_sets').select('source_image_paths');const used=new Set((sets||[]).flatMap((s:any)=>s.source_image_paths||[]));const cutoff=Date.now()-60*60*1000;const stale=files.filter((f:any)=>f?.name&&!used.has(`${folder}/${f.name}`)&&new Date(f.created_at||0).getTime()<cutoff).map((f:any)=>`${folder}/${f.name}`);if(stale.length)await supabase.storage.from('homework-images').remove(stale)}catch(e){console.error('review source cleanup failed',String(e))}}
// 주간 자동 복습(HSK 4~5급): 매주 토 11:00 생성·공개·알림, 20:30 미완료 학생 리마인드 (pg_cron이 호출, 시간대·하루 1회로만 동작)
const AUTO_REVIEW_TITLE='주말공부'
const AUTO_PUSH_TEXT='공부해서 짱이되자!'
function kstNow(){const d=new Date(Date.now()+9*60*60*1000);return{day:d.getUTCDay(),mins:d.getUTCHours()*60+d.getUTCMinutes(),date:d.toISOString().slice(0,10),label:`${d.getUTCMonth()+1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`}}
async function claimOnce(key:string){const{error}=await supabase.from('app_shared_state').insert({key,value:{at:new Date().toISOString()}});return !error}
async function internalPush(userIds:string[],payload:Record<string,unknown>){if(!userIds.length)return{sent:0};const r=await fetch(`${SUPABASE_URL}/functions/v1/push-api/internal/send`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${SERVICE_KEY}`},body:JSON.stringify({userIds,payload})});return await r.json().catch(()=>({}))}
async function generateHskQuestions(avoid:string[]){
  const key=Deno.env.get('GEMINI_API_KEY');if(!key)throw new Error('GEMINI_NOT_CONFIGURED')
  const model=Deno.env.get('GEMINI_MODEL')||'gemini-3.8-flash'
  const text=`HSK 4~5급 수준의 중국어 복습 문제를 만드세요. 한국인 성인 학습자가 매주 푸는 문제입니다. HSK 4~5급 필수 어휘와 문법(예: 把자문, 被자문, 결과보어·방향보어, 비교문, 是…的, 连…都, 既…又, 不但…而且, 虽然…但是, 只要…就, 除了…以外 등)을 고르게 다루세요. 아래 세 유형만 사용하고 이 순서로 배치합니다. 1) 단어(vocab) 4~5개: 빈칸에 들어갈 단어 쓰기, 한국어 뜻에 맞는 중국어 단어 쓰기, 중국어 단어의 한국어 뜻 쓰기를 섞습니다. 정답이 하나로 정해지면 answer에 정답을 쓰고, 한국어 뜻을 쓰는 문제는 answer를 빈 문자열로 두고 뜻을 explanation에 씁니다. 2) 쓰기(writing) 3개: 짧은 중국어 작문 질문 2개(예: '你周末一般做什么？', '请用"虽然…但是…"写一句话。')와 중국어 예문을 한국어로 해석하는 문제 1개('다음 문장을 한국어로 해석하세요: (예문)'). answer는 빈 문자열, 예시 답안이나 해석은 explanation에 씁니다. 3) 문법(note) 2~3개: 문법 포인트를 묻는 짧은 문제. 정답이 하나로 정해지면 answer에, 설명형이면 answer를 비우고 참고 답안을 explanation에 씁니다. 질문은 '무엇을 쓰세요'와 그 대상만 담은 짧은 한 문장으로 쓰고, 병음을 쓰게 하는 문제는 만들지 마세요. explanation에는 뜻, 쓰임, 짧은 예문처럼 학습에 필요한 내용을 씁니다. 중국어는 간체자로 씁니다.${avoid.length?`\n최근에 낸 문제와 겹치지 않게 하세요:\n${avoid.slice(0,40).join('\n')}`:''}`
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text}]}],generationConfig:{temperature:0.7,responseMimeType:'application/json',responseJsonSchema:{type:'object',additionalProperties:false,required:['questions'],properties:{questions:{type:'array',minItems:1,maxItems:20,items:{type:'object',additionalProperties:false,required:['type','question','answer','explanation'],properties:{type:{type:'string',enum:['vocab','writing','note']},question:{type:'string'},answer:{type:'string'},explanation:{type:'string'}}}}}}}}),signal:AbortSignal.timeout(50000)})
  if(!response.ok)throw new Error('GEMINI_API_ERROR')
  const payload:any=await response.json()
  const raw=(payload?.candidates?.[0]?.content?.parts||[]).map((part:any)=>part?.text||'').join('').trim()
  return validateGeneratedQuestions(JSON.parse(raw))
}
// 기출 문제은행(HSK 5급, 듣기·그림 제외): 저장소 homework-images/hsk/hsk5_bank.json (공개 저장소에 올리지 않기 위해 코드와 분리)
const BANK_PATH='hsk/hsk5_bank.json',USED_KEY='auto-review-used'
const optLine=(o:any)=>['A','B','C','D'].map(k=>`${k} ${o?.[k]??''}`).join('\n')
function bankUnitKey(u:any){return `${u.paper}-${u.part}-${u.range?u.range.join('_'):u.no}`}
function bankToQuestions(units:any[]){
  const q:any[]=[]
  for(const u of units){
    if(u.part==='cloze'){const letters=u.items.map((it:any)=>it.answer).join('');q.push({type:'reading',prompt:`다음 글의 빈칸에 알맞은 것을 고르세요. 답은 빈칸 순서대로 알파벳으로 쓰세요. (예: ABD)\n\n${u.passage}\n\n${u.items.map((it:any)=>`（${it.no}）  ${['A','B','C','D'].map(k=>`${k} ${it.options?.[k]??''}`).join('   ')}`).join('\n')}`,answer:letters,explanation:u.items.map((it:any)=>`（${it.no}）${it.answer} ${it.options[it.answer]}`).join('\n')})}
    else if(u.part==='reading'){const letters=u.items.map((it:any)=>it.answer).join('');q.push({type:'reading',prompt:`다음 글을 읽고 질문에 답하세요. 답은 질문 순서대로 알파벳으로 쓰세요. (예: DBAC)\n\n${u.passage}\n\n${u.items.map((it:any,i:number)=>`${i+1}. ${it.stem}\n${optLine(it.options)}`).join('\n\n')}`,answer:letters,explanation:u.items.map((it:any,i:number)=>`${i+1}. ${it.answer} ${it.options[it.answer]}`).join('\n')})}
    else if(u.part==='match')q.push({type:'reading',prompt:`다음 글과 내용이 일치하는 것을 고르세요. 알파벳으로 쓰세요.\n\n${u.passage}\n\n${optLine(u.options)}`,answer:u.answer,explanation:`${u.answer} ${u.options[u.answer]}`})
    else if(u.part==='order')q.push({type:'sentence',prompt:`다음 단어를 배열해 문장을 완성하세요.\n${u.words.join(' / ')}`,answer:u.answers.join(' / '),explanation:''})
    else if(u.part==='essay')q.push({type:'writing',prompt:`다음 단어를 모두 사용해 80자 정도의 짧은 글을 쓰세요.\n${u.words.join('、')}`,answer:'',explanation:''})
  }
  return q.map((x:any)=>({...x,audioPath:null,audioName:null}))
}
async function pickFromBank(){
  const{data:file,error}=await supabase.storage.from('homework-images').download(BANK_PATH);if(error||!file)return null
  const bank:any[]=JSON.parse(await file.text());const usedRaw=await gs(USED_KEY);let used=new Set<string>(Array.isArray(usedRaw)?usedRaw:[])
  const plan:[string,number][]=[['cloze',1],['match',2],['reading',1],['order',3],['essay',1]];const picked:any[]=[]
  for(const[part,n]of plan){
    const all=bank.filter((u:any)=>u.part===part);let free=all.filter((u:any)=>!used.has(bankUnitKey(u)))
    if(free.length<n){for(const u of all)used.delete(bankUnitKey(u));free=all}
    for(let i=0;i<n&&free.length;i++){const j=Math.floor(Math.random()*free.length);const u=free.splice(j,1)[0];picked.push(u);used.add(bankUnitKey(u))}
  }
  return{questions:bankToQuestions(picked),used:[...used]}
}
async function runWeeklyAutoReview(){
  const now=kstNow();if(now.day!==6||now.mins<10*60+55||now.mins>12*60)return{done:false,reason:'outside-window'}
  const claimKey=`auto-review-${now.date}`
  if(!await claimOnce(claimKey))return{done:false,reason:'already-done'}
  try{
  const{data:recent}=await supabase.from('review_sets').select('id').eq('title',AUTO_REVIEW_TITLE).order('lesson_date',{ascending:false}).limit(2)
  const fromBank=await pickFromBank()
  let questions:any[]
  if(fromBank)questions=fromBank.questions
  else{const avoid:string[]=[];for(const r of recent||[]){const qs=await loadReviewQuestionRows(r.id);for(const q of qs)avoid.push(String(q.prompt))}questions=await generateHskQuestions(avoid)}
  const{data:admin}=await supabase.from('app_users').select('id').eq('is_admin',true).eq('active',true).limit(1).maybeSingle()
  if(!admin)throw new Error('ADMIN_NOT_FOUND')
  const{data:setId,error}=await supabase.rpc('app_admin_save_review_set',{p_admin_id:admin.id,p_payload:{lessonDate:now.date,title:AUTO_REVIEW_TITLE,status:'published',sourceImagePaths:[],questions}});if(error)throw error
  if(fromBank)await ps(USED_KEY,fromBank.used)
  const notices=await gs('lin-homework-v3-notices');const list=Array.isArray(notices)?notices:[]
  await ps('lin-homework-v3-notices',[...list,{id:Date.now()*1000+Math.floor(Math.random()*999),message:`[복습] 주말공부가 도착했어요 · ${AUTO_PUSH_TEXT}`,createdAt:now.label,kind:'review',reviewId:setId}])
  const{data:learners}=await supabase.from('app_users').select('id').eq('role','student').eq('active',true)
  const push=await internalPush((learners||[]).map((x:any)=>x.id),{title:'📚 주말공부 도착!',body:AUTO_PUSH_TEXT,url:`/?kind=review&reviewId=${setId}`,tag:`review-${setId}`})
  return{done:true,setId,source:fromBank?'bank':'ai',questions:questions.length,push}
  }catch(e){await supabase.from('app_shared_state').delete().eq('key',claimKey);throw e}
}
async function runWeeklyReminder(){
  const now=kstNow();if(now.day!==6||now.mins<20*60+25||now.mins>21*60+30)return{done:false,reason:'outside-window'}
  const{data:set}=await supabase.from('review_sets').select('id').eq('title',AUTO_REVIEW_TITLE).eq('status','published').eq('lesson_date',now.date).maybeSingle()
  if(!set)return{done:false,reason:'no-review-today'}
  if(!await claimOnce(`auto-review-reminder-${now.date}`))return{done:false,reason:'already-done'}
  const{data:rows}=await supabase.from('review_results').select('student_id').eq('review_set_id',set.id);const doneIds=new Set((rows||[]).map((r:any)=>r.student_id))
  const{data:learners}=await supabase.from('app_users').select('id').eq('role','student').eq('active',true)
  const targets=(learners||[]).map((x:any)=>x.id).filter((id:string)=>!doneIds.has(id))
  const push=await internalPush(targets,{title:'⏰ 주말공부 잊지 않았죠?',body:`오늘 주말공부가 아직 남아 있어요. ${AUTO_PUSH_TEXT}`,url:`/?kind=review&reviewId=${set.id}`,tag:`review-reminder-${set.id}`})
  return{done:true,targets:targets.length,push}
}
async function signed(bucket:string,path:any){if(!path)return null;const{data,error}=await supabase.storage.from(bucket).createSignedUrl(String(path),3600);if(error)throw error;return data.signedUrl}
async function reviewQuestions(setId:string,includeAnswers=false){const{data,error}=await supabase.from('review_questions').select('id,type,prompt,answer,explanation,audio_path,audio_name,position').eq('review_set_id',setId).order('position',{ascending:true});if(error)throw error;return Promise.all((data||[]).map(async(q:any)=>({id:q.id,type:q.type,prompt:q.prompt,...(includeAnswers?{answer:q.answer,explanation:q.explanation}:{}),audioPath:q.audio_path,audioName:q.audio_name,audioUrl:await signed('homework-audio',q.audio_path),position:q.position})))}
async function reviewResult(setId:string,studentId:string){const{data,error}=await supabase.from('review_results').select('answers,correctness,corrections,score,total,completed_at').eq('review_set_id',setId).eq('student_id',studentId).maybeSingle();if(error)throw error;return data?{answers:data.answers||{},correctness:data.correctness||{},corrections:data.corrections||{},score:data.score,total:data.total,completedAt:data.completed_at}:null}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});const p=new URL(req.url).pathname.replace(/^.*\/homework-api\/?/,'/');try{
if(p==='/login'&&req.method==='POST'){const b=await bj(req),{data,error}=await supabase.rpc('app_login',{p_username:b.username,p_password:b.password});return error?fail('아이디 또는 비밀번호를 확인해 주세요.',401):ok(data)}
if(p==='/register'&&req.method==='POST'){const b=await bj(req),v=Array.isArray(b.vocab)?b.vocab:[];if(v.some((x:any)=>!x||!['3급','4급','5급','6급'].includes(String(x.level||''))||!Number.isInteger(Number(x.chapter))||Number(x.chapter)<0))return fail('선택한 급수와 시작 과를 확인해 주세요.');const clean=v.map((x:any)=>({level:String(x.level),chapter:Number(x.chapter)}));const{data,error}=await supabase.rpc('app_register_student',{p_username:b.username,p_password:b.password,p_vocab:clean,p_avatar_url:b.avatarUrl||null});if(error){const m=String(error.message||'');if(m.includes('USERNAME_TAKEN'))return fail('이미 사용 중인 이름이에요.',409);if(m.includes('PASSWORD_TOO_SHORT'))return fail('비밀번호는 4자리 이상 입력해 주세요.');return fail('계정 생성에 실패했어요.')}return ok(data,201)}
if(p==='/cron/weekly-review'&&req.method==='GET')return ok(await runWeeklyAutoReview())
if(p==='/cron/weekly-reminder'&&req.method==='GET')return ok(await runWeeklyReminder())
const u=await au(req);if(!u)return fail('로그인이 필요합니다.',401)
if(p.startsWith('/admin/')){
if(u.is_admin!==true&&!(staff(u)&&p.startsWith('/admin/review')))return fail('관리자만 사용할 수 있어요.',403)
if(p==='/admin/accounts'&&req.method==='GET'){const{data,error}=await supabase.from('app_users').select('id,username,role,active').in('role',['teacher','student']).eq('active',true).order('created_at',{ascending:true});if(error)throw error;return ok({accounts:data||[]})}
if(p==='/admin/reset-password'&&req.method==='POST'){const b=await bj(req);if(typeof b.userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.userId))return fail('계정을 확인해 주세요.');const{error}=await supabase.rpc('app_admin_reset_password',{p_admin_id:u.id,p_user_id:b.userId});if(error){const m=String(error.message||'');if(m.includes('ADMIN_REQUIRED'))return fail('관리자만 사용할 수 있어요.',403);if(m.includes('ACCOUNT_NOT_FOUND'))return fail('초기화할 계정을 찾을 수 없어요.',404);throw error}return ok({ok:true})}
if(p==='/admin/reviews'&&req.method==='GET'){await cleanupOrphanReviewSources(u.id);const{data:sets,error}=await supabase.from('review_sets').select('id,lesson_date,title,status,source_image_paths,created_at,updated_at,published_at').order('lesson_date',{ascending:false});if(error)throw error;const items=[];for(const set of sets||[]){const questions=await reviewQuestions(set.id,true),sourceImages=[];for(const path of set.source_image_paths||[])sourceImages.push({path,url:await signed('homework-images',path)});items.push({id:set.id,lessonDate:set.lesson_date,title:set.title,status:set.status,sourceImages,questions,createdAt:set.created_at,updatedAt:set.updated_at,publishedAt:set.published_at})}return ok({reviews:items})}
// 선생님 학생 탭: 가장 최근 등록된 복습을 학생별로 풀었는지(O/X)만 알려준다
if(p==='/admin/review-status'&&req.method==='GET'){const{data:set,error}=await supabase.from('review_sets').select('id,lesson_date').eq('status','published').order('lesson_date',{ascending:false}).order('published_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;if(!set)return ok({lessonDate:null,done:{}});const{data:rows,error:re}=await supabase.from('review_results').select('student_id').eq('review_set_id',set.id);if(re)throw re;const doneIds=new Set((rows||[]).map((r:any)=>r.student_id));const{data:learners,error:le}=await supabase.from('app_users').select('id,username').eq('role','student').eq('active',true);if(le)throw le;const done:Record<string,boolean>={};for(const s of learners||[])done[s.username]=doneIds.has(s.id);return ok({lessonDate:set.lesson_date,done})}
// 선생님 학생 상세: 그 학생의 등록된 복습 목록과, 푼 복습은 문제·결과까지 (학생 결과 화면 재사용용)
if(p==='/admin/student-reviews'&&req.method==='GET'){const name=String(new URL(req.url).searchParams.get('username')||'');const{data:stu,error:ue}=await supabase.from('app_users').select('id').eq('username',name).eq('role','student').maybeSingle();if(ue)throw ue;if(!stu)return ok({reviews:[]});const{data:sets,error}=await supabase.from('review_sets').select('id,lesson_date,title').eq('status','published').order('lesson_date',{ascending:false});if(error)throw error;const items=[];for(const set of sets||[]){const result=await reviewResult(set.id,stu.id);items.push({id:set.id,lessonDate:set.lesson_date,title:set.title,result,questions:result?await reviewQuestions(set.id,true):[]})}return ok({reviews:items})}
if(p==='/admin/reviews/generate'&&req.method==='POST'){const b=await bj(req);try{return ok(await generateReviewQuestions(u.id,b.lessonDate,b.sourceImagePaths))}catch(error){const code=String((error as Error)?.message||'');if(code==='LESSON_DATE_REQUIRED')return fail('수업 날짜를 입력해 주세요.');if(code==='INVALID_SOURCE_IMAGES'||code==='SOURCE_IMAGE_DOWNLOAD_FAILED')return fail('등록한 교재 사진을 확인해 주세요.');if(code==='GEMINI_NOT_CONFIGURED')return fail('AI 문제 생성 설정이 아직 완료되지 않았어요.',503);if(code==='GEMINI_NETWORK_ERROR')return fail('AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.',503);if(code==='GEMINI_API_ERROR')return fail('AI 문제 생성에 실패했어요. 잠시 후 다시 시도해주세요.',502);if(code==='GEMINI_EMPTY_RESULT')return fail('사진에서 만들 수 있는 복습 문제를 찾지 못했어요.',422);if(code==='GEMINI_RESPONSE_ERROR'||code==='INVALID_GENERATED_QUESTIONS')return fail('AI가 만든 문제 형식을 확인하지 못했어요. 다시 시도해주세요.',502);throw error}}
if(p==='/admin/reviews/save'&&req.method==='POST'){const b=await bj(req);if(uuid(b.id)){const{data:cur,error:ce}=await supabase.from('review_sets').select('status').eq('id',String(b.id)).maybeSingle();if(ce)throw ce;if(cur?.status==='published'){
// 학생에게 공개된 복습: 문제 구성은 그대로 두고 정답·설명(채점 기준)만 수정한 뒤, 학생 답은 유지한 채 다시 채점
const setId=String(b.id),date=String(b.lessonDate||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return fail('수업 날짜를 입력해 주세요.');const oldQs=await loadReviewQuestionRows(setId),known=new Set(oldQs.map((q:any)=>String(q.id)));for(const q of Array.isArray(b.questions)?b.questions:[]){const id=String(q?.id||'');if(!known.has(id))continue;const{error:qe}=await supabase.from('review_questions').update({answer:String(q?.answer??'').trim().slice(0,1000),explanation:String(q?.explanation??'').trim().slice(0,1500)||null}).eq('id',id).eq('review_set_id',setId);if(qe)throw qe}const{error:se}=await supabase.from('review_sets').update({lesson_date:date,title:String(b.title||'').trim().slice(0,120),updated_at:new Date().toISOString()}).eq('id',setId);if(se)throw se;try{await regradeReviewResults(setId,oldQs,oldQs.map((q:any)=>({id:q.id})))}catch(e){console.error('review regrade failed',String(e))}return ok({ok:true,id:setId})}}
const{data,error}=await supabase.rpc('app_admin_save_review_set',{p_admin_id:u.id,p_payload:b});if(error){const m=String(error.message||'');if(m.includes('ADMIN_REQUIRED'))return fail('관리자만 사용할 수 있어요.',403);if(m.includes('LESSON_DATE_REQUIRED'))return fail('수업 날짜를 입력해 주세요.');if(m.includes('SOURCE_IMAGES_REQUIRED'))return fail('필기된 교재 사진을 한 장 이상 등록해 주세요.');if(m.includes('INVALID_REVIEW_QUESTIONS')||m.includes('QUESTION_FIELDS_REQUIRED'))return fail('문제를 모두 입력해 주세요.');if(m.includes('INVALID_QUESTION_TYPE'))return fail('문제 유형을 확인해 주세요.');throw error}if(b.status==='published'&&uuid(data)){try{await removeReviewSources(String(data))}catch(e){console.error('review source remove failed',String(e))}}return ok({ok:true,id:data})}
if(p==='/admin/reviews/delete'&&req.method==='POST'){const b=await bj(req),id=String(b.id||'');if(!uuid(id))return fail('복습을 찾을 수 없어요.',404);const{data:set,error:se}=await supabase.from('review_sets').select('id,source_image_paths').eq('id',id).maybeSingle();if(se)throw se;if(!set)return fail('복습을 찾을 수 없어요.',404);const{data:qs}=await supabase.from('review_questions').select('audio_path').eq('review_set_id',id);const{error}=await supabase.from('review_sets').delete().eq('id',id);if(error)throw error;const imgs=(set.source_image_paths||[]).filter(Boolean),audio=(qs||[]).map((q:any)=>q.audio_path).filter(Boolean);try{if(imgs.length)await supabase.storage.from('homework-images').remove(imgs);if(audio.length)await supabase.storage.from('homework-audio').remove(audio)}catch(e){console.error('review file cleanup failed',String(e))}return ok({ok:true})}
if(p==='/admin/review-source-upload'&&req.method==='POST'){const b=await bj(req),du=String(b.dataUrl||''),m=du.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);if(!m)return fail('이미지 형식이 올바르지 않아요.');const raw=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));if(raw.byteLength>5*1024*1024)return fail('이미지는 5MB 이하만 올릴 수 있어요.',413);const safe=String(b.name||'review.webp').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`reviews/${u.id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const{error:e}=await supabase.storage.from('homework-images').upload(path,raw,{contentType:m[1],upsert:false});if(e)throw e;return ok({path,url:await signed('homework-images',path)})}
return fail('없는 API입니다.',404)
}
if(p==='/me'&&req.method==='GET')return ok({id:u.id,username:u.username,role:u.role,isAdmin:u.is_admin===true,avatarUrl:u.avatar_url,vocab:u.vocab})
if(p==='/change-password'&&req.method==='POST'){const b=await bj(req),cur=String(b.currentPassword||''),next=String(b.newPassword||'');if(next.length<4)return fail('새 비밀번호는 4자리 이상 입력해 주세요.');const{error}=await supabase.rpc('app_change_password',{p_user_id:u.id,p_current_password:cur,p_new_password:next});if(error){const m=String(error.message||'');if(m.includes('INVALID_CURRENT_PASSWORD'))return fail('현재 비밀번호가 올바르지 않아요.',400);if(m.includes('PASSWORD_TOO_SHORT'))return fail('새 비밀번호는 4자리 이상 입력해 주세요.',400);throw error}return ok({ok:true})}
if(p==='/change-username'&&req.method==='POST'){const b=await bj(req),{data,error}=await supabase.rpc('app_change_username',{p_user_id:u.id,p_new_username:String(b.username||'')});if(error){const m=String(error.message||'');if(m.includes('USERNAME_TAKEN'))return fail('이미 사용 중인 이름이에요.',409);if(m.includes('INVALID_USERNAME'))return fail('이름은 1자 이상 30자 이하로 입력해 주세요.');if(m.includes('RESERVED_USERNAME'))return fail('사용할 수 없는 이름이에요.');throw error}return ok({ok:true,username:data.username})}
if(p==='/state'&&req.method==='GET'){const{data,error}=await supabase.from('app_shared_state').select('key,value,updated_at');if(error)throw error;const state:Record<string,any>={};for(const r of data||[])state[r.key]=r.value;const{data:profiles}=await supabase.from('app_users').select('id,username,avatar_url,active,vocab,created_at').eq('role','student').order('created_at',{ascending:true});return ok({state,profiles:profiles||[]})}
if(p==='/state'&&req.method==='PUT'){const b=await bj(req),k=String(b.key||'');if(!k.startsWith('lin-homework-v3-'))return fail('허용되지 않은 저장 키예요.');if(b.mode==='teacher'&&!staff(u))return fail('보기 전용 모드에서는 저장할 수 없어요.',403);let v=b.value,o=await gs(k);if(k.endsWith('-assigns'))v=staff(u)?v:mergeA(o,v,u.username);else if(k.endsWith('-students'))v=staff(u)?strip(v):mergeS(o,v,u.username);else if(k.endsWith('-vocab')&&!staff(u)){const a=o&&typeof o==='object'?o:{},z=v&&typeof v==='object'?v:{};v={...a,[u.username]:z[u.username]??a[u.username]??[]}}else if((k.includes('banner')||k.includes('notice-setting'))&&!staff(u))return fail('선생님만 공지를 수정할 수 있어요.',403);await ps(k,v);return ok({ok:true,value:v})}
if(p==='/upload-data-url'&&req.method==='POST'){const b=await bj(req),du=String(b.dataUrl||''),m=du.match(/^data:((?:audio|image)\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);if(!m)return fail('파일 형식이 올바르지 않아요.');const mime=m[1],raw=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0)),isImg=mime.startsWith('image/'),limit=isImg?5*1024*1024:20*1024*1024;if(raw.byteLength>limit)return fail(isImg?'이미지는 5MB 이하만 올릴 수 있어요.':'녹음파일은 20MB 이하만 올릴 수 있어요.',413);const bucket=isImg?'homework-images':'homework-audio',safe=String(b.name||'file').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`${u.id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const{error:e}=await supabase.storage.from(bucket).upload(path,raw,{contentType:mime,upsert:false});if(e)throw e;const{data:s,error:se}=await supabase.storage.from(bucket).createSignedUrl(path,31536000);if(se)throw se;return ok({url:s.signedUrl,path})}
if(p==='/reviews'&&req.method==='GET'){const{data:sets,error}=await supabase.from('review_sets').select('id,lesson_date,title').eq('status','published').order('lesson_date',{ascending:false});if(error)throw error;let results:any[]=[];if(learner(u)&&(sets||[]).length){const r=await supabase.from('review_results').select('review_set_id,score,total,completed_at').eq('student_id',u.id).in('review_set_id',(sets||[]).map((x:any)=>x.id));if(r.error)throw r.error;results=r.data||[]}const bySet=new Map(results.map((r:any)=>[r.review_set_id,r]));return ok({reviews:(sets||[]).map((set:any)=>{const r:any=bySet.get(set.id);return{id:set.id,lessonDate:set.lesson_date,title:set.title,completed:!!r,score:r?.score??null,total:r?.total??null,completedAt:r?.completed_at??null}})})}
const reviewMatch=p.match(/^\/reviews\/([0-9a-f-]+)$/i)
if(reviewMatch&&req.method==='GET'){const setId=reviewMatch[1];if(!uuid(setId))return fail('복습을 찾을 수 없어요.',404);let q=supabase.from('review_sets').select('id,lesson_date,title,status').eq('id',setId);if(learner(u))q=q.eq('status','published');const{data:set,error}=await q.maybeSingle();if(error)throw error;if(!set)return fail('복습을 찾을 수 없어요.',404);const result=learner(u)?await reviewResult(setId,u.id):null,questions=await reviewQuestions(setId,!!result);return ok({review:{id:set.id,lessonDate:set.lesson_date,title:set.title,status:set.status,questions,result}})}
const submitMatch=p.match(/^\/reviews\/([0-9a-f-]+)\/submit$/i)
if(submitMatch&&req.method==='POST'){if(!learner(u))return fail('학생만 제출할 수 있어요.',403);const setId=submitMatch[1];if(!uuid(setId))return fail('복습을 찾을 수 없어요.',404);const existing=await reviewResult(setId,u.id);if(existing){const questions=await reviewQuestions(setId,true);return ok({result:existing,questions})}const{data:set,error:setError}=await supabase.from('review_sets').select('id').eq('id',setId).eq('status','published').maybeSingle();if(setError)throw setError;if(!set)return fail('복습을 찾을 수 없어요.',404);const questions=await reviewQuestions(setId,true);if(!questions.length)return fail('등록된 문제가 없어요.');const b=await bj(req),raw=b.answers&&typeof b.answers==='object'?b.answers:{},answers:Record<string,string>={},correctness:Record<string,boolean>={},writings:{id:string,prompt:string,answer:string}[]=[],aiGrades:{id:string,prompt:string,answer:string,reference:string}[]=[];let score=0,total=0;for(const question of questions){const answer=String(raw[question.id]??'').slice(0,2000);answers[question.id]=answer;if(ungradedReviewTypes.has(question.type)){if(answer.trim())writings.push({id:String(question.id),prompt:question.prompt,answer:answer.trim()});continue}if(!String(question.answer||'').trim()){if(answer.trim()){aiGrades.push({id:String(question.id),prompt:question.prompt,answer:answer.trim(),reference:String(question.explanation||'')});continue}total++;correctness[question.id]=false;continue}total++;const correct=answerMatches(answer,question.answer);correctness[question.id]=correct;if(correct)score++}const checked=await reviewWithAI(writings,aiGrades),corrections:Record<string,any>={...checked.corrections};for(const item of aiGrades){const g=checked.grades[item.id];if(!g)continue;total++;correctness[item.id]=g.correct;if(g.correct)score++;corrections[item.id]={note:g.note}}const row={review_set_id:setId,student_id:u.id,answers,correctness,corrections,score,total},{error}=await supabase.from('review_results').insert(row);if(error){if(String(error.code)==='23505'){const result=await reviewResult(setId,u.id);return ok({result,questions})}throw error}return ok({result:{answers,correctness,corrections,score,total,completedAt:new Date().toISOString()},questions},201)}
if(p==='/sync-user'&&req.method==='POST'){const b=await bj(req),q:any={updated_at:new Date().toISOString()};if('avatarUrl'in b)q.avatar_url=b.avatarUrl||null;if('vocab'in b)q.vocab=b.vocab||[];const{error}=await supabase.from('app_users').update(q).eq('id',u.id);if(error)throw error;return ok({ok:true})}
if(p==='/student-active'&&req.method==='POST'){if(!staff(u))return fail('선생님만 변경할 수 있어요.',403);const b=await bj(req),n=String(b.username||''),a=!!b.active;const{error}=await supabase.from('app_users').update({active:a,updated_at:new Date().toISOString()}).eq('username',n).eq('role','student');if(error)throw error;if(!a){const{data:x}=await supabase.from('app_users').select('id').eq('username',n).maybeSingle();if(x?.id)await supabase.from('app_sessions').delete().eq('user_id',x.id)}return ok({ok:true})}
if(p==='/student-vocab'&&req.method==='POST'){if(!staff(u))return fail('선생님만 변경할 수 있어요.',403);const b=await bj(req),n=String(b.username||''),v=Array.isArray(b.vocab)?b.vocab:[];const{error}=await supabase.from('app_users').update({vocab:v,updated_at:new Date().toISOString()}).eq('username',n).eq('role','student');if(error)throw error;return ok({ok:true})}
return fail('없는 API입니다.',404)}catch(e){console.error(e);return fail('서버 처리 중 오류가 발생했어요.',500)}})
