// @ts-nocheck
const { useEffect, useMemo, useRef, useState } = React;
const C = '#FF6B5F';
const BORDER = '#B2B2B2';
const LIST_BORDER = '#D8D8D8';
const NAV_CHEVRON_SIZE = 24;
const NAV_CHEVRON_STROKE = 2.2;
const NAV_CHEVRON_COLOR = '#333333';
const BRAND_CHARACTER = '/lin-character.png';
const LOGIN_LOGO = '/lin-logo.svg';
const FEEDBACK_GUIDE_KEY = 'lin-feedback-guide-complete-v1';
// These placeholders are replaced by scripts/build.mjs from environment variables.
// Do not put real credentials in this file or commit them to Git.
const API = '__LIN_API_URL__';
const PUSH_API = '__LIN_PUSH_API_URL__';
const API_KEY = '__LIN_SUPABASE_ANON_KEY__';
const K = {
    assigns: 'lin-homework-v3-assigns',
    students: 'lin-homework-v3-students',
    notices: 'lin-homework-v3-notices',
    noticeDismissed: 'lin-homework-v3-notice-dismissed',
    vocab: 'lin-homework-v3-vocab',
    banner: 'lin-homework-v3-banner',
};
const LEVELS = ['3급', '4급', '5급', '6급'];
const DEFAULT_BANNER = { enabled: true, message: '🔔 보강 | 8월 31일 (토) · 14:00' };
async function api(path, opts = {}, token) {
    const headers = new Headers(opts.headers || {});
    headers.set('apikey', API_KEY);
    if (!headers.has('content-type') && opts.body)
        headers.set('content-type', 'application/json');
    if (token)
        headers.set('authorization', `Bearer ${token}`);
    const r = await fetch(API + path, { ...opts, headers });
    const data = await r.json().catch(() => ({}));
    if (!r.ok)
        throw new Error(data?.error || '처리 중 오류가 발생했어요.');
    return data;
}
async function pushApi(path, opts = {}, token) {
    const headers = new Headers(opts.headers || {});
    headers.set('apikey', API_KEY);
    if (!headers.has('content-type') && opts.body)
        headers.set('content-type', 'application/json');
    if (token)
        headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(PUSH_API + path, { ...opts, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
        throw new Error(data?.error || '푸시 알림 처리 중 오류가 발생했어요.');
    return data;
}
function applicationServerKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}
async function fileToDataUrl(file) {
    return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });
}
function fmtNow() {
    const d = new Date();
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function uid() { return Date.now() * 1000 + Math.floor(Math.random() * 999); }
function isFeedbackComplete(sub) { return !!sub?.comment && sub.feedbackComplete !== false; }
function feedbackGuideCompleted() { try { return localStorage.getItem(FEEDBACK_GUIDE_KEY) === '1'; } catch { return false; } }
function completeFeedbackGuide() { try { localStorage.setItem(FEEDBACK_GUIDE_KEY, '1'); } catch { } }
function dateFromAssignment(a) {
    const text = String(a?.createdAt || a?.dueAt || '');
    const m = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (!m)
        return new Date(0);
    return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
}
function weekStart(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
function weekKey(date) { return weekStart(date).toISOString().slice(0, 10); }
function weekLabel(key) { const start = new Date(`${key}T00:00:00`); const end = new Date(start); end.setDate(end.getDate() + 6); return `${start.getMonth() + 1}월 ${start.getDate()}일 ~ ${end.getMonth() + 1}월 ${end.getDate()}일`; }
function AssignmentWeekList({ assigns, renderCard }) {
    const groups = new Map();
    assigns.forEach(a => { const key = weekKey(dateFromAssignment(a)); groups.set(key, [...(groups.get(key) || []), a]); });
    const weeks = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
    const current = weekKey(new Date());
    const [open, setOpen] = useState(() => Object.fromEntries(weeks.map(([key]) => [key, key === current])));
    useEffect(() => setOpen(previous => Object.fromEntries(weeks.map(([key]) => [key, previous[key] ?? key === current]))), [assigns.length]);
    return React.createElement("div", { className: "space-y-3" }, weeks.map(([key, items]) => React.createElement("section", { key: key, className: "rounded-2xl border bg-white overflow-hidden", style: { borderColor: LIST_BORDER } },
        React.createElement("button", { onClick: () => setOpen(value => ({ ...value, [key]: !value[key] })), className: "w-full px-4 py-3 flex items-center justify-between text-left" },
            React.createElement("b", { className: "flex min-h-[18px] items-center text-[14px] leading-[18px]" }, weekLabel(key)),
            React.createElement("span", { className: "flex h-[18px] w-[18px] shrink-0 items-center justify-center" },
                React.createElement("span", { className: `flex h-[18px] w-[18px] items-center justify-center ${open[key] ? 'rotate-180' : 'rotate-0'}` }, React.createElement(ChevronDown, null)))),
        open[key] && React.createElement("div", { className: "border-t px-3 py-3 space-y-3", style: { borderColor: '#EEEEEE' } }, items.map(renderCard)))));
}
function makeDeepLink(kind, { assignmentId, noticeId, student } = {}) {
    const params = new URLSearchParams({ kind });
    if (assignmentId)
        params.set('assignmentId', String(assignmentId));
    if (noticeId)
        params.set('noticeId', String(noticeId));
    if (student)
        params.set('student', String(student));
    return `/?${params.toString()}`;
}
async function optimizeProfileImage(file) {
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 200 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .72));
    if (!blob)
        throw new Error('프로필 사진을 최적화하지 못했어요.');
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'profile'}.webp`, { type: 'image/webp' });
}
const Icon = {
    back: () => React.createElement("svg", { width: NAV_CHEVRON_SIZE, height: NAV_CHEVRON_SIZE, viewBox: "0 0 24 24", fill: "none", stroke: NAV_CHEVRON_COLOR, strokeWidth: NAV_CHEVRON_STROKE, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "m15 18-6-6 6-6" })),
    home: (on = false) => React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: on ? C : '#AFAFAF', strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "M3 10.5 12 3l9 7.5V21H5a2 2 0 0 1-2-2z" }),
        React.createElement("path", { d: "M9 21v-7h6v7" })),
    task: (on = false) => React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: on ? C : '#AFAFAF', strokeWidth: "2", strokeLinecap: "round" },
        React.createElement("rect", { x: "5", y: "3", width: "14", height: "18", rx: "2" }),
        React.createElement("path", { d: "M9 8h6M9 12h6M9 16h4" })),
    bell: (on = false) => React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: on ? C : '#AFAFAF', strokeWidth: "2", strokeLinecap: "round" },
        React.createElement("path", { d: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" }),
        React.createElement("path", { d: "M10 20h4" })),
    notice: (on = false) => React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: on ? C : '#AFAFAF', strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "m3 11 18-5v12L3 14v-3Z" }),
        React.createElement("path", { d: "M7 15.2 8.5 21H13l-1.2-7" })),
    users: (on = false) => React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: on ? C : '#AFAFAF', strokeWidth: "2", strokeLinecap: "round" },
        React.createElement("circle", { cx: "9", cy: "8", r: "4" }),
        React.createElement("path", { d: "M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M16 5a4 4 0 0 1 0 7.5M18 15a5 5 0 0 1 4 4.9V21" })),
    play: () => React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "white" },
        React.createElement("path", { d: "m7 4 13 8-13 8z" })),
    pause: () => React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "white" },
        React.createElement("path", { d: "M6 4h4v16H6zM14 4h4v16h-4z" })),
    right: () => React.createElement("svg", { width: NAV_CHEVRON_SIZE, height: NAV_CHEVRON_SIZE, viewBox: "0 0 24 24", fill: "none", stroke: NAV_CHEVRON_COLOR, strokeWidth: NAV_CHEVRON_STROKE, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "m9 18 6-6-6-6" })),
};
function Frame({ children, white = false }) {
    return React.createElement("div", { className: "min-h-[100dvh] sm:bg-[#EFEFEF] sm:flex sm:justify-center sm:py-3" },
        React.createElement("main", { className: `${white ? 'bg-white' : 'bg-[#F7F7F7]'} w-full sm:max-w-[393px] h-[100dvh] sm:h-[min(852px,calc(100dvh-24px))] flex flex-col overflow-hidden` }, children));
}
function Toast({ text }) { return text ? React.createElement("div", { className: "fixed z-[99] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2.5 rounded-xl bg-[#333] text-white text-[13px] font-bold shadow-lg max-w-[330px] text-center" }, text) : null; }
function Banner({ banner }) { if (!banner.enabled || !banner.message.trim())
    return null; return React.createElement("div", { className: "shrink-0", style: { background: '#1FEB09', paddingTop: 'env(safe-area-inset-top)' } },
    React.createElement("div", { className: "px-4 py-2.5 text-[13px] font-black text-black whitespace-pre-wrap break-words" }, banner.message)); }
function Avatar({ name, src, size = 42 }) { return React.createElement("div", { className: "rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-black", style: { width: size, height: size, background: src ? 'transparent' : C } }, src ? React.createElement("img", { src: src, className: "w-full h-full object-cover" }) : React.createElement("span", null, name.slice(0, 1))); }
function ChevronDown() { return React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "#62666D", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
    React.createElement("path", { d: "m7 10 5 5 5-5" })); }
function FeedbackChevron({ open }) { return React.createElement("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "#62666D", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
    React.createElement("path", { d: open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6" })); }
function BrandLogo({ small = false }) { return React.createElement("div", { className: "flex items-center min-w-0", style: { gap: small ? 7 : 9 } },
    React.createElement("img", { src: BRAND_CHARACTER, alt: "", className: "shrink-0 object-contain", style: { width: small ? 34 : 40, height: small ? 34 : 40 } }),
    React.createElement("b", { className: small ? "text-[14px] whitespace-nowrap" : "text-[16px] whitespace-nowrap" }, "린중국어학원")); }
function AccountMenu({ user, avatarUrl, onLogout, onChangePassword, onAvatar, onInstall, pushEnabled, onTogglePush }) {
    const [open, setOpen] = useState(false);
    const [changing, setChanging] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const closeChange = () => { setChanging(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setError(''); };
    const submitChange = async () => {
        if (newPassword.length < 4)
            return setError('새 비밀번호는 4자리 이상 입력해 주세요.');
        if (newPassword !== confirmPassword)
            return setError('새 비밀번호가 서로 일치하지 않아요.');
        setSaving(true); setError('');
        try {
            await onChangePassword(currentPassword, newPassword);
        }
        catch (e) {
            setError(e.message || '비밀번호 변경에 실패했어요.');
        }
        finally {
            setSaving(false);
        }
    };
    return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "relative" },
            React.createElement("button", { onClick: () => setOpen(v => !v), className: "flex items-center gap-1.5 p-0.5 leading-none", "aria-label": "계정 메뉴" },
                React.createElement(Avatar, { name: user.username, src: avatarUrl, size: 38 }),
                React.createElement("span", { className: "max-w-[72px] truncate text-[13px] font-bold text-[#333]" }, user.username),
                React.createElement("span", { className: "flex h-[18px] w-[18px] shrink-0 items-center justify-center" }, React.createElement(ChevronDown, null))),
            open && React.createElement(React.Fragment, null,
                React.createElement("button", { className: "fixed inset-0 z-40 cursor-default", onClick: () => setOpen(false), "aria-label": "계정 메뉴 닫기" }),
                React.createElement("div", { className: "absolute right-0 top-[44px] z-50 w-[190px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl" },
                    React.createElement("div", { className: "border-b border-[#EFEFEF] px-4 py-3" },
                        React.createElement("b", { className: "block text-[14px]" }, user.username),
                        React.createElement("span", { className: "text-[11px] text-[#999]" }, user.role === 'teacher' ? '선생님 계정' : '학생 계정')),
                    onAvatar && React.createElement("label", { className: "block cursor-pointer px-4 py-3 text-[13px] font-bold hover:bg-[#F7F7F7]" },
                        "프로필 사진 변경",
                        React.createElement("input", { type: "file", accept: "image/*", className: "hidden", onChange: e => { const f = e.target.files?.[0]; setOpen(false); if (f)
                                onAvatar(f); } })),
                    onInstall && React.createElement("button", { onClick: () => { setOpen(false); onInstall(); }, className: "block w-full px-4 py-3 text-left text-[13px] font-bold hover:bg-[#F7F7F7]" }, "홈 화면에 추가"),
                    onTogglePush && React.createElement("button", { onClick: () => { setOpen(false); onTogglePush(); }, className: "block w-full px-4 py-3 text-left text-[13px] font-bold hover:bg-[#F7F7F7]" }, pushEnabled ? '푸시 알림 끄기' : '푸시 알림 켜기'),
                    React.createElement("button", { onClick: () => { setOpen(false); setChanging(true); }, className: "block w-full px-4 py-3 text-left text-[13px] font-bold hover:bg-[#F7F7F7]" }, "비밀번호 변경"),
                    React.createElement("button", { onClick: onLogout, className: "block w-full border-t border-[#EFEFEF] px-4 py-3 text-left text-[13px] font-bold text-[#E45F57] hover:bg-[#FFF5F3]" }, "로그아웃")))),
        changing && React.createElement("div", { className: "fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-5" },
            React.createElement("div", { className: "w-full max-w-[345px] rounded-[20px] bg-white p-5 shadow-2xl" },
                React.createElement("div", { className: "flex items-center justify-between" },
                    React.createElement("h2", { className: "text-[20px] font-black" }, "비밀번호 변경"),
                    React.createElement("button", { onClick: closeChange, className: "h-9 w-9 rounded-full bg-[#F3F4F6] text-[18px] text-[#777]", "aria-label": "닫기" }, "×")),
                React.createElement("p", { className: "mt-1 text-[12px] text-[#999]" }, "변경 후에는 새 비밀번호로 다시 로그인해 주세요."),
                React.createElement("label", { className: "mt-5 block text-[13px] font-bold" }, "현재 비밀번호"),
                React.createElement("input", { type: "password", value: currentPassword, onChange: e => setCurrentPassword(e.target.value), className: "mt-2 h-12 w-full rounded-xl border px-4 text-[16px] outline-none focus:border-[#FF6B5F]", style: { borderColor: BORDER }, autoComplete: "current-password" }),
                React.createElement("label", { className: "mt-4 block text-[13px] font-bold" }, "새 비밀번호"),
                React.createElement("input", { type: "password", value: newPassword, onChange: e => setNewPassword(e.target.value), className: "mt-2 h-12 w-full rounded-xl border px-4 text-[16px] outline-none focus:border-[#FF6B5F]", style: { borderColor: BORDER }, placeholder: "4자리 이상", autoComplete: "new-password" }),
                React.createElement("label", { className: "mt-4 block text-[13px] font-bold" }, "새 비밀번호 확인"),
                React.createElement("input", { type: "password", value: confirmPassword, onChange: e => setConfirmPassword(e.target.value), onKeyDown: e => e.key === 'Enter' && currentPassword && newPassword && confirmPassword && submitChange(), className: "mt-2 h-12 w-full rounded-xl border px-4 text-[16px] outline-none focus:border-[#FF6B5F]", style: { borderColor: BORDER }, autoComplete: "new-password" }),
                error && React.createElement("p", { className: "mt-3 text-[12px] font-bold text-[#E45F57]" }, error),
                React.createElement("button", { disabled: saving || !currentPassword || !newPassword || !confirmPassword, onClick: submitChange, className: "mt-5 h-12 w-full rounded-2xl text-[14px] font-black text-white disabled:opacity-40", style: { background: C } }, saving ? '변경 중...' : '변경하기'))));
}
function CameraIcon() { return React.createElement("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M14.5 4.5 16 7h2.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-7A2.5 2.5 0 0 1 5.5 7H8l1.5-2.5z" }),
    React.createElement("circle", { cx: "12", cy: "13", r: "3.5" })); }
function CloudUploadIcon() { return React.createElement("svg", { width: "32", height: "32", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: "M12 13v8m-4-4 4-4 4 4" }),
    React.createElement("path", { d: "M4.4 15.3A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.7 8.1" })); }
function UploadBox({ fileName, onChange, disabled = false }) {
    const androidPwa = /Android/i.test(navigator.userAgent) && window.matchMedia('(display-mode: standalone)').matches && 'showOpenFilePicker' in window;
    const pickAndroidFile = async () => {
        if (disabled)
            return;
        try {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [{
                        description: '녹음 파일',
                        accept: {
                            'audio/mpeg': ['.mp3'],
                            'audio/mp4': ['.m4a'],
                            'audio/wav': ['.wav'],
                        },
                    }],
            });
            const file = await handle.getFile();
            onChange({ target: { files: [file] } });
        }
        catch (e) {
            if (e?.name !== 'AbortError')
                throw e;
        }
    };
    const boxContent = React.createElement(React.Fragment, null,
        React.createElement("span", { className: "text-[#9AA3B2] leading-none" }, React.createElement(CloudUploadIcon, null)),
        React.createElement("b", { className: "mt-1 text-[14px] leading-5 text-[#697284]" }, fileName || '파일을 업로드하세요'),
        React.createElement("span", { className: "mt-1 text-[12px] leading-4 text-[#9CA5B5]" }, "mp3, m4a, wav / 최대 20MB"));
    if (androidPwa)
        return React.createElement("button", { type: "button", disabled: disabled, onClick: pickAndroidFile, className: "w-full h-[122px] rounded-[16px] border-2 border-dashed bg-white cursor-pointer flex flex-col items-center justify-center disabled:cursor-not-allowed disabled:opacity-50", style: { borderColor: '#29ADBD' } }, boxContent);
    return React.createElement("label", { className: `block w-full h-[122px] rounded-[16px] border-2 border-dashed bg-white flex flex-col items-center justify-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`, style: { borderColor: '#29ADBD' } },
        React.createElement("input", { type: "file", disabled: disabled, accept: "audio/m4a,audio/mp4,audio/mpeg,audio/wav,.m4a,.mp3,.wav,audio/mp3,audio/x-m4a,audio/x-wav", className: "hidden", onChange: onChange }),
        boxContent);
}
function AssignmentTypeIcon({ type }) {
    const cfg = type === 'writing' ? { label: '作文', bg: '#FFF0ED', color: '#E86F69', icon: React.createElement("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" })) } : type === 'recording' ? { label: '录音', bg: '#E2F7FA', color: '#20AFC3', icon: React.createElement("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }), React.createElement("path", { d: "M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" })) } : { label: '练习', bg: '#EEF0FF', color: '#778BD4', icon: React.createElement("svg", { width: "30", height: "30", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M2 4.5A3.5 3.5 0 0 1 5.5 3H11v17H5.5A3.5 3.5 0 0 0 2 21.5zM22 4.5A3.5 3.5 0 0 0 18.5 3H13v17h5.5a3.5 3.5 0 0 1 3.5 1.5z" })) };
    return React.createElement("span", { className: "w-16 h-16 rounded-2xl shrink-0 flex flex-col items-center justify-center", style: { background: cfg.bg, color: cfg.color } },
        cfg.icon,
        React.createElement("b", { className: "mt-0.5 text-[13px]", style: { fontFamily: "'Noto Sans SC',sans-serif" } }, cfg.label));
}
function TypeBadge({ type }) { const x = type === 'writing' ? ['作文', '#FFF0ED', C] : type === 'recording' ? ['录音', '#E7F7F8', '#279EAC'] : ['练习', '#EEF0FF', '#6575C8']; return React.createElement("span", { className: "px-2.5 py-1 rounded-full text-[11px] font-bold", style: { background: x[1], color: x[2], fontFamily: "'Noto Sans SC',sans-serif" } }, x[0]); }
function Header({ title, onBack, onHome }) { return React.createElement("div", { className: "bg-white shrink-0 border-b border-[#E5E7EB]", style: { paddingTop: 'env(safe-area-inset-top)' } },
    React.createElement("div", { className: "h-[68px] px-3 flex items-center justify-between" },
        React.createElement("button", { className: "w-10 h-10 grid place-items-center text-[#333]", onClick: onBack }, onBack && Icon.back()),
        React.createElement("div", { className: "flex items-center leading-none" },
            React.createElement(BrandLogo, { small: true })),
        React.createElement("button", { className: "w-10 h-10 grid place-items-center", onClick: onHome }, onHome && React.cloneElement(Icon.home(false), { width: "24", height: "24", stroke: "#666" })))); }
function Empty({ children }) { return React.createElement("div", { className: "py-14 text-center text-[13px] text-[#999]" }, children); }
function AudioPlayer({ src, label, downloadName }) {
    const ref = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [cur, setCur] = useState(0);
    const [dur, setDur] = useState(0);
    useEffect(() => { setPlaying(false); setCur(0); setDur(0); if (ref.current)
        ref.current.load(); }, [src]);
    const fm = (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
    const toggle = async () => { const a = ref.current; if (!a || !src)
        return; if (a.paused) {
        try {
            await a.play();
        }
        catch { }
    }
    else
        a.pause(); };
    const download = async () => { if (!src)
        return; try {
        const response = await fetch(src);
        if (!response.ok)
            throw new Error('download failed');
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = downloadName || label || 'recording';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
    catch {
        window.open(src, '_blank', 'noopener');
    } };
    return React.createElement("div", { className: "rounded-2xl border bg-white p-3 flex gap-3 items-center", style: { borderColor: BORDER } },
        React.createElement("audio", { ref: ref, src: src || undefined, preload: "metadata", onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false), onLoadedMetadata: e => setDur(e.currentTarget.duration || 0), onDurationChange: e => setDur(e.currentTarget.duration || 0), onTimeUpdate: e => setCur(e.currentTarget.currentTime || 0) }),
        React.createElement("button", { onClick: toggle, disabled: !src, className: "w-10 h-10 rounded-full grid place-items-center disabled:opacity-40 shrink-0", style: { background: C } }, playing ? Icon.pause() : Icon.play()),
        React.createElement("div", { className: "min-w-0 flex-1" },
            React.createElement("div", { className: "text-[11px] text-[#666] truncate mb-1.5" }, label),
            React.createElement("input", { type: "range", min: 0, max: dur || 1, step: "0.01", value: Math.min(cur, dur || 0), onChange: e => { const v = Number(e.target.value); setCur(v); if (ref.current)
                    ref.current.currentTime = v; }, className: "audio-range w-full", style: { background: `linear-gradient(to right, ${C} 0%, ${C} ${dur ? Math.min(100, (cur / dur) * 100) : 0}%, #D7DCE2 ${dur ? Math.min(100, (cur / dur) * 100) : 0}%, #D7DCE2 100%)` } }),
            React.createElement("div", { className: "flex justify-between text-[10px] text-[#999]" },
                React.createElement("span", null, fm(cur)),
                React.createElement("span", null, dur ? fm(dur) : '0:00'))),
        downloadName && React.createElement("button", { type: "button", onClick: download, className: "shrink-0 px-2.5 py-1.5 rounded-lg bg-[#F1F1F1] text-[11px] font-bold text-[#666]" }, "다운로드"));
}
function Login({ onLogin, onSignup, busy }) {
    const [name, setName] = useState('');
    const [pw, setPw] = useState('');
    return React.createElement(Frame, { white: true },
        React.createElement("div", { className: "shrink min-h-0 w-full flex items-end justify-center overflow-hidden", style: { height: 'clamp(175px,43.5dvh,392px)' } },
            React.createElement("div", { className: "w-[250px] max-w-[64%] flex flex-col items-center justify-end pb-3" },
                React.createElement("img", { src: LOGIN_LOGO, alt: "린중국어", className: "w-full max-w-[234px] h-auto object-contain" }),
                React.createElement("p", { className: "mt-2 text-[14px] leading-5 text-center whitespace-nowrap" }, "作业要做，单词也要乖乖背好再来哦~😎"))),
        React.createElement("div", { className: "flex-1 min-h-0 flex flex-col items-center justify-center px-8", style: { gap: 'clamp(7px,1.75dvh,15px)', paddingTop: 'clamp(6px,2dvh,20px)', paddingBottom: 'clamp(6px,2dvh,20px)' } },
            React.createElement("label", { className: "w-full max-w-[311px] text-[13px] font-bold" }, "\uC774\uB984"),
            React.createElement("input", { value: name, onChange: e => setName(e.target.value), placeholder: "\uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694", className: "w-full max-w-[311px] rounded-xl px-4 outline-none border focus:border-[#FF6B5F] text-[16px] placeholder:text-[13px]", style: { height: 'clamp(44px,6.57dvh,56px)', borderColor: '#BBBBBB' } }),
            React.createElement("label", { className: "w-full max-w-[311px] text-[13px] font-bold" }, "\uBE44\uBC00\uBC88\uD638"),
            React.createElement("input", { value: pw, onChange: e => setPw(e.target.value), type: "password", placeholder: "\uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD558\uC138\uC694", onKeyDown: e => e.key === 'Enter' && name && pw && onLogin(name, pw), className: "w-full max-w-[311px] rounded-xl px-4 outline-none border focus:border-[#FF6B5F] text-[16px] placeholder:text-[13px]", style: { height: 'clamp(44px,6.57dvh,56px)', borderColor: '#BBBBBB' } }),
            React.createElement("button", { disabled: busy || !name.trim() || !pw, onClick: () => onLogin(name.trim(), pw), className: "w-full max-w-[311px] rounded-2xl font-bold text-white disabled:opacity-50", style: { height: 'clamp(44px,6.57dvh,56px)', background: C, fontSize: 13 } }, "\uB85C\uADF8\uC778"),
            React.createElement("button", { onClick: onSignup, className: "w-full max-w-[311px] font-bold text-black text-center", style: { fontSize: 13 } }, "\uACC4\uC815\uC0DD\uC131\uD558\uAE30")),
        React.createElement("p", { className: "shrink-0 text-[13px] text-[#99A1AF] text-center", style: { height: 'clamp(32px,5.75dvh,49px)' } }, "\uC219\uC81C \uC54C\uB9BC \uC571 v1.0"));
}
function Signup({ onBack, onCreate, busy }) {
    const [name, setName] = useState('');
    const [pw, setPw] = useState('');
    const [levels, setLevels] = useState([]);
    const [chapters, setChapters] = useState({});
    const [file, setFile] = useState(null);
    const preview = file ? URL.createObjectURL(file) : null;
    const toggleLevel = (level) => {
        setLevels(v => v.includes(level) ? v.filter(x => x !== level) : [...v, level]);
        setChapters(v => ({ ...v, [level]: v[level] || '1' }));
    };
    const chaptersReady = levels.every(level => Number(chapters[level]) >= 1);
    return React.createElement(Frame, null,
        React.createElement(Header, { title: "\uACC4\uC815 \uC0DD\uC131", onBack: onBack }),
        React.createElement("div", { className: "flex-1 overflow-y-auto p-5" },
            React.createElement("div", { className: "flex justify-center mb-6" },
                React.createElement("label", { className: "cursor-pointer" },
                    preview ? React.createElement(Avatar, { name: name || '?', src: preview, size: 72 }) : React.createElement("span", { className: "w-[72px] h-[72px] rounded-full bg-white border flex items-center justify-center text-[#B0B0B0]", style: { borderColor: BORDER } }, React.createElement(CameraIcon, null)),
                    React.createElement("input", { className: "hidden", type: "file", accept: "image/*", onChange: e => setFile(e.target.files?.[0] || null) }),
                    React.createElement("div", { className: "text-[11px] text-center text-[#888] mt-2" }, "프로필 사진 (선택)"))),
            React.createElement("div", { className: "space-y-4" },
                React.createElement("div", null,
                    React.createElement("label", { className: "text-[13px] font-bold" }, "\uC774\uB984"),
                    React.createElement("input", { className: "mt-1.5 w-full h-12 bg-white rounded-xl border px-4 text-[16px] outline-none focus:border-[#FF6B5F]", style: { borderColor: BORDER }, value: name, onChange: e => setName(e.target.value) })),
                React.createElement("div", null,
                    React.createElement("label", { className: "text-[13px] font-bold" }, "\uBE44\uBC00\uBC88\uD638"),
                    React.createElement("input", { type: "password", className: "mt-1.5 w-full h-12 bg-white rounded-xl border px-4 text-[16px] outline-none focus:border-[#FF6B5F]", style: { borderColor: BORDER }, value: pw, onChange: e => setPw(e.target.value), placeholder: "4\uC790\uB9AC \uC774\uC0C1" })),
                React.createElement("div", null,
                    React.createElement("label", { className: "text-[13px] font-bold" }, "단어시험 급수 · 시작 과 (선택)"),
                    React.createElement("div", { className: "grid grid-cols-2 gap-2 mt-2" }, LEVELS.map(level => {
                        const selected = levels.includes(level);
                        return React.createElement("div", { key: level, className: "flex items-center gap-2" },
                            React.createElement("button", { type: "button", onClick: () => toggleLevel(level), className: "shrink-0 w-[58px] py-2 rounded-full border text-[13px] font-bold", style: { background: selected ? C : '#fff', borderColor: selected ? C : '#D8D8D8', color: selected ? '#fff' : '#777' } }, level),
                            selected && React.createElement("label", { className: "flex-1 min-w-0 h-10 bg-white rounded-xl border px-2 flex items-center", style: { borderColor: BORDER } },
                                React.createElement("input", { type: "number", min: "1", inputMode: "numeric", value: chapters[level] || '', onChange: e => setChapters(v => ({ ...v, [level]: e.target.value })), className: "min-w-0 w-full text-center text-[15px] outline-none", "aria-label": `${level} 시작 과` }),
                                React.createElement("span", { className: "text-[13px] text-[#777]" }, "과")));
                    })))),
            React.createElement("button", { disabled: busy || !name.trim() || pw.length < 4 || !chaptersReady, onClick: () => onCreate(name.trim(), pw, levels.map(level => ({ level, chapter: Number(chapters[level]) - 1 })), file), className: "mt-8 w-full h-13 rounded-2xl font-black text-white disabled:opacity-40", style: { background: C, fontSize: 13 } }, "\uACC4\uC815 \uB9CC\uB4E4\uAE30")));
}
function StudentNav({ tab, setTab }) { const items = [['home', '홈', Icon.home], ['homework', '과제', Icon.task], ['notifications', '알림', Icon.bell]]; return React.createElement("nav", { className: "shrink-0 bg-white border-t flex", style: { paddingBottom: 'env(safe-area-inset-bottom)' } }, items.map(([k, l, I]) => React.createElement("button", { key: k, onClick: () => setTab(k), className: "flex-1 py-2 flex flex-col items-center justify-center gap-1" },
    React.cloneElement(I(tab === k), { width: "24", height: "24", stroke: tab === k ? C : '#666' }),
    React.createElement("span", { className: "text-[11px] font-bold", style: { color: tab === k ? C : '#666' } }, l)))); }
function TeacherNav({ tab, setTab }) { const items = [['home', '홈', Icon.home], ['students', '학생', Icon.users], ['homework', '과제', Icon.task], ['notifications', '알림', Icon.bell], ['notice', '공지', Icon.notice]]; return React.createElement("nav", { className: "shrink-0 bg-white border-t flex", style: { paddingBottom: 'env(safe-area-inset-bottom)' } }, items.map(([k, l, I]) => React.createElement("button", { key: k, onClick: () => setTab(k), className: "flex-1 py-2 flex flex-col items-center justify-center gap-1" },
    React.cloneElement(I(tab === k), { width: "24", height: "24", stroke: tab === k ? C : '#666' }),
    React.createElement("span", { className: "text-[11px] font-bold", style: { color: tab === k ? C : '#666' } }, l)))); }
function StudentApp({ user, assigns, notices, dismissedNoticeIds, vocab, banner, students, tab, setTab, onOpen, onOpenNotice, onDismissNotice, onDismissAllNotices, onLogout, onChangePassword, onAvatar, onInstall, pushEnabled, onTogglePush, refresh }) {
    const me = students.find(s => s.name === user.username);
    const active = assigns.filter(a => !a.archived);
    const dismissed = new Set((dismissedNoticeIds || []).map(String));
    const myNotices = notices.filter(n => n.audience !== 'teacher' && (!n.user || n.user === user.username) && !dismissed.has(String(n.id))).slice().reverse();
    const vv = vocab[user.username] || user.vocab || [];
    const card = (a) => { const sub = a.subs?.[user.username] || {}; const feedbackComplete = isFeedbackComplete(sub); const status = feedbackComplete ? '피드백 완료' : sub.submitted ? '제출 완료' : '미제출'; const statusColor = feedbackComplete ? C : sub.submitted ? '#29ADBD' : '#8E8E8E'; return React.createElement("button", { key: a.id, onClick: () => onOpen(a), className: "w-full min-h-[98px] bg-white rounded-[16px] border px-4 py-3 text-left flex items-center gap-4 active:scale-[.99]", style: { borderColor: LIST_BORDER } },
        React.createElement(AssignmentTypeIcon, { type: a.type }),
        React.createElement("span", { className: "flex-1 min-w-0" },
            React.createElement("strong", { className: "block text-[16px] font-black text-[#101828] leading-snug" }, a.title),
            a.type !== 'exercise' && React.createElement("span", { className: "block mt-1 text-[13px] font-bold", style: { color: statusColor } }, status)),
        React.createElement("span", { className: "shrink-0" }, Icon.right())); };
    return React.createElement(Frame, null,
        React.createElement(Banner, { banner: banner }),
        React.createElement("div", { className: "shrink-0 bg-white px-5 py-4 flex items-center justify-between" },
            React.createElement("div", { className: "min-w-0" },
                React.createElement(BrandLogo, null)),
            React.createElement(AccountMenu, { user: user, avatarUrl: me?.avatar || user.avatarUrl, onLogout: onLogout, onChangePassword: onChangePassword, onAvatar: onAvatar, onInstall: onInstall, pushEnabled: pushEnabled, onTogglePush: onTogglePush })),
        React.createElement("div", { className: "flex-1 overflow-y-auto px-4 py-4" },
            tab === 'home' && React.createElement(React.Fragment, null,
                React.createElement("section", { className: "mb-5" },
                    React.createElement("div", { className: "flex items-center justify-between mb-2" },
                        React.createElement("h2", { className: "text-[13px] font-black" }, "\uB2E8\uC5B4\uC2DC\uD5D8 \uC9C4\uB3C4"),
                        React.createElement("button", { onClick: refresh, className: "text-[11px] text-[#999]" }, "\uC0C8\uB85C\uACE0\uCE68")),
                    React.createElement("div", { className: "bg-white rounded-2xl border p-4", style: { borderColor: BORDER } }, vv.length ? vv.map(v => React.createElement("div", { key: v.level, className: "flex items-center justify-between py-1.5" },
                        React.createElement("span", { className: "text-[13px] font-bold text-[#777]" }, v.level),
                        React.createElement("b", { className: "text-[16px]" },
                            v.chapter + 1,
                            "\uACFC"))) : React.createElement("span", { className: "text-[13px] text-[#999]" }, "\uB4F1\uB85D\uB41C \uB2E8\uC5B4\uC2DC\uD5D8\uC774 \uC5C6\uC5B4\uC694."))),
                React.createElement("h1", { className: "text-[25px] font-black mb-3", style: { fontFamily: "'Noto Sans SC',sans-serif" } }, "\u672C\u5468\u4EFB\u52A1"),
                React.createElement("div", { className: "space-y-3" }, active.length ? active.slice(0, 4).map(card) : React.createElement(Empty, null, "\uB4F1\uB85D\uB41C \uC219\uC81C\uAC00 \uC5C6\uC5B4\uC694."))),
            tab === 'homework' && React.createElement(React.Fragment, null,
                React.createElement("h1", { className: "text-[26px] font-black mb-4" }, "\uB0B4 \uACFC\uC81C"),
                active.length ? React.createElement(AssignmentWeekList, { assigns: active, renderCard: card }) : React.createElement(Empty, null, "\uB4F1\uB85D\uB41C \uC219\uC81C\uAC00 \uC5C6\uC5B4\uC694.")),
            tab === 'notifications' && React.createElement(React.Fragment, null,
                React.createElement("div", { className: "flex items-center justify-between mb-4" },
                    React.createElement("h1", { className: "text-[26px] font-black" }, "\uC54C\uB9BC"),
                    myNotices.length > 0 && React.createElement("button", { onClick: () => onDismissAllNotices(myNotices.map(n => n.id)), className: "text-[13px] font-bold text-[#777]" }, "전체 삭제")),
                React.createElement("div", { className: "space-y-2" }, myNotices.length ? myNotices.map(n => React.createElement("div", { key: n.id, className: "bg-white rounded-2xl border p-4", style: { borderColor: '#E2E2E2' } },
                    React.createElement("div", { className: "flex items-start gap-3" },
                        React.createElement("button", { onClick: () => onOpenNotice(n), className: "min-w-0 flex-1 text-left text-[13px] font-bold leading-relaxed whitespace-pre-wrap" }, n.message),
                        React.createElement("button", { onClick: () => onDismissNotice(n.id), className: "shrink-0 text-[12px] font-bold text-[#999]", "aria-label": "알림 삭제" }, "삭제")),
                    React.createElement("div", { className: "mt-2 text-[10px] text-[#AAA]" }, n.createdAt))) : React.createElement(Empty, null, "\uC0C8 \uC54C\uB9BC\uC774 \uC5C6\uC5B4\uC694.")))),
        React.createElement(StudentNav, { tab: tab, setTab: setTab }));
}
function StudentDetail({ user, a, onBack, onSubmit, busy }) {
    const sub = a.subs?.[user.username] || { submitted: false };
    const [text, setText] = useState(sub.answer || '');
    const [file, setFile] = useState(null);
    const writing = a.type === 'writing';
    const feedbackLocked = isFeedbackComplete(sub);
    return React.createElement(Frame, null,
        React.createElement(Header, { title: "\uACFC\uC81C", onBack: onBack, onHome: onBack }),
        React.createElement("div", { className: writing ? "flex-1 min-h-0 p-4 flex flex-col" : "flex-1 overflow-y-auto p-4", style: writing ? { paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' } : undefined },
            React.createElement("div", { className: `${writing ? 'shrink-0 ' : ''}bg-white rounded-2xl border p-4`, style: { borderColor: BORDER } },
                React.createElement(TypeBadge, { type: a.type }),
                React.createElement("h1", { className: "mt-3 text-[20px] font-black leading-snug" }, a.title),
                a.description && React.createElement("p", { className: "mt-3 text-[14px] leading-[23px] text-[#1E2939] whitespace-pre-wrap" }, a.description)),
            a.type === 'recording' && a.sampleFile && React.createElement("section", { className: "mt-4" },
                React.createElement("div", { className: "text-[13px] font-black mb-2" }, "교재 녹음본"),
                React.createElement(AudioPlayer, { src: a.sampleFile.url, label: a.sampleFile.name, downloadName: a.sampleFile.name || '교재 녹음본' })),
            a.type === 'writing' && React.createElement("textarea", { disabled: feedbackLocked, value: text, onChange: e => setText(e.target.value), className: "mt-4 flex-1 min-h-0 w-full rounded-2xl border bg-white p-4 text-[16px] outline-none focus:border-[#FF6B5F] disabled:cursor-not-allowed disabled:bg-[#F7F7F7]", style: { borderColor: BORDER }, placeholder: "\uC5EC\uAE30\uC5D0 \uC791\uBB38\uC744 \uC791\uC131\uD558\uC138\uC694." }),
            a.type === 'recording' && React.createElement("div", { className: "mt-4" },
                React.createElement(UploadBox, { disabled: feedbackLocked, fileName: file?.name, onChange: e => setFile(e.target.files?.[0] || null) }),
                sub.file && React.createElement("div", { className: "mt-3" },
                    React.createElement(AudioPlayer, { src: sub.file, label: sub.fileName || '제출한 녹음' }))),
            a.type !== 'exercise' && isFeedbackComplete(sub) && React.createElement("section", { className: "mt-4 rounded-[16px] border-2 bg-white p-4", style: { borderColor: C } },
                React.createElement("div", { className: "text-[13px] font-black", style: { color: C } }, "\u8001\u5E08\u8BC4\u8BED"),
                React.createElement("p", { className: "mt-2 text-[14px] leading-[23px] text-[#1E2939] whitespace-pre-wrap" }, sub.comment),
                sub.feedbackAt && React.createElement("div", { className: "mt-2 text-[11px] text-[#99A1AF]" }, sub.feedbackAt)),
            a.type !== 'exercise' && React.createElement("button", { disabled: feedbackLocked || busy || (a.type === 'recording' && !file), onClick: () => onSubmit(text, file || undefined), className: `${writing ? 'shrink-0 ' : ''}mt-5 w-full h-12 rounded-2xl font-black text-white disabled:opacity-40`, style: { background: C, fontSize: 13 } }, sub.submitted ? '다시 제출' : '제출하기')));
}
function NoticeDetail({ notice, onBack }) {
    return React.createElement(Frame, null,
        React.createElement(Header, { title: "공지", onBack: onBack, onHome: onBack }),
        React.createElement("div", { className: "flex-1 overflow-y-auto p-4" },
            React.createElement("article", { className: "bg-white rounded-2xl border p-4", style: { borderColor: BORDER } },
                React.createElement("b", { className: "text-[12px]", style: { color: C } }, "공지"),
                React.createElement("p", { className: "mt-3 text-[16px] font-bold leading-7 whitespace-pre-wrap" }, notice.message),
                React.createElement("div", { className: "mt-4 text-[11px] text-[#999]" }, notice.createdAt))));
}
function TeacherApp({ user, assigns, students, vocab, notices, dismissedNoticeIds, banner, tab, setTab, onCreate, onEdit, onDelete, onReview, onOpenNotice, onStudent, onDeleteStudent, onDismissNotice, onDismissAllNotices, onLogout, onChangePassword, onInstall, pushEnabled, onTogglePush, onSaveBanner, refresh }) {
    const [draft, setDraft] = useState(banner);
    const [savingNotice, setSavingNotice] = useState(false);
    const activeStudents = students.filter(s => s.active);
    const activeAssigns = assigns.filter(a => !a.archived);
    const submittableAssigns = activeAssigns.filter(a => a.type !== 'exercise');
    const dismissed = new Set((dismissedNoticeIds || []).map(String));
    const teacherNotices = notices.filter(n => n.audience === 'teacher' && !dismissed.has(String(n.id))).slice().reverse();
    const studentSummary = (name) => {
        const submitted = submittableAssigns.filter(a => a.subs?.[name]?.submitted).length;
        const feedback = submittableAssigns.filter(a => isFeedbackComplete(a.subs?.[name])).length;
        const progress = (vocab[name] || []).map(v => `${v.level} ${v.chapter + 1}과`).join(', ');
        return `제출 ${submitted}/${submittableAssigns.length} · 피드백 ${feedback}건${progress ? ` · ${progress}` : ''}`;
    };
    const homeworkCard = (a) => { const trackable = a.type !== 'exercise'; const submitted = activeStudents.filter(s => a.subs?.[s.name]?.submitted).length; const total = activeStudents.length; const percent = total ? Math.min(100, (submitted / total) * 100) : 0; return React.createElement("div", { key: a.id, role: "button", tabIndex: 0, onClick: () => onReview(a), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReview(a); } }, className: "bg-white rounded-2xl border p-4 cursor-pointer active:scale-[.99]", style: { borderColor: LIST_BORDER } },
        React.createElement("div", { className: "flex justify-between items-start" },
            React.createElement(TypeBadge, { type: a.type }),
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { onClick: e => { e.stopPropagation(); onEdit(a); }, className: "px-3 py-1.5 rounded-lg bg-[#F1F1F1] font-bold", style: { fontSize: 13 } }, "\uC218\uC815"),
                React.createElement("button", { onClick: e => { e.stopPropagation(); onDelete(a); }, className: "px-3 py-1.5 rounded-lg bg-[#F1F1F1] font-bold text-[#666]", style: { fontSize: 13 } }, "\uC0AD\uC81C"))),
        React.createElement("h3", { className: "mt-3 font-black text-[14px]" }, a.title),
        trackable && React.createElement("div", { className: "mt-4 flex items-center gap-3" },
            React.createElement("div", { className: "h-2 flex-1 overflow-hidden rounded-full bg-[#F1F1F1]" },
                React.createElement("div", { className: "h-full rounded-full", style: { width: `${percent}%`, background: C } })),
            React.createElement("span", { className: "shrink-0 text-[12px] font-bold text-[#4A5565]" }, `제출 ${submitted}/${total}`))); };
    const saveDraft = async () => { if (savingNotice)
        return; setSavingNotice(true); try {
        await onSaveBanner(draft);
    }
    finally {
        setSavingNotice(false);
    } };
    return React.createElement(Frame, null,
        React.createElement(Banner, { banner: banner }),
        React.createElement("div", { className: "shrink-0 bg-white px-5 py-4 flex justify-between items-center" },
            React.createElement("div", { className: "min-w-0" },
                React.createElement(BrandLogo, null)),
            React.createElement(AccountMenu, { user: user, onLogout: onLogout, onChangePassword: onChangePassword, onInstall: onInstall, pushEnabled: pushEnabled, onTogglePush: onTogglePush })),
        React.createElement("div", { className: "flex-1 overflow-y-auto p-4" },
            tab === 'home' && React.createElement(React.Fragment, null,
                React.createElement("h1", { className: "text-[28px] leading-7 font-black text-[#101828]", style: { fontFamily: "'Noto Sans SC',sans-serif" } }, "老师主页"),
                React.createElement("button", { onClick: onCreate, className: "mt-4 w-full h-[52px] rounded-[16px] font-black text-white text-[16px]", style: { background: C } }, "+  새 숙제 등록"),
                React.createElement("div", { className: "mt-4 text-[12px] leading-4 font-bold text-[#99A1AF]" }, "학생 현황"),
                React.createElement("div", { className: "mt-3 space-y-2" },
                    activeStudents.map(s => React.createElement("button", { key: s.name, onClick: () => onStudent(s.name), className: "w-full min-h-[74px] bg-white rounded-[16px] border px-4 py-3.5 flex items-center gap-3 text-left active:scale-[.99]", style: { borderColor: LIST_BORDER } },
                        React.createElement(Avatar, { name: s.name, src: s.avatar, size: 40 }),
                        React.createElement("span", { className: "flex-1 min-w-0" },
                            React.createElement("b", { className: "block text-[16px] leading-[26px] text-[#101828]" }, s.name),
                            React.createElement("span", { className: "block text-[12px] leading-4 text-[#99A1AF] truncate" }, studentSummary(s.name))),
                        React.createElement("span", { className: "shrink-0" }, Icon.right()))),
                    !activeStudents.length && React.createElement(Empty, null, "등록된 학생이 없어요."))),
            tab === 'students' && React.createElement(React.Fragment, null,
                React.createElement("h1", { className: "text-[26px] font-black mb-4" }, "\uD559\uC0DD"),
                React.createElement("div", { className: "space-y-2" },
                    activeStudents.map(s => React.createElement("div", { key: s.name, className: "w-full bg-white rounded-2xl border p-3.5 flex items-center text-left gap-3", style: { borderColor: LIST_BORDER } },
                        React.createElement(Avatar, { name: s.name, src: s.avatar }),
                        React.createElement("button", { onClick: () => onStudent(s.name), className: "flex-1 min-w-0 text-left" },
                            React.createElement("b", { className: "text-[14px]" }, s.name),
                            React.createElement("div", { className: "text-[11px] text-[#999] mt-1" }, (vocab[s.name] || []).map(v => `${v.level} ${v.chapter + 1}과`).join(' · ') || '단어시험 없음')),
                        React.createElement("button", { onClick: () => onDeleteStudent(s.name), className: "shrink-0 px-3 py-2 rounded-lg bg-[#F1F1F1] font-bold text-[#666]", style: { fontSize: 13 } }, "\uC0AD\uC81C"))),
                    !activeStudents.length && React.createElement(Empty, null, "\uB4F1\uB85D\uB41C \uD559\uC0DD\uC774 \uC5C6\uC5B4\uC694."))),
            tab === 'homework' && React.createElement(React.Fragment, null,
                React.createElement("div", { className: "flex justify-between items-center mb-4" },
                    React.createElement("h1", { className: "text-[26px] font-black" }, "\uACFC\uC81C"),
                    React.createElement("button", { onClick: onCreate, className: "px-4 py-2 rounded-xl font-black text-white", style: { background: C, fontSize: 13 } }, "+ \uB4F1\uB85D")),
                activeAssigns.length ? React.createElement(AssignmentWeekList, { assigns: activeAssigns, renderCard: homeworkCard }) : React.createElement(Empty, null, "\uB4F1\uB85D\uD55C \uC219\uC81C\uAC00 \uC5C6\uC5B4\uC694.")),
            tab === 'notifications' && React.createElement(React.Fragment, null,
                React.createElement("div", { className: "flex items-center justify-between mb-4" },
                    React.createElement("h1", { className: "text-[26px] font-black" }, "알림"),
                    teacherNotices.length > 0 && React.createElement("button", { onClick: () => onDismissAllNotices(teacherNotices.map(n => n.id)), className: "text-[13px] font-bold text-[#777]" }, "전체 삭제")),
                React.createElement("div", { className: "space-y-2" }, teacherNotices.length ? teacherNotices.map(n => React.createElement("div", { key: n.id, className: "bg-white rounded-2xl border p-4", style: { borderColor: '#E2E2E2' } },
                    React.createElement("div", { className: "flex items-start gap-3" },
                        React.createElement("button", { onClick: () => onOpenNotice(n), className: "min-w-0 flex-1 text-left text-[13px] font-bold leading-relaxed whitespace-pre-wrap" }, n.message),
                        React.createElement("button", { onClick: () => onDismissNotice(n.id), className: "shrink-0 text-[12px] font-bold text-[#999]", "aria-label": "알림 삭제" }, "삭제")),
                    React.createElement("div", { className: "mt-2 text-[10px] text-[#AAA]" }, n.createdAt))) : React.createElement(Empty, null, "새 알림이 없어요."))),
            tab === 'notice' && React.createElement(React.Fragment, null,
                React.createElement("h1", { className: "text-[26px] font-black mb-4" }, "\uACF5\uC9C0"),
                React.createElement("div", { className: "bg-white rounded-2xl border p-4", style: { borderColor: BORDER } },
                    React.createElement("div", { className: "flex items-center justify-between" },
                        React.createElement("b", { className: "text-[14px]" }, "\uC0C1\uB2E8 \uB760\uBC30\uB108"),
                        React.createElement("button", { onClick: () => setDraft(v => ({ ...v, enabled: !v.enabled })), className: "w-12 h-7 rounded-full p-1 transition", style: { background: draft.enabled ? C : '#CCC' } },
                            React.createElement("span", { className: "block w-5 h-5 rounded-full bg-white transition", style: { transform: draft.enabled ? 'translateX(20px)' : 'translateX(0)' } }))),
                    React.createElement("textarea", { value: draft.message, onChange: e => setDraft(v => ({ ...v, message: e.target.value })), className: "mt-4 w-full min-h-24 rounded-xl border p-3 text-[16px] outline-none", style: { borderColor: BORDER } }),
                    React.createElement("div", { className: "mt-4 text-[11px] font-bold text-[#777]" }, "\uBBF8\uB9AC\uBCF4\uAE30"),
                    React.createElement("div", { className: "mt-2 px-4 py-2.5 text-[13px] font-black text-black rounded-lg whitespace-pre-wrap break-words", style: { background: '#1FEB09', opacity: draft.enabled ? 1 : .35 } }, draft.message || '공지 문구를 입력하세요.'),
                    React.createElement("button", { disabled: savingNotice, onClick: saveDraft, className: "mt-4 w-full h-11 rounded-xl font-black text-white disabled:opacity-50", style: { background: C, fontSize: 13 } }, savingNotice ? '저장 중...' : '\uC800\uC7A5')))),
        React.createElement(TeacherNav, { tab: tab, setTab: setTab }));
}
function TeacherCreate({ existing, students, onBack, onSave, busy }) {
    const [type, setType] = useState(existing?.type || 'writing');
    const [title, setTitle] = useState(existing?.title || '');
    const [desc, setDesc] = useState(existing?.description || '');
    const [sample, setSample] = useState(null);
    return React.createElement(Frame, null,
        React.createElement(Header, { title: existing ? '숙제 수정' : '숙제 등록', onBack: onBack, onHome: onBack }),
        React.createElement("div", { className: "flex-1 overflow-y-auto p-4" },
            React.createElement("div", { className: "text-[13px] font-black mb-2" }, "숙제 종류"),
            React.createElement("div", { className: "flex gap-2" }, ['writing', 'recording', 'exercise'].map(t => React.createElement("button", { key: t, onClick: () => setType(t), className: "flex-1 h-12 rounded-xl border font-bold", style: { fontSize: 13, background: type === t ? C : '#fff', borderColor: type === t ? C : BORDER, color: type === t ? '#fff' : '#666' } }, t === 'writing' ? '✏️ 작문' : t === 'recording' ? '🎙 녹음' : '📖 문제풀이'))),
            React.createElement("label", { className: "block mt-5 text-[13px] font-black" }, "\uC81C\uBAA9"),
            React.createElement("input", { value: title, onChange: e => setTitle(e.target.value), className: "mt-2 w-full h-12 rounded-xl border bg-white px-4 text-[16px] outline-none", style: { borderColor: BORDER } }),
            React.createElement("label", { className: "block mt-4 text-[13px] font-black" }, "\uC219\uC81C \uB0B4\uC6A9"),
            React.createElement("textarea", { value: desc, onChange: e => setDesc(e.target.value), className: "mt-2 w-full min-h-36 rounded-xl border bg-white p-4 text-[16px] outline-none", style: { borderColor: BORDER } }),
            type === 'recording' && React.createElement(React.Fragment, null,
                React.createElement("label", { className: "block mt-4 text-[13px] font-black" }, "교재 녹음 파일 (선택)"),
                React.createElement("div", { className: "mt-2" },
                    React.createElement(UploadBox, { fileName: sample?.name || existing?.sampleFile?.name, onChange: e => setSample(e.target.files?.[0] || null) }))),
            React.createElement("div", { className: "mt-5 text-[11px] text-[#999]" },
                "\uD604\uC7AC \uD65C\uC131 \uD559\uC0DD ",
                students.filter(s => s.active).length,
                "\uBA85\uC5D0\uAC8C \uC219\uC81C\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4."),
            React.createElement("button", { disabled: busy || !title.trim(), onClick: () => onSave({ type, title: title.trim(), description: desc.trim(), sample }), className: "mt-6 w-full h-12 rounded-2xl font-black text-white disabled:opacity-40", style: { background: C, fontSize: 13 } }, existing ? '수정 저장' : '숙제 등록')));
}
function TeacherReview({ a, students, initialStudent, initialFilter = 'all', onBack, onHome, onSave, onSend }) {
    const [filter, setFilter] = useState(initialFilter);
    const active = students.filter(s => s.active);
    const list = active.filter(s => filter === 'all' || (filter === 'submitted' ? !!a.subs?.[s.name]?.submitted && !isFeedbackComplete(a.subs?.[s.name]) : filter === 'feedback' ? isFeedbackComplete(a.subs?.[s.name]) : !a.subs?.[s.name]?.submitted));
    const [sel, setSel] = useState(initialStudent ? (active.some(s => s.name === initialStudent) ? initialStudent : null) : (list[0]?.name || null));
    const previousFilter = useRef(filter);
    useEffect(() => { const wasFiltered = previousFilter.current !== 'all'; previousFilter.current = filter; if (filter === 'all' && wasFiltered) {
        setSel(active[0]?.name || null);
        return;
    } if (sel && !list.some(s => s.name === sel))
        setSel(list[0]?.name || null); }, [filter]);
    const sub = sel ? a.subs?.[sel] : null;
    const [comment, setComment] = useState(sub?.comment || '');
    const [feedbackOpen, setFeedbackOpen] = useState(true);
    const [guideStep, setGuideStep] = useState(() => feedbackGuideCompleted() ? null : 0);
    const feedbackAreaRef = useRef(null);
    const feedbackChanged = comment !== (sub?.comment || '');
    const feedbackCanSave = feedbackChanged;
    useEffect(() => setComment(sub?.comment || ''), [sel, sub?.comment]);
    useEffect(() => { if (guideStep !== null && sub?.submitted) {
        setFeedbackOpen(true);
        requestAnimationFrame(() => feedbackAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } }, [guideStep, sel, sub?.submitted]);
    const selectedProfile = active.find(s => s.name === sel);
    const submittedCount = active.filter(s => a.subs?.[s.name]?.submitted).length;
    const filterStyle = (key, on) => key === 'submitted' ? { background: on ? '#29ADBD' : '#E2F7FA', color: on ? '#fff' : '#29ADBD' } : key === 'feedback' ? { background: on ? C : '#FFF0ED', color: on ? '#fff' : C } : { background: on ? '#565656' : '#F3F4F6', color: on ? '#fff' : '#6B7280' };
    const submissionStatus = (name) => isFeedbackComplete(a.subs?.[name]) ? '피드백완료' : a.subs?.[name]?.submitted ? '제출완료' : '미제출';
    const submissionColor = (name) => isFeedbackComplete(a.subs?.[name]) ? C : a.subs?.[name]?.submitted ? '#29ADBD' : '#99A1AF';
    const selectedColor = (name) => isFeedbackComplete(a.subs?.[name]) ? C : a.subs?.[name]?.submitted ? '#29ADBD' : '#565656';
    const studentStripRef = useRef(null);
    useEffect(() => {
        const selected = studentStripRef.current?.querySelector(`[data-student="${CSS.escape(sel || '')}"]`);
        selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [sel, filter, a.id]);
    return React.createElement(Frame, null,
        React.createElement(Header, { title: "\uC81C\uCD9C \uD655\uC778", onBack: onBack, onHome: onHome }),
        React.createElement("div", { className: "h-[79px] shrink-0 bg-white border-y border-[#E5E7EB] px-5 flex items-center" },
            React.createElement("div", { className: "flex items-center gap-2 min-w-0" },
                React.createElement("h1", { className: "min-w-0 text-[20px] leading-6 font-black text-[#101828] truncate" }, a.title),
                React.createElement("span", { className: "shrink-0" }, React.createElement(TypeBadge, { type: a.type })))),
        React.createElement("div", { className: "flex-1 overflow-y-auto" },
            React.createElement("section", { className: "bg-white border-b border-[#E5E7EB] px-5 py-3" },
                React.createElement("div", { className: "h-[43px] flex items-center justify-between" },
                    React.createElement("b", { className: "text-[14px] leading-5 text-[#364153]" }, `제출자 (${submittedCount}/${active.length})`),
                    React.createElement("div", { className: "flex gap-1" }, [['all', '전체'], ['missing', '미제출'], ['submitted', '제출완료'], ['feedback', '피드백완료']].map(([k, l]) => React.createElement("button", { key: k, onClick: () => setFilter(k), className: "px-2 py-1 rounded-full text-[12px] leading-4 font-bold", style: filterStyle(k, filter === k) }, l)))),
                React.createElement("div", { ref: studentStripRef, className: "flex gap-2 overflow-x-auto pt-2 pb-0.5" }, list.map(s => React.createElement("button", { key: s.name, "data-student": s.name, onClick: () => setSel(s.name), className: "h-[58px] shrink-0 px-3 py-2 rounded-[16px] flex flex-col items-center gap-1", style: { width: '78px', background: sel === s.name ? selectedColor(s.name) : '#F9FAFB', color: sel === s.name ? '#fff' : '#374151' } },
                    React.createElement("b", { className: "text-[14px] leading-5" }, s.name),
                    React.createElement("span", { className: "text-[10px] leading-4 font-medium", style: { color: sel === s.name ? 'rgba(255,255,255,.8)' : submissionColor(s.name) } }, submissionStatus(s.name))))),
                !list.length && React.createElement("div", { className: "py-4 text-[13px] text-[#99A1AF]" }, "해당 학생이 없어요.")),
            sel && React.createElement("section", { className: "px-5 pt-4 pb-6" }, sub?.submitted ? React.createElement(React.Fragment, null,
                React.createElement("div", { className: "flex items-center gap-3" },
                    React.createElement(Avatar, { name: sel, src: selectedProfile?.avatar, size: 40 }),
                    React.createElement("div", null,
                        React.createElement("b", { className: "block text-[16px] leading-[26px] text-[#101828]" }, sel),
                        React.createElement("span", { className: "block text-[12px] leading-4 text-[#99A1AF]" }, sub.submittedAt ? `제출일 ${sub.submittedAt}` : '제출 완료'))),
                a.type === 'recording' ? React.createElement("div", { className: "mt-4" },
                    React.createElement("b", { className: "block mb-2 text-[14px] leading-5 text-[#4A5565]" }, "학생 녹음 파일"),
                    React.createElement(AudioPlayer, { src: sub.file, label: sub.fileName || `${sel}_녹음.mp3` })) : React.createElement("div", { className: "mt-4 bg-white rounded-[16px] border border-[#E5E7EB] p-4" },
                    React.createElement("b", { className: "block text-[12px] leading-4", style: { color: C } }, "제출 답안"),
                    React.createElement("p", { className: "mt-2 text-[14px] leading-[23px] text-[#1E2939] whitespace-pre-wrap" }, sub.answer || '완료 표시만 했습니다.')),
                React.createElement("div", { ref: feedbackAreaRef, className: "mt-4" },
                    React.createElement("div", { className: "mb-2 flex items-center justify-between" },
                        React.createElement("span", { className: "text-[14px] leading-5 font-bold text-[#4A5565]" }, "피드백 작성"),
                        React.createElement("button", { onClick: () => setFeedbackOpen(value => !value), className: "flex h-10 w-10 items-center justify-center rounded-full", "aria-label": feedbackOpen ? "피드백 영역 접기" : "피드백 영역 펼치기", "aria-expanded": feedbackOpen }, React.createElement(FeedbackChevron, { open: feedbackOpen }))),
                    feedbackOpen && React.createElement(React.Fragment, null,
                        React.createElement("textarea", { value: comment, maxLength: 1000, onChange: e => setComment(e.target.value), className: "w-full h-[134px] rounded-[16px] border border-[#9CA3AF] bg-white p-4 text-[14px] leading-5 outline-none resize-none", placeholder: "학생에게 남길 피드백을 입력하세요." }),
                        React.createElement("div", { className: "mt-1 text-right text-[12px] leading-4 text-[#99A1AF]" }, `${comment.length} / 1000`),
                        React.createElement("div", { className: "mt-3 flex gap-2" },
                            React.createElement("button", { disabled: !feedbackCanSave, onClick: () => onSave(sel, comment), className: `relative flex-1 h-[56px] rounded-[16px] border text-[14px] font-black disabled:opacity-40 ${guideStep === 0 ? 'z-[82] ring-4 ring-white' : ''}`, style: feedbackCanSave ? { borderColor: '#29ADBD', background: '#29ADBD', color: '#FFFFFF' } : { borderColor: '#D1D5DB', background: '#F3F4F6', color: '#4B5563' } }, "저장"),
                            React.createElement("button", { disabled: !comment.trim(), onClick: () => onSend(sel, comment), className: `relative flex-[1.35] h-[56px] rounded-[16px] text-[14px] font-black text-white disabled:opacity-40 ${guideStep === 1 ? 'z-[82] ring-4 ring-white' : ''}`, style: { background: C } }, "알림 보내기"))))) : React.createElement(Empty, null, "아직 제출하지 않았어요."))),
        guideStep !== null && sub?.submitted && React.createElement(React.Fragment, null,
            React.createElement("div", { className: "fixed inset-0 z-[80] bg-black/40" }),
            React.createElement("div", { className: "fixed left-1/2 top-1/2 z-[83] w-[calc(100%-40px)] max-w-[345px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-white p-5 shadow-2xl" },
                React.createElement("div", { className: "text-[12px] font-black", style: { color: C } }, `${guideStep + 1} / 3`),
                React.createElement("h2", { className: "mt-1 text-[18px] font-black text-[#101828]" }, guideStep === 0 ? '저장' : guideStep === 1 ? '알림 보내기' : '수정 후 재발송'),
                React.createElement("p", { className: "mt-2 whitespace-pre-wrap text-[14px] leading-6 text-[#4A5565]" }, guideStep === 0 ? '피드백 내용만 저장합니다.\n학생에게 알림은 가지 않습니다.' : guideStep === 1 ? '현재 내용을 저장하고 피드백완료 처리 후 학생에게 알림을 보냅니다.' : '피드백을 수정한 뒤 `저장`만 하면 알림은 가지 않습니다.\n수정된 내용을 다시 알려주고 싶을 때 `알림 보내기`를 누르면 알림이 다시 발송됩니다.'),
                React.createElement("button", { onClick: () => { if (guideStep < 2) { setFeedbackOpen(true); setGuideStep(guideStep + 1); } else { completeFeedbackGuide(); setGuideStep(null); } }, className: "mt-4 h-11 w-full rounded-[14px] text-[14px] font-black text-white", style: { background: C } }, guideStep < 2 ? '다음' : '완료'))));
}
function TeacherExerciseDetail({ a, onBack, onHome }) {
    return React.createElement(Frame, null,
        React.createElement(Header, { title: "\uACFC\uC81C", onBack: onBack, onHome: onHome }),
        React.createElement("div", { className: "flex-1 overflow-y-auto p-4" },
            React.createElement("div", { className: "bg-white rounded-2xl border p-4", style: { borderColor: BORDER } },
                React.createElement(TypeBadge, { type: a.type }),
                React.createElement("h1", { className: "mt-3 text-[20px] font-black leading-snug" }, a.title),
                React.createElement("div", { className: "mt-4 text-[13px] font-black text-[#444]" }, "\uC219\uC81C \uB0B4\uC6A9"),
                React.createElement("p", { className: "mt-2 text-[13px] leading-6 text-[#666] whitespace-pre-wrap" }, a.description || '\uB4F1\uB85D\uB41C \uC219\uC81C \uB0B4\uC6A9\uC774 \uC5C6\uC5B4\uC694.'))));
}
function TeacherStudent({ name, profile, vocab, assigns, tab, onTab, onBack, onVocab, onDelete, onReview }) {
    const update = (i, d) => onVocab(vocab.map((v, j) => j === i ? { ...v, chapter: Math.max(0, v.chapter + d) } : v));
    return React.createElement(Frame, null,
        React.createElement(Header, { title: name, onBack: onBack, onHome: onBack }),
        React.createElement("div", { className: "flex-1 overflow-y-auto p-4" },
            React.createElement("div", { className: "flex items-center gap-4 mb-6" },
                React.createElement(Avatar, { name: name, src: profile?.avatar, size: 68 }),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("b", { className: "text-[20px] font-black leading-tight" }, name),
                    React.createElement("div", { className: "mt-1 text-[12px] text-[#999]" }, "\uD559\uC0DD \uD604\uD669")),
                React.createElement("button", { onClick: onDelete, className: "shrink-0 px-3 py-1.5 rounded-lg bg-[#F1F1F1] font-bold text-[#666]", style: { fontSize: 13 } }, "\uD559\uC0DD \uC0AD\uC81C")),
            React.createElement("div", { className: "bg-white rounded-2xl border p-4", style: { borderColor: BORDER } },
                React.createElement("div", { className: "text-[13px] font-black mb-3" }, "\uB2E8\uC5B4\uC2DC\uD5D8 \uC9C4\uB3C4"),
                vocab.length ? vocab.map((v, i) => React.createElement("div", { key: v.level, className: "flex items-center gap-2 py-2" },
                    React.createElement("span", { className: "text-[13px] font-bold w-10" }, v.level),
                    React.createElement("b", { className: "flex-1 text-[16px]" },
                        v.chapter + 1,
                        "\uACFC"),
                    React.createElement("button", { onClick: () => update(i, -1), className: "w-8 h-8 rounded-full bg-[#F1F1F1] font-bold" }, "\u2212"),
                    React.createElement("button", { onClick: () => update(i, 1), className: "px-3 h-8 rounded-lg text-white font-bold", style: { background: C, fontSize: 13 } }, "+ 1\uACFC"))) : React.createElement("div", { className: "text-[13px] text-[#999]" }, "\uB2E8\uC5B4\uC2DC\uD5D8 \uC5C6\uC74C")),
            React.createElement("div", { className: "mt-5 text-[13px] font-black mb-2" }, "\uACFC\uC81C \uC0C1\uD0DC"),
            React.createElement("div", { className: "space-y-2" }, assigns.filter(a => !a.archived).map(a => React.createElement("button", { key: a.id, onClick: () => onReview(a), className: "w-full bg-white rounded-2xl border p-3.5 text-left flex gap-3 items-center", style: { borderColor: LIST_BORDER } },
                React.createElement("div", { className: "flex-1" },
                    React.createElement("b", { className: "text-[13px]" }, a.title),
                    a.type !== 'exercise' && React.createElement("div", { className: "text-[11px] text-[#999] mt-1" },
                        React.createElement("span", { className: a.subs?.[name]?.submitted ? 'font-bold' : undefined, style: a.subs?.[name]?.submitted ? { color: '#29ADBD' } : undefined }, a.subs?.[name]?.submitted ? '제출 완료' : '미제출'),
                        isFeedbackComplete(a.subs?.[name]) && React.createElement("span", { className: "font-bold", style: { color: C } }, ' · 피드백 완료'))),
                React.createElement("span", { className: "shrink-0" }, Icon.right()))))),
        React.createElement(TeacherNav, { tab: tab, setTab: onTab }));
}
function InstallSheet({ ios, onInstall, onClose }) {
    return React.createElement("div", { className: "fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-3" },
        React.createElement("button", { className: "absolute inset-0 cursor-default", onClick: onClose, "aria-label": "설치 안내 닫기" }),
        React.createElement("div", { className: "relative w-full max-w-[367px] rounded-[22px] bg-white p-5 shadow-2xl" },
            React.createElement("div", { className: "flex items-start gap-3" },
                React.createElement("img", { src: "/icons/icon-192.png", alt: "", className: "h-12 w-12 rounded-xl" }),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("h2", { className: "text-[18px] font-black" }, "홈 화면에 추가할까요?"),
                    React.createElement("p", { className: "mt-1 text-[13px] leading-5 text-[#777]" }, "앱처럼 바로 열 수 있어요. 주소는 지금과 그대로예요."))),
            ios ? React.createElement("div", { className: "mt-4 rounded-2xl bg-[#F7F7F7] px-4 py-3 text-[13px] leading-6 text-[#555]" },
                React.createElement("b", { className: "text-[#333]" }, "iPhone 설치 방법"),
                React.createElement("p", null, "Safari 아래쪽 공유 버튼 → ‘홈 화면에 추가’ → ‘추가’")) : React.createElement("button", { onClick: onInstall, className: "mt-5 h-12 w-full rounded-2xl text-[14px] font-black text-white", style: { background: C } }, "홈 화면에 추가"),
            React.createElement("button", { onClick: onClose, className: "mt-2 h-10 w-full text-[13px] font-bold text-[#888]" }, "나중에")));
}
function PushSheet({ onEnable, onClose, busy }) {
    return React.createElement("div", { className: "fixed inset-0 z-[91] flex items-center justify-center bg-black/35 px-3" },
        React.createElement("button", { className: "absolute inset-0 cursor-default", onClick: onClose, "aria-label": "알림 안내 닫기" }),
        React.createElement("div", { className: "relative w-full max-w-[367px] rounded-[22px] bg-white p-5 shadow-2xl" },
            React.createElement("div", { className: "flex items-start gap-3" },
                React.createElement("div", { className: "grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#FFF0ED] text-[24px]" }, "🔔"),
                React.createElement("div", { className: "min-w-0 flex-1" },
                    React.createElement("h2", { className: "text-[18px] font-black" }, "푸시 알림을 켤까요?"),
                    React.createElement("p", { className: "mt-1 text-[13px] leading-5 text-[#777]" }, "새 숙제·제출·피드백·공지를 앱을 닫아도 바로 알려드려요."))),
            React.createElement("button", { disabled: busy, onClick: onEnable, className: "mt-5 h-12 w-full rounded-2xl text-[14px] font-black text-white disabled:opacity-50", style: { background: C } }, busy ? '연결 중...' : '알림 켜기'),
            React.createElement("button", { disabled: busy, onClick: onClose, className: "mt-2 h-10 w-full text-[13px] font-bold text-[#888]" }, "나중에")));
}
function UpdateSheet({ onUpdate, onClose, busy }) {
    return React.createElement("div", { className: "fixed inset-0 z-[92] flex items-center justify-center bg-black/35 px-3" },
        React.createElement("div", { className: "relative w-full max-w-[367px] rounded-[22px] bg-white p-5 shadow-2xl" },
            React.createElement("h2", { className: "text-[18px] font-black text-[#101828]" }, "새 버전이 업데이트되었습니다."),
            React.createElement("p", { className: "mt-2 text-[13px] leading-5 text-[#777]" }, "최신 버전을 적용하려면 앱을 새로고침해주세요."),
            React.createElement("div", { className: "mt-5 flex gap-2" },
                React.createElement("button", { disabled: busy, onClick: onClose, className: "h-12 flex-1 rounded-2xl bg-[#F3F4F6] text-[14px] font-black text-[#666] disabled:opacity-50" }, "나중에"),
                React.createElement("button", { disabled: busy, onClick: onUpdate, className: "h-12 flex-1 rounded-2xl text-[14px] font-black text-white disabled:opacity-50", style: { background: C } }, busy ? '업데이트 중...' : '업데이트'))));
}
function App() {
    const [page, setPage] = useState('login');
    const pageRef = useRef('login');
    const navigationStack = useRef(['login']);
    const navigationDepth = useRef(0);
    const pendingNavigationReset = useRef(null);
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('lin-session-token'));
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null);
    const [assigns, setAssigns] = useState([]);
    const [students, setStudents] = useState([]);
    const [notices, setNotices] = useState([]);
    const [dismissedNotices, setDismissedNotices] = useState({});
    const noticesRef = useRef([]);
    const dismissedNoticesRef = useRef({});
    const stateSyncVersion = useRef({});
    const pendingStateWrites = useRef({});
    const noticesWriteQueue = useRef(Promise.resolve());
    const dismissedWriteQueue = useRef(Promise.resolve());
    const [vocab, setVocab] = useState({});
    const [banner, setBanner] = useState(DEFAULT_BANNER);
    const [dataLoaded, setDataLoaded] = useState(false);
    const [active, setActive] = useState(null);
    const [activeNotice, setActiveNotice] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [reviewStudent, setReviewStudent] = useState(null);
    const [reviewFilter, setReviewFilter] = useState('all');
    const [studentTab, setStudentTab] = useState('home');
    const [teacherTab, setTeacherTab] = useState('home');
    const studentTabRef = useRef('home');
    const teacherTabRef = useRef('home');
    const [installEvent, setInstallEvent] = useState(null);
    const [showInstall, setShowInstall] = useState(false);
    const [standalone, setStandalone] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [showPush, setShowPush] = useState(false);
    const [waitingWorker, setWaitingWorker] = useState(null);
    const [updateBusy, setUpdateBusy] = useState(false);
    const updateReloading = useRef(false);
    studentTabRef.current = studentTab;
    teacherTabRef.current = teacherTab;
    const [deepLink, setDeepLink] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const kind = params.get('kind');
        return kind ? { kind, assignmentId: params.get('assignmentId'), noticeId: params.get('noticeId'), student: params.get('student') } : null;
    });
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const say = (s) => { setToast(s); setTimeout(() => setToast(null), 2500); };
    const replacePage = (next) => { pageRef.current = next; setPage(next); };
    const openPage = (next) => { if (next === pageRef.current)
        return; const stack = [...navigationStack.current, next]; const depth = navigationDepth.current + 1; navigationStack.current = stack; navigationDepth.current = depth; window.history.pushState({ linApp: true, stack, depth, studentTab: studentTabRef.current, teacherTab: teacherTabRef.current }, '', window.location.href); replacePage(next); };
    const resetPage = (next) => { const steps = navigationDepth.current; if (steps > 0) {
        pendingNavigationReset.current = next;
        window.history.go(-steps);
        return;
    } navigationStack.current = [next]; navigationDepth.current = 0; window.history.replaceState({ ...(window.history.state || {}), linApp: true, stack: [next], depth: 0, studentTab: studentTabRef.current, teacherTab: teacherTabRef.current }, '', window.location.href); replacePage(next); };
    const backPage = (fallback) => { if (navigationDepth.current > 0) {
        window.history.back();
        return;
    } resetPage(fallback); };
    const replaceTab = (role, next) => {
        if (role === 'student') {
            studentTabRef.current = next;
            setStudentTab(next);
        }
        else {
            teacherTabRef.current = next;
            setTeacherTab(next);
        }
    };
    const navigateTab = (role, next) => {
        const current = role === 'student' ? studentTabRef.current : teacherTabRef.current;
        if (next === current)
            return;
        const depth = navigationDepth.current + 1;
        navigationDepth.current = depth;
        const nextStudentTab = role === 'student' ? next : studentTabRef.current;
        const nextTeacherTab = role === 'teacher' ? next : teacherTabRef.current;
        window.history.pushState({ linApp: true, stack: navigationStack.current, depth, studentTab: nextStudentTab, teacherTab: nextTeacherTab }, '', window.location.href);
        replaceTab(role, next);
    };
    const putState = async (key, value) => { if (!token)
        return; await api('/state', { method: 'PUT', body: JSON.stringify({ key, value }) }, token); };
    const beginStateWrite = (key) => { stateSyncVersion.current[key] = (stateSyncVersion.current[key] || 0) + 1; pendingStateWrites.current[key] = (pendingStateWrites.current[key] || 0) + 1; };
    const endStateWrite = (key) => { stateSyncVersion.current[key] = (stateSyncVersion.current[key] || 0) + 1; pendingStateWrites.current[key] = Math.max(0, (pendingStateWrites.current[key] || 1) - 1); };
    const putVersionedState = async (key, value) => { beginStateWrite(key); try {
        await putState(key, value);
    }
    finally {
        endStateWrite(key);
    } };
    const writeNotices = async (next) => {
        noticesRef.current = next;
        setNotices(next);
        beginStateWrite(K.notices);
        const write = noticesWriteQueue.current.then(() => putState(K.notices, next));
        noticesWriteQueue.current = write.catch(() => { });
        try {
            await write;
        }
        finally {
            endStateWrite(K.notices);
        }
    };
    const appendNotice = (notice) => writeNotices([...noticesRef.current, notice]);
    const navigateStudentDeepLink = (target, replace = false) => {
        const assignment = target.assignmentId && assigns.find(a => String(a.id) === String(target.assignmentId) && !a.archived);
        const go = (next) => replace ? resetPage(next) : openPage(next);
        if ((target.kind === 'assignment' || target.kind === 'feedback') && assignment) {
            setActive(assignment);
            go('student-detail');
            return;
        }
        const notice = target.noticeId && notices.find(n => String(n.id) === String(target.noticeId));
        if (target.kind === 'notice' && notice) {
            setActiveNotice(notice);
            go('student-notice-detail');
            return;
        }
        replaceTab('student', 'notifications');
        resetPage('student');
        say('해당 알림의 원본을 찾을 수 없어요.');
    };
    const openStudentNotice = (notice) => navigateStudentDeepLink({ kind: notice.kind, assignmentId: notice.assignmentId, noticeId: notice.id });
    const load = async (t = token, silent = false) => { if (!t)
        return; const requestedVersion = { ...stateSyncVersion.current }; try {
        const d = await api('/state', {}, t);
        const st = d.state || {};
        const profiles = d.profiles || [];
        setAssigns(Array.isArray(st[K.assigns]) ? st[K.assigns] : []);
        if (!pendingStateWrites.current[K.notices] && (stateSyncVersion.current[K.notices] || 0) === (requestedVersion[K.notices] || 0)) {
            const loadedNotices = Array.isArray(st[K.notices]) ? st[K.notices] : [];
            noticesRef.current = loadedNotices;
            setNotices(loadedNotices);
        }
        if (!pendingStateWrites.current[K.noticeDismissed] && (stateSyncVersion.current[K.noticeDismissed] || 0) === (requestedVersion[K.noticeDismissed] || 0)) {
            const loadedDismissed = st[K.noticeDismissed] && typeof st[K.noticeDismissed] === 'object' ? st[K.noticeDismissed] : {};
            dismissedNoticesRef.current = loadedDismissed;
            setDismissedNotices(loadedDismissed);
        }
        setVocab(st[K.vocab] && typeof st[K.vocab] === 'object' ? st[K.vocab] : {});
        if (!pendingStateWrites.current[K.banner] && (stateSyncVersion.current[K.banner] || 0) === (requestedVersion[K.banner] || 0))
            setBanner(st[K.banner] && typeof st[K.banner] === 'object' ? st[K.banner] : DEFAULT_BANNER);
        const shared = Array.isArray(st[K.students]) ? st[K.students] : [];
        const by = new Map();
        for (const s of shared)
            if (s?.name)
                by.set(s.name, { name: s.name, avatar: s.avatar || null, active: s.active !== false });
        for (const p of profiles)
            by.set(p.username, { name: p.username, avatar: p.avatar_url || by.get(p.username)?.avatar || null, active: p.active !== false });
        setStudents([...by.values()]);
        setDataLoaded(true);
        if (!silent)
            say('최신 내용으로 불러왔어요.');
    }
    catch (e) {
        if (!silent)
            say(e.message);
    } };
    useEffect(() => {
        window.history.replaceState({ ...(window.history.state || {}), linApp: true, stack: navigationStack.current, depth: navigationDepth.current, studentTab: studentTabRef.current, teacherTab: teacherTabRef.current }, '', window.location.href);
        const onPopState = (event) => {
            const resetTarget = pendingNavigationReset.current;
            if (resetTarget) {
                pendingNavigationReset.current = null;
                navigationStack.current = [resetTarget];
                navigationDepth.current = 0;
                window.history.replaceState({ linApp: true, stack: [resetTarget], depth: 0, studentTab: studentTabRef.current, teacherTab: teacherTabRef.current }, '', window.location.href);
                replacePage(resetTarget);
                return;
            }
            const stack = event.state?.linApp && Array.isArray(event.state.stack) ? event.state.stack : null;
            if (!stack?.length)
                return;
            navigationStack.current = stack;
            navigationDepth.current = Number(event.state.depth) || 0;
            if (event.state.studentTab)
                replaceTab('student', event.state.studentTab);
            if (event.state.teacherTab)
                replaceTab('teacher', event.state.teacherTab);
            replacePage(stack[stack.length - 1]);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    useEffect(() => { if (!token)
        return; api('/me', {}, token).then((u) => { setUser(u); resetPage(u.role === 'teacher' ? 'teacher' : 'student'); return load(token, true); }).catch(() => { localStorage.removeItem('lin-session-token'); setToken(null); setUser(null); resetPage('login'); }); }, []);
    useEffect(() => { if (!token || !user)
        return; const id = setInterval(() => load(token, true), 5000); const vis = () => document.visibilityState === 'visible' && load(token, true); document.addEventListener('visibilitychange', vis); return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); }; }, [token, user]);
    useEffect(() => {
        const ready = (e) => { e.preventDefault(); setInstallEvent(e); };
        const installed = () => { setStandalone(true); setInstallEvent(null); setShowInstall(false); };
        window.addEventListener('beforeinstallprompt', ready);
        window.addEventListener('appinstalled', installed);
        return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', installed); };
    }, []);
    useEffect(() => {
        if (!('serviceWorker' in navigator))
            return;
        let registration;
        let checkTimer;
        let disposed = false;
        const offer = (worker) => { if (!disposed && worker && navigator.serviceWorker.controller)
            setWaitingWorker(worker); };
        const watch = (worker) => { if (!worker)
            return; const changed = () => { if (worker.state === 'installed')
                offer(registration?.waiting || worker); }; worker.addEventListener('statechange', changed); };
        const found = () => watch(registration?.installing);
        const check = () => registration?.update().catch(error => console.warn('service worker update', error));
        const visible = () => { if (document.visibilityState === 'visible')
            check(); };
        const controllerChanged = () => { if (updateReloading.current)
            window.location.reload(); };
        navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
        navigator.serviceWorker.ready.then(value => {
            if (disposed)
                return;
            registration = value;
            registration.addEventListener('updatefound', found);
            offer(registration.waiting);
            watch(registration.installing);
            check();
            checkTimer = setInterval(check, 60 * 60 * 1000);
            document.addEventListener('visibilitychange', visible);
        }).catch(error => console.warn('service worker ready', error));
        return () => {
            disposed = true;
            clearInterval(checkTimer);
            registration?.removeEventListener('updatefound', found);
            document.removeEventListener('visibilitychange', visible);
            navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
        };
    }, []);
    useEffect(() => {
        if (!deepLink || !user || !dataLoaded)
            return;
        const assignment = deepLink.assignmentId && assigns.find(a => String(a.id) === String(deepLink.assignmentId) && !a.archived);
        window.history.replaceState(window.history.state, '', window.location.pathname);
        if (user.role === 'student') {
            resetPage('student');
            navigateStudentDeepLink(deepLink);
        }
        else if (assignment && deepLink.student) {
            resetPage('teacher');
            setSelectedStudent(deepLink.student);
            setReviewStudent(deepLink.student);
            setActive(assignment);
            openPage('teacher-review');
        }
        else {
            replaceTab('teacher', 'notifications');
            resetPage('teacher');
        }
        setDeepLink(null);
    }, [deepLink, user, dataLoaded, assigns, notices]);
    useEffect(() => {
        if (!user || standalone || localStorage.getItem('lin-pwa-install-dismissed') === '1')
            return;
        if (ios || installEvent)
            setShowInstall(true);
    }, [user, standalone, ios, installEvent]);
    const openInstall = () => setShowInstall(true);
    const dismissInstall = () => { localStorage.setItem('lin-pwa-install-dismissed', '1'); setShowInstall(false); };
    const requestInstall = async () => {
        if (!installEvent)
            return;
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === 'accepted') {
            setStandalone(true);
            setInstallEvent(null);
        }
        setShowInstall(false);
    };
    const syncPush = async (syncServer = false) => {
        const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        setPushSupported(supported);
        if (!supported)
            return false;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const enabled = !!subscription && Notification.permission === 'granted';
        setPushEnabled(enabled);
        if (enabled && syncServer && token)
            await pushApi('/subscribe', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) }, token);
        return enabled;
    };
    useEffect(() => {
        if (!user || !token)
            return;
        syncPush(true).catch(error => console.warn('push status', error));
    }, [user, token]);
    useEffect(() => {
        if (!user || !pushSupported || pushEnabled || showInstall || localStorage.getItem('lin-push-prompt-dismissed') === '1')
            return;
        if (!ios || standalone)
            setShowPush(true);
    }, [user, pushSupported, pushEnabled, showInstall, ios, standalone]);
    const enablePush = async () => {
        if (ios && !standalone) {
            setShowPush(false);
            setShowInstall(true);
            say('iPhone은 홈 화면에 추가한 뒤 알림을 켤 수 있어요.');
            return;
        }
        if (Notification.permission === 'denied') {
            setShowPush(false);
            say('브라우저 설정에서 이 사이트의 알림 권한을 허용해 주세요.');
            return;
        }
        setPushBusy(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted')
                throw new Error('알림 권한이 허용되지 않았어요.');
            const registration = await navigator.serviceWorker.ready;
            const { publicKey } = await pushApi('/public-key', {}, token);
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription)
                subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
            await pushApi('/subscribe', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) }, token);
            setPushEnabled(true);
            setShowPush(false);
            localStorage.removeItem('lin-push-prompt-dismissed');
            say('푸시 알림을 켰어요. 테스트 알림을 보낼게요.');
            pushApi('/test', { method: 'POST' }, token).catch(error => console.warn('test push', error));
        }
        catch (error) {
            say(error.message || '푸시 알림을 켜지 못했어요.');
        }
        finally {
            setPushBusy(false);
        }
    };
    const disablePush = async () => {
        setPushBusy(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await pushApi('/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }, token);
                await subscription.unsubscribe();
            }
            setPushEnabled(false);
            say('푸시 알림을 껐어요.');
        }
        catch (error) {
            say(error.message || '푸시 알림을 끄지 못했어요.');
        }
        finally {
            setPushBusy(false);
        }
    };
    const togglePush = () => pushEnabled ? disablePush() : enablePush();
    const dismissPush = () => { localStorage.setItem('lin-push-prompt-dismissed', '1'); setShowPush(false); };
    const applyUpdate = () => {
        if (!waitingWorker || updateBusy)
            return;
        setUpdateBusy(true);
        updateReloading.current = true;
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    };
    const dismissUpdate = () => setWaitingWorker(null);
    const sendPush = (kind, payload) => pushApi('/send', { method: 'POST', body: JSON.stringify({ kind, ...payload }) }, token)
        .catch(error => console.warn('push send', error));
    const login = async (n, p) => { setBusy(true); try {
        const d = await api('/login', { method: 'POST', body: JSON.stringify({ username: n, password: p }) });
        localStorage.setItem('lin-session-token', d.token);
        setToken(d.token);
        setUser(d.user);
        await load(d.token, true);
        resetPage(d.user.role === 'teacher' ? 'teacher' : 'student');
    }
    catch (e) {
        say(e.message);
    }
    finally {
        setBusy(false);
    } };
    const logout = () => { localStorage.removeItem('lin-session-token'); setToken(null); setUser(null); resetPage('login'); };
    const changePassword = async (currentPassword, newPassword) => {
        await api('/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, token);
        logout();
    };
    const upload = async (file) => { const dataUrl = await fileToDataUrl(file); return await api('/upload-data-url', { method: 'POST', body: JSON.stringify({ name: file.name, dataUrl }) }, token); };
    const signup = async (name, pw, vv, avatarFile) => { setBusy(true); try {
        const d = await api('/register', { method: 'POST', body: JSON.stringify({ username: name, password: pw, vocab: vv }) });
        localStorage.setItem('lin-session-token', d.token);
        setToken(d.token);
        setUser(d.user);
        let avatar = null;
        if (avatarFile) {
            const optimized = await optimizeProfileImage(avatarFile);
            const up = await (async () => { const du = await fileToDataUrl(optimized); return api('/upload-data-url', { method: 'POST', body: JSON.stringify({ name: optimized.name, dataUrl: du }) }, d.token); })();
            avatar = up.url;
            await api('/sync-user', { method: 'POST', body: JSON.stringify({ avatarUrl: avatar, vocab: vv }) }, d.token);
        }
        const state = await api('/state', {}, d.token);
        const curStudents = Array.isArray(state.state?.[K.students]) ? state.state[K.students] : [];
        const nextStudents = [...curStudents.filter((s) => s.name !== name), { name, avatar, active: true }];
        await api('/state', { method: 'PUT', body: JSON.stringify({ key: K.students, value: nextStudents }) }, d.token);
        const curV = state.state?.[K.vocab] || {};
        await api('/state', { method: 'PUT', body: JSON.stringify({ key: K.vocab, value: { ...curV, [name]: vv } }) }, d.token);
        const curA = Array.isArray(state.state?.[K.assigns]) ? state.state[K.assigns] : [];
        await api('/state', { method: 'PUT', body: JSON.stringify({ key: K.assigns, value: curA.map((a) => ({ ...a, subs: { ...(a.subs || {}), [name]: { submitted: false } } })) }) }, d.token);
        await load(d.token, true);
        resetPage('student');
        say('계정 생성 완료!');
    }
    catch (e) {
        say(e.message);
    }
    finally {
        setBusy(false);
    } };
    const saveAssign = async (x) => { if (!user)
        return; setBusy(true); try {
        let sampleFile = active?.sampleFile || null;
        if (x.type === 'recording' && x.sample) {
            const up = await upload(x.sample);
            sampleFile = { name: x.sample.name, url: up.url };
        }
        if (x.type !== 'recording')
            sampleFile = null;
        let next;
        if (active) {
            next = assigns.map(a => a.id === active.id ? { ...a, ...x, sampleFile } : a);
        }
        else {
            const subs = Object.fromEntries(students.filter(s => s.active).map(s => [s.name, { submitted: false }]));
            const assignment = { id: uid(), type: x.type, title: x.title, description: x.description, sampleFile, subs, createdAt: fmtNow() };
            next = [...assigns, assignment];
            await appendNotice({ id: uid(), message: `[숙제] ${x.title}`, createdAt: fmtNow(), kind: 'assignment', assignmentId: assignment.id });
        }
        setAssigns(next);
        await putState(K.assigns, next);
        if (!active)
            void sendPush('assignment', { title: x.title, body: '새 숙제가 도착했습니다.', url: makeDeepLink('assignment', { assignmentId: next[next.length - 1]?.id }), eventId: `assignment-${next[next.length - 1]?.id}` });
        setActive(null);
        backPage('teacher');
        say(active ? '숙제를 수정했어요.' : '숙제를 등록했어요.');
    }
    catch (e) {
        say(e.message);
    }
    finally {
        setBusy(false);
    } };
    const deleteAssign = async (a) => { if (!confirm('이 숙제를 삭제할까요?'))
        return; const next = assigns.map(x => x.id === a.id ? { ...x, archived: true } : x); setAssigns(next); await putState(K.assigns, next); say('숙제를 삭제했어요.'); };
    const submit = async (answer, file) => { if (!active || !user || active.type === 'exercise')
        return; setBusy(true); try {
        let fileUrl = active.subs?.[user.username]?.file || null, fileName = active.subs?.[user.username]?.fileName || null;
        if (file) {
            const up = await upload(file);
            fileUrl = up.url;
            fileName = file.name;
        }
        const next = assigns.map(a => a.id === active.id ? { ...a, subs: { ...(a.subs || {}), [user.username]: { ...(a.subs?.[user.username] || {}), submitted: true, answer: answer || null, file: fileUrl, fileName, submittedAt: fmtNow() } } } : a);
        setAssigns(next);
        await putState(K.assigns, next);
        await appendNotice({ id: uid(), message: `[${user.username}] ${active.title}\n제출했어요! 👏`, createdAt: fmtNow(), kind: 'submission', audience: 'teacher', student: user.username, assignmentId: active.id });
        void sendPush('submission', { title: `[${user.username}]`, body: `${active.title} 제출했어요! 👏`, url: makeDeepLink('submission', { assignmentId: active.id, student: user.username }), eventId: `submission-${active.id}-${user.username}-${Date.now()}` });
        setActive(next.find(a => a.id === active.id) || null);
        say('제출했어요!');
    }
    catch (e) {
        say(e.message);
    }
    finally {
        setBusy(false);
    } };
    const saveFeedback = async (student, comment) => { if (!active || active.type === 'exercise')
        return; const current = active.subs?.[student]; const next = assigns.map(a => a.id === active.id ? { ...a, subs: { ...(a.subs || {}), [student]: { ...(a.subs?.[student] || { submitted: false }), comment, feedbackComplete: isFeedbackComplete(current) } } } : a); const updated = next.find(a => a.id === active.id) || active; setAssigns(next); setActive(updated); await putState(K.assigns, next); say('저장되었습니다.'); };
    const sendFeedback = async (student, comment) => { if (!active || active.type === 'exercise')
        return; const next = assigns.map(a => a.id === active.id ? { ...a, subs: { ...(a.subs || {}), [student]: { ...(a.subs?.[student] || { submitted: false }), comment, feedbackComplete: true } } } : a); const updated = next.find(a => a.id === active.id) || active; setAssigns(next); setActive(updated); await Promise.all([putState(K.assigns, next), appendNotice({ id: uid(), message: `[피드백] ${active.title}`, createdAt: fmtNow(), user: student, kind: 'feedback', assignmentId: active.id })]); void sendPush('feedback', { title: `[${active.title}]`, body: '새 피드백이 도착했어요.', targetUsername: student, url: makeDeepLink('feedback', { assignmentId: active.id }), eventId: `feedback-${active.id}-${student}-${Date.now()}` }); say('피드백을 저장하고 알림을 보냈어요.'); };
    const saveBanner = async (b) => {
        setBanner(b);
        await putVersionedState(K.banner, b);
        const noticeTitle = b.message.trim();
        if (b.enabled && noticeTitle) {
            const notice = { id: uid(), message: `[공지] ${noticeTitle}`, createdAt: fmtNow(), kind: 'notice' };
            await appendNotice(notice);
            void sendPush('notice', { title: '린중국어 알림', body: `[공지] ${noticeTitle}`, url: makeDeepLink('notice', { noticeId: notice.id }), eventId: `notice-${notice.id}` });
        }
        say('공지를 저장했어요.');
    };
    const saveDismissedNotices = async (ids) => {
        const previous = dismissedNoticesRef.current;
        const next = { ...previous, [user.username]: [...new Set(ids.map(String))] };
        dismissedNoticesRef.current = next;
        setDismissedNotices(next);
        beginStateWrite(K.noticeDismissed);
        const write = dismissedWriteQueue.current.then(() => putState(K.noticeDismissed, next));
        dismissedWriteQueue.current = write.catch(() => { });
        try {
            await write;
        }
        catch (e) {
            if (dismissedNoticesRef.current === next) {
                dismissedNoticesRef.current = previous;
                setDismissedNotices(previous);
            }
            say(e.message);
        }
        finally {
            endStateWrite(K.noticeDismissed);
        }
    };
    const dismissNotice = (id) => saveDismissedNotices([...(dismissedNoticesRef.current[user.username] || []), id]);
    const dismissAllNotices = (ids) => {
        if (!window.confirm('알림을 모두 삭제할까요?'))
            return;
        saveDismissedNotices([...(dismissedNoticesRef.current[user.username] || []), ...ids]);
    };
    const studentVocab = async (name, vv) => { const next = { ...vocab, [name]: vv }; setVocab(next); await Promise.all([putState(K.vocab, next), api('/student-vocab', { method: 'POST', body: JSON.stringify({ username: name, vocab: vv }) }, token)]); say('단어 진도를 수정했어요.'); };
    const deleteStudent = async (name) => { if (!confirm(`${name} 학생을 목록에서 삭제할까요?\n기존 제출 기록은 남아 있어요.`))
        return; const next = students.map(s => s.name === name ? { ...s, active: false } : s); setStudents(next); await Promise.all([putState(K.students, next), api('/student-active', { method: 'POST', body: JSON.stringify({ username: name, active: false }) }, token)]); backPage('teacher'); say('학생을 삭제했어요.'); };
    const avatar = async (file) => { if (!user)
        return; setBusy(true); try {
        const up = await upload(await optimizeProfileImage(file));
        await api('/sync-user', { method: 'POST', body: JSON.stringify({ avatarUrl: up.url }) }, token);
        const next = students.map(s => s.name === user.username ? { ...s, avatar: up.url } : s);
        setStudents(next);
        await putState(K.students, next);
        setUser({ ...user, avatarUrl: up.url });
        say('프로필 사진을 바꿨어요.');
    }
    catch (e) {
        say(e.message);
    }
    finally {
        setBusy(false);
    } };
    const content = useMemo(() => {
        if (page === 'login')
            return React.createElement(Login, { onLogin: login, onSignup: () => openPage('signup'), busy: busy });
        if (page === 'signup')
            return React.createElement(Signup, { onBack: () => backPage('login'), onCreate: signup, busy: busy });
        if (!user)
            return null;
        if (page === 'student')
            return React.createElement(StudentApp, { user: user, assigns: assigns, notices: notices, dismissedNoticeIds: dismissedNotices[user.username] || [], vocab: vocab, banner: banner, students: students, tab: studentTab, setTab: next => navigateTab('student', next), onOpen: a => { setActive(a); openPage('student-detail'); }, onOpenNotice: openStudentNotice, onDismissNotice: dismissNotice, onDismissAllNotices: dismissAllNotices, onLogout: logout, onChangePassword: changePassword, onAvatar: avatar, onInstall: standalone ? null : openInstall, pushEnabled: pushEnabled, onTogglePush: pushSupported ? togglePush : null, refresh: () => load(token, false) });
        if (page === 'student-detail' && active)
            return React.createElement(StudentDetail, { user: user, a: active, onBack: () => backPage('student'), onSubmit: submit, busy: busy });
        if (page === 'student-notice-detail' && activeNotice)
            return React.createElement(NoticeDetail, { notice: activeNotice, onBack: () => backPage('student') });
        if (page === 'teacher')
            return React.createElement(TeacherApp, { user: user, assigns: assigns, students: students, vocab: vocab, notices: notices, dismissedNoticeIds: dismissedNotices[user.username] || [], banner: banner, tab: teacherTab, setTab: next => navigateTab('teacher', next), onCreate: () => { setActive(null); openPage('teacher-create'); }, onEdit: a => { setActive(a); openPage('teacher-create'); }, onDelete: deleteAssign, onReview: a => { setReviewStudent(null); setReviewFilter('all'); setActive(a); openPage('teacher-review'); }, onOpenNotice: n => { const assignment = assigns.find(a => a.id === n.assignmentId && !a.archived && a.type !== 'exercise'); if (!assignment || !n.student)
                    return say('해당 제출 과제를 찾을 수 없어요.'); setSelectedStudent(n.student); setReviewStudent(n.student); setReviewFilter(n.kind === 'feedback' ? 'feedback' : n.kind === 'submission' ? 'submitted' : 'all'); setActive(assignment); openPage('teacher-review'); }, onStudent: s => { setSelectedStudent(s); openPage('teacher-student'); }, onDeleteStudent: deleteStudent, onDismissNotice: dismissNotice, onDismissAllNotices: dismissAllNotices, onLogout: logout, onChangePassword: changePassword, onInstall: standalone ? null : openInstall, pushEnabled: pushEnabled, onTogglePush: pushSupported ? togglePush : null, onSaveBanner: saveBanner, refresh: () => load(token, false) });
        if (page === 'teacher-create')
            return React.createElement(TeacherCreate, { existing: active, students: students, onBack: () => { setActive(null); backPage('teacher'); }, onSave: saveAssign, busy: busy });
        if (page === 'teacher-review' && active) {
            const reviewBack = () => { setActive(null); backPage(reviewStudent ? 'teacher-student' : 'teacher'); };
            const reviewHome = () => { setActive(null); setReviewStudent(null); setReviewFilter('all'); replaceTab('teacher', 'home'); resetPage('teacher'); };
            return active.type === 'exercise' ? React.createElement(TeacherExerciseDetail, { a: active, onBack: reviewBack, onHome: reviewHome }) : React.createElement(TeacherReview, { a: active, students: students, initialStudent: reviewStudent, initialFilter: reviewFilter, onBack: reviewBack, onHome: reviewHome, onSave: saveFeedback, onSend: sendFeedback });
        }
        if (page === 'teacher-student' && selectedStudent)
            return React.createElement(TeacherStudent, { name: selectedStudent, profile: students.find(s => s.name === selectedStudent), vocab: vocab[selectedStudent] || [], assigns: assigns, tab: teacherTab, onTab: k => { replaceTab('teacher', k); resetPage('teacher'); }, onBack: () => backPage('teacher'), onVocab: v => studentVocab(selectedStudent, v), onDelete: () => deleteStudent(selectedStudent), onReview: a => { setReviewStudent(selectedStudent); setReviewFilter('all'); setActive(a); openPage('teacher-review'); } });
        return null;
    }, [page, user, assigns, students, notices, dismissedNotices, vocab, banner, active, selectedStudent, reviewStudent, reviewFilter, studentTab, teacherTab, busy, token, standalone, pushEnabled, pushSupported]);
    return React.createElement(React.Fragment, null,
        React.createElement(Toast, { text: toast }),
        content,
        showInstall && user && !standalone && React.createElement(InstallSheet, { ios: ios, onInstall: requestInstall, onClose: dismissInstall }),
        showPush && user && pushSupported && !pushEnabled && React.createElement(PushSheet, { onEnable: enablePush, onClose: dismissPush, busy: pushBusy }),
        waitingWorker && React.createElement(UpdateSheet, { onUpdate: applyUpdate, onClose: dismissUpdate, busy: updateBusy }));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));
