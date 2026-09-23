import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, onValue, onChildAdded, onChildChanged, set, update } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const $ = (selector) => document.querySelector(selector);
const ADMIN_EMAIL = "sotrabalho683@gmail.com";
const LEVEL_THRESHOLDS = [0,50,100,180,280,400,550,750,1000,1300,1650,2050,2500,3000,3550,4150,4800,5500];
const LEVEL_FLOORS = [0,35,70,140,220,330,470,650,880,1150,1450,1800,2200,2650,3150,3700,4300,4800];
const LEVEL_NAMES = ["Recruta","Soldado","Cabo","3º Sargento","2º Sargento","1º Sargento","Subtenente","Aspirante","2º Tenente","1º Tenente","Capitão","Major","Tenente-Coronel","Coronel","General de Brigada","General de Divisão","General de Exército","General"];
const state = { user: null, section: "inicio", filter: "todas", data: { tarefas: {}, notas: {}, cuidados: {}, agua: {}, treinos_extras: {}, exercicios_dias: {}, cuidados_dias: {} }, backup: {}, news: {}, backupCategory: "diary_local", listeners: [], editId: null, editIndex: null, toastTimer: null };
const sections = {
  inicio: { title: "Visão geral", subtitle: "Tudo que está em aberto ou vence hoje, em um só lugar.", add: "Nova tarefa", node: "tarefas", empty: "Nada pendente por aqui", emptyCopy: "Suas tarefas, cuidados e exercícios em aberto aparecerão nesta página." },
  tarefas: { title: "Suas tarefas", subtitle: "Organize o que importa e comemore cada avanço.", add: "Nova tarefa", node: "tarefas", empty: "Tudo começa com um primeiro passo", emptyCopy: "Adicione uma tarefa e ela aparecerá aqui e no aplicativo." },
  cuidados: { title: "Cuidados pessoais", subtitle: "Pequenos hábitos que ajudam você a se sentir bem.", add: "Novo cuidado", node: "cuidados", empty: "Um cuidado de cada vez", emptyCopy: "Adicione um cuidado pessoal para acompanhar sua rotina." },
  agua: { title: "Sua hidratação", subtitle: "Acompanhe a água que você bebe ao longo do dia.", add: "Registrar água", node: "agua", empty: "Ainda não há registros de hoje", emptyCopy: "Registre um copo de água para começar." },
  notas: { title: "Suas notas", subtitle: "Ideias e lembretes rápidos, sempre à mão.", add: "Nova nota", node: "notas", empty: "Guarde uma ideia por aqui", emptyCopy: "Suas notas ficam disponíveis no site e no app." },
  exercicios: { title: "Seus exercícios", subtitle: "Uma rotina simples, registrada junto com o app.", add: "Novo exercício", node: "treinos_extras", empty: "Monte sua rotina", emptyCopy: "Adicione um exercício para organizar seus treinos." },
  mais: { title: "Mais áreas do app", subtitle: "Seus outros dados salvos na mesma conta, com sincronização pelo backup do app.", add: "Novo registro", node: "", empty: "Nenhum registro nesta área", emptyCopy: "Seus dados aparecem aqui depois que o app salva o backup na nuvem." },
  noticias: { title: "Notícias", subtitle: "Avisos e novidades do Pontua Tasks.", add: "Publicar notícia", node: "", empty: "Nenhuma notícia por enquanto", emptyCopy: "As novidades publicadas aparecerão aqui." }
};
const backupLabels = { diary_local:"Diário", humor_local:"Humor", financas_local:"Finanças", dividas_local:"Dívidas", dividas_recorrentes_local:"Dívidas recorrentes", mensagens_local:"Mensagens", livros_local:"Livros", sono_local:"Sono", estudos_local:"Estudos", emprestimos_local:"Empréstimos", lembretes_local:"Lembretes", estoque_local:"Estoque", ferramentas_local:"Ferramentas", calorias_local:"Alimentação", historico_local:"Histórico", config_local:"Configurações" };
const priorityName = (value) => Number(value) >= 2 ? "Prioridade alta" : Number(value) === 1 ? "Prioridade média" : "Normal";
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const localDate = (time) => { const d = new Date(Number(time)); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };
const localDayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const safeKey = (value) => String(value).replace(/[.#$\[\]/ ]/g, "_");
const items = (node) => Object.entries(state.data[node] || {}).filter(([, item]) => !item.deletado).map(([id, item]) => ({ id, ...item }));
const pathFor = (node) => ref(database, `users/${state.user.uid}/itens/${node}`);

function message(text, error = false) {
  const banner = $("#status-banner");
  if (error) { banner.textContent = text; banner.classList.remove("hidden"); }
  else { banner.classList.add("hidden"); }
  const toast = $("#toast"); toast.textContent = text; toast.classList.add("visible");
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function showError(error) {
  console.error(error);
  const detail = error?.code === "PERMISSION_DENIED" || error?.code === "database/permission-denied"
    ? "O Firebase recusou o acesso. Confira as regras do Realtime Database descritas no LEIA-ME."
    : error?.code?.includes("unauthorized-domain") ? "Este endereço ainda não está autorizado no Firebase Authentication."
    : error?.message || "Não foi possível sincronizar. Tente novamente.";
  message(detail, true);
}

function attachLiveData() {
  state.listeners.forEach((unsubscribe) => unsubscribe());
  state.listeners = [];
  for (const node of Object.keys(state.data)) {
    const listener = (snapshot) => { state.data[node][snapshot.key] = snapshot.val() || {}; render(); };
    state.listeners.push(onChildAdded(pathFor(node), listener, showError));
    state.listeners.push(onChildChanged(pathFor(node), listener, showError));
  }
  state.listeners.push(onValue(ref(database, `users/${state.user.uid}/backup`), (snapshot) => {
    try { const value = snapshot.val(); state.backup = typeof value === "string" ? JSON.parse(value || "{}") : (value || {}); render(); }
    catch (error) { showError(error); }
  }, showError));
  state.listeners.push(onValue(ref(database, "news"), (snapshot) => { state.news = snapshot.val() || {}; render(); }, showError));
}

function updateAccount(user) {
  $("#profile-name").textContent = user.displayName || "Minha conta";
  $("#profile-email").textContent = user.email || "";
  $("#avatar").textContent = (user.displayName || user.email || "P").trim().charAt(0).toUpperCase();
  $("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
}

function render() {
  const config = sections[state.section];
  $("#breadcrumb-current").textContent = config.title;
  $("#page-title").innerHTML = `${escapeHtml(config.title)}<span class="period">.</span>`;
  $("#page-subtitle").textContent = state.section === "mais" ? `${config.subtitle} As mudanças chegam ao app quando você atualiza a tela nele.` : config.subtitle;
  $("#add-label").textContent = config.add;
  $("#empty-title").textContent = config.empty;
  $("#empty-copy").textContent = config.emptyCopy;
  $("#navigation").querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.section === state.section));
  $("#overview").classList.toggle("hidden", state.section !== "inicio");
  $("#filters").classList.toggle("hidden", state.section !== "tarefas");
  $("#add-button").classList.toggle("hidden", state.section === "mais");
  $("#add-button").classList.toggle("hidden", state.section === "noticias" && !isAdmin());
  $("#import-backup-button").classList.toggle("hidden", state.section !== "mais");
  $("#backup-categories").classList.toggle("hidden", state.section !== "mais");
  const filterHint = state.section === "mais" ? "Backup do app" : state.section === "noticias" ? "Avisos do Pontua Tasks" : "Sincronizado com o app";
  $("#section-helper").innerHTML = `<span class="live-dot"></span> ${filterHint}`;
  $("#filters").querySelectorAll(".filter-pill").forEach((button) => button.classList.toggle("selected", button.dataset.filter === state.filter));
  const taskList = items("tarefas");
  const open = taskList.filter((task) => !task.done).length;
  const done = taskList.length - open;
  const progress = taskList.length ? Math.round(done * 100 / taskList.length) : 0;
  $("#open-count").textContent = open; $("#done-count").textContent = done; $("#progress-count").innerHTML = `${progress}<span class="small-unit">%</span>`;
  const score = Math.max(0, Number(state.backup?.pontua_local?.score || 0));
  const rank = rankFor(score, Number(state.backup?.pontua_local?.patente_atual_nivel || 1));
  $("#score-total").textContent = `${Number(state.backup?.pontua_local?.score || 0)} pontos`;
  $("#rank-name").textContent = LEVEL_NAMES[rank - 1];
  const badgeNames = ["recruta","soldado","cabo","sargento_3","sargento_2","sargento_1","subtenente","aspirante","tenente_2","tenente_1","capitao","major","tenente_coronel","coronel","general_de_brigada","general_de_divisao","general_de_exercito","marechal"];
  $("#rank-badge").src = `patentes/${badgeNames[rank - 1]}.png`;
  const rankBase = LEVEL_THRESHOLDS[rank - 1];
  const rankTarget = LEVEL_THRESHOLDS[rank] || rankBase;
  $("#rank-next").textContent = rank >= 18 ? "Patente máxima" : `Próxima: ${LEVEL_NAMES[rank]} · faltam ${Math.max(0, rankTarget - score)} pts`;
  $("#rank-progress").style.width = rank >= 18 ? "100%" : `${Math.min(100, Math.max(0, (score - rankBase) * 100 / Math.max(1, rankTarget - rankBase)))}%`;
  $("#progress-bar").style.width = `${progress}%`; $("#nav-task-count").textContent = open || "";
  let rows = [];
  if (state.section === "inicio") rows = renderOverview();
  if (state.section === "tarefas") rows = renderTasks();
  if (state.section === "notas") rows = renderNotes();
  if (state.section === "cuidados") rows = renderCare();
  if (state.section === "agua") rows = renderWater();
  if (state.section === "exercicios") rows = renderExercises();
  if (state.section === "mais") rows = renderBackupSection();
  if (state.section === "noticias") rows = renderNews();
  if (state.section === "mais") $("#add-button").classList.toggle("hidden", !backupCollection().records.length);
  $("#list").innerHTML = rows.join("");
  $("#empty-state").classList.toggle("hidden", rows.length > 0);
}

function row(id, title, subtitle, trailing = "", options = {}) {
  const checked = options.checked ? "checked" : "";
  const done = options.checked ? "is-done" : "";
  const check = options.toggle ? `<button class="check-control ${checked}" data-action="${options.toggle}" data-id="${escapeHtml(id)}" aria-label="Marcar como ${options.checked ? "pendente" : "concluído"}">${options.checked ? "✓" : ""}</button>` : "";
  const remove = options.delete ? `<button class="row-action" data-action="delete" data-id="${escapeHtml(id)}" aria-label="Excluir" title="Excluir">×</button>` : "";
  return `<article class="item-row ${done} ${options.urgency || ""}" data-id="${escapeHtml(id)}" data-kind="${escapeHtml(options.kind || "")}">${check}<div class="item-copy"><div class="item-title">${escapeHtml(title)}</div><div class="item-subtitle">${escapeHtml(subtitle || " ")}</div></div>${trailing}<div class="row-actions">${options.edit ? `<button class="row-action" data-action="edit" data-id="${escapeHtml(id)}" aria-label="Editar" title="Editar">✎</button>` : ""}${remove}</div></article>`;
}

const hasDue = (item) => (item?.hasDeadline === true || Number(item?.dueAt) > 0) && Number(item?.dueAt) > 0;
const dueSort = (item) => hasDue(item) ? Number(item.dueAt) : Number.POSITIVE_INFINITY;
function dueAtToday(hour = 23, minute = 59) { const date = new Date(); date.setHours(hour, minute, 0, 0); return date.getTime(); }
function dueLabel(timestamp) { const date = new Date(timestamp); return `Prazo ${localDate(timestamp)} às ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`; }
function sectionHeading(title, count) { return `<h2 class="overview-heading">${escapeHtml(title)} <span>${count}</span></h2>`; }
function decodePref(pref, key, fallback = "") { return decodeBackupValue(state.backup?.[pref]?.[key] ?? fallback); }
function exerciseGroupsForToday() {
  const dow = new Date().getDay() + 1;
  const today = localDayKey();
  const pref = state.backup?.exercicios_local || {};
  const defaultDays = { A: [2,5], B: [3,6], C: [4,7] };
  const defaults = { A: ["Peito","Tríceps"], B: ["Bíceps","Costas"], C: ["Ombro","Inferiores","ABS"] };
  const groups = [];
  for (const letter of ["A","B","C"]) {
    const savedDaysValue = decodePref("exercicios_local", `dias_treino_${letter}`, null);
    const days = savedDaysValue === null ? defaultDays[letter] : String(savedDaysValue).split(",").map(Number).filter(Boolean);
    if (!days.includes(dow)) continue;
    const rawNames = String(decodePref("exercicios_local", `treino_${letter}`, "")).trim();
    const names = rawNames ? rawNames.split(",").map((name)=>name.trim()).filter(Boolean) : defaults[letter];
    const dayMap = decodePref("exercicios_local", `dia_${today}`, {});
    for (const name of names) {
      const completed = dayMap?.[name] === true || dayMap?.[name] === "feito";
      groups.push({ id: `abc_${letter}_${safeKey(name)}`, name, type: "abc", completed, dueAt: dueAtToday(), dueText: "Treino de hoje" });
    }
  }
  const marked = items("exercicios_dias");
  for (const exercise of items("treinos_extras")) {
    if (!(exercise.days || []).map(Number).includes(dow)) continue;
    const entry = marked.find((record)=>record.dayKey===today && record.grupo===exercise.name && record.concluido);
    const hasTime = Number(exercise.deadlineHour) >= 0;
    groups.push({ id: exercise.id, name: exercise.name, type: "extra", exercise, completed: !!entry, dueAt: hasTime ? dueAtToday(Number(exercise.deadlineHour), Number(exercise.deadlineMinute||0)) : dueAtToday(), dueText: hasTime ? `Prazo até ${String(exercise.deadlineHour).padStart(2,"0")}:${String(exercise.deadlineMinute||0).padStart(2,"0")}` : "Exercício de hoje" });
  }
  return groups;
}
function renderOverview() {
  const now = Date.now();
  const taskRows = items("tarefas").filter((task)=>!task.done).sort((a,b)=>dueSort(a)-dueSort(b)).map((task)=>row(task.id,task.title||"Tarefa",`${task.hasDeadline&&task.dueAt?dueLabel(task.dueAt):"Sem prazo"}${task.description?` · ${task.description}`:""}`,`<span class="tag-chip">Tarefa</span>`,{toggle:"task-toggle",kind:"tarefas",edit:true,urgency:urgencyClass(task)}));
  const today = localDayKey();
  const careDay = items("cuidados_dias");
  const careRows = items("cuidados").filter((care)=>{
    if (care.diaUnico && care.diaUnico !== today) return false;
    const rec = careDay.find((entry)=>entry.dayKey===today&&entry.careTaskId===care.id);
    if (rec?.status) return false;
    const due = care.hasTime && Number(care.hour)>=0 ? dueAtToday(Number(care.hour),Number(care.minute||0)) : dueAtToday();
    return !(care.hasTime && care.createdAt && Number(care.createdAt)>due);
  }).map((care)=>{
    const deadline = care.hasTime && Number(care.hour)>=0 ? dueAtToday(Number(care.hour),Number(care.minute||0)) : dueAtToday();
    const label = care.hasTime ? `Hoje às ${String(care.hour).padStart(2,"0")}:${String(care.minute||0).padStart(2,"0")}` : "Hoje · sem horário definido";
    return { care, deadline, label };
  }).sort((a,b)=>a.deadline-b.deadline).map(({care,deadline,label})=>row(care.id,care.name||"Cuidado pessoal",label,"<span class=\"tag-chip\">Cuidado</span>",{toggle:"care-toggle",kind:"cuidados",edit:true,urgency:care.hasTime?urgencyClass({hasDeadline:true,dueAt:deadline}):"urgency-none"}));
  const exerciseRows = exerciseGroupsForToday().filter((exercise)=>!exercise.completed).sort((a,b)=>a.dueAt-b.dueAt).map((exercise)=>row(exercise.id,exercise.name,exercise.dueText,`<span class="tag-chip">${exercise.type==="abc"?"Treino":"Exercício"}</span>`,{toggle:"exercise-toggle",kind:exercise.type==="abc"?"abc":"treinos_extras",edit:exercise.type==="extra",urgency:urgencyClass({hasDeadline:exercise.type==="extra"&&Number(exercise.exercise.deadlineHour)>=0,dueAt:exercise.dueAt})}));
  const noteRows = items("notas").filter(hasDue).sort((a,b)=>Number(a.dueAt)-Number(b.dueAt)).map((note)=>row(note.id,(note.text||"Nota").split("\n")[0],dueLabel(note.dueAt),"<span class=\"tag-chip\">Nota</span>",{kind:"notas",edit:true,delete:true,urgency:urgencyClass(note)}));
  const groups = [
    ["Tarefas em aberto",taskRows],
    ["Notas com prazo",noteRows],
    ["Cuidados pessoais de hoje",careRows],
    ["Exercícios de hoje",exerciseRows]
  ];
  const html = groups.map(([title,rows])=>rows.length?`${sectionHeading(title,rows.length)}${rows.join("")}`:"").join("");
  return html ? [html] : [];
}

function isAdmin() { return (state.user?.email || "").toLowerCase() === ADMIN_EMAIL; }
function rankFor(score, savedLevel) {
  let level = Math.max(1, Math.min(18, savedLevel));
  while (level < 18 && score >= LEVEL_THRESHOLDS[level]) level++;
  while (level > 1 && score < LEVEL_FLOORS[level - 1]) level--;
  return level;
}
function urgencyClass(item) {
  if (item.done) return "";
  if (!hasDue(item)) return "urgency-none";
  const diff = Number(item.dueAt || 0) - Date.now();
  if (diff <= 0) return "urgency-overdue";
  if (diff <= 3600000) return "urgency-red-strong";
  if (diff <= 3 * 3600000) return "urgency-red";
  if (diff <= 8 * 3600000) return "urgency-yellow";
  if (diff <= 20 * 3600000) return "urgency-green";
  return "urgency-none";
}
function renderNews() {
  const admin = isAdmin();
  return Object.entries(state.news).filter(([, item]) => !item?.deleted).sort((a,b)=>Number(b[1]?.createdAt||0)-Number(a[1]?.createdAt||0)).map(([id, news]) => {
    const safeTitle = escapeHtml(news.title || "Notícia");
    const body = sanitizeNewsHtml(news.bodyHtml || escapeHtml(news.body || "").replace(/\n/g,"<br>"));
    const date = news.createdAt ? localDate(news.createdAt) : "";
    const cover = safeImageSource(news.coverImage);
    const link = /^https?:\/\//i.test(news.buttonUrl||"") ? `<a class="news-link" href="${escapeHtml(news.buttonUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(news.buttonLabel||"Saiba mais")}</a>` : "";
    return `<article class="news-card"><div class="news-meta">${escapeHtml(news.category||"Notícia")}${date ? ` · ${date}` : ""}${admin ? `<span><button class="row-action" data-action="edit" data-id="${escapeHtml(id)}" title="Editar notícia">✎</button><button class="row-action" data-action="delete" data-id="${escapeHtml(id)}" title="Excluir notícia">×</button></span>` : ""}</div>${cover?`<img class="news-cover" src="${escapeHtml(cover)}" alt="">`:""}<h2>${safeTitle}</h2>${news.subtitle?`<p class="news-subtitle">${escapeHtml(news.subtitle)}</p>`:""}<div class="news-body">${body}</div>${link}</article>`;
  });
}

const NEWS_TAGS = new Set(["P","BR","STRONG","B","EM","I","U","H2","H3","UL","OL","LI","A","IMG","BLOCKQUOTE"]);
function safeImageSource(value) {
  const source = String(value || "").trim();
  return source.length <= 1_300_000 && (/^https?:\/\//i.test(source) || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(source)) ? source : "";
}
function sanitizeNewsHtml(html) {
  const documentCopy = new DOMParser().parseFromString(`<div>${html}</div>`,"text/html");
  const root = documentCopy.body.firstElementChild;
  const cleanNode = (node) => {
    [...node.childNodes].forEach((child)=>{
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName;
      cleanNode(child);
      if (!NEWS_TAGS.has(tag)) { child.replaceWith(...child.childNodes); return; }
      const originalHref = child.getAttribute("href");
      const originalSrc = child.getAttribute("src");
      const originalAlt = child.getAttribute("alt") || "";
      [...child.attributes].forEach((attribute)=>child.removeAttribute(attribute.name));
      if (tag === "A" && /^(https?:\/\/|mailto:)/i.test(originalHref||"")) { child.setAttribute("href",originalHref); child.setAttribute("target","_blank"); child.setAttribute("rel","noopener noreferrer"); }
      if (tag === "IMG") { const safe = safeImageSource(originalSrc); if (safe) { child.setAttribute("src",safe); child.setAttribute("alt",originalAlt); } else child.remove(); }
    });
  };
  cleanNode(root);
  return root.innerHTML;
}
async function compressNewsImage(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 12 * 1024 * 1024) throw new Error("A imagem precisa ter menos de 12 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(image.width,image.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1,Math.round(image.width*scale)); canvas.height = Math.max(1,Math.round(image.height*scale));
  canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height); image.close();
  let data = canvas.toDataURL("image/webp",0.76);
  if (data.length > 950_000) data = canvas.toDataURL("image/jpeg",0.65);
  if (data.length > 1_250_000) throw new Error("A imagem ficou muito grande. Escolha uma imagem menor.");
  return data;
}

function renderTasks() {
  const all = items("tarefas").sort((a, b) => Number(a.done) - Number(b.done) || dueSort(a) - dueSort(b));
  return all.filter((task) => state.filter === "todas" || (state.filter === "abertas" ? !task.done : task.done)).map((task) => {
    const subtitle = [task.description, task.hasDeadline && task.dueAt ? `Prazo ${localDate(task.dueAt)}` : "Sem prazo", task.tags ? `# ${task.tags}` : ""].filter(Boolean).join(" · ");
    const level = Number(task.priority || 0);
    const priority = `<span class="priority-chip ${level >= 2 ? "high" : level === 1 ? "medium" : ""}">● ${priorityName(level)}</span>`;
    return row(task.id, task.title || "Tarefa", subtitle, priority, { toggle: "task-toggle", checked: !!task.done, edit: true, delete: true, urgency: urgencyClass(task) });
  });
}

function renderNotes() {
  return items("notas").sort((a,b)=>dueSort(a)-dueSort(b)||(b.date||0)-(a.date||0)).map((note) => row(note.id, (note.text || "Nota").split("\n")[0], `${hasDue(note)?dueLabel(note.dueAt):note.date?localDate(note.date):"Nota sincronizada"}${note.tags ? ` · ${note.tags}` : ""}`, "<span class=\"tag-chip\">Nota</span>", { edit: true, delete: true, urgency: hasDue(note) ? urgencyClass(note) : "" }));
}

function renderCare() {
  const today = localDayKey();
  const dayEntries = items("cuidados_dias");
  return items("cuidados").sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map((care) => {
    const record = dayEntries.find((entry) => entry.dayKey === today && entry.careTaskId === care.id);
    const status = record?.status || "";
    const checked = status === "feito";
    const chip = status ? `<span class="status-chip">${status === "feito" ? "Feito hoje" : status === "perdida" ? "Perdido" : "Pulado"}</span>` : `<span class="status-chip">Pendente hoje</span>`;
    return row(care.id, care.name || "Cuidado pessoal", `${care.hasTime ? `Horário ${String(care.hour).padStart(2,"0")}:${String(care.minute||0).padStart(2,"0")}` : "Rotina pessoal"} · Toque em ✓ para marcar hoje`, chip, { toggle: "care-toggle", checked, edit: true, delete: true });
  });
}

function renderWater() {
  const today = localDayKey();
  const todaysWater = items("agua").filter((entry) => entry.date && localDayKey(new Date(entry.date)) === today).sort((a,b)=>b.date-a.date);
  const total = todaysWater.reduce((sum, entry) => sum + Number(entry.amountMl || 0), 0);
  const goal = Number(state.data.backup?.agua_local?.metaMl || 2000);
  const summary = `<article class="item-row"><span class="stat-icon green-icon">◉</span><div class="item-copy"><div class="item-title">${(total/1000).toLocaleString("pt-BR",{maximumFractionDigits:2})} L de ${(goal/1000).toLocaleString("pt-BR")} L hoje</div><div class="item-subtitle">${Math.min(100,Math.round(total*100/goal))}% da sua meta diária · Registros sincronizados com o app</div></div><span class="tag-chip">Hoje</span></article>`;
  return [summary, ...todaysWater.map((entry) => row(entry.id, `${Number(entry.amountMl).toLocaleString("pt-BR")} ml`, `Registrado às ${new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit"}).format(new Date(entry.date))}`, "<span class=\"tag-chip\">Água</span>", { edit: true, delete: true }))];
}

function renderExercises() {
  const today = localDayKey();
  const marked = items("exercicios_dias");
  return items("treinos_extras").sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map((exercise) => {
    const record = marked.find((entry) => entry.dayKey === today && entry.grupo === exercise.name);
    return row(exercise.id, exercise.name || "Exercício", `${exercise.metaQuantidade ? `Meta ${exercise.metaQuantidade} ${exercise.unidade || "repetições"} · ` : ""}${exercise.points || 1} ponto(s) · Toque em ✓ para registrar hoje`, `<span class="tag-chip">${(exercise.days || []).length ? "Rotina" : "Exercício"}</span>`, { toggle: "exercise-toggle", checked: !!record?.concluido, edit: true, delete: true });
  });
}

function decodeBackupValue(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}
function backupCollection() {
  const preference = state.backup[state.backupCategory] || {};
  for (const [key, value] of Object.entries(preference)) {
    const decoded = decodeBackupValue(value);
    if (Array.isArray(decoded)) return { preference, key, records: decoded };
  }
  return { preference, key: Object.prototype.hasOwnProperty.call(preference, "entries") ? "entries" : "entries", records: [] };
}
function backupCategories() {
  return Object.keys(backupLabels).filter((name) => state.backup[name] || ["diary_local","financas_local"].includes(name));
}
function recordTitle(record, index) {
  if (typeof record !== "object" || !record) return `Registro ${index + 1}`;
  return record.title || record.name || record.nome || record.text || record.titulo || record.exercicio || record.assunto || record.tipo || `Registro ${index + 1}`;
}
function renderBackupSection() {
  let categories = backupCategories();
  if (categories.length && !categories.includes(state.backupCategory)) state.backupCategory = categories[0];
  $("#backup-categories").innerHTML = categories.map((name) => `<button class="category-pill ${name === state.backupCategory ? "selected" : ""}" data-backup-category="${name}">${escapeHtml(backupLabels[name])}</button>`).join("");
  const collection = backupCollection();
  return collection.records.map((record, index) => {
    const preview = typeof record === "object" && record ? Object.entries(record).filter(([key,value]) => key !== "id" && key !== "updatedAt" && value !== "" && value != null && typeof value !== "object").slice(0,3).map(([key,value]) => `${humanizeKey(key)}: ${String(value)}`).join(" · ") : String(record);
    return row(String(index), recordTitle(record,index), preview || "Registro salvo no backup do app", `<span class="tag-chip">${escapeHtml(backupLabels[state.backupCategory] || "App")}</span>`, { edit: true, delete: true });
  });
}
function humanizeKey(key) {
  return key.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/_/g," ").replace(/^./,(letter)=>letter.toUpperCase());
}

function openBackupDialog(index = null) {
  const collection = backupCollection();
  const old = index == null ? null : collection.records[Number(index)];
  state.editIndex = index == null ? null : Number(index);
  const model = old || (collection.records[0] ? newBackupRecord(collection.records[0]) : null);
  if (!model || typeof model !== "object") return message("Ainda não há um modelo de registro nesta área.");
  $("#dialog-title").textContent = old ? `Editar registro · ${backupLabels[state.backupCategory]}` : `Novo registro · ${backupLabels[state.backupCategory]}`;
  $("#delete-button").classList.toggle("hidden", !old);
  $("#dialog-fields").innerHTML = Object.entries(model).filter(([key]) => key !== "id" && key !== "updatedAt").map(([key,value]) => {
    const name = `backup_${key}`;
    const label = humanizeKey(key);
    if (typeof value === "boolean") return `<label class="checkbox-field"><input name="${name}" type="checkbox" ${value ? "checked" : ""} /> ${escapeHtml(label)}</label>`;
    if (value != null && typeof value === "object") return `<label class="field">${escapeHtml(label)}<textarea name="${name}" data-json-field="true">${escapeHtml(JSON.stringify(value))}</textarea></label>`;
    if (typeof value === "number" && value > 1000000000000 && /(date|time|deadline|createdat|completedat|timestamp)/i.test(key)) {
      const date = new Date(value); const local = new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
      return `<label class="field">${escapeHtml(label)}<input name="${name}" type="datetime-local" data-epoch-field="true" value="${local}" /></label>`;
    }
    const type = typeof value === "number" ? "number" : "text";
    return `<label class="field">${escapeHtml(label)}<input name="${name}" type="${type}" value="${escapeHtml(value ?? "")}" /></label>`;
  }).join("");
  $("#item-dialog").showModal();
}

async function saveBackupRecord(form) {
  const collection = backupCollection();
  const model = state.editIndex == null ? (collection.records[0] ? newBackupRecord(collection.records[0]) : null) : collection.records[state.editIndex];
  if (!model || typeof model !== "object") return message("Não encontramos um registro para usar como modelo.");
  const record = { ...model };
  for (const [key, value] of Object.entries(model)) {
    if (key === "id" || key === "updatedAt") continue;
    const input = form.elements[`backup_${key}`]; if (!input) continue;
    if (typeof value === "boolean") record[key] = input.checked;
    else if (value != null && typeof value === "object") {
      try { record[key] = JSON.parse(input.value || (Array.isArray(value) ? "[]" : "{}")); }
      catch { return message(`Confira o campo ${humanizeKey(key)}.`); }
    } else if (typeof value === "number" && input.dataset.epochField) record[key] = input.value ? new Date(input.value).getTime() : 0;
    else if (typeof value === "number") record[key] = input.value === "" ? 0 : Number(input.value);
    else record[key] = input.value;
  }
  record.id = model.id || crypto.randomUUID();
  if (Object.prototype.hasOwnProperty.call(record,"updatedAt")) record.updatedAt = Date.now();
  if (state.editIndex == null) collection.records.push(record); else collection.records[state.editIndex] = record;
  await saveBackupCollection(collection);
  render();
  $("#item-dialog").close(); message("Backup atualizado. Atualize a tela no app para receber a mudança.");
}

async function saveBackupCollection(collection) {
  const pref = { ...(state.backup[collection.preference] || {}) };
  const oldValue = pref[collection.key];
  pref[collection.key] = typeof oldValue === "string" ? JSON.stringify(collection.records) : collection.records;
  state.backup[collection.preference] = pref;
  await set(ref(database, `users/${state.user.uid}/webPatch/${collection.preference}/${collection.key}`), { value: pref[collection.key], updatedAt: Date.now() });
}

async function deleteBackupRecord(index) {
  if (!confirm("Excluir este registro do backup? Atualize a tela no app para receber a mudança.")) return;
  const collection = backupCollection();
  collection.records.splice(Number(index),1);
  await saveBackupCollection(collection); $("#item-dialog").close(); render(); message("Registro removido do backup.");
}
function newBackupRecord(sample) {
  return Object.fromEntries(Object.entries(sample).map(([key,value]) => [key, key === "id" ? crypto.randomUUID() : key === "updatedAt" ? Date.now() : typeof value === "boolean" ? false : typeof value === "number" && value > 1000000000000 && /(date|time|deadline|createdat|completedat|timestamp)/i.test(key) ? Date.now() : typeof value === "number" ? 0 : typeof value === "string" ? "" : Array.isArray(value) ? [] : value && typeof value === "object" ? {} : ""]));
}

function field(label, name, value = "", type = "text", placeholder = "", extra = "") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${extra} /></label>`;
}
function textField(label, name, value = "", placeholder = "") {
  return `<label class="field">${label}<textarea name="${name}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea></label>`;
}
function openDialog(id = null) {
  state.editId = id;
  if (state.section === "noticias") {
    const old = id ? state.news[id] : null;
    $("#dialog-title").textContent = old ? "Editar notícia" : "Publicar notícia";
    $("#delete-button").classList.add("hidden");
    const body = old?.bodyHtml || escapeHtml(old?.body || "").replace(/\n/g,"<br>");
    $("#dialog-fields").innerHTML = field("Título", "newsTitle", old?.title || "", "text", "Ex.: Novidade no aplicativo", "required maxlength=\"100\"") +
      field("Resumo curto (opcional)", "newsSubtitle", old?.subtitle || "", "text", "Uma frase para chamar atenção", "maxlength=\"180\"") +
      `<label class="field">Categoria<select name="newsCategory">${["Novidades","Avisos","Atualizações","Eventos","Geral"].map((category)=>`<option ${((old?.category||"Geral")===category)?"selected":""}>${category}</option>`).join("")}</select></label>` +
      `<label class="field">Imagem de capa (opcional)<span class="news-cover-input"><input name="newsCover" id="news-cover-input" type="text" placeholder="Cole o endereço da imagem ou escolha um arquivo" value="${escapeHtml(old?.coverImage||"")}"/><button type="button" class="button secondary" id="news-cover-choose">Escolher imagem</button><input type="file" id="news-cover-file" accept="image/*" hidden></span><img id="news-cover-preview" class="news-cover-preview ${old?.coverImage?"":"hidden"}" src="${escapeHtml(safeImageSource(old?.coverImage)||"")}" alt="Prévia da capa"></label>` +
      `<label class="field">Texto da notícia<div class="news-toolbar"><button type="button" data-news-command="bold"><b>B</b></button><button type="button" data-news-command="italic"><i>I</i></button><button type="button" data-news-command="underline"><u>U</u></button><button type="button" data-news-command="formatBlock" data-news-value="h2">Título</button><button type="button" data-news-command="insertUnorderedList">• Lista</button><button type="button" data-news-command="createLink">Link</button><button type="button" id="news-insert-image">Imagem no texto</button><input type="file" id="news-body-file" accept="image/*" hidden></div><div id="news-editor" class="news-editor" contenteditable="true" data-placeholder="Escreva a notícia. Selecione um trecho e use os botões para formatar.">${sanitizeNewsHtml(body)}</div></label>` +
      field("Endereço do botão (opcional)", "newsButtonUrl", old?.buttonUrl || "", "url", "https://…") +
      field("Texto do botão", "newsButtonLabel", old?.buttonLabel || "Saiba mais", "text", "Saiba mais", "maxlength=\"40\"");
    $("#item-dialog").showModal();
    const coverInput = $("#news-cover-input");
    const coverPreview = $("#news-cover-preview");
    const previewCover = () => { const src=safeImageSource(coverInput.value); coverPreview.src=src; coverPreview.classList.toggle("hidden",!src); };
    coverInput.addEventListener("input",previewCover);
    $("#news-cover-choose").addEventListener("click",()=>$("#news-cover-file").click());
    $("#news-cover-file").addEventListener("change",async(event)=>{try{coverInput.value=await compressNewsImage(event.target.files[0]);previewCover();}catch(error){message(error.message,true);}});
    $("#news-insert-image").addEventListener("click",()=>$("#news-body-file").click());
    $("#news-body-file").addEventListener("change",async(event)=>{try{const src=await compressNewsImage(event.target.files[0]);$("#news-editor").focus();document.execCommand("insertHTML",false,`<p><img src="${src}" alt="Imagem da notícia"></p>`);}catch(error){message(error.message,true);}});
    $("#dialog-fields").querySelectorAll("[data-news-command]").forEach((button)=>button.addEventListener("mousedown",(event)=>event.preventDefault()));
    $("#dialog-fields").querySelectorAll("[data-news-command]").forEach((button)=>button.addEventListener("click",()=>{
      $("#news-editor").focus();
      if(button.dataset.newsCommand==="createLink"){const url=prompt("Cole o endereço do link (https://…)");if(url&&/^https?:\/\//i.test(url))document.execCommand("createLink",false,url);else if(url)message("Use um endereço que comece com http:// ou https://.");}
      else document.execCommand(button.dataset.newsCommand,false,button.dataset.newsValue||null);
    }));
    return;
  }
  const node = sections[state.section].node;
  const existing = id ? state.data[node][id] : null;
  const title = existing ? `Editar ${state.section === "tarefas" ? "tarefa" : state.section === "notas" ? "nota" : state.section === "cuidados" ? "cuidado" : "exercício"}` : sections[state.section].add;
  $("#dialog-title").textContent = title;
  $("#delete-button").classList.toggle("hidden", !existing);
  let fields = "";
  if (state.section === "tarefas") {
    const due = existing?.dueAt ? new Date(existing.dueAt) : null;
    fields = field("Nome da tarefa", "title", existing?.title || "", "text", "Ex.: estudar matemática", "required maxlength=\"100\"") +
      textField("Descrição", "description", existing?.description || "", "Detalhes que ajudam você a começar…") +
      `<div class="field-row">${field("Prazo", "dueAt", due ? new Date(due.getTime()-due.getTimezoneOffset()*60000).toISOString().slice(0,16) : "", "datetime-local")}<label class="field">Prioridade<select name="priority"><option value="0" ${Number(existing?.priority||0)===0?"selected":""}>Normal</option><option value="1" ${Number(existing?.priority||0)===1?"selected":""}>Média</option><option value="2" ${Number(existing?.priority||0)>=2?"selected":""}>Alta</option></select></label></div>` +
      `<label class="field">Repetição<select name="repeat"><option value="NONE" ${!existing?.repeat||existing.repeat==="NONE"?"selected":""}>Não repetir</option><option value="DAILY" ${existing?.repeat==="DAILY"?"selected":""}>Todos os dias</option><option value="WEEKLY" ${existing?.repeat==="WEEKLY"?"selected":""}>Toda semana</option><option value="MONTHLY" ${existing?.repeat==="MONTHLY"?"selected":""}>Todo mês</option>${existing?.repeat==="CUSTOM"?'<option value="CUSTOM" selected>Personalizada do app</option>':""}</select></label>` +
      `<label class="field">Dias da semana <small style="font-weight:400;color:#99a39d">Use para repetição semanal (opcional).</small><span class="field-row">${[[1,"Dom"],[2,"Seg"],[3,"Ter"],[4,"Qua"],[5,"Qui"],[6,"Sex"],[7,"Sáb"]].map(([day,label])=>`<label class="checkbox-field"><input name="repeatDay" type="checkbox" value="${day}" ${(existing?.repeatDays||[]).includes(day)?"checked":""} /> ${label}</label>`).join("")}</span></label>` +
      field("Tags (opcional)", "tags", existing?.tags || "", "text", "estudo, trabalho") +
      `<label class="checkbox-field"><input name="mandatory" type="checkbox" ${existing?.mandatory ? "checked" : ""} /> Tarefa importante</label>`;
  } else if (state.section === "notas") {
    const noteDue = existing?.dueAt ? new Date(existing.dueAt) : null;
    fields = textField("Sua nota", "text", existing?.text || "", "Escreva sua ideia aqui…") + field("Prazo (opcional)", "dueAt", noteDue ? new Date(noteDue.getTime()-noteDue.getTimezoneOffset()*60000).toISOString().slice(0,16) : "", "datetime-local") + field("Tags (opcional)", "tags", existing?.tags || "", "text", "ideias, estudo");
  } else if (state.section === "cuidados") {
    fields = field("Nome do cuidado", "name", existing?.name || "", "text", "Ex.: escovar os dentes", "required maxlength=\"80\"") +
      `<label class="checkbox-field"><input name="hasTime" type="checkbox" ${existing?.hasTime ? "checked" : ""} /> Definir um horário</label>` +
      `<div class="field-row">${field("Horário", "time", existing?.hasTime ? `${String(existing.hour).padStart(2,"0")}:${String(existing.minute||0).padStart(2,"0")}` : "", "time")}${field("Dia (opcional)", "diaUnico", existing?.diaUnico || "", "date")}</div>`;
  } else if (state.section === "agua") {
    const date = existing?.date ? new Date(existing.date) : new Date();
    const localTime = new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    fields = field("Quantidade de água", "amountMl", existing?.amountMl || "250", "number", "250", "required min=\"1\" max=\"5000\" step=\"50\"") + field("Data e horário", "date", localTime, "datetime-local", "", "required") + "<p class=\"muted\">O registro aparece na aba Água do app.</p>";
  } else if (state.section === "exercicios") {
    fields = field("Nome do exercício", "name", existing?.name || "", "text", "Ex.: caminhada", "required maxlength=\"80\"") +
      `<div class="field-row">${field("Meta (opcional)", "metaQuantidade", existing?.metaQuantidade || "", "number", "10", "min=\"0\"")}${field("Unidade", "unidade", existing?.unidade || "", "text", "repetições")}</div>` +
      `<label class="field">Dias de treino<span class="field-row workout-days">${[[1,"Dom"],[2,"Seg"],[3,"Ter"],[4,"Qua"],[5,"Qui"],[6,"Sex"],[7,"Sáb"]].map(([day,label])=>`<label class="checkbox-field"><input name="workoutDay" type="checkbox" value="${day}" ${(existing?.days||[]).includes(day)?"checked":""} /> ${label}</label>`).join("")}</span></label>` +
      field("Pontos por sessão", "points", existing?.points || 1, "number", "1", "min=\"0\" max=\"100\"");
  }
  $("#dialog-fields").innerHTML = fields;
  $("#item-dialog").showModal();
}

async function saveItem(form) {
  if (state.section === "noticias") {
    if (!isAdmin()) return message("Somente a conta administradora pode publicar notícias.", true);
    const values = Object.fromEntries(new FormData(form).entries());
    const bodyHtml = sanitizeNewsHtml($("#news-editor").innerHTML);
    if (!values.newsTitle.trim() || !bodyHtml.trim()) return message("Preencha o título e o texto da notícia.");
    if (values.newsCover && !safeImageSource(values.newsCover)) return message("Confira o endereço da imagem de capa.");
    if (values.newsButtonUrl && !/^https?:\/\//i.test(values.newsButtonUrl)) return message("O endereço do botão precisa começar com http:// ou https://.");
    const id = state.editId || crypto.randomUUID();
    const old = state.news[id] || {};
    await set(ref(database, `news/${id}`), { title: values.newsTitle.trim(), subtitle: values.newsSubtitle.trim(), category: values.newsCategory || "Geral", coverImage: safeImageSource(values.newsCover), bodyHtml, buttonUrl: values.newsButtonUrl.trim(), buttonLabel: values.newsButtonLabel.trim() || "Saiba mais", createdAt: Number(old.createdAt || Date.now()), updatedAt: Date.now(), author: ADMIN_EMAIL, deleted: false });
    $("#item-dialog").close(); message(state.editId ? "Notícia atualizada." : "Notícia publicada para os usuários."); return;
  }
  const node = sections[state.section].node;
  const old = state.editId ? state.data[node][state.editId] : null;
  const id = state.editId || crypto.randomUUID();
  const values = Object.fromEntries(new FormData(form).entries());
  let data;
  if (state.section === "tarefas") {
    data = { ...old, title: values.title.trim(), description: values.description.trim(), dueAt: values.dueAt ? new Date(values.dueAt).getTime() : 0, hasDeadline: !!values.dueAt, repeat: values.repeat || "NONE", priority: Number(values.priority || 0), mandatory: form.elements.mandatory.checked, done: !!old?.done, penalized: !!old?.penalized, completedAt: Number(old?.completedAt || 0), repeatDays: values.repeat === "CUSTOM" ? (old?.repeatDays || []) : values.repeat === "WEEKLY" ? [...form.querySelectorAll('[name="repeatDay"]:checked')].map((input)=>Number(input.value)) : [], tags: values.tags.trim(), linkedRecurringDebtId: old?.linkedRecurringDebtId || "", lastPenaltyDay: old?.lastPenaltyDay || "", createdAt: Number(old?.createdAt || Date.now()), linkedStudySubjectId: old?.linkedStudySubjectId || "", ofertaStatus: old?.ofertaStatus || "", ofertaPontos: Number(old?.ofertaPontos || 0), ofertaPrazoEm: Number(old?.ofertaPrazoEm || 0), ultimaOfertaEm: Number(old?.ultimaOfertaEm || 0) };
  } else if (state.section === "notas") {
    if (!values.text.trim()) return message("Escreva alguma coisa na nota.");
    data = { ...old, text: values.text.trim(), tags: values.tags.trim(), date: Number(old?.date || Date.now()), dueAt: values.dueAt ? new Date(values.dueAt).getTime() : 0, hasDeadline: !!values.dueAt };
  } else if (state.section === "cuidados") {
    const [hour = "-1", minute = "0"] = values.time ? values.time.split(":") : [];
    data = { ...old, name: values.name.trim(), createdAt: Number(old?.createdAt || Date.now()), hasTime: form.elements.hasTime.checked && !!values.time, hour: Number(hour), minute: Number(minute), diaUnico: values.diaUnico || "", hasReleaseTime: !!old?.hasReleaseTime, releaseHour: Number(old?.releaseHour ?? -1), releaseMinute: Number(old?.releaseMinute || 0) };
  } else if (state.section === "agua") {
    data = { amountMl: Number(values.amountMl), date: values.date ? new Date(values.date).getTime() : Date.now() };
    await writeItem("agua", id, data); $("#item-dialog").close(); return message(old ? "Registro de água atualizado." : "Água registrada e sincronizada.");
  } else {
    data = { ...old, name: values.name.trim(), days: [...form.querySelectorAll('[name="workoutDay"]:checked')].map((input)=>Number(input.value)), deadlineHour: Number(old?.deadlineHour ?? -1), deadlineMinute: Number(old?.deadlineMinute || 0), points: Number(values.points || 1), metaQuantidade: Number(values.metaQuantidade || 0), unidade: values.unidade.trim() };
  }
  await writeItem(node, id, data);
  $("#item-dialog").close(); message(old ? "Alterações salvas e sincronizadas." : "Salvo e sincronizado com o app.");
}

async function writeItem(node, id, data) {
  await set(ref(database, `users/${state.user.uid}/itens/${node}/${id}`), { ...data, updatedAt: Date.now(), deletado: false });
}

async function deleteItem(id) {
  if (state.section === "noticias") {
    if (!isAdmin()) return message("Somente a conta administradora pode excluir notícias.", true);
    if (!confirm("Excluir esta notícia para todos os usuários?")) return;
    await update(ref(database, `news/${id}`), { deleted: true, updatedAt: Date.now() });
    return message("Notícia excluída.");
  }
  const node = sections[state.section].node;
  if (!confirm("Excluir este item? A alteração será sincronizada com o app.")) return;
  await update(ref(database, `users/${state.user.uid}/itens/${node}/${id}`), { deletado: true, updatedAt: Date.now() });
  if (state.section === "cuidados") await updateCareDayStatus(id, "");
  $("#item-dialog").close(); message("Item excluído e sincronizado.");
}

async function updateCareDayStatus(careId, status) {
  const day = localDayKey(); const key = `${day}_${safeKey(careId)}`;
  await set(ref(database, `users/${state.user.uid}/itens/cuidados_dias/${key}`), { dayKey: day, careTaskId: careId, status, updatedAt: Date.now(), deletado: false });
}
async function updateExerciseDayStatus(exercise, checked) {
  const day = localDayKey(); const key = `${day}_${safeKey(exercise.name)}`;
  await set(ref(database, `users/${state.user.uid}/itens/exercicios_dias/${key}`), { dayKey: day, grupo: exercise.name, concluido: checked, updatedAt: Date.now(), deletado: false });
}

$("#login-button").addEventListener("click", async () => {
  $("#login-error").textContent = "";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (error) { $("#login-error").textContent = error.code?.includes("unauthorized-domain") ? "Adicione localhost aos domínios autorizados do Firebase." : "Não foi possível entrar. Verifique a configuração do Firebase e tente novamente."; console.error(error); }
});
$("#logout-button").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, (user) => {
  if (!user) { state.listeners.forEach((unsubscribe) => unsubscribe()); state.listeners = []; }
  state.user = user;
  $("#login").classList.toggle("hidden", !!user); $("#app").classList.toggle("hidden", !user);
  if (user) { updateAccount(user); attachLiveData(); render(); }
  else { state.data = { tarefas: {}, notas: {}, cuidados: {}, agua: {}, treinos_extras: {}, exercicios_dias: {}, cuidados_dias: {} }; }
});

$("#navigation").addEventListener("click", (event) => { const button = event.target.closest("[data-section]"); if (button) { state.section = button.dataset.section; state.filter = "todas"; render(); } });
$("#filters").addEventListener("click", (event) => { const button = event.target.closest("[data-filter]"); if (button) { state.filter = button.dataset.filter; render(); } });
$("#add-button").addEventListener("click", () => {
  if (state.section === "mais") return openBackupDialog();
  if (state.section === "inicio") { state.section = "tarefas"; render(); }
  openDialog();
});
$("#dialog-close").addEventListener("click", () => $("#item-dialog").close());
$("#cancel-button").addEventListener("click", () => $("#item-dialog").close());
$("#delete-button").addEventListener("click", () => {
  if (state.section === "mais") deleteBackupRecord(state.editIndex).catch(showError);
  else if (state.editId) deleteItem(state.editId).catch(showError);
});
$("#item-form").addEventListener("submit", (event) => { event.preventDefault(); (state.section === "mais" ? saveBackupRecord(event.currentTarget) : saveItem(event.currentTarget)).catch(showError); });
$("#refresh-button").addEventListener("click", () => { if (state.user) { attachLiveData(); message("Conferindo seus dados mais recentes."); } });
$("#import-backup-button").addEventListener("click", async () => {
  if (!state.user || !confirm("Importar do backup do app tarefas, água, cuidados e exercícios extras que ainda não estejam na nuvem? Itens com o mesmo identificador serão mantidos.")) return;
  try {
    const snapshot = await get(ref(database, `users/${state.user.uid}/backup`));
    const raw = snapshot.val();
    if (!raw) return message("Não encontramos um backup. Abra o app conectado à sua conta e tente novamente.");
    const backup = typeof raw === "string" ? JSON.parse(raw) : raw;
    const sources = [
      ["tarefas", backup?.pontua_local?.tasks],
      ["notas", backup?.notas_local?.entries],
      ["agua", backup?.agua_local?.entries],
      ["cuidados", backup?.cuidados_local?.entries],
      ["treinos_extras", backup?.exercicios_local?.extras]
    ];
    let count = 0;
    for (const [node, encoded] of sources) {
      let records = encoded;
      if (typeof records === "string") records = JSON.parse(records);
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        if (!record?.id || state.data[node]?.[record.id]) continue;
        await writeItem(node, record.id, record);
        count++;
      }
    }
    if (count) message(`${count} item(ns) importado(s) e sincronizado(s) com o app.`);
    else message("O backup não tem itens novos dessas áreas para importar.");
  } catch (error) { showError(error); }
});

$("#list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (state.section === "inicio") {
      const kind = button.closest("[data-kind]")?.dataset.kind;
      if (action === "edit" || action === "delete") {
        const target = kind === "treinos_extras" ? "exercicios" : kind;
        if (!target || target === "abc") return;
        state.section = target; render();
        if (action === "edit") return openDialog(id);
        return deleteItem(id);
      }
      if (action === "task-toggle") {
        const task = state.data.tarefas[id]; if (!task) return;
        const done = !task.done;
        await writeItem("tarefas", id, { ...task, done, completedAt: done ? Date.now() : 0 }); return;
      }
      if (action === "care-toggle") {
        const record = items("cuidados_dias").find((entry)=>entry.dayKey===localDayKey()&&entry.careTaskId===id);
        await updateCareDayStatus(id, record?.status==="feito"?"":"feito"); return;
      }
      if (action === "exercise-toggle") {
        const exercise = kind === "abc" ? { name: button.closest("[data-kind]").querySelector(".item-title").textContent } : state.data.treinos_extras[id];
        if (!exercise) return;
        const record = exerciseGroupsForToday().find((entry)=>entry.name===exercise.name);
        await updateExerciseDayStatus(exercise, !record?.completed); return;
      }
      return;
    }
    if (state.section === "noticias") {
      if (!isAdmin()) return;
      if (action === "edit") return openDialog(id);
      if (action === "delete") return deleteItem(id);
    }
    if (state.section === "mais") {
      if (action === "edit") return openBackupDialog(id);
      if (action === "delete") return deleteBackupRecord(id);
    }
    const node = sections[state.section].node; const item = state.data[node]?.[id]; if (!item) return;
    if (action === "edit") return openDialog(id);
    if (action === "delete") return deleteItem(id);
    if (action === "task-toggle") {
      const done = !item.done;
      await writeItem("tarefas", id, { ...item, done, completedAt: done ? Date.now() : 0, title: item.title || "", description: item.description || "", hasDeadline: !!item.hasDeadline, dueAt: Number(item.dueAt || 0), repeat: item.repeat || "NONE", priority: Number(item.priority || 0), mandatory: !!item.mandatory, penalized: !!item.penalized, repeatDays: item.repeatDays || [], tags: item.tags || "", linkedRecurringDebtId: item.linkedRecurringDebtId || "", linkedStudySubjectId: item.linkedStudySubjectId || "", lastPenaltyDay: item.lastPenaltyDay || "", createdAt: Number(item.createdAt || Date.now()), ofertaStatus: item.ofertaStatus || "", ofertaPontos: Number(item.ofertaPontos || 0), ofertaPrazoEm: Number(item.ofertaPrazoEm || 0), ultimaOfertaEm: Number(item.ultimaOfertaEm || 0) });
      return;
    }
    if (action === "care-toggle") { const record = items("cuidados_dias").find((entry) => entry.dayKey === localDayKey() && entry.careTaskId === id); await updateCareDayStatus(id, record?.status === "feito" ? "" : "feito"); return; }
    if (action === "exercise-toggle") { const done = items("exercicios_dias").some((entry) => entry.dayKey === localDayKey() && entry.grupo === item.name && entry.concluido); await updateExerciseDayStatus(item, !done); return; }
  } catch (error) { showError(error); }
});

$("#backup-categories").addEventListener("click", (event) => {
  const button = event.target.closest("[data-backup-category]");
  if (button) { state.backupCategory = button.dataset.backupCategory; state.editIndex = null; render(); }
});

$("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
setInterval(() => { if (state.user) render(); }, 60_000);
