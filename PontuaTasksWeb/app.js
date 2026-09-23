import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getDatabase, ref, get, onValue, onChildAdded, onChildChanged, set, update } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const $ = (selector) => document.querySelector(selector);
const state = { user: null, section: "tarefas", filter: "todas", data: { tarefas: {}, notas: {}, cuidados: {}, agua: {}, treinos_extras: {}, exercicios_dias: {}, cuidados_dias: {} }, backup: {}, backupCategory: "diary_local", listeners: [], editId: null, editIndex: null, toastTimer: null };
const sections = {
  tarefas: { title: "Suas tarefas", subtitle: "Organize o que importa e comemore cada avanço.", add: "Nova tarefa", node: "tarefas", empty: "Tudo começa com um primeiro passo", emptyCopy: "Adicione uma tarefa e ela aparecerá aqui e no aplicativo." },
  cuidados: { title: "Cuidados pessoais", subtitle: "Pequenos hábitos que ajudam você a se sentir bem.", add: "Novo cuidado", node: "cuidados", empty: "Um cuidado de cada vez", emptyCopy: "Adicione um cuidado pessoal para acompanhar sua rotina." },
  agua: { title: "Sua hidratação", subtitle: "Acompanhe a água que você bebe ao longo do dia.", add: "Registrar água", node: "agua", empty: "Ainda não há registros de hoje", emptyCopy: "Registre um copo de água para começar." },
  notas: { title: "Suas notas", subtitle: "Ideias e lembretes rápidos, sempre à mão.", add: "Nova nota", node: "notas", empty: "Guarde uma ideia por aqui", emptyCopy: "Suas notas ficam disponíveis no site e no app." },
  exercicios: { title: "Seus exercícios", subtitle: "Uma rotina simples, registrada junto com o app.", add: "Novo exercício", node: "treinos_extras", empty: "Monte sua rotina", emptyCopy: "Adicione um exercício para organizar seus treinos." },
  mais: { title: "Mais áreas do app", subtitle: "Seus outros dados salvos na mesma conta, com sincronização pelo backup do app.", add: "Novo registro", node: "", empty: "Nenhum registro nesta área", emptyCopy: "Seus dados aparecem aqui depois que o app salva o backup na nuvem." }
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
  $("#overview").classList.toggle("hidden", state.section !== "tarefas");
  $("#filters").classList.toggle("hidden", state.section !== "tarefas");
  $("#add-button").classList.toggle("hidden", state.section === "mais");
  $("#import-backup-button").classList.toggle("hidden", state.section !== "mais");
  $("#backup-categories").classList.toggle("hidden", state.section !== "mais");
  const filterHint = state.section === "mais" ? "Backup do app" : state.section === "tarefas" ? "Sincronizado com o app" : "Atualizado em tempo real";
  $("#section-helper").innerHTML = `<span class="live-dot"></span> ${filterHint}`;
  $("#filters").querySelectorAll(".filter-pill").forEach((button) => button.classList.toggle("selected", button.dataset.filter === state.filter));
  const taskList = items("tarefas");
  const open = taskList.filter((task) => !task.done).length;
  const done = taskList.length - open;
  const progress = taskList.length ? Math.round(done * 100 / taskList.length) : 0;
  $("#open-count").textContent = open; $("#done-count").textContent = done; $("#progress-count").innerHTML = `${progress}<span class="small-unit">%</span>`;
  $("#progress-bar").style.width = `${progress}%`; $("#nav-task-count").textContent = open || "";
  let rows = [];
  if (state.section === "tarefas") rows = renderTasks();
  if (state.section === "notas") rows = renderNotes();
  if (state.section === "cuidados") rows = renderCare();
  if (state.section === "agua") rows = renderWater();
  if (state.section === "exercicios") rows = renderExercises();
  if (state.section === "mais") rows = renderBackupSection();
  if (state.section === "mais") $("#add-button").classList.toggle("hidden", !backupCollection().records.length);
  $("#list").innerHTML = rows.join("");
  $("#empty-state").classList.toggle("hidden", rows.length > 0);
}

function row(id, title, subtitle, trailing = "", options = {}) {
  const checked = options.checked ? "checked" : "";
  const done = options.checked ? "is-done" : "";
  const check = options.toggle ? `<button class="check-control ${checked}" data-action="${options.toggle}" data-id="${escapeHtml(id)}" aria-label="Marcar como ${options.checked ? "pendente" : "concluído"}">${options.checked ? "✓" : ""}</button>` : "";
  const remove = options.delete ? `<button class="row-action" data-action="delete" data-id="${escapeHtml(id)}" aria-label="Excluir" title="Excluir">×</button>` : "";
  return `<article class="item-row ${done}" data-id="${escapeHtml(id)}">${check}<div class="item-copy"><div class="item-title">${escapeHtml(title)}</div><div class="item-subtitle">${escapeHtml(subtitle || " ")}</div></div>${trailing}<div class="row-actions">${options.edit ? `<button class="row-action" data-action="edit" data-id="${escapeHtml(id)}" aria-label="Editar" title="Editar">✎</button>` : ""}${remove}</div></article>`;
}

function renderTasks() {
  const all = items("tarefas").sort((a, b) => Number(a.done) - Number(b.done) || (a.dueAt || 0) - (b.dueAt || 0));
  return all.filter((task) => state.filter === "todas" || (state.filter === "abertas" ? !task.done : task.done)).map((task) => {
    const subtitle = [task.description, task.hasDeadline && task.dueAt ? `Prazo ${localDate(task.dueAt)}` : "Sem prazo", task.tags ? `# ${task.tags}` : ""].filter(Boolean).join(" · ");
    const level = Number(task.priority || 0);
    const priority = `<span class="priority-chip ${level >= 2 ? "high" : level === 1 ? "medium" : ""}">● ${priorityName(level)}</span>`;
    return row(task.id, task.title || "Tarefa", subtitle, priority, { toggle: "task-toggle", checked: !!task.done, edit: true, delete: true });
  });
}

function renderNotes() {
  return items("notas").sort((a,b)=>(b.date||0)-(a.date||0)).map((note) => row(note.id, (note.text || "Nota").split("\n")[0], `${note.tags ? `${note.tags} · ` : ""}${note.date ? localDate(note.date) : "Nota sincronizada"}`, "<span class=\"tag-chip\">Nota</span>", { edit: true, delete: true }));
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
    fields = textField("Sua nota", "text", existing?.text || "", "Escreva sua ideia aqui…") + field("Tags (opcional)", "tags", existing?.tags || "", "text", "ideias, estudo");
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
  const node = sections[state.section].node;
  const old = state.editId ? state.data[node][state.editId] : null;
  const id = state.editId || crypto.randomUUID();
  const values = Object.fromEntries(new FormData(form).entries());
  let data;
  if (state.section === "tarefas") {
    data = { ...old, title: values.title.trim(), description: values.description.trim(), dueAt: values.dueAt ? new Date(values.dueAt).getTime() : 0, hasDeadline: !!values.dueAt, repeat: values.repeat || "NONE", priority: Number(values.priority || 0), mandatory: form.elements.mandatory.checked, done: !!old?.done, penalized: !!old?.penalized, completedAt: Number(old?.completedAt || 0), repeatDays: values.repeat === "CUSTOM" ? (old?.repeatDays || []) : values.repeat === "WEEKLY" ? [...form.querySelectorAll('[name="repeatDay"]:checked')].map((input)=>Number(input.value)) : [], tags: values.tags.trim(), linkedRecurringDebtId: old?.linkedRecurringDebtId || "", lastPenaltyDay: old?.lastPenaltyDay || "", createdAt: Number(old?.createdAt || Date.now()), linkedStudySubjectId: old?.linkedStudySubjectId || "", ofertaStatus: old?.ofertaStatus || "", ofertaPontos: Number(old?.ofertaPontos || 0), ofertaPrazoEm: Number(old?.ofertaPrazoEm || 0), ultimaOfertaEm: Number(old?.ultimaOfertaEm || 0) };
  } else if (state.section === "notas") {
    if (!values.text.trim()) return message("Escreva alguma coisa na nota.");
    data = { ...old, text: values.text.trim(), tags: values.tags.trim(), date: Number(old?.date || Date.now()) };
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
$("#add-button").addEventListener("click", () => state.section === "mais" ? openBackupDialog() : openDialog());
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
