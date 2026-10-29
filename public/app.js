import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = 'https://rrptfgdshlrfongkfppv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VIbLFUuvaksiYulO8-CuCQ_zRY92zUp';
const PRODUCTION_APP_URL = 'https://syllabo.beinfinia.com/';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const weekdays = { 1:'Lunes', 2:'Martes', 3:'Miércoles', 4:'Jueves', 5:'Viernes' };
function authRedirectTo() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return PRODUCTION_APP_URL;
  return `${window.location.origin}/`;
}
let currentUser = null;
let isSignup = false;
let currentPlanId = null;
let generatedPlanText = '';
let generatedPlanData = null;
let allPlans = [];
let pendingSignupEmail = '';

function setStatus(selector, message = '', type = '') {
  const el = $(selector); if (!el) return;
  el.textContent = message; el.className = `status ${type}`.trim();
}
function localISODate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function prettyDate(value) {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-NI', { day:'numeric', month:'long', year:'numeric' });
}
function showPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== page));
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (page === 'planes') loadPlans();
  if (page === 'horario') loadSchedule();
  if (page === 'perfil') loadProfile();
  if (page === 'inicio') loadHome();
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.goto)));

async function ensureProfile() {
  const { data, error } = await supabase.from('teacher_profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const metadata = currentUser.user_metadata || {};
  const firstName = metadata.first_name || '';
  const lastName = metadata.last_name || '';
  const { data: created, error: insertError } = await supabase.from('teacher_profiles').insert({
    id: currentUser.id, first_name: firstName, last_name: lastName,
    full_name: [firstName, lastName].filter(Boolean).join(' ')
  }).select().single();
  if (insertError) throw insertError;
  return created;
}
async function openApp(user) {
  currentUser = user;
  $('#userEmail').textContent = user.email || '';
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  try {
    const profile = await ensureProfile();
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'docente';
    $('#welcomeTitle').textContent = `¡Hola, ${fullName}!`;
    if (profile.primary_grade && !$('#planForm').elements.grade.value) $('#planForm').elements.grade.value = profile.primary_grade;
    for (const field of ['first_name','last_name','school_name','municipality','primary_grade']) {
      if (profile[field]) $('#profileForm').elements[field].value = profile[field];
    }
    await loadHome();
  } catch (err) {
    setStatus('#planStatus', `No se pudo cargar tu perfil: ${friendlyError(err)}`, 'error');
  }
}
function friendlyError(error) {
  const message = error?.message || 'Ocurrió un problema inesperado.';
  if (/fetch|network/i.test(message)) return 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.';
  if (/row-level security|permission denied/i.test(message)) return 'Tu sesión no tiene permiso para esta acción. Cerrá sesión y volvé a ingresar.';
  return message;
}

function setAuthMode(signup) {
  isSignup = signup;
  $('#authTitle').textContent = isSignup ? 'Crear cuenta docente' : 'Ingresar';
  $('#authSubmit').textContent = isSignup ? 'Crear cuenta' : 'Ingresar';
  $('#toggleAuth').textContent = isSignup ? 'Ya tengo cuenta' : 'Crear cuenta';
  $('#nameWrap').classList.toggle('hidden', !isSignup);
  $('#authForm').elements.first_name.required = isSignup;
  $('#authForm').elements.last_name.required = isSignup;
  $('#authForm').elements.password.autocomplete = isSignup ? 'new-password' : 'current-password';
  const emailEntered = Boolean($('#authForm').elements.email.value.trim());
  $('#resendVerification').classList.toggle('hidden', !pendingSignupEmail && (isSignup || !emailEntered));
  try { sessionStorage.setItem('syllabo_auth_mode', isSignup ? 'signup' : 'login'); } catch {}
}
let savedAuthMode = 'login';
try { savedAuthMode = sessionStorage.getItem('syllabo_auth_mode') || 'login'; } catch {}
setAuthMode(savedAuthMode === 'signup');
$('#toggleAuth').addEventListener('click', () => { setStatus('#authStatus'); setAuthMode(!isSignup); });
document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById(button.dataset.passwordToggle);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Ocultar' : 'Mostrar';
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
}));
$('#authForm').elements.email.addEventListener('input', () => {
  const showResend = Boolean(pendingSignupEmail || (!isSignup && $('#authForm').elements.email.value.trim()));
  $('#resendVerification').classList.toggle('hidden', !showResend);
});
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('#authStatus', isSignup ? 'Creando tu cuenta…' : 'Ingresando…');
  const form = new FormData(event.currentTarget); const email = String(form.get('email') || '').trim(); const password = String(form.get('password') || '');
  try {
    if (isSignup) {
      const first_name = String(form.get('first_name') || '').trim();
      const last_name = String(form.get('last_name') || '').trim();
      const full_name = [first_name, last_name].filter(Boolean).join(' ');
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, full_name }, emailRedirectTo: authRedirectTo() } });
      if (error) throw error;
      if (data.session && data.user) await openApp(data.user);
      else {
        pendingSignupEmail = email;
        $('#resendVerification').classList.remove('hidden');
        setStatus('#authStatus', 'Cuenta creada. Revisá tu correo y confirmá el registro antes de ingresar.', 'ok');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      recoveringPassword = false;
      setAuthMode(false); if (data.user) await openApp(data.user);
    }
  } catch (err) { setStatus('#authStatus', friendlyError(err), 'error'); }
});
$('#resendVerification').addEventListener('click', async () => {
  const email = pendingSignupEmail || $('#authForm').elements.email.value.trim();
  if (!email) { setStatus('#authStatus','Escribí tu correo para reenviar la verificación.','error'); return; }
  setStatus('#authStatus','Enviando nuevo enlace…');
  const { error } = await supabase.auth.resend({ type:'signup', email, options:{ emailRedirectTo:authRedirectTo() } });
  if (error) setStatus('#authStatus',friendlyError(error),'error');
  else setStatus('#authStatus','Listo. Revisá tu correo y abrí el enlace nuevo de Syllabo.','ok');
});
$('#forgotPassword').addEventListener('click', async () => {
  const email = $('#authForm').elements.email.value.trim();
  if (!email) { setStatus('#authStatus', 'Escribí tu correo para enviarte el enlace de recuperación.', 'error'); $('#authForm').elements.email.focus(); return; }
  setStatus('#authStatus', 'Enviando enlace…');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() });
  if (error) setStatus('#authStatus', friendlyError(error), 'error');
  else setStatus('#authStatus', 'Si el correo está registrado, recibirás un enlace para cambiar tu contraseña.', 'ok');
});
$('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault(); const password = new FormData(event.currentTarget).get('password');
  if (String(password).length < 8) { setStatus('#authStatus','La contraseña debe tener al menos 8 caracteres.','error'); return; }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) setStatus('#authStatus',friendlyError(error),'error');
  else { $('#recoveryForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); setAuthMode(false); setStatus('#authStatus','Contraseña actualizada. Ya podés ingresar.','ok'); }
});
$('#logout').addEventListener('click', async () => {
  await supabase.auth.signOut(); currentUser = null; setAuthMode(false); $('#app').classList.add('hidden'); $('#auth').classList.remove('hidden'); setStatus('#authStatus', 'Sesión cerrada.');
});

function splitActivities(plan) {
  return Array.isArray(plan.activities) ? plan.activities : [];
}
function plainPlanText(plan) {
  const lines = [
    `PLAN DE CLASE · ${plan.title || plan.topic}`,
    `Docente: ${plan.teacher || ''}`,
    `Centro educativo: ${plan.school || ''}`,
    `Asignatura: ${plan.subject} · Grado: ${plan.grade} · Fecha: ${prettyDate(plan.lesson_date)} · Duración: ${plan.duration_minutes} minutos`,
    `Tema: ${plan.topic}`,
    `Contenido: ${plan.content}`,
    `Indicador de logro: ${plan.achievement_indicator}`,
    `Criterios de evaluación: ${plan.evaluation_criteria || 'Observar la participación, el procedimiento y el aprendizaje demostrado.'}`,
    '', 'PROPÓSITO DE APRENDIZAJE', plan.objective || `Desarrollar el contenido «${plan.content}» para avanzar hacia el indicador de logro.`, '',
    'SECUENCIA DIDÁCTICA'
  ];
  for (const activity of splitActivities(plan)) lines.push('', `${activity.moment || ''} (${activity.minutes || 0} min)`, activity.activity || '', activity.examples ? `Ejemplo: ${activity.examples}` : '', activity.assessment ? `Verificación y realimentación: ${activity.assessment}` : '');
  lines.push('', 'EVALUACIÓN Y EVIDENCIAS', plan.evidence || 'Recoger las producciones y respuestas del grupo, y contrastarlas con los criterios definidos.', '', 'ATENCIÓN A LA DIVERSIDAD', plan.differentiation || 'Ofrecer apoyo visual, modelar los pasos y permitir explicar las respuestas oralmente o por escrito.', '', `RECURSOS: ${plan.resources || 'Pizarra, cuaderno y lápiz.'}`);
  if (plan.homework) lines.push('', 'ACTIVIDAD DE APLICACIÓN', plan.homework);
  lines.push('', 'Borrador para revisión docente. Adecuar al programa de estudio y a las características del grupo.');
  return lines.join('\n');
}
function localDraft(data, teacher) {
  const total = Number(data.duration_minutes);
  const opener = Math.max(2, Math.round(total * .2));
  const close = Math.max(2, Math.round(total * .2));
  const develop = total - opener - close;
  const subject = data.subject.toLowerCase();
  let example = 'Usar una situación cercana a la vida del grupo relacionada con el tema y pedir que expliquen lo que observan.';
  let activity = 'En equipos, leer el contenido, seleccionar las ideas principales y organizarlas en una hoja. Cada equipo comparte una conclusión.';
  if (/matem|aritm|geometr/.test(subject)) {
    example = `Modelar en la pizarra un ejercicio breve sobre ${data.topic}; explicar en voz alta los pasos y resolver un ejemplo con participación del grupo.`;
    activity = `Resolver un ejercicio guiado sobre ${data.content}. Después, cada pareja crea o resuelve un ejemplo propio y explica cómo llegó a la respuesta.`;
  } else if (/lengua|literatura|espa|comunic/.test(subject)) {
    example = `Leer una oración o fragmento corto relacionado con ${data.topic}; identificar oralmente una idea o elemento clave del contenido.`;
    activity = `Leer el fragmento o consigna, localizar ejemplos de ${data.content} y compartir una respuesta con evidencia del texto. Luego escribir una breve producción propia.`;
  } else if (/cienc|naturaleza|biolog|qu[ií]mica/.test(subject)) {
    example = `Observar un objeto o imagen del entorno y describir sus características antes de relacionarlo con ${data.topic}.`;
    activity = `En equipos, observar los materiales disponibles, registrarlos en una tabla y explicar cómo se relacionan con ${data.content}. Si no hay materiales, usar dibujos o tarjetas.`;
  } else if (/social|historia|geograf|c[ií]vica/.test(subject)) {
    example = `Ubicar ${data.topic} en una línea del tiempo, mapa o situación cotidiana, y hacer una pregunta que conecte con el contenido.`;
    activity = `Analizar una imagen, texto breve o caso sobre ${data.content}; identificar hechos o ideas principales y organizarlos en una línea del tiempo, mapa conceptual o cuadro.`;
  }
  const plan = {
    title: data.topic, teacher: [teacher.first_name, teacher.last_name].filter(Boolean).join(' '), school: teacher.school_name,
    subject: data.subject, grade: data.grade, lesson_date: data.lesson_date, duration_minutes: total, topic: data.topic,
    content: data.content, achievement_indicator: data.achievement_indicator, evaluation_criteria: data.evaluation_criteria,
    resources: data.resources || 'Pizarra, cuaderno, lápiz y material visual disponible.',
    objective: `Que las y los estudiantes comprendan y trabajen ${data.content}, demostrando avances hacia este indicador: ${data.achievement_indicator}`,
    activities: [
      { moment:'Primer momento · Iniciación', minutes:opener, activity:`Dar la bienvenida y presentar el tema «${data.topic}». Activar saberes previos con preguntas: ¿qué sabemos?, ¿dónde lo hemos visto?, ¿qué queremos descubrir? Registrar algunas ideas y acordar el propósito de la clase.`, examples, assessment:'Escuchar las respuestas iniciales, valorar ideas previas y aclarar vocabulario que se necesite.' },
      { moment:'Segundo momento · Desarrollo', minutes:develop, activity:`Presentar brevemente el contenido «${data.content}» usando ejemplos y apoyos visuales. Modelar cómo se resuelve o comprende una situación vinculada con el indicador. ${activity}`, examples, assessment:`Observar el trabajo individual y en parejas. Hacer preguntas de seguimiento y brindar una pista o ejemplo adicional a quienes lo necesiten. Criterios a observar: ${data.evaluation_criteria || 'comprende el contenido, participa y explica sus respuestas.'}` },
      { moment:'Tercer momento · Culminación', minutes:close, activity:`Invitar a algunos estudiantes a compartir su respuesta o producción. Cerrar con una síntesis colectiva: cada estudiante completa oralmente o por escrito «Hoy aprendí…» y «Todavía quiero practicar…».`, examples:'Aplicar una pregunta o ejercicio corto directamente relacionado con el indicador de logro.', assessment:`Recoger una respuesta breve de cada estudiante y verificarla con el indicador: ${data.achievement_indicator}` }
    ],
    evidence:`Producción o respuesta individual relacionada con «${data.content}», explicación oral del procedimiento y participación en la actividad. Revisar con estos criterios: ${data.evaluation_criteria || 'comprensión, participación y explicación de la respuesta.'}`,
    differentiation:'Presentar instrucciones cortas en pasos; mostrar un ejemplo resuelto; apoyar con imágenes u objetos; permitir trabajar con una pareja de apoyo; ofrecer una consigna de ampliación a quien termine antes.',
    homework:''
  };
  plan.text = plainPlanText(plan);
  return plan;
}
function getPlanFormData() {
  const data = Object.fromEntries(new FormData($('#planForm')).entries());
  data.duration_minutes = Number(data.duration_minutes);
  return data;
}
function formHasRequiredData(data) {
  for (const key of ['subject','grade','topic','lesson_date','content','achievement_indicator']) {
    if (!String(data[key] || '').trim()) { $('#planForm').elements[key].focus(); return false; }
  }
  if (data.duration_minutes < 10 || data.duration_minutes > 600) { $('#planForm').elements.duration_minutes.focus(); return false; }
  return true;
}
$('#planForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = getPlanFormData();
  if (!formHasRequiredData(data)) { setStatus('#planStatus', 'Completá los campos requeridos para preparar el plan.', 'error'); return; }
  const button = $('#generatePlan'); button.disabled = true;
  $('#aiState').innerHTML = '<span class="progress"><span></span></span> Preparando el borrador en este dispositivo…';
  setStatus('#planStatus', 'Armando la secuencia de clase…');
  try {
    const teacher = await ensureProfile();
    const result = { plan:localDraft(data, teacher), source:'guided' };
    generatedPlanText = result.plan.text;
    generatedPlanData = result.plan;
    renderPlanPreview(result.plan, result.source);
    $('#aiState').textContent = 'Borrador guiado en este dispositivo. El contenido no se envió a un servicio externo.';
    setStatus('#planStatus', 'Tu borrador está listo. Revisá las actividades antes de guardarlo.', 'ok');
    currentPlanId = null;
  } catch (err) { setStatus('#planStatus', friendlyError(err), 'error'); $('#aiState').textContent = 'No se pudo generar la propuesta.'; }
  finally { button.disabled = false; }
});
function renderPlanPreview(plan, source = 'guided') {
  const text = plan.text || plainPlanText(plan);
  generatedPlanText = text;
  const badge = source === 'ai' ? '<span class="pill green">Propuesta con IA</span>' : '<span class="pill blue-pill">Borrador guiado</span>';
  $('#planPreview').innerHTML = `<div class="plan-paper"><pre id="printBody" class="print-body"></pre><div class="plan-heading"><div class="brand" style="justify-content:center;font-size:17px"><img class="mark" src="./logo.svg" alt="">Syllabo</div><p class="eyebrow" style="margin:8px 0 3px">Planificación didáctica</p><h2>${escapeHtml(plan.topic || plan.title || 'Plan de clase')}</h2>${badge}</div><div class="plan-meta"><div><b>Docente:</b> ${escapeHtml(plan.teacher || '')}</div><div><b>Centro:</b> ${escapeHtml(plan.school || '—')}</div><div><b>Asignatura:</b> ${escapeHtml(plan.subject || '')}</div><div><b>Grado:</b> ${escapeHtml(plan.grade || '')}</div><div><b>Fecha:</b> ${escapeHtml(prettyDate(plan.lesson_date) || '')}</div><div><b>Duración:</b> ${escapeHtml(plan.duration_minutes || '')} minutos</div></div><div class="plan-block"><h3>Contenido e indicador</h3><p><b>Contenido:</b> ${escapeHtml(plan.content || '')}</p><p><b>Indicador de logro:</b> ${escapeHtml(plan.achievement_indicator || '')}</p><p><b>Criterios de evaluación:</b> ${escapeHtml(plan.evaluation_criteria || 'Observar la participación, el procedimiento y el aprendizaje demostrado.')}</p><p><b>Propósito:</b> ${escapeHtml(plan.objective || '')}</p></div><div class="plan-block"><h3>Secuencia didáctica</h3>${splitActivities(plan).map(item=>`<div class="activity"><strong>${escapeHtml(item.moment || 'Actividad')} · ${escapeHtml(item.minutes || 0)} min</strong><p>${escapeHtml(item.activity || '')}</p>${item.examples?`<p><b>Ejemplo:</b> ${escapeHtml(item.examples)}</p>`:''}${item.assessment?`<p><b>Verificación y realimentación:</b> ${escapeHtml(item.assessment)}</p>`:''}</div>`).join('')}</div><div class="plan-block"><h3>Evaluación y atención a la diversidad</h3><p><b>Evidencias:</b> ${escapeHtml(plan.evidence || '')}</p><p><b>Apoyos y ajustes:</b> ${escapeHtml(plan.differentiation || '')}</p><p><b>Recursos:</b> ${escapeHtml(plan.resources || '')}</p>${plan.homework?`<p><b>Actividad de aplicación:</b> ${escapeHtml(plan.homework)}</p>`:''}</div><div class="plan-block"><h3>Editar el plan</h3><textarea id="planEditor" aria-label="Editar plan de clase">${escapeHtml(text)}</textarea><p class="muted">Podés editar este borrador antes de guardarlo o imprimirlo.</p></div><div class="row noprint"><button id="savePlan" class="primary">${currentPlanId?'Guardar cambios':'Guardar en mis planes'}</button><button id="printPlan" class="soft-btn">Imprimir / Guardar PDF</button><button id="discardPlan" class="text-btn">Cerrar</button></div><div id="saveStatus" class="status" aria-live="polite"></div></div>`;
  $('#planEditor').addEventListener('input', event => { generatedPlanText = event.target.value; });
  $('#savePlan').addEventListener('click', saveCurrentPlan);
  $('#printPlan').addEventListener('click', () => { generatedPlanText = $('#planEditor').value; $('#printBody').textContent = generatedPlanText; window.print(); });
  $('#discardPlan').addEventListener('click', () => { $('#planPreview').innerHTML = ''; currentPlanId = null; generatedPlanText = ''; generatedPlanData = null; });
}
async function saveCurrentPlan() {
  const data = getPlanFormData();
  const editor = $('#planEditor');
  if (editor) generatedPlanText = editor.value;
  const row = { ...data, plan_body:{ text:generatedPlanText, plan:generatedPlanData, source:$('#aiState').textContent.startsWith('Borrador guiado') ? 'guided' : 'ai' }, updated_at:new Date().toISOString() };
  setStatus('#saveStatus', 'Guardando…'); $('#savePlan').disabled = true;
  let query = supabase.from('lesson_plans');
  if (currentPlanId) query = query.update(row).eq('id', currentPlanId);
  else query = query.insert(row);
  const { data:saved, error } = await query.select().single();
  $('#savePlan').disabled = false;
  if (error) { setStatus('#saveStatus', friendlyError(error), 'error'); return; }
  currentPlanId = saved.id; setStatus('#saveStatus', 'Plan guardado en tu cuenta.', 'ok'); $('#savePlan').textContent = 'Guardar cambios';
  await loadHome();
}
$('#newPlan').addEventListener('click', () => {
  const grade = $('#profileForm').elements.primary_grade.value || '';
  $('#planForm').reset(); $('#planForm').elements.lesson_date.value = localISODate(); $('#planForm').elements.duration_minutes.value = 45; $('#planForm').elements.grade.value = grade;
  $('#planPreview').innerHTML = ''; $('#aiState').textContent = 'Se prepara un borrador editable.'; setStatus('#planStatus'); currentPlanId = null; generatedPlanText = ''; generatedPlanData = null;
});

async function loadPlans() {
  $('#plansList').innerHTML = '<div class="empty">Cargando tus planes…</div>';
  const { data, error } = await supabase.from('lesson_plans').select('id,subject,grade,topic,lesson_date,content,achievement_indicator,evaluation_criteria,duration_minutes,resources,plan_body,created_at').order('lesson_date', { ascending:false }).order('created_at', { ascending:false });
  if (error) { $('#plansList').innerHTML = `<div class="empty">${escapeHtml(friendlyError(error))}</div>`; return; }
  allPlans = data || []; populatePlanMonths(allPlans); renderPlanList();
}
function populatePlanMonths(plans) {
  const select = $('#planMonth'); const selected = select.value;
  const months = [...new Set(plans.map(p => p.lesson_date?.slice(0,7)).filter(Boolean))];
  select.innerHTML = '<option value="">Todas las fechas</option>' + months.map(month => `<option value="${month}">${escapeHtml(new Date(`${month}-15T12:00:00`).toLocaleDateString('es-NI',{month:'long',year:'numeric'}))}</option>`).join('');
  if (months.includes(selected)) select.value = selected;
}
function renderPlanList() {
  const search = $('#planSearch').value.trim().toLocaleLowerCase(); const month = $('#planMonth').value;
  const plans = allPlans.filter(p => (!month || p.lesson_date.startsWith(month)) && (!search || `${p.subject} ${p.grade} ${p.topic}`.toLocaleLowerCase().includes(search)));
  if (!plans.length) { $('#plansList').innerHTML = '<div class="empty">No encontramos planes con esos filtros. Creá tu primer plan para empezar.</div>'; return; }
  $('#plansList').innerHTML = plans.map(plan => `<article class="item"><div class="section-title"><div><div class="row"><span class="pill">${escapeHtml(prettyDate(plan.lesson_date))}</span><span class="pill green">${escapeHtml(plan.duration_minutes)} min</span></div><p class="item-title" style="margin-top:9px">${escapeHtml(plan.subject)} · ${escapeHtml(plan.grade)}</p><p>${escapeHtml(plan.topic)}</p></div><div class="row noprint"><button class="soft-btn" data-open-plan="${plan.id}">Abrir / editar</button><button class="danger-btn" data-delete-plan="${plan.id}">Eliminar</button></div></div></article>`).join('');
  plans.forEach(plan => $(`[data-open-plan="${plan.id}"]`).addEventListener('click', () => openSavedPlan(plan)));
  plans.forEach(plan => $(`[data-delete-plan="${plan.id}"]`).addEventListener('click', () => deletePlan(plan)));
}
$('#planSearch').addEventListener('input', renderPlanList); $('#planMonth').addEventListener('change', renderPlanList);
async function openSavedPlan(plan) {
  currentPlanId = plan.id;
  const form = $('#planForm');
  for (const key of ['subject','grade','topic','lesson_date','content','achievement_indicator','evaluation_criteria','duration_minutes','resources']) form.elements[key].value = plan[key] ?? '';
  const profile = await ensureProfile();
  const body = plan.plan_body || {};
  const draft = body.plan || null;
  const text = body.text || (draft ? plainPlanText(draft) : '');
  if (draft) { draft.text = text; generatedPlanData = draft; renderPlanPreview(draft, body.source || 'guided'); }
  else {
    const fallback = localDraft({ ...plan, text }, profile); fallback.text = text || fallback.text; generatedPlanData = fallback;
    renderPlanPreview(fallback, body.source || 'guided');
  }
  if ($('#planEditor')) $('#planEditor').value = text || $('#planEditor').value;
  showPage('crear'); window.scrollTo({ top:0, behavior:'smooth' });
}
async function deletePlan(plan) {
  if (!confirm(`¿Eliminar el plan «${plan.topic}»? Esta acción no se puede deshacer.`)) return;
  const { error } = await supabase.from('lesson_plans').delete().eq('id', plan.id);
  if (error) alert(friendlyError(error)); else { await loadPlans(); await loadHome(); }
}

$('#scheduleForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const data = Object.fromEntries(form.entries());
  data.weekday = Number(data.weekday); data.duration_minutes = Number(data.duration_minutes); data.start_time = data.start_time || null;
  const button = event.currentTarget.querySelector('button[type="submit"]') || event.currentTarget.querySelector('button'); button.disabled = true;
  const { error } = await supabase.from('class_schedules').insert(data); button.disabled = false;
  if (error) { setStatus('#scheduleStatus', friendlyError(error), 'error'); return; }
  event.currentTarget.reset(); event.currentTarget.elements.duration_minutes.value = 45; setStatus('#scheduleStatus', 'Clase agregada al horario.', 'ok'); await loadSchedule(); await loadHome();
});
async function loadSchedule() {
  $('#scheduleList').innerHTML = '<div class="empty">Cargando horario…</div>';
  const { data, error } = await supabase.from('class_schedules').select('*').order('weekday').order('start_time');
  if (error) { $('#scheduleList').innerHTML = `<div class="empty">${escapeHtml(friendlyError(error))}</div>`; return; }
  if (!data?.length) { $('#scheduleList').innerHTML = '<div class="empty">Todavía no cargaste clases. Agregá los bloques de tu semana arriba.</div>'; return; }
  $('#scheduleList').innerHTML = data.map(item => `<article class="item"><div class="row"><span class="pill">${weekdays[item.weekday] || ''}</span><b>${escapeHtml((item.start_time || '').slice(0,5))}</b><span>${escapeHtml(item.subject)} · ${escapeHtml(item.grade)}${item.section ? ` · Sección ${escapeHtml(item.section)}` : ''}</span><span class="muted">${escapeHtml(item.duration_minutes)} min</span><button class="danger-btn" data-remove-schedule="${item.id}">Quitar</button></div></article>`).join('');
  data.forEach(item => $(`[data-remove-schedule="${item.id}"]`).addEventListener('click', async () => {
    if (!confirm(`¿Quitar ${item.subject} del horario?`)) return;
    const { error:deleteError } = await supabase.from('class_schedules').delete().eq('id', item.id);
    if (deleteError) setStatus('#scheduleStatus', friendlyError(deleteError), 'error'); else { setStatus('#scheduleStatus', 'Clase eliminada del horario.', 'ok'); await loadSchedule(); await loadHome(); }
  }));
}

$('#profileForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('#profileStatus','Guardando perfil…');
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  data.first_name = data.first_name.trim(); data.last_name = data.last_name.trim(); data.full_name = [data.first_name,data.last_name].filter(Boolean).join(' '); data.updated_at = new Date().toISOString();
  const { error } = await supabase.from('teacher_profiles').upsert({ id:currentUser.id, ...data });
  if (error) setStatus('#profileStatus', friendlyError(error), 'error');
  else { if (data.primary_grade) $('#planForm').elements.grade.value = data.primary_grade; $('#welcomeTitle').textContent = `¡Hola, ${data.first_name}!`; setStatus('#profileStatus','Perfil guardado.','ok'); }
});
async function loadProfile() {
  const { data,error } = await supabase.from('teacher_profiles').select('*').eq('id',currentUser.id).maybeSingle();
  if (error) { setStatus('#profileStatus',friendlyError(error),'error'); return; }
  if (data) for (const [key,value] of Object.entries(data)) if ($('#profileForm').elements[key]) $('#profileForm').elements[key].value = value || '';
}

async function loadHome() {
  const [{ data:plans,error:plansError },{ data:schedule,error:scheduleError }] = await Promise.all([
    supabase.from('lesson_plans').select('id,subject,grade,topic,lesson_date').order('lesson_date',{ascending:true}),
    supabase.from('class_schedules').select('id,weekday,start_time,subject,grade,section,duration_minutes').order('weekday').order('start_time')
  ]);
  if (plansError || scheduleError) {
    $('#homeSchedule').innerHTML = `<div class="empty">${escapeHtml(friendlyError(plansError || scheduleError))}</div>`; return;
  }
  const currentMonth = localISODate().slice(0,7);
  $('#statPlans').textContent = plans?.length || 0; $('#statMonth').textContent = plans?.filter(p=>p.lesson_date.startsWith(currentMonth)).length || 0; $('#statClasses').textContent = schedule?.length || 0;
  if (!schedule?.length) { $('#homeSchedule').innerHTML = '<div class="empty">Cargá tu horario semanal para ver aquí tus próximas clases.</div>'; return; }
  const today = new Date().getDay();
  const orderedDays = [...schedule].sort((a,b) => ((a.weekday - (today || 7) + 7)%7) - ((b.weekday - (today || 7) + 7)%7) || (a.start_time||'').localeCompare(b.start_time||''));
  $('#homeSchedule').innerHTML = orderedDays.slice(0,5).map(item=>`<article class="item"><div class="row"><span class="pill">${weekdays[item.weekday]}</span><b>${escapeHtml((item.start_time||'').slice(0,5))}</b><span>${escapeHtml(item.subject)} · ${escapeHtml(item.grade)}${item.section?` · ${escapeHtml(item.section)}`:''}</span><span class="muted">${escapeHtml(item.duration_minutes)} min</span></div></article>`).join('');
}

let recoveringPassword = false;
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveringPassword = true;
    $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden');
    $('#authForm').classList.add('hidden'); $('#recoveryForm').classList.remove('hidden'); $('#recoveryForm').elements.password.focus();
    setStatus('#authStatus','Elegí una contraseña nueva de al menos 8 caracteres.');
    return;
  }
  if (session?.user && !recoveringPassword && $('#app').classList.contains('hidden')) openApp(session.user);
});
const { data:{ session } } = await supabase.auth.getSession();
if (session?.user && !recoveringPassword && $('#app').classList.contains('hidden')) await openApp(session.user);
$('#planForm').elements.lesson_date.value = localISODate();
$('#planForm').elements.lesson_date.addEventListener('change', async event => {
  if (!currentUser || !event.target.value) return;
  const weekday = new Date(`${event.target.value}T12:00:00`).getDay();
  if (weekday < 1 || weekday > 5) return;
  const { data } = await supabase.from('class_schedules').select('subject,grade,duration_minutes').eq('weekday',weekday).order('start_time');
  if (!data?.length) return;
  const selected = data[0]; const form = $('#planForm');
  if (!form.elements.subject.value) form.elements.subject.value = selected.subject;
  if (!form.elements.grade.value) form.elements.grade.value = selected.grade;
  if (!form.elements.duration_minutes.value || form.elements.duration_minutes.value === '45') form.elements.duration_minutes.value = selected.duration_minutes;
});
