import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = 'https://rrptfgdshlrfongkfppv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VIbLFUuvaksiYulO8-CuCQ_zRY92zUp';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let currentUser = null;
let isSignup = false;

function setStatus(selector, message = '', type = '') {
  const el = $(selector); el.textContent = message; el.className = `status ${type}`.trim();
}
function showPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== page));
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (page === 'planes') loadPlans();
  if (page === 'horario') loadSchedule();
  if (page === 'perfil') loadProfile();
}
async function ensureProfile() {
  const { data, error } = await supabase.from('teacher_profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const name = currentUser.user_metadata?.full_name || '';
  const { data: created, error: insertError } = await supabase.from('teacher_profiles').insert({ id: currentUser.id, full_name: name }).select().single();
  if (insertError) throw insertError;
  return created;
}
async function openApp(user) {
  currentUser = user;
  $('#userEmail').textContent = user.email || '';
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  try { const profile = await ensureProfile(); if (profile.primary_grade) $('#planForm').elements.grade.value = profile.primary_grade; }
  catch (err) { setStatus('#planStatus', `No se pudo cargar el perfil: ${err.message}`, 'error'); }
}
$('#toggleAuth').addEventListener('click', () => {
  isSignup = !isSignup;
  $('#authTitle').textContent = isSignup ? 'Crear cuenta docente' : 'Ingresar';
  $('#authSubmit').textContent = isSignup ? 'Crear cuenta' : 'Ingresar';
  $('#toggleAuth').textContent = isSignup ? 'Ya tengo cuenta' : 'Crear cuenta';
  $('#nameWrap').classList.toggle('hidden', !isSignup);
  $('#authForm').elements.password.autocomplete = isSignup ? 'new-password' : 'current-password';
});
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault(); setStatus('#authStatus', 'Procesando…');
  const form = new FormData(event.currentTarget); const email = form.get('email'); const password = form.get('password');
  try {
    if (isSignup) {
      const name = form.get('name')?.trim() || '';
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) throw error;
      if (data.session) await openApp(data.user);
      else setStatus('#authStatus', 'Cuenta creada. Revisá tu correo para confirmar el registro y luego ingresá.', 'ok');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await openApp(data.user);
    }
  } catch (err) { setStatus('#authStatus', err.message || 'No se pudo completar el acceso.', 'error'); }
});
$('#logout').addEventListener('click', async () => { await supabase.auth.signOut(); currentUser = null; $('#app').classList.add('hidden'); $('#auth').classList.remove('hidden'); setStatus('#authStatus', 'Sesión cerrada.'); });
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));

function makePlanBody(data, teacher) {
  const total = Number(data.duration_minutes); const start = Math.max(5, Math.round(total * .2)); const development = Math.max(5, Math.round(total * .6)); const end = total - start - development;
  return `PLAN DIDÁCTICO DE CLASE · PRIMARIA REGULAR\n\nDocente: ${teacher.full_name || ''}\nCentro educativo: ${teacher.school_name || ''}\nAsignatura: ${data.subject} · Grado: ${data.grade} · Fecha: ${data.lesson_date} · Duración: ${total} minutos\nTema: ${data.topic}\nContenido: ${data.content}\nIndicador de logro: ${data.achievement_indicator}\nCriterios de evaluación: ${data.evaluation_criteria || 'Completar según el aprendizaje esperado.'}\n\nPRIMER MOMENTO · ACTIVIDADES DE INICIACIÓN (${start} min)\nActivar saberes previos sobre ${data.topic}. Conversar a partir de preguntas relacionadas con la experiencia del grupo.\nVerificación y realimentación: escuchar respuestas, reconocer ideas previas y aclarar dudas iniciales.\n\nSEGUNDO MOMENTO · ACTIVIDADES DE DESARROLLO (${development} min)\nExplorar ${data.content} con ejemplos concretos adecuados a ${data.grade}. Modelar un ejemplo y proponer una práctica guiada, seguida de trabajo individual o en parejas.\nVerificación y realimentación: observar procedimientos y participación; hacer preguntas de seguimiento y brindar apoyo oportuno.\n\nTERCER MOMENTO · ACTIVIDADES DE CULMINACIÓN (${end} min)\nCompartir respuestas, realizar una breve aplicación y resumir lo aprendido.\nVerificación y realimentación: recoger evidencias vinculadas al indicador y a los criterios; reconocer avances y orientar próximos pasos.\n\nRecursos: ${data.resources || 'Pizarra, cuaderno y lápiz.'}\n\nBorrador editable: adecuar las actividades al programa de estudio y a las características del grupo.`;
}
$('#planForm').addEventListener('submit', async (event) => {
  event.preventDefault(); setStatus('#planStatus', 'Guardando plan…');
  const form = new FormData(event.currentTarget); const data = Object.fromEntries(form.entries());
  data.duration_minutes = Number(data.duration_minutes);
  try {
    const teacher = await ensureProfile();
    const plan_body = { text: makePlanBody(data, teacher) };
    const { data: saved, error } = await supabase.from('lesson_plans').insert({ ...data, plan_body }).select().single();
    if (error) throw error;
    setStatus('#planStatus', 'Plan guardado en tu cuenta.', 'ok'); showPlan(saved);
  } catch (err) { setStatus('#planStatus', err.message || 'No se pudo guardar el plan.', 'error'); }
});
function showPlan(plan) {
  const text = plan.plan_body?.text || 'Este plan no tiene contenido guardado.';
  $('#planPreview').innerHTML = `<div class="card"><div class="row noprint"><button onclick="window.print()">Imprimir / Guardar PDF</button><button id="closePreview">Cerrar</button></div><div class="plan">${escapeHtml(text)}</div></div>`;
  $('#closePreview').addEventListener('click', () => { $('#planPreview').innerHTML = ''; });
}
async function loadPlans() {
  $('#plansList').innerHTML = '<p class="muted">Cargando planes…</p>';
  const { data, error } = await supabase.from('lesson_plans').select('id,subject,grade,topic,lesson_date,plan_body').order('lesson_date', { ascending: false });
  if (error) { $('#plansList').textContent = error.message; return; }
  $('#plansList').innerHTML = data.length ? data.map(plan => `<div class="item"><div class="row"><span class="pill">${escapeHtml(plan.lesson_date)}</span><b>${escapeHtml(plan.subject)} · ${escapeHtml(plan.grade)}</b></div><p>${escapeHtml(plan.topic)}</p><div class="row"><button data-open="${plan.id}">Abrir / imprimir</button><button data-delete="${plan.id}">Eliminar</button></div></div>`).join('') : '<p class="muted">Todavía no guardaste planes.</p>';
  data.forEach(plan => $(`[data-open="${plan.id}"]`).addEventListener('click', () => { showPlan(plan); showPage('crear'); }));
  document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => { if (!confirm('¿Eliminar este plan?')) return; const { error: deleteError } = await supabase.from('lesson_plans').delete().eq('id', button.dataset.delete); if (deleteError) alert(deleteError.message); else loadPlans(); }));
}
const weekdays = {1:'Lunes',2:'Martes',3:'Miércoles',4:'Jueves',5:'Viernes'};
$('#scheduleForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const data = Object.fromEntries(form.entries()); data.weekday = Number(data.weekday); data.duration_minutes = Number(data.duration_minutes); data.start_time = data.start_time || null;
  const { error } = await supabase.from('class_schedules').insert(data);
  if (error) { alert(error.message); return; } event.currentTarget.reset(); event.currentTarget.elements.duration_minutes.value = 45; loadSchedule();
});
async function loadSchedule() {
  $('#scheduleList').innerHTML = '<p class="muted">Cargando horario…</p>';
  const { data, error } = await supabase.from('class_schedules').select('*').order('weekday').order('start_time');
  if (error) { $('#scheduleList').textContent = error.message; return; }
  $('#scheduleList').innerHTML = data.length ? data.map(item => `<div class="item"><div class="row"><b>${weekdays[item.weekday] || ''} · ${(item.start_time || '').slice(0,5)}</b><span>${escapeHtml(item.subject)} · ${escapeHtml(item.grade)}${item.section ? ' · '+escapeHtml(item.section) : ''}</span><span class="muted">${item.duration_minutes} min</span><button data-schedule-delete="${item.id}">Quitar</button></div></div>`).join('') : '<p class="muted">Agregá las clases semanales para tener tu horario aquí.</p>';
  document.querySelectorAll('[data-schedule-delete]').forEach(button => button.addEventListener('click', async () => { const { error: deleteError } = await supabase.from('class_schedules').delete().eq('id', button.dataset.scheduleDelete); if (deleteError) alert(deleteError.message); else loadSchedule(); }));
}
$('#profileForm').addEventListener('submit', async (event) => {
  event.preventDefault(); setStatus('#profileStatus', 'Guardando perfil…'); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const { error } = await supabase.from('teacher_profiles').upsert({ id: currentUser.id, ...data, updated_at: new Date().toISOString() });
  if (error) setStatus('#profileStatus', error.message, 'error'); else { if (data.primary_grade) $('#planForm').elements.grade.value = data.primary_grade; setStatus('#profileStatus', 'Perfil guardado.', 'ok'); }
});
async function loadProfile() {
  const { data, error } = await supabase.from('teacher_profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (error) { setStatus('#profileStatus', error.message, 'error'); return; }
  if (data) for (const [key, value] of Object.entries(data)) if ($('#profileForm').elements[key]) $('#profileForm').elements[key].value = value || '';
}
const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await openApp(session.user);
supabase.auth.onAuthStateChange((_event, session) => { if (session?.user && $('#app').classList.contains('hidden')) openApp(session.user); });
