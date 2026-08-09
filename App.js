import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Plus, LogOut, Shield, Users, X, Check, Ban, Trash2,
  MessageCircle, ArrowLeft, UserPlus, Settings, UserMinus,
  Crown, CheckCheck, Camera, Search, Moon, Sun,
  Reply, Megaphone, Key
} from "lucide-react";
import { dbGet, dbSet, dbUpdate, dbRemove, dbPush, dbListen, uploadDataURL } from "./db";
import "./App.css";

const ADMIN_USERNAME = "ARATA";
const ADMIN_PASSWORD = "arata0502";
const ONLINE_TTL = 20000;
const SESSION_TTL = 30 * 60 * 1000;
const MAX_FAILS = 5;

// ─── notification sound ───
function playNotif() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch {}
}

function encodeImage(file) {
  return new Promise((res, rej) => {
    if (file.size > 2 * 1024 * 1024) { rej(new Error("画像は2MB以下にしてください。")); return; }
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.onerror = () => rej(new Error("読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function Avatar({ name, photo, size = 40, danger, online }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div style={{ width: size, height: size, minWidth: size, position: "relative", flexShrink: 0 }}>
      {photo
        ? <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
        : <div style={{ width: size, height: size, fontSize: size * 0.4, background: danger ? "#f87171" : "#0f766e" }}
            className="rounded-full flex items-center justify-center font-semibold text-white">
            {initial}
          </div>
      }
      {online !== undefined && (
        <span style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: "50%", border: "2px solid white", background: online ? "#16a34a" : "#9ca3af" }} />
      )}
    </div>
  );
}

function ReadReceipt({ msg, conv, me, dark }) {
  if (msg.sender !== me) return null;
  const others = (conv.members || []).filter(m => m !== me);
  const readBy = others.filter(u => (msg.readBy || {})[u]);
  if (readBy.length === 0) return <span style={{ fontSize: 10, color: dark ? "#6b7280" : "#9ca3af", marginLeft: 3 }}>送信済み</span>;
  if (readBy.length === others.length) return <CheckCheck size={13} style={{ color: "#0d9488", marginLeft: 3 }} />;
  return <span style={{ fontSize: 10, color: dark ? "#9ca3af" : "#6b7280", marginLeft: 3 }}>既読{readBy.length}</span>;
}

export default function App() {
  // ── boot ──
  const [booted, setBooted] = useState(false);
  // ── auth ──
  const [screen, setScreen] = useState("login");
  const [authError, setAuthError] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "" });
  const [registerPending, setRegisterPending] = useState(false);
  const [me, setMe] = useState(null); // { username, isAdmin, photo }
  const [lastActivity, setLastActivity] = useState(Date.now());
  // ── settings ──
  const [showSettings, setShowSettings] = useState(false);
  const [pwForm, setPwForm] = useState({ old: "", new1: "", new2: "" });
  const [pwError, setPwError] = useState(""); const [pwOk, setPwOk] = useState(false);
  const [photoInput, setPhotoInput] = useState(null); const [photoError, setPhotoError] = useState("");
  const photoFileRef = useRef(null);
  // ── theme ──
  const [dark, setDark] = useState(false);
  // ── nav ──
  const [view, setView] = useState("chats");
  // ── conversations ──
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageError, setImageError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [addMemberList, setAddMemberList] = useState([]);
  const [addMemberSel, setAddMemberSel] = useState([]);
  // ── users / online ──
  const [allUsers, setAllUsers] = useState([]);
  const [onlineMap, setOnlineMap] = useState({});
  // ── search ──
  const [searchQ, setSearchQ] = useState("");
  // ── admin ──
  const [registerRequests, setRegisterRequests] = useState([]);
  const [announceText, setAnnounceText] = useState("");
  const [announceOk, setAnnounceOk] = useState(false);

  const scrollRef = useRef(null);
  const heartbeatRef = useRef(null);
  const sessionRef = useRef(null);
  const fileRef = useRef(null);
  const prevMsgLen = useRef(0);
  const unsubConvsRef = useRef(null);
  const unsubMsgsRef = useRef(null);
  const unsubOnlineRef = useRef(null);

  // ── theme ──
  const th = {
    bg: dark ? "#0f172a" : "#FAF9F6",
    card: dark ? "#1e293b" : "#ffffff",
    border: dark ? "#334155" : "#e7e5e0",
    text: dark ? "#f1f5f9" : "#1c1917",
    sub: dark ? "#94a3b8" : "#78716c",
    input: dark ? "#0f172a" : "#f5f5f4",
    msgBg: dark ? "#1e293b" : "#ffffff",
    chatBg: dark ? "#0f172a" : "#F7F5F0",
    sidebar: dark ? "#1e293b" : "#FAF9F6",
    myMsg: "#0f766e",
    hover: dark ? "#334155" : "#f5f5f4",
    activeConv: dark ? "#1e3a5f" : "#f0fdfa",
  };

  // ─── bootstrap: ensure admin exists ───
  useEffect(() => {
    (async () => {
      const adminSnap = await dbGet(`users/${ADMIN_USERNAME}`);
      if (!adminSnap) {
        await dbSet(`users/${ADMIN_USERNAME}`, {
          username: ADMIN_USERNAME, password: ADMIN_PASSWORD,
          isAdmin: true, banned: false, createdAt: Date.now(), photo: null
        });
      }
      setBooted(true);
    })();
  }, []);

  // ─── session timeout ───
  const refreshActivity = useCallback(() => setLastActivity(Date.now()), []);
  useEffect(() => {
    if (!me) return;
    sessionRef.current = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TTL) handleLogout();
    }, 30000);
    return () => clearInterval(sessionRef.current);
  }, [me, lastActivity]);

  // ─── heartbeat ───
  const heartbeat = useCallback(async (username) => {
    if (!username) return;
    await dbSet(`online/${username}`, Date.now());
  }, []);

  // ─── auth ───
  const handleRegister = async () => {
    setAuthError("");
    const uname = registerForm.username.trim().replace(/[.#$[\]]/g, "");
    const pwd = registerForm.password;
    if (!uname || !pwd) { setAuthError("ユーザー名とパスワードを入力してください。"); return; }
    if (uname.toLowerCase() === ADMIN_USERNAME.toLowerCase()) { setAuthError("そのユーザー名は使用できません。"); return; }
    if (await dbGet(`users/${uname}`)) { setAuthError("そのユーザー名はすでに使われています。"); return; }
    if (await dbGet(`reqs/${uname}`)) { setAuthError("すでにリクエスト済みです。管理者の承認をお待ちください。"); return; }
    await dbSet(`reqs/${uname}`, { username: uname, password: pwd, requestedAt: Date.now() });
    setRegisterPending(true);
  };

  const handleLogin = async () => {
    setAuthError("");
    const uname = loginForm.username.trim();
    const failData = await dbGet(`loginfails/${uname}`) || { count: 0, until: 0 };
    if (failData.until > Date.now()) {
      const secs = Math.ceil((failData.until - Date.now()) / 1000);
      setAuthError(`ログイン試行が多すぎます。${secs}秒後に再試行してください。`); return;
    }
    const user = await dbGet(`users/${uname}`);
    if (!user || user.password !== loginForm.password) {
      const newCount = (failData.count || 0) + 1;
      const lockUntil = newCount >= MAX_FAILS ? Date.now() + 60000 : 0;
      await dbSet(`loginfails/${uname}`, { count: newCount, until: lockUntil });
      setAuthError(lockUntil ? "5回失敗しました。1分間ロックされます。" : `ユーザー名またはパスワードが違います。(${newCount}/${MAX_FAILS})`);
      return;
    }
    if (user.banned) { setAuthError("このアカウントはBANされています。"); return; }
    await dbSet(`loginfails/${uname}`, { count: 0, until: 0 });
    await heartbeat(uname);
    setMe({ username: user.username, isAdmin: !!user.isAdmin, photo: user.photo || null });
    setLastActivity(Date.now());
  };

  const handleLogout = useCallback(async () => {
    if (me) await dbRemove(`online/${me.username}`);
    clearInterval(heartbeatRef.current); clearInterval(sessionRef.current);
    if (unsubConvsRef.current) unsubConvsRef.current();
    if (unsubMsgsRef.current) unsubMsgsRef.current();
    if (unsubOnlineRef.current) unsubOnlineRef.current();
    setMe(null); setView("chats"); setActiveConvId(null); setConversations([]); setMessages([]);
    setLoginForm({ username: "", password: "" }); setRegisterForm({ username: "", password: "" });
  }, [me]);

  // ─── realtime listeners ───
  useEffect(() => {
    if (!me) return;

    // heartbeat
    heartbeat(me.username);
    heartbeatRef.current = setInterval(() => heartbeat(me.username), 8000);

    // conversations listener
    if (unsubConvsRef.current) unsubConvsRef.current();
    unsubConvsRef.current = dbListen("convs", (data) => {
      if (!data) { setConversations([]); return; }
      const myConvs = Object.values(data)
        .filter(c => c.members && c.members[me.username])
        .sort((a, b) => (b.lastAt || b.createdAt) - (a.lastAt || a.createdAt));
      setConversations(myConvs);
    });

    // online listener
    if (unsubOnlineRef.current) unsubOnlineRef.current();
    unsubOnlineRef.current = dbListen("online", (data) => {
      if (!data) { setOnlineMap({}); return; }
      const now = Date.now();
      const map = {};
      Object.entries(data).forEach(([u, ts]) => { map[u] = (now - ts) < ONLINE_TTL; });
      setOnlineMap(map);
    });

    // users listener
    dbListen("users", (data) => {
      if (!data) { setAllUsers([]); return; }
      setAllUsers(Object.values(data));
    });

    // requests listener (admin only)
    if (me.isAdmin) {
      dbListen("reqs", (data) => {
        if (!data) { setRegisterRequests([]); return; }
        const reqs = Object.values(data).sort((a, b) => a.requestedAt - b.requestedAt);
        setRegisterRequests(reqs);
      });
    }

    return () => {
      clearInterval(heartbeatRef.current);
      if (unsubConvsRef.current) unsubConvsRef.current();
      if (unsubOnlineRef.current) unsubOnlineRef.current();
    };
  }, [me, heartbeat]);

  // ─── messages listener ───
  useEffect(() => {
    if (unsubMsgsRef.current) { unsubMsgsRef.current(); unsubMsgsRef.current = null; }
    if (!activeConvId || !me) return;
    unsubMsgsRef.current = dbListen(`msgs/${activeConvId}`, (data) => {
      const msgs = data ? Object.entries(data).map(([k, v]) => ({ ...v, _key: k })).sort((a, b) => a.ts - b.ts) : [];
      // notification sound
      const newFromOthers = msgs.filter(m => m.sender !== me.username && !(m.readBy || {})[me.username]);
      if (newFromOthers.length > 0 && msgs.length > prevMsgLen.current) playNotif();
      prevMsgLen.current = msgs.length;
      setMessages(msgs);
      // mark read
      msgs.forEach(m => {
        if (m.sender !== me.username && !(m.readBy || {})[me.username] && m._key) {
          dbUpdate(`msgs/${activeConvId}/${m._key}/readBy`, { [me.username]: Date.now() });
        }
      });
    });
    return () => { if (unsubMsgsRef.current) unsubMsgsRef.current(); };
  }, [activeConvId, me]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ─── conversation actions ───
  const openNewChat = async () => { setSelectedMembers([]); setGroupName(""); setShowNewChat(true); };
  const toggleMember = (u) => setSelectedMembers(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

  const createConversation = async () => {
    if (!selectedMembers.length) return;
    const memberNames = [me.username, ...selectedMembers];
    const isGroup = memberNames.length > 2;

    if (!isGroup) {
      const existing = conversations.find(c => c.type === "dm" && c.members[selectedMembers[0]]);
      if (existing) { setActiveConvId(existing.id); setShowNewChat(false); setMobileShowChat(true); return; }
    }

    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const membersMap = {};
    memberNames.forEach(u => { membersMap[u] = true; });
    const conv = {
      id, type: isGroup ? "group" : "dm",
      name: isGroup ? groupName.trim() || memberNames.filter(m => m !== me.username).join(", ") : null,
      members: membersMap,
      owner: isGroup ? me.username : null,
      admins: isGroup ? { [me.username]: true } : {},
      createdAt: Date.now(), lastAt: Date.now()
    };
    await dbSet(`convs/${id}`, conv);
    setShowNewChat(false); setActiveConvId(id); setMobileShowChat(true);
  };

  // ─── image picker ───
  const pickImage = () => { setImageError(""); fileRef.current?.click(); };
  const onFileChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    try { setImagePreview(await encodeImage(file)); } catch (err) { setImageError(err.message); }
  };

  // ─── send message ───
  const sendMessage = async () => {
    const text = messageInput.trim();
    if (!text && !imagePreview) return;
    if (!activeConvId) return;
    refreshActivity();
    const msgText = text || null;
    let imageURL = null;
    if (imagePreview) {
      const path = `images/${activeConvId}/${Date.now()}`;
      try { imageURL = await uploadDataURL(path, imagePreview); } catch { imageURL = imagePreview; }
    }
    setMessageInput(""); setImagePreview(null); setReplyTo(null);
    const newMsg = {
      sender: me.username, text: msgText, image: imageURL || null,
      ts: Date.now(), readBy: {},
      replyTo: replyTo ? { sender: replyTo.sender, text: replyTo.text, image: !!replyTo.image } : null,
    };
    await dbPush(`msgs/${activeConvId}`, newMsg);
    await dbUpdate(`convs/${activeConvId}`, { lastAt: Date.now() });
  };

  // ─── group management ───
  const activeConv = conversations.find(c => c.id === activeConvId);
  const isGroupOwner = activeConv?.owner === me?.username;
  const canManageGroup = isGroupOwner || (activeConv?.admins || {})[me?.username] || me?.isAdmin;

  const leaveGroup = async () => {
    if (!activeConv || activeConv.type !== "group") return;
    if (activeConv.owner === me.username) { alert("オーナーは退出できません。"); return; }
    await dbRemove(`convs/${activeConvId}/members/${me.username}`);
    await dbRemove(`convs/${activeConvId}/admins/${me.username}`);
    setActiveConvId(null); setShowGroupSettings(false); setMobileShowChat(false);
  };
  const removeMember = async (username) => {
    if (!canManageGroup || username === activeConv.owner) return;
    await dbRemove(`convs/${activeConvId}/members/${username}`);
    await dbRemove(`convs/${activeConvId}/admins/${username}`);
  };
  const toggleGroupAdmin = async (username) => {
    if (!isGroupOwner) return;
    const isAdm = (activeConv.admins || {})[username];
    if (isAdm) await dbRemove(`convs/${activeConvId}/admins/${username}`);
    else await dbUpdate(`convs/${activeConvId}/admins`, { [username]: true });
  };
  const openAddMember = () => {
    const currentMembers = Object.keys(activeConv?.members || {});
    setAddMemberList(allUsers.filter(u => !currentMembers.includes(u.username) && !u.banned));
    setAddMemberSel([]);
  };
  const doAddMembers = async () => {
    if (!addMemberSel.length || !activeConv) return;
    const updates = {};
    addMemberSel.forEach(u => { updates[u] = true; });
    await dbUpdate(`convs/${activeConvId}/members`, updates);
    setAddMemberSel([]); setAddMemberList([]);
  };

  // ─── admin actions ───
  const approveRequest = async (req) => {
    await dbSet(`users/${req.username}`, { username: req.username, password: req.password, isAdmin: false, banned: false, createdAt: Date.now(), photo: null });
    await dbRemove(`reqs/${req.username}`);
  };
  const denyRequest = async (req) => { await dbRemove(`reqs/${req.username}`); };
  const toggleBan = async (user) => { await dbUpdate(`users/${user.username}`, { banned: !user.banned }); };
  const deleteUser = async (user) => {
    if (user.username === ADMIN_USERNAME) return;
    if (!window.confirm(`${user.username} を削除しますか?`)) return;
    await dbRemove(`users/${user.username}`);
  };
  const sendAnnouncement = async () => {
    if (!announceText.trim()) return;
    const allMembersMap = {};
    allUsers.forEach(u => { allMembersMap[u.username] = true; });
    const annId = "conv_announce";
    const existing = await dbGet(`convs/${annId}`);
    if (!existing) {
      await dbSet(`convs/${annId}`, { id: annId, type: "group", name: "📢 お知らせ", members: allMembersMap, owner: me.username, admins: { [me.username]: true }, createdAt: Date.now(), lastAt: Date.now(), isAnnounce: true });
    } else {
      await dbUpdate(`convs/${annId}/members`, allMembersMap);
      await dbUpdate(`convs/${annId}`, { lastAt: Date.now() });
    }
    await dbPush(`msgs/${annId}`, { sender: me.username, text: announceText.trim(), ts: Date.now(), readBy: {} });
    setAnnounceText(""); setAnnounceOk(true); setTimeout(() => setAnnounceOk(false), 3000);
  };

  // ─── password change ───
  const changePassword = async () => {
    setPwError(""); setPwOk(false);
    const user = await dbGet(`users/${me.username}`);
    if (!user || user.password !== pwForm.old) { setPwError("現在のパスワードが違います。"); return; }
    if (pwForm.new1.length < 4) { setPwError("新しいパスワードは4文字以上にしてください。"); return; }
    if (pwForm.new1 !== pwForm.new2) { setPwError("新しいパスワードが一致しません。"); return; }
    await dbUpdate(`users/${me.username}`, { password: pwForm.new1 });
    setPwForm({ old: "", new1: "", new2: "" }); setPwOk(true); setTimeout(() => setPwOk(false), 3000);
  };

  // ─── profile photo ───
  const pickProfilePhoto = () => { setPhotoError(""); photoFileRef.current?.click(); };
  const onProfilePhotoChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
    try { setPhotoInput(await encodeImage(file)); } catch (err) { setPhotoError(err.message); }
  };
  const saveProfilePhoto = async () => {
    if (!photoInput) return;
    let url = photoInput;
    try { url = await uploadDataURL(`photos/${me.username}`, photoInput); } catch {}
    await dbUpdate(`users/${me.username}`, { photo: url });
    setMe(prev => ({ ...prev, photo: url })); setPhotoInput(null);
  };

  // ─── helpers ───
  const convTitle = (conv) => {
    if (!conv) return "";
    if (conv.type === "group") return conv.name || Object.keys(conv.members || {}).filter(m => m !== me?.username).join(", ");
    return Object.keys(conv.members || {}).find(m => m !== me?.username) || "?";
  };
  const convSubtitle = (conv) => {
    if (!conv) return "";
    if (conv.type === "group") return `${Object.keys(conv.members || {}).length}人のグループ`;
    const other = Object.keys(conv.members || {}).find(m => m !== me?.username);
    return other && onlineMap[other] ? "オンライン" : "オフライン";
  };
  const dmOther = (conv) => conv?.type === "dm" ? Object.keys(conv.members || {}).find(m => m !== me?.username) : null;
  const userPhoto = (username) => allUsers.find(u => u.username === username)?.photo || null;

  const filteredConvs = conversations.filter(c => !searchQ || convTitle(c).toLowerCase().includes(searchQ.toLowerCase()));
  const filteredUsers = allUsers.filter(u => !searchQ || u.username.toLowerCase().includes(searchQ.toLowerCase()));

  const totalUnread = messages.length; // simplified — full unread tracking via Firebase

  const inputStyle = { background: th.input, color: th.text, borderColor: th.border, outline: "none" };
  const inputCls = "w-full border rounded-lg px-3 py-2.5 text-sm";

  if (!booted) return <div style={{ background: th.bg }} className="w-full h-screen flex items-center justify-center text-stone-400">読み込み中...</div>;

  // ══════════ AUTH ══════════
  if (!me) return (
    <div style={{ background: th.bg }} className="w-full min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-10 h-10 rounded-2xl bg-teal-700 flex items-center justify-center"><MessageCircle size={20} className="text-white" /></div>
          <span className="text-xl font-semibold" style={{ color: th.text }}>Hanashi</span>
          <button onClick={() => setDark(d => !d)} className="ml-auto p-2" style={{ color: th.sub }}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
        {registerPending ? (
          <div style={{ background: th.card, borderColor: th.border }} className="rounded-2xl border p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-4"><Check size={28} className="text-teal-600" /></div>
            <p className="font-medium mb-2" style={{ color: th.text }}>リクエストを送信しました</p>
            <p className="text-sm leading-relaxed" style={{ color: th.sub }}>管理者が承認するとログインできるようになります。</p>
            <button onClick={() => { setRegisterPending(false); setScreen("login"); }} className="mt-5 text-sm text-teal-600 hover:underline">ログイン画面に戻る</button>
          </div>
        ) : (
          <div style={{ background: th.card, borderColor: th.border }} className="rounded-2xl border p-6">
            <div className="flex mb-6 rounded-xl p-1" style={{ background: dark ? "#0f172a" : "#f5f5f4" }}>
              {["login", "register"].map(s => (
                <button key={s} onClick={() => { setScreen(s); setAuthError(""); }}
                  style={{ background: screen === s ? th.card : "transparent", color: screen === s ? th.text : th.sub }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition">
                  {s === "login" ? "ログイン" : "新規登録"}
                </button>
              ))}
            </div>
            {screen === "login" ? (
              <div className="space-y-3">
                <input placeholder="ユーザー名" value={loginForm.username} style={inputStyle} className={inputCls}
                  onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} />
                <input type="password" placeholder="パスワード" value={loginForm.password} style={inputStyle} className={inputCls}
                  onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && handleLogin()} />
                {authError && <p className="text-rose-500 text-xs">{authError}</p>}
                <button onClick={handleLogin} className="w-full bg-teal-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-teal-800 transition">ログイン</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700 leading-relaxed">
                  登録リクエストを送信すると、管理者が確認・承認後にログインできます。
                </div>
                <input placeholder="ユーザー名 (英数字)" value={registerForm.username} style={inputStyle} className={inputCls}
                  onChange={e => setRegisterForm({ ...registerForm, username: e.target.value })} />
                <input type="password" placeholder="パスワード" value={registerForm.password} style={inputStyle} className={inputCls}
                  onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && handleRegister()} />
                {authError && <p className="text-rose-500 text-xs">{authError}</p>}
                <button onClick={handleRegister} className="w-full bg-teal-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-teal-800 transition">承認リクエストを送る</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ══════════ MAIN APP ══════════
  return (
    <div style={{ background: th.card, position: "relative" }}
      className="w-full h-screen flex overflow-hidden"
      onClick={refreshActivity} onKeyDown={refreshActivity}>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
      <input ref={photoFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onProfilePhotoChange} />

      {/* ── SIDEBAR ── */}
      <div style={{ width: 300, minWidth: 300, background: th.sidebar, borderColor: th.border }}
        className={`border-r flex flex-col ${mobileShowChat ? "hidden md:flex" : "flex"}`}>

        {/* header */}
        <div style={{ borderColor: th.border }} className="px-4 py-3 border-b flex items-center gap-2">
          <Avatar name={me.username} photo={me.photo} size={34} online={true} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: th.text }}>{me.username}</p>
            <p className="text-[11px]" style={{ color: me.isAdmin ? "#0d9488" : "#16a34a" }}>{me.isAdmin ? "管理者" : "オンライン"}</p>
          </div>
          <button onClick={() => setDark(d => !d)} className="p-1.5 rounded-lg" style={{ color: th.sub }}>{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
          <button onClick={() => { setShowSettings(s => !s); setPwError(""); setPwOk(false); setPhotoInput(null); }} className="p-1.5 rounded-lg" style={{ color: th.sub }}><Settings size={15} /></button>
          <button onClick={handleLogout} className="p-1.5 rounded-lg" style={{ color: th.sub }}><LogOut size={15} /></button>
        </div>

        {/* settings */}
        {showSettings && (
          <div style={{ background: th.card, borderColor: th.border }} className="border-b px-4 py-3 space-y-2">
            <p className="text-xs font-medium" style={{ color: th.sub }}>プロフィール写真</p>
            <div className="flex items-center gap-3">
              <Avatar name={me.username} photo={photoInput || me.photo} size={44} />
              <div>
                <button onClick={pickProfilePhoto} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><Camera size={12} /> 写真を変更</button>
                {photoError && <p className="text-rose-500 text-[11px]">{photoError}</p>}
                {photoInput && <button onClick={saveProfilePhoto} className="mt-1 text-xs bg-teal-700 text-white px-2 py-1 rounded">保存する</button>}
              </div>
            </div>
            <p className="text-xs font-medium pt-1" style={{ color: th.sub }}>パスワード変更</p>
            {[["old", "現在のパスワード"], ["new1", "新しいパスワード"], ["new2", "確認"]].map(([k, ph]) => (
              <input key={k} type="password" placeholder={ph} value={pwForm[k]} style={inputStyle} className={inputCls}
                onChange={e => setPwForm({ ...pwForm, [k]: e.target.value })} />
            ))}
            {pwError && <p className="text-rose-500 text-xs">{pwError}</p>}
            {pwOk && <p className="text-teal-600 text-xs">変更しました！</p>}
            <button onClick={changePassword} className="w-full bg-teal-700 text-white rounded-lg py-2 text-xs font-medium hover:bg-teal-800 transition flex items-center justify-center gap-1">
              <Key size={13} /> 変更する
            </button>
          </div>
        )}

        {/* tabs */}
        {me.isAdmin && (
          <div style={{ borderColor: th.border }} className="flex border-b">
            {[["chats", "チャット", <MessageCircle size={13} />], ["admin", "管理", <Shield size={13} />]].map(([v, label, icon]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ color: view === v ? "#0d9488" : th.sub, borderBottomColor: view === v ? "#0d9488" : "transparent" }}
                className="flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition">
                {icon} {label}
                {v === "admin" && registerRequests.length > 0 && <span className="bg-rose-500 text-white text-[10px] rounded-full px-1.5">{registerRequests.length}</span>}
              </button>
            ))}
          </div>
        )}

        {/* search */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: th.input }}>
            <Search size={14} style={{ color: th.sub }} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="検索..."
              style={{ background: "transparent", color: th.text, outline: "none", flex: 1, fontSize: 13 }} />
          </div>
        </div>

        {/* chats */}
        {view === "chats" && (
          <>
            <div className="px-3 pt-2 pb-1">
              <button onClick={openNewChat} className="w-full flex items-center justify-center gap-1.5 bg-teal-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-teal-800 transition">
                <Plus size={15} /> 新しいチャット
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {filteredConvs.length === 0 && <p className="text-xs text-center mt-8 px-4" style={{ color: th.sub }}>チャットがありません。</p>}
              {filteredConvs.map(c => {
                const other = dmOther(c);
                const isOnline = c.type === "dm" && other && onlineMap[other];
                return (
                  <button key={c.id} onClick={() => { setActiveConvId(c.id); setMobileShowChat(true); setShowGroupSettings(false); setReplyTo(null); }}
                    style={{ background: activeConvId === c.id ? th.activeConv : "transparent", width: "100%" }}
                    className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition hover:opacity-80">
                    {c.type === "group"
                      ? <div className="w-10 h-10 min-w-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0"><Users size={17} className="text-white" /></div>
                      : <Avatar name={convTitle(c)} photo={userPhoto(other)} online={isOnline} />
                    }
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: th.text }}>{convTitle(c)}</p>
                      <p className="text-[11px] truncate" style={{ color: isOnline ? "#16a34a" : th.sub }}>{convSubtitle(c)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* admin */}
        {view === "admin" && (
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {/* announcement */}
            <div style={{ background: dark ? "#1e3a5f" : "#eff6ff", borderColor: dark ? "#1d4ed8" : "#bfdbfe" }} className="rounded-xl border p-3 mb-2">
              <p className="text-xs font-medium flex items-center gap-1 mb-2" style={{ color: dark ? "#93c5fd" : "#1d4ed8" }}><Megaphone size={13} /> 全体アナウンス</p>
              <textarea value={announceText} onChange={e => setAnnounceText(e.target.value)} placeholder="全員に送るメッセージ..." rows={2}
                style={{ ...inputStyle, resize: "none", width: "100%", borderRadius: 8, padding: "6px 10px", fontSize: 12, border: `1px solid ${th.border}` }} />
              {announceOk && <p className="text-teal-600 text-xs mt-1">送信しました！</p>}
              <button onClick={sendAnnouncement} disabled={!announceText.trim()}
                className="w-full mt-1.5 bg-blue-600 disabled:bg-stone-300 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-blue-700 transition">送信する</button>
            </div>
            {/* requests */}
            {registerRequests.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-rose-500 px-1 mb-1.5 flex items-center gap-1"><UserPlus size={13} /> 登録リクエスト ({registerRequests.length})</p>
                {registerRequests.map(req => (
                  <div key={req.username} style={{ background: dark ? "#2d1515" : "#fff1f2", borderColor: "#fecdd3" }} className="flex items-center gap-2 border rounded-xl px-3 py-2.5 mb-1.5">
                    <Avatar name={req.username} size={30} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: th.text }}>{req.username}</p>
                      <p className="text-[11px]" style={{ color: th.sub }}>{new Date(req.requestedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <button onClick={() => approveRequest(req)} className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50"><Check size={15} /></button>
                    <button onClick={() => denyRequest(req)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"><X size={15} /></button>
                  </div>
                ))}
                <div style={{ borderColor: th.border }} className="border-t my-2" />
              </div>
            )}
            {/* users */}
            <p className="text-xs px-1 mb-1" style={{ color: th.sub }}>全ユーザー ({filteredUsers.length})</p>
            {filteredUsers.map(u => (
              <div key={u.username} style={{ background: th.card, borderColor: th.border }} className="flex items-center gap-2.5 border rounded-xl px-3 py-2.5">
                <Avatar name={u.username} photo={u.photo} size={32} danger={u.banned} online={onlineMap[u.username]} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-1" style={{ color: th.text }}>
                    {u.username} {u.isAdmin && <Shield size={12} className="text-teal-600" />}
                  </p>
                  <p className="text-[11px]" style={{ color: u.banned ? "#f43f5e" : onlineMap[u.username] ? "#16a34a" : th.sub }}>
                    {u.banned ? "BAN中" : onlineMap[u.username] ? "オンライン" : "オフライン"}
                  </p>
                </div>
                {u.username !== ADMIN_USERNAME && (
                  <div className="flex gap-1">
                    <button onClick={() => toggleBan(u)} className={`p-1.5 rounded-lg ${u.banned ? "text-teal-600" : "text-amber-600"}`}>{u.banned ? <Check size={14} /> : <Ban size={14} />}</button>
                    <button onClick={() => deleteUser(u)} className="p-1.5 rounded-lg text-rose-500"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CHAT PANEL ── */}
      <div style={{ flex: 1, minWidth: 0 }} className={`flex flex-col ${mobileShowChat ? "flex" : "hidden md:flex"}`}>
        {activeConv ? (
          <>
            {/* header */}
            <div style={{ borderColor: th.border, background: th.card }} className="px-4 py-3 border-b flex items-center gap-2.5">
              <button onClick={() => { setMobileShowChat(false); setShowGroupSettings(false); }} className="p-1 md:hidden" style={{ color: th.sub }}><ArrowLeft size={18} /></button>
              {activeConv.type === "group"
                ? <div className="w-9 h-9 min-w-9 rounded-full bg-amber-500 flex items-center justify-center"><Users size={16} className="text-white" /></div>
                : <Avatar name={convTitle(activeConv)} photo={userPhoto(dmOther(activeConv))} size={36} online={onlineMap[dmOther(activeConv)]} />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: th.text }}>{convTitle(activeConv)}</p>
                <p className="text-[11px]" style={{ color: activeConv.type === "dm" && onlineMap[dmOther(activeConv)] ? "#16a34a" : th.sub }}>{convSubtitle(activeConv)}</p>
              </div>
              {activeConv.type === "group" && (
                <button onClick={() => setShowGroupSettings(v => !v)}
                  style={{ color: showGroupSettings ? "#0d9488" : th.sub, background: showGroupSettings ? (dark ? "#0f2920" : "#f0fdfa") : "transparent" }}
                  className="p-2 rounded-lg transition"><Settings size={17} /></button>
              )}
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* messages */}
              <div ref={scrollRef} style={{ background: th.chatBg, flex: 1 }} className="overflow-y-auto px-4 py-4 flex flex-col gap-3">
                {messages.length === 0 && <p className="text-xs text-center mt-6" style={{ color: th.sub }}>まだメッセージがありません。</p>}
                {messages.map(m => {
                  const mine = m.sender === me.username;
                  return (
                    <div key={m._key || m.ts} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                      {!mine && <Avatar name={m.sender} photo={userPhoto(m.sender)} size={26} online={onlineMap[m.sender]} />}
                      <div className={`max-w-[68%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        {!mine && activeConv.type === "group" && <span className="text-[11px] mb-0.5 px-1" style={{ color: th.sub }}>{m.sender}</span>}
                        {m.replyTo && (
                          <div style={{ background: dark ? "#0f172a" : "#f5f5f4", borderLeft: "3px solid #0d9488", borderRadius: 8, padding: "4px 8px", marginBottom: 4 }}>
                            <p className="text-[11px] font-medium text-teal-600">{m.replyTo.sender}</p>
                            <p className="text-[11px] truncate" style={{ color: th.sub }}>{m.replyTo.image ? "📷 画像" : m.replyTo.text}</p>
                          </div>
                        )}
                        {m.image && <img src={m.image} alt="送信画像" style={{ maxWidth: 200, maxHeight: 180, borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", objectFit: "cover", marginBottom: m.text ? 4 : 0 }} />}
                        {m.text && (
                          <div style={{ background: mine ? th.myMsg : th.msgBg, color: mine ? "#fff" : th.text, borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", border: mine ? "none" : `1px solid ${th.border}` }}
                            className="px-3.5 py-2 text-sm leading-relaxed">{m.text}</div>
                        )}
                        <div className={`flex items-center mt-0.5 gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                          <span style={{ fontSize: 10, color: th.sub }}>{new Date(m.ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</span>
                          {mine && <ReadReceipt msg={m} conv={{ members: Object.keys(activeConv.members || {}) }} me={me.username} dark={dark} />}
                          <button onClick={() => setReplyTo(m)} style={{ color: th.sub }} className="opacity-50 hover:opacity-100"><Reply size={12} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* group settings */}
              {showGroupSettings && activeConv.type === "group" && (
                <div style={{ width: 220, minWidth: 220, background: th.card, borderColor: th.border }} className="border-l flex flex-col overflow-y-auto">
                  <div style={{ borderColor: th.border }} className="px-3 py-3 border-b"><p className="text-xs font-medium" style={{ color: th.sub }}>グループ設定</p></div>
                  <div className="px-3 py-2 flex-1 overflow-y-auto">
                    <p className="text-[11px] mb-2" style={{ color: th.sub }}>メンバー ({Object.keys(activeConv.members || {}).length})</p>
                    {Object.keys(activeConv.members || {}).map(u => {
                      const isOwner = u === activeConv.owner;
                      const isAdm = (activeConv.admins || {})[u];
                      const isMe = u === me.username;
                      return (
                        <div key={u} className="flex items-center gap-2 py-1.5">
                          <Avatar name={u} photo={userPhoto(u)} size={28} online={onlineMap[u]} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate flex items-center gap-1" style={{ color: th.text }}>
                              {u} {isOwner && <Crown size={11} className="text-amber-500" />} {!isOwner && isAdm && <Shield size={11} className="text-teal-500" />}
                            </p>
                            <p className="text-[10px]" style={{ color: onlineMap[u] ? "#16a34a" : th.sub }}>{onlineMap[u] ? "オンライン" : "オフライン"}</p>
                          </div>
                          {!isMe && canManageGroup && !isOwner && (
                            <div className="flex gap-0.5">
                              {isGroupOwner && <button onClick={() => toggleGroupAdmin(u)} className={`p-1 rounded ${isAdm ? "text-teal-600" : "text-stone-400"}`}><Shield size={13} /></button>}
                              <button onClick={() => removeMember(u)} className="p-1 rounded text-rose-400"><UserMinus size={13} /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {canManageGroup && (
                    <div style={{ borderColor: th.border }} className="border-t px-3 py-2">
                      <p className="text-[11px] mb-1.5" style={{ color: th.sub }}>メンバーを追加</p>
                      {addMemberList.length === 0
                        ? <button onClick={openAddMember} className="w-full flex items-center gap-1.5 text-xs text-teal-600 py-1"><UserPlus size={14} /> 選択する</button>
                        : <div>
                            {addMemberList.map(u => (
                              <button key={u.username} onClick={() => setAddMemberSel(prev => prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username])}
                                style={{ background: addMemberSel.includes(u.username) ? (dark ? "#0f2920" : "#f0fdfa") : "transparent", color: th.text, width: "100%" }}
                                className="flex items-center gap-1.5 py-1 px-1 rounded text-xs">
                                <Avatar name={u.username} photo={u.photo} size={18} /><span className="flex-1 text-left truncate">{u.username}</span>
                                {addMemberSel.includes(u.username) && <Check size={12} className="text-teal-600" />}
                              </button>
                            ))}
                            <button onClick={doAddMembers} disabled={!addMemberSel.length}
                              className="w-full mt-1.5 bg-teal-700 disabled:bg-stone-300 text-white rounded py-1 text-xs font-medium">追加する</button>
                          </div>
                      }
                    </div>
                  )}
                  {activeConv.owner !== me.username && (
                    <div style={{ borderColor: th.border }} className="border-t px-3 py-2">
                      <button onClick={leaveGroup} className="w-full flex items-center gap-1.5 text-xs text-rose-500 py-1"><LogOut size={14} /> グループを退出</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* reply preview */}
            {replyTo && (
              <div style={{ background: th.input, borderColor: th.border, borderTopColor: "#0d9488" }} className="px-4 py-2 border-t-2 flex items-center gap-2">
                <Reply size={14} className="text-teal-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-teal-600">{replyTo.sender}に返信</p>
                  <p className="text-[11px] truncate" style={{ color: th.sub }}>{replyTo.image ? "📷 画像" : replyTo.text}</p>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ color: th.sub }}><X size={15} /></button>
              </div>
            )}
            {imagePreview && (
              <div style={{ borderColor: th.border }} className="px-3 pt-2 border-t flex items-center gap-2">
                <img src={imagePreview} alt="プレビュー" style={{ height: 56, borderRadius: 8, objectFit: "cover" }} />
                <button onClick={() => setImagePreview(null)} style={{ color: th.sub }}><X size={16} /></button>
                <span className="text-xs" style={{ color: th.sub }}>送信する画像</span>
              </div>
            )}
            {imageError && <p className="text-xs text-rose-500 px-4 pt-1">{imageError}</p>}

            {/* input */}
            <div style={{ borderColor: th.border, background: th.card }} className="px-3 py-3 border-t flex items-center gap-2">
              <button onClick={pickImage} style={{ borderColor: th.border, color: th.sub }} className="w-9 h-9 min-w-9 rounded-full border flex items-center justify-center hover:text-teal-600 transition"><Camera size={16} /></button>
              <input value={messageInput} onChange={e => setMessageInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="メッセージを入力"
                style={{ background: th.input, color: th.text, border: "none", outline: "none", flex: 1, borderRadius: 999, padding: "10px 16px", fontSize: 14 }} />
              <button onClick={sendMessage} disabled={!messageInput.trim() && !imagePreview}
                className="w-10 h-10 min-w-10 rounded-full bg-teal-700 disabled:bg-stone-300 text-white flex items-center justify-center hover:bg-teal-800 transition"><Send size={16} /></button>
            </div>
          </>
        ) : (
          <div style={{ background: th.chatBg, color: th.sub }} className="flex-1 flex items-center justify-center flex-col gap-2">
            <MessageCircle size={40} /><p className="text-sm">チャットを選択してください</p>
          </div>
        )}
      </div>

      {/* new chat modal */}
      {showNewChat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={() => setShowNewChat(false)}>
          <div style={{ background: th.card, borderColor: th.border }} className="rounded-2xl border w-full max-w-sm p-5 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-medium flex items-center gap-1.5" style={{ color: th.text }}><UserPlus size={17} /> 新しいチャット</p>
              <button onClick={() => setShowNewChat(false)} style={{ color: th.sub }}><X size={18} /></button>
            </div>
            {selectedMembers.length > 1 && (
              <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="グループ名(任意)"
                style={inputStyle} className={`${inputCls} mb-3`} />
            )}
            <div className="max-h-64 overflow-y-auto space-y-1">
              {allUsers.filter(u => u.username !== me.username && !u.banned).map(u => (
                <button key={u.username} onClick={() => toggleMember(u.username)}
                  style={{ background: selectedMembers.includes(u.username) ? (dark ? "#0f2920" : "#f0fdfa") : "transparent", width: "100%" }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left">
                  <Avatar name={u.username} photo={u.photo} size={30} online={onlineMap[u.username]} />
                  <span className="text-sm flex-1" style={{ color: th.text }}>{u.username}</span>
                  {selectedMembers.includes(u.username) && <Check size={16} className="text-teal-600" />}
                </button>
              ))}
              {allUsers.filter(u => u.username !== me.username).length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: th.sub }}>他のユーザーがまだいません。</p>
              )}
            </div>
            <button onClick={createConversation} disabled={!selectedMembers.length}
              className="w-full mt-4 bg-teal-700 disabled:bg-stone-300 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-teal-800 transition">
              {selectedMembers.length > 1 ? "グループを作成" : "チャットを開始"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
