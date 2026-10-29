const SUPABASE_URL = 'https://rrptfgdshlrfongkfppv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VIbLFUuvaksiYulO8-CuCQ_zRY92zUp';
const PRODUCTION_APP_URL = 'https://syllabo.beinfinia.com/';
let supabase = null;
let supabaseLoadError = null;
async function loadSupabaseModule(url) {
  let timeoutId;
  try {
    return await Promise.race([
      import(url),
      new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('Tiempo agotado cargando el servicio de datos.')), 7000); })
    ]);
  } finally { clearTimeout(timeoutId); }
}
try {
  let module;
  try { module = await loadSupabaseModule('https://esm.sh/@supabase/supabase-js@2.112.2'); }
  catch { module = await loadSupabaseModule('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm'); }
  supabase = module.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
} catch (error) { supabaseLoadError = error; }
const $ = (selector) => document.querySelector(selector);
const iconMarkup = (name) => `<img class="icon" src="./icons/${name}.svg" alt="">`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const weekdays = { 1:'Lunes', 2:'Martes', 3:'Miércoles', 4:'Jueves', 5:'Viernes' };
function authRedirectTo() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return PRODUCTION_APP_URL;
  return `${window.location.origin}/`;
}
const initialRecoveryParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
let recoveringPassword = initialRecoveryParams.get('type') === 'recovery' || new URLSearchParams(window.location.search).get('type') === 'recovery';
let currentUser = null;
let isSignup = false;
let currentPlanId = null;
let generatedPlanText = '';
let generatedPlanData = null;
let generatedPlanSource = 'guided';
let allPlans = [];

let currentProfile = null;
let planningGradeOverride = '';
let planResourcesOverride = null;
let openingUserId = null;
let initializedUserId = null;
let calendarDate = new Date();
let allCalendarPlans = [];
let allCalendarEvents = [];
let allCalendarSchedule = [];

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
  if (page === 'horario') page = 'calendario';
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== page));
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (page === 'planes') loadPlans();
  if (page === 'horario') loadSchedule();
  if (page === 'calendario') { loadCalendar(); loadSchedule(); }
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
  if (initializedUserId === user.id || openingUserId === user.id) return;
  openingUserId = user.id;
  currentUser = user;
  $('#userEmail').textContent = user.email || '';
  $('#auth').classList.add('hidden'); $('#app').classList.add('hidden');
  try {
    const profile = await ensureProfile(); currentProfile = profile; planningGradeOverride = profile.primary_grade || '';
    if (!profile.onboarding_completed) {
      $('#onboarding').classList.remove('hidden'); document.body.classList.add('onboarding-open');
      initializedUserId = user.id; openingUserId = null;
      const form = $('#onboardingForm');
      for (const key of ['first_name','last_name']) form.elements[key].value = profile[key] || user.user_metadata?.[key] || '';
      form.elements.modality.value = profile.modality || '';
      populateGradeChoices(form, profile.modality || '', profile.primary_grade || '');
      populateSubjectChoices(form, profile.subjects || []);
      return;
    }
    $('#onboarding').classList.add('hidden'); document.body.classList.remove('onboarding-open'); $('#app').classList.remove('hidden');
    fillTeacherForm($('#profileForm'), profile);
    setTeacherIdentity(profile);
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'docente';
    $('#welcomeTitle').textContent = `¡Hola, ${profile.gender === 'mujer' ? 'maestra' : 'maestro'} ${fullName}!`;
    populatePlanSubjectOptions(profile); updatePlanAgeHint(profile); populateScheduleGradeOptions(profile, profile.primary_grade);
    await loadHome();
    initializedUserId = user.id; openingUserId = null;
  } catch (err) { openingUserId = null; $('#app').classList.add('hidden'); $('#onboarding').classList.add('hidden'); document.body.classList.remove('onboarding-open'); $('#auth').classList.remove('hidden'); setStatus('#authStatus', `No se pudo cargar tu perfil: ${friendlyError(err)}`, 'error'); }
}
const subjectCatalog = window.SyllaboSubjects.catalog;
const getSubjectsFor = window.SyllaboSubjects.getFor;
const populateSubjectChoices = window.SyllaboSubjects.populateChoices;
function getSelectedSubjects(form) { return window.SyllaboSubjects.unique([...form.querySelectorAll('input[name="subject_choice"]:checked')].map(input => input.value)); }
function addCustomSubject(form) {
  const input = form.elements.custom_subject; const value = String(input.value || '').trim().replace(/\s+/g, ' ');
  if (!value) { input.focus(); return; }
  const selected = getSelectedSubjects(form);
  const normalize=window.SyllaboSubjects.normalizeName;
  const duplicate = [...subjectCatalog.primary, ...subjectCatalog.secondary, ...selected].some(subject => normalize(subject) === normalize(value));
  if (duplicate) { input.setCustomValidity('Esa materia ya está en la lista.'); input.reportValidity(); input.setCustomValidity(''); return; }
  populateSubjectChoices(form, [...selected, value]); input.value = '';
}
function populateGradeChoices(form, modality, selected = '') {
  const field = form.elements.primary_grade; if (!field) return;
  const max = modality === 'primaria' ? 6 : modality === 'secundaria' ? 11 : 0;
  const first = modality === 'secundaria' ? 7 : 1;
  const options = max ? Array.from({length:max-first+1},(_,i)=>`${first+i}° grado`) : [];
  field.innerHTML = '<option value="">' + (modality ? 'Seleccioná un grado' : 'Seleccioná primero la modalidad') + '</option>' + options.map(value=>`<option value="${value}">${value}</option>`).join('') + (modality ? '<option value="Multigrado">Multigrado</option>' : '');
  field.value = options.includes(selected) || selected === 'Multigrado' ? selected : '';
  populateSubjectChoices(form);
}
function populateScheduleGradeOptions(profile = currentProfile, selected = '') {
  const field = $('#scheduleForm').elements.grade;
  if (!field) return;
  const modality = profile?.modality || '';
  const first = modality === 'secundaria' ? 7 : 1;
  const last = modality === 'primaria' ? 6 : modality === 'secundaria' ? 11 : 0;
  const options = last ? Array.from({length:last-first+1}, (_, index) => `${first+index}° grado`) : [];
  field.innerHTML = '<option value="">Elegí el grado</option>' + options.map(value => `<option value="${value}">${value}</option>`).join('') + '<option value="Multigrado">Multigrado</option>';
  const value = selected || profile?.primary_grade || '';
  field.value = [...options, 'Multigrado'].includes(value) ? value : '';
  populateScheduleSubjectSuggestions(profile, field.value);
}
function populateScheduleSubjectSuggestions(profile = currentProfile, grade = '') {
  const list = $('#scheduleSubjects');
  if (!list) return;
  const known = new Set([...subjectCatalog.primary, ...subjectCatalog.secondary].map(window.SyllaboSubjects.normalizeName));
  const custom = (profile?.subjects || []).filter(subject => !known.has(window.SyllaboSubjects.normalizeName(subject)));
  const options = window.SyllaboSubjects.unique([...getSubjectsFor(profile?.modality || '', grade || profile?.primary_grade || ''), ...custom]);
  list.innerHTML = options.map(subject => `<option value="${escapeHtml(subject)}"></option>`).join('');
}
for (const formId of ['onboardingForm','profileForm']) {
  const form = $(`#${formId}`);
  populateSubjectChoices(form);
  form.elements.modality.addEventListener('change', () => { populateGradeChoices(form, form.elements.modality.value); });
  form.elements.primary_grade.addEventListener('change', () => populateSubjectChoices(form));
}
$('#scheduleForm').elements.grade.addEventListener('change', () => populateScheduleSubjectSuggestions(currentProfile, $('#scheduleForm').elements.grade.value));
document.querySelectorAll('[data-add-subject]').forEach(button => { if (!button.dataset.subjectFallback) button.addEventListener('click', () => addCustomSubject($(`#${button.dataset.addSubject}`))); });
function readProfileForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const selectedSubjects=getSelectedSubjects(form);
  delete data.custom_subject;
  delete data.subject_choice;
  data.subjects=[...new Set(selectedSubjects)];
  const selectedResources=window.SyllaboResources?.getSelected(form) || [];
  const customResources=window.SyllaboResources?.normalize(form.elements.other_resources?.value || '') || [];
  data.full_name = [data.first_name.trim(),data.last_name.trim()].filter(Boolean).join(' ');
  data.teacher_context = { ...(currentProfile?.teacher_context || {}), ...Object.fromEntries(['student_age_range','context_zone','class_size','internet_access','planning_challenges','preferred_dynamics'].map(key=>[key,data[key] || ''])) };
  data.teacher_context.avatar = ['woman','man','flower','owl','book'].includes(data.avatar_choice) ? data.avatar_choice : (data.teacher_context.avatar || (data.gender==='mujer'?'woman':'man'));
  delete data.avatar_choice;
  data.teacher_context.available_resources=[...new Set([...selectedResources,...customResources])];
  delete data.other_resources; delete data.resource_choice;
  for (const key of Object.keys(data.teacher_context)) delete data[key];
  return data;
}
function fillTeacherForm(form, profile) {
  for (const key of ['first_name','last_name','gender','modality','primary_grade','school_name','municipality']) if (form.elements[key]) form.elements[key].value = profile[key] || '';
  populateGradeChoices(form,profile.modality || '',profile.primary_grade || '');
  populateSubjectChoices(form,profile.subjects || []);
  const context = profile.teacher_context || {};
  if(form.elements.avatar_choice) form.elements.avatar_choice.value = context.avatar || (profile.gender==='mujer'?'woman':'man');
  for (const key of ['student_age_range','context_zone','class_size','internet_access','planning_challenges','preferred_dynamics']) if (form.elements[key]) form.elements[key].value = context[key] || '';
  const resources=window.SyllaboResources?.normalize(context.available_resources) || [];
  window.SyllaboResources?.populateChoices(form, resources.filter(value => window.SyllaboResources.catalog.includes(value)));
  const customResources=resources.filter(value => !window.SyllaboResources?.catalog.includes(value));
  if(form.elements.other_resources) form.elements.other_resources.value=customResources.join(', ');
}
function populatePlanSubjectOptions(profile, selected = '') {
  const select=$('#planSubjectInput'); const subjects=window.SyllaboSubjects.unique(profile?.subjects||[]); const value=selected||select.value;
  select.innerHTML='<option value="">Elegí una materia de tu perfil</option>'+subjects.map(subject=>`<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('');
  if(value&&!subjects.includes(value))select.insertAdjacentHTML('beforeend',`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  select.value=value||'';
}
function setPlanSubject(value) { const select=$('#planSubjectInput'); if(![...select.options].some(option=>option.value===value))select.insertAdjacentHTML('beforeend',`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);select.value=value; }
function updatePlanAgeHint(profile) {
  const grade = planningGradeOverride || profile?.primary_grade || 'grado de tu perfil';
  const range = profile?.teacher_context?.student_age_range || '';
  $('#planContextHint').textContent = `El plan usará ${grade}${range ? ` y adaptará ejemplos y dinámicas para estudiantes de ${range}` : ''}. Podés actualizar estos datos en Mi perfil.`;
}
function setTeacherIdentity(profile) {
  const avatar=$('#teacherAvatar'); const selected=profile.teacher_context?.avatar || (profile.gender==='mujer'?'woman':'man');
  const symbols={flower:'🌻',owl:'🦉',book:'📚'};
  avatar.innerHTML=symbols[selected]?`<span aria-hidden="true">${symbols[selected]}</span>`:`<img class="avatar-image" src="./icons/avatar-${selected==='woman'?'woman':'man'}.svg" alt="">`;
  const name=[profile.first_name,profile.last_name].filter(Boolean).join(' ');avatar.setAttribute('aria-label',`Avatar de ${name||'docente'}`);avatar.title=name||'Docente';
}
async function saveTeacherProfile(form, onboarding = false) {
  const data = readProfileForm(form);
  if (!data.subjects.length) throw new Error('Seleccioná al menos una materia.');
  const row = {id:currentUser.id, ...data, onboarding_completed:true, updated_at:new Date().toISOString()};
  const {data:saved,error} = await supabase.from('teacher_profiles').upsert(row).select().single();
  if (error) throw error;
  currentProfile = saved; fillTeacherForm($('#profileForm'),saved); setTeacherIdentity(saved);
  $('#welcomeTitle').textContent = `¡Hola, ${saved.gender === 'mujer' ? 'maestra' : 'maestro'} ${[saved.first_name, saved.last_name].filter(Boolean).join(' ')}!`;
  planningGradeOverride = saved.primary_grade || '';
  populatePlanSubjectOptions(saved); updatePlanAgeHint(saved); populateScheduleGradeOptions(saved, saved.primary_grade);
  if (onboarding) { $('#onboarding').classList.add('hidden'); document.body.classList.remove('onboarding-open'); $('#app').classList.remove('hidden'); await loadHome(); }
  return saved;
}
let activeRecognition = null;
function startDictation(button) {
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){setStatus('#planStatus','Este navegador no ofrece dictado de voz. Probá el micrófono del teclado del celular.','error');return;}
  if(activeRecognition){activeRecognition.stop();return;}
  const field=document.getElementById(button.dataset.dictate); const recognition=new Recognition();
  recognition.lang='es-MX';recognition.interimResults=false;recognition.maxAlternatives=1;activeRecognition=recognition;
  button.classList.add('listening');button.innerHTML=`${iconMarkup('mic')}<span>Escuchando…</span>`;button.setAttribute('aria-pressed','true');setStatus('#planStatus','Hablá ahora; al terminar, el texto aparecerá en el campo.');
  recognition.onresult=event=>{const transcript=event.results?.[0]?.[0]?.transcript?.trim();if(transcript){field.value=`${field.value.trim()}${field.value.trim()?' ':''}${transcript}`;field.dispatchEvent(new Event('input',{bubbles:true}));}};
  recognition.onerror=event=>{const message=event.error==='not-allowed'||event.error==='service-not-allowed'?'Permití el acceso al micrófono en el navegador para dictar.':event.error==='no-speech'?'No detecté voz. Intentá de nuevo.':event.error==='network'?'El dictado requiere conexión a internet. Revisá la conexión e intentá otra vez.':event.error==='audio-capture'?'No encontré un micrófono disponible. Revisá el dispositivo.':event.error==='language-not-supported'?'El navegador no admite el idioma de dictado. Probá Chrome o Edge actualizado.':'No se pudo iniciar el dictado. Revisá el micrófono e intentá de nuevo.';setStatus('#planStatus',message,'error');};
  recognition.onend=()=>{button.classList.remove('listening');button.innerHTML=`${iconMarkup('mic')}<span>Dictar</span>`;button.setAttribute('aria-pressed','false');if(activeRecognition===recognition)activeRecognition=null;};
  try{recognition.start();}catch{button.classList.remove('listening');button.innerHTML=`${iconMarkup('mic')}<span>Dictar</span>`;button.setAttribute('aria-pressed','false');activeRecognition=null;setStatus('#planStatus','No se pudo iniciar el micrófono. Esperá un momento e intentá de nuevo.','error');}
}
document.querySelectorAll('[data-dictate]').forEach(button=>{if(!button.dataset.uiFallback)button.addEventListener('click',()=>startDictation(button));});
$('#onboardingForm').addEventListener('submit', async event => {
  event.preventDefault(); const button=$('#finishOnboarding'); button.disabled=true; setStatus('#onboardingStatus','Guardando tu perfil…');
  try { await saveTeacherProfile(event.currentTarget,true); }
  catch(error) { setStatus('#onboardingStatus',friendlyError(error),'error'); }
  finally { button.disabled=false; }
});

function friendlyError(error) {
  const message = error?.message || 'Ocurrió un problema inesperado.';
  if (/fetch|network/i.test(message)) return 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.';
  if (/row-level security|permission denied/i.test(message)) return 'Tu sesión no tiene permiso para esta acción. Cerrá sesión y volvé a ingresar.';
  return message;
}
async function functionErrorMessage(error) {
  try {
    const response = error?.context;
    if (response?.clone) {
      const body = await response.clone().json();
      if (body?.error) return String(body.error);
    }
  } catch {}
  return friendlyError(error);
}

function setAuthMode(signup) {
  isSignup = signup;
  $('#authTitle').textContent = isSignup ? 'Crear cuenta docente' : 'Ingresar';
  $('#authSubmit').textContent = isSignup ? 'Crear cuenta' : 'Ingresar';
  $('#toggleAuth').textContent = isSignup ? 'Ya tengo cuenta' : 'Crear cuenta';
  $('#authForm').elements.password.autocomplete = isSignup ? 'new-password' : 'current-password';
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
  button.innerHTML = `${iconMarkup(show ? 'eye-off' : 'eye')}<span>${show ? 'Ocultar' : 'Mostrar'}</span>`;
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
}));
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#authSubmit'); button.disabled = true;
  setStatus('#authStatus', isSignup ? 'Creando tu cuenta…' : 'Ingresando…');
  const form = new FormData(event.currentTarget); const email = String(form.get('email') || '').trim(); const password = String(form.get('password') || '');
  try {
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirectTo() } });
      if (error) throw error;
      if (data.session && data.user) await openApp(data.user);
      else setStatus('#authStatus', 'Supabase todavía exige confirmar el correo. Desactivá “Confirm email” en Authentication → Sign In / Providers → Email para permitir el ingreso inmediato.', 'error');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      recoveringPassword = false;
      setAuthMode(false); if (data.user) await openApp(data.user);
    }
  } catch (err) { setStatus('#authStatus', friendlyError(err), 'error'); }
  finally { button.disabled = false; }
});
$('#forgotPassword').addEventListener('click', () => {
  $('#authForm').classList.add('hidden'); $('#forgotForm').classList.remove('hidden'); $('#forgotForm').elements.email.value = $('#authForm').elements.email.value.trim();
  setStatus('#authStatus'); $('#forgotForm').elements.email.focus();
});
$('#cancelForgot').addEventListener('click', () => {
  $('#forgotForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); setAuthMode(false); setStatus('#authStatus');
});
$('#forgotForm').addEventListener('submit', async event => {
  event.preventDefault(); const email = event.currentTarget.elements.email.value.trim();
  const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])'); button.disabled = true; setStatus('#authStatus', 'Enviando enlace de recuperación…');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectTo() });
    if (error) throw error;
    $('#forgotForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); setAuthMode(false);
    setStatus('#authStatus', 'Si el correo está registrado, recibirás un enlace de recuperación. Revisá también spam.', 'ok');
  } catch (error) { setStatus('#authStatus', friendlyError(error), 'error'); }
  finally { button.disabled = false; }
});
$('#recoveryForm').addEventListener('submit', async event => {
  event.preventDefault(); const password = new FormData(event.currentTarget).get('password');
  if (String(password).length < 8) { setStatus('#authStatus','La contraseña debe tener al menos 8 caracteres.','error'); return; }
  const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])'); button.disabled = true; setStatus('#authStatus','Actualizando contraseña…');
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    recoveringPassword = false;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    await supabase.auth.signOut();
    $('#recoveryForm').reset(); $('#recoveryForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); setAuthMode(false);
    setStatus('#authStatus','Contraseña actualizada. Ya podés ingresar con tu correo y la nueva contraseña.','ok');
  } catch (error) { setStatus('#authStatus',friendlyError(error),'error'); }
  finally { button.disabled = false; }
});
$('#cancelRecovery').addEventListener('click', async () => {
  recoveringPassword = false; if (supabase) await supabase.auth.signOut(); history.replaceState(null, '', `${location.pathname}${location.search}`);
  $('#recoveryForm').reset(); $('#recoveryForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); setAuthMode(false); setStatus('#authStatus','Podés ingresar con tu correo y contraseña.');
});
$('#logout').addEventListener('click', async () => {
  await supabase.auth.signOut(); currentUser = null; currentProfile=null; openingUserId=null; initializedUserId=null; setAuthMode(false); $('#app').classList.add('hidden'); $('#onboarding').classList.add('hidden'); document.body.classList.remove('onboarding-open'); $('#auth').classList.remove('hidden'); $('#forgotForm').classList.add('hidden'); $('#recoveryForm').classList.add('hidden'); $('#authForm').classList.remove('hidden'); recoveringPassword=false; setStatus('#authStatus', 'Sesión cerrada.');
});

function splitActivities(plan) {
  return Array.isArray(plan.activities) ? plan.activities : [];
}
function plainPlanText(plan) {
  const lines = [
    `PLAN DE CLASE | ${plan.subject || 'Asignatura'}`,
    `Docente: ${plan.teacher || ''}    Grado: ${plan.grade || ''}`,
    `Fecha: ${prettyDate(plan.lesson_date)}    Duración: ${plan.duration_minutes || 0} minutos`,
    '', 'INDICADOR DE LOGRO', plan.achievement_indicator || '',
    `Contenido: ${plan.content || ''}`,
    `Propósito: ${plan.objective || `Trabajar ${plan.content || 'el contenido'} y avanzar hacia el indicador de logro.`}`,
    ...(plan.additional_observation ? [`Observación del docente considerada: ${plan.additional_observation}`] : []),
    '', 'RECURSOS Y PREPARACIÓN', plan.preparation || plan.resources || 'Preparar pizarra, cuaderno y ejemplos del entorno.'
  ];
  for (const activity of splitActivities(plan)) {
    lines.push('', `${activity.moment || 'Actividad'} | ${activity.minutes || 0} minutos`);
    if (Array.isArray(activity.steps) && activity.steps.length) {
      activity.steps.forEach(step => lines.push(`${step.label || 'Actividad'} (${step.minutes || 0} min): ${step.detail || ''}`));
    } else {
      lines.push(activity.activity || '');
      if (activity.examples) lines.push(`Ejemplo: ${activity.examples}`);
      if (activity.assessment) lines.push(`Observación: ${activity.assessment}`);
    }
  }
  const worksheet = plan.worksheet || buildWorksheet(plan);
  const checklist = plan.evaluation_checklist || String(plan.evaluation_criteria || '').split(/\n/).map(text => text.trim()).filter(Boolean);
  lines.push('', 'FICHA Y EVALUACIÓN', 'Nombre: ____________________________________    Fecha: __________________', worksheet.instructions || 'Resuelve las actividades y explica tus respuestas.');
  (worksheet.tasks || []).forEach((task, index) => lines.push('', `${index + 1}. ${task}`));
  lines.push('', 'Lista de cotejo para la docente');
  checklist.forEach(criterion => lines.push(`[ ] ${criterion}    Sí: ____    En proceso: ____`));
  lines.push('', 'RESPUESTAS ORIENTATIVAS Y APOYO', plan.answer_guide || 'Las respuestas pueden variar; verificar que se relacionen con el contenido y demuestren el indicador de logro.', `Adecuación: ${plan.differentiation || 'Dar instrucciones paso a paso, ofrecer apoyo visual y permitir responder oralmente o por escrito.'}`);
  if (plan.teacher_note) lines.push(`Nota docente: ${plan.teacher_note}`);
  if(plan.teacher_explanation) lines.push('', 'GUÍA CONCEPTUAL PARA EL DOCENTE', plan.teacher_explanation);
  if(plan.worked_examples?.length) { lines.push('', 'EJEMPLOS RESUELTOS'); plan.worked_examples.forEach((example,index)=>lines.push(`${index+1}. ${example}`)); }
  if(plan.glossary?.length) { lines.push('', 'GLOSARIO DOCENTE'); plan.glossary.forEach(entry=>lines.push(`${entry.term}: ${entry.definition}`)); }
  if(plan.extension) lines.push('', 'RETO OPCIONAL DE AMPLIACIÓN', plan.extension);
  lines.push('', 'Borrador para revisión docente. Ajustar ejemplos y ficha al programa de estudio y a las características del grupo.');
  return lines.join('\n');
}
function suggestEvaluationCriteria(data) {
  return [
    `Demuestra el aprendizaje esperado descrito en el indicador: ${data.achievement_indicator}`,
    `Relaciona el contenido «${data.content}» con la actividad o el ejemplo trabajado.`,
    `Explica o presenta su respuesta con claridad y utiliza ideas vinculadas con «${data.content}».`
  ].join('\n');
}
function formatResourceList(values) {
  const normalized=window.SyllaboResources?.normalize(values) || (Array.isArray(values)?values:String(values||'').split(/[,;\n]+/).map(value=>value.trim()).filter(Boolean));
  return normalized.join(', ');
}
function derivePlanTitle(content='') {
  const first=String(content).trim().split(/\n|[.!?](?:\s|$)/)[0].trim();
  return first.length>90 ? `${first.slice(0,87).trimEnd()}…` : first || 'Plan de clase';
}
function buildWorksheet(data) {
  const subject=String(data.subject || '').toLowerCase();
  let tasks;
  if (/matem|aritm|geometr/.test(subject)) tasks=[
    `Resuelve un ejercicio de «${data.content || 'este contenido'}» trabajado en clase y muestra tus pasos: ________________________________`,
    `Crea un ejemplo propio relacionado con «${data.content || 'este contenido'}» y explica cómo lo resolviste.`,
    `¿Qué paso o idea te ayudó más? Escríbelo con tus palabras.`
  ];
  else if (/lengua|literatura|espa|comunic|inglés|francés/.test(subject)) tasks=[
    `Lee el texto breve seleccionado por la docente. Identifica dos ejemplos de «${data.content || 'este contenido'}» y cópialos.`,
    `Explica qué función o idea cumple «${data.content || 'este contenido'}» en el texto.`,
    `Escribe una oración o respuesta propia usando lo aprendido.`
  ];
  else if (/cienc|naturaleza|biolog|qu[ií]mica|física/.test(subject)) tasks=[
    `Observa los ejemplos presentados y clasifica o describe cada uno según «${data.content || 'este contenido'}».`,
    `Elige un ejemplo y explica por qué corresponde a esa clasificación o concepto.`,
    `Menciona una situación de la vida diaria en la que se observe lo aprendido.`
  ];
  else if (/social|historia|geograf|c[ií]vica/.test(subject)) tasks=[
    `Lee la fuente, imagen o mapa seleccionado. Escribe dos ideas relacionadas con «${data.content || 'este contenido'}».`,
    `Organiza la información en el orden o lugar que corresponda y explica tu decisión.`,
    `Relaciona lo estudiado con una persona, lugar o situación de la comunidad.`
  ];
  else tasks=[
    `Explica con tus propias palabras una idea importante de «${data.content || 'este contenido'}».`,
    `Resuelve o completa una actividad que demuestre el indicador de logro. Explica cómo lo hiciste.`,
    `Da un ejemplo de cómo se relaciona lo aprendido con la vida diaria.`
  ];
  return {instructions:'Resuelve las actividades. Usa el contenido trabajado en clase y explica tus respuestas.',tasks};
}
function localDraft(data, teacher) {
  const total=Math.max(10,Number(data.duration_minutes)||45);
  const subject=String(data.subject||'').toLowerCase();
  let opener=Math.max(2,Math.round(total*.18));
  let develop=Math.max(3,Math.round(total*.60));
  let close=total-opener-develop;
  if(close<2){develop-=2-close;close=2;}
  let explain=Math.max(1,Math.round(develop*.30));
  let collaborative=Math.max(1,Math.round(develop*.45));
  let independent=develop-explain-collaborative;
  if(independent<1){collaborative=Math.max(1,collaborative+independent-1);independent=develop-explain-collaborative;}
  const socialization=Math.max(1,Math.round(close*.5));
  const exit=close-socialization;
  const evaluationCriteria=data.evaluation_criteria||suggestEvaluationCriteria(data);
  const checklist=evaluationCriteria.split('\n').map(item=>item.trim()).filter(Boolean);
  const ageRange=teacher.teacher_context?.student_age_range||'';
  const ageGuidance=ageRange==='3–5 años'?'Usar objetos concretos, imágenes, consignas de un paso y juegos breves con movimiento.':ageRange==='6–8 años'?'Usar ejemplos cotidianos, apoyo visual e instrucciones breves.':ageRange==='9–11 años'?'Combinar ejemplos cercanos, organizadores gráficos y explicación del razonamiento.':ageRange==='12–14 años'?'Proponer retos conectados con su vida, colaboración y conversación guiada.':ageRange==='15–18 años'?'Incluir problemas auténticos, análisis de casos y argumentación con evidencias.':ageRange==='Edades variadas'?'Ofrecer apoyos y niveles de reto distintos para una misma consigna.':'Dar instrucciones breves, modelar un ejemplo y comprobar la comprensión.';
  const resources=data.resources||formatResourceList(teacher.teacher_context?.available_resources)||'Pizarra, cuaderno, lápiz y ejemplos del entorno.';
  const resourceParts=resources.split(/,\s*/).map(item=>item.toLocaleLowerCase());
  const soundNote=resourceParts.some(item=>item.includes('sonido')||item.includes('parlante'))?' Si se usará audio o video, comprobar antes que el sonido del parlante se escuche con claridad.':'';
  const prep=`Organizar con anticipación: ${resources}. Preparar ejemplos, tarjetas, imágenes o una lectura corta vinculados con «${data.content}».${soundNote}${teacher.teacher_context?.internet_access==='Sin acceso en el aula'?' Tener una alternativa impresa o dibujada para no depender de internet.':''}`;
  let warmup=`Dinámica «¿Qué sabemos?»: mostrar una imagen, objeto o situación de la comunidad relacionada con «${data.content}». Preguntar qué observan, qué saben y dónde lo han visto. Escuchar ideas, presentar el propósito y recuperar vocabulario clave.`;
  let explainDetail=`Presentar «${data.content}» en pasos breves. Modelar un ejemplo y relacionarlo con el indicador: «${data.achievement_indicator}». Invitar al grupo a explicar qué observa o qué estrategia propone.`;
  let teamDetail=`En parejas o equipos, trabajar con ejemplos de «${data.content}». Comparar respuestas, explicar por qué corresponden y hacer ajustes después de la conversación.`;
  let practiceDetail=`Resolver la ficha individual de la sección siguiente. Leer las instrucciones en voz alta y permitir consultar el ejemplo modelado.`;
  if(/matem|aritm|geometr/.test(subject)){
    warmup=`Dinámica «Resolvamos juntos»: presentar una situación cotidiana vinculada con «${data.content}». Pedir al grupo que proponga maneras de resolverla y explique su razonamiento.`;
    explainDetail=`Modelar en la pizarra un ejercicio breve de «${data.content}». Pensar en voz alta, explicar los pasos y resolver un segundo ejemplo con participación del grupo.`;
    teamDetail=`En parejas, resolver ejercicios cortos de «${data.content}». Cada estudiante explica un paso y compara el procedimiento con su compañero o compañera.`;
  } else if(/lengua|literatura|espa|comunic|inglés|francés/.test(subject)){
    warmup=`Dinámica «Leemos y descubrimos»: leer una oración o fragmento corto relacionado con «${data.content}». Preguntar qué palabras o ideas llaman la atención y por qué.`;
    explainDetail=`Leer un ejemplo y modelar cómo reconocer o utilizar «${data.content}». Explicar la estrategia con palabras sencillas y comprobarla con el indicador.`;
    teamDetail=`En parejas, leer un fragmento breve, localizar ejemplos de «${data.content}» y justificar la respuesta usando una parte del texto.`;
  } else if(/cienc|naturaleza|biolog|qu[ií]mica|física/.test(subject)){
    warmup=`Dinámica «Observamos el entorno»: mostrar dos o tres objetos, imágenes o muestras seguras. Preguntar qué tienen en común y cómo se relacionan con «${data.content}».`;
    explainDetail=`Observar y explicar «${data.content}» con objetos, dibujos o imágenes. Modelar cómo describir o clasificar un ejemplo y conectar la explicación con el indicador.`;
    teamDetail=`En equipos, clasificar, comparar o registrar ejemplos de «${data.content}» en una tabla o cartel. Cada equipo explica una decisión y escucha comentarios.`;
  } else if(/social|historia|geograf|c[ií]vica/.test(subject)){
    warmup=`Dinámica «Pistas del pasado o del lugar»: observar una imagen, mapa o fuente breve relacionada con «${data.content}». Preguntar qué información aporta y qué quisieran saber.`;
    explainDetail=`Ubicar «${data.content}» en el tiempo, lugar o contexto que corresponda. Modelar la lectura de un mapa, imagen o fuente y distinguir las ideas principales.`;
    teamDetail=`En equipos, analizar una imagen, mapa o texto breve sobre «${data.content}». Ordenar hechos o ideas y compartir una conclusión con evidencia.`;
  }
  const objective=`Que las y los estudiantes comprendan «${data.content}» y demuestren avances hacia el indicador: ${data.achievement_indicator}`;
  const worksheet=buildWorksheet(data);
  const answerGuide=`Las respuestas pueden variar. Aceptar las que se relacionen con «${data.content}» y demuestren el indicador. Si una consigna admite varias respuestas, pedir al estudiante que explique su razonamiento.`;
  const teacherNote='Adecuar los ejemplos al programa de estudio y a lo que el grupo ya ha trabajado. Permitir responder oralmente, por escrito o con un dibujo cuando sea pertinente.';
  const differentiation=`${ageGuidance}${teacher.teacher_context?.internet_access==='Sin acceso en el aula'?' Priorizar los materiales impresos, los objetos del entorno y las actividades sin conexión.':''}${teacher.teacher_context?.planning_challenges?` Considerar el desafío señalado por el docente: ${teacher.teacher_context.planning_challenges}.`:''}`;
  const plan={
    title:derivePlanTitle(data.content),teacher:[teacher.first_name,teacher.last_name].filter(Boolean).join(' '),school:teacher.school_name,
    student_age_range:ageRange,subject:data.subject,grade:data.grade,lesson_date:data.lesson_date,duration_minutes:total,
    topic:derivePlanTitle(data.content),content:data.content,achievement_indicator:data.achievement_indicator,
    evaluation_criteria:evaluationCriteria,evaluation_checklist:checklist,resources,preparation:prep,objective,worksheet,answer_guide:answerGuide,teacher_note:teacherNote,
    activities:[
      {moment:'1. Inicio',minutes:opener,steps:[{label:'Dinámica de activación',minutes:opener,detail:warmup}]},
      {moment:'2. Desarrollo',minutes:develop,steps:[
        {label:'Explorar y explicar',minutes:explain,detail:explainDetail},
        {label:'Actividad colaborativa',minutes:collaborative,detail:teamDetail},
        {label:'Práctica individual',minutes:independent,detail:practiceDetail}
      ]},
      {moment:'3. Cierre',minutes:close,steps:[
        {label:'Socialización',minutes:socialization,detail:'Revisar algunas respuestas o producciones. Preguntar cómo llegaron a la respuesta y aclarar errores frecuentes con un ejemplo breve.'},
        {label:'Salida',minutes:exit,detail:`Cada estudiante comparte o escribe una idea que aprendió y un ejemplo relacionado con «${data.content}». Registrar avances usando la lista de cotejo.`}
      ]}
    ],
    evidence:`Ficha individual, explicaciones durante el trabajo colaborativo y respuesta de salida, cotejadas con el indicador: ${data.achievement_indicator}`,
    differentiation,homework:''
  };
  plan.text=plainPlanText(plan);
  return plan;
}
function getPlanFormData() {
  const data = Object.fromEntries(new FormData($('#planForm')).entries());
  data.duration_minutes = Number(data.duration_minutes);
  data.grade = planningGradeOverride || currentProfile?.primary_grade || '';
  data.topic = derivePlanTitle(data.content);
  data.resources = planResourcesOverride ?? formatResourceList(currentProfile?.teacher_context?.available_resources);
  data.evaluation_criteria = suggestEvaluationCriteria(data);
  data.additional_observation = String(data.additional_observation || '').trim();
  return data;
}
function formHasRequiredData(data) {
  for (const key of ['subject','grade','lesson_date','content','achievement_indicator']) {
    if (!String(data[key] || '').trim()) { $('#planForm').elements[key]?.focus(); return false; }
  }
  if (data.duration_minutes < 10 || data.duration_minutes > 600) { $('#planForm').elements.duration_minutes.focus(); return false; }
  return true;
}
let pendingPlanData = null;
function reviewPlan(event) {
  event.preventDefault();
  const data = getPlanFormData();
  if (!data.grade) { setStatus('#planStatus', 'Elegí el grado en Mi perfil antes de preparar el plan.', 'error'); return; }
  if (!formHasRequiredData(data)) { setStatus('#planStatus', 'Completá la asignatura, la fecha, el contenido y el indicador.', 'error'); return; }
  const profile = currentProfile || {};
  pendingPlanData = { ...data, student_age_range: profile.teacher_context?.student_age_range || '', modality: profile.modality || '' };
  const summary = [
    ['Asignatura', data.subject], ['Modalidad', profile.modality || '—'], ['Grado de esta clase', data.grade],
    ['Rango de edad del grupo', pendingPlanData.student_age_range || 'No indicado: la IA usará el grado como referencia'],
    ['Fecha', prettyDate(data.lesson_date)], ['Duración', `${data.duration_minutes} minutos`],
    ['Contenido', data.content], ['Indicador de logro', data.achievement_indicator],
    ['Sugerencia u observación', data.additional_observation || 'Ninguna'],
    ['Recursos del perfil', data.resources || 'Sin recursos marcados; se sugerirán materiales básicos.'],
    ['Criterios de evaluación', 'La IA los propondrá a partir del indicador.'],
    ['Revisión del dictado', 'La IA interpretará errores leves por contexto. Si una palabra cambia el tema y es ambigua, pedirá que la revisés.']
  ];
  $('#planReviewDetails').innerHTML = summary.map(([label, value]) => `<div><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`).join('');
  $('#planForm').classList.add('hidden');
  $('#planReview').classList.remove('hidden');
  setStatus('#planStatus');
  $('#planReview').scrollIntoView({ behavior:'smooth', block:'center' });
}
$('#planForm').addEventListener('submit', reviewPlan);
$('#editPlanDetails').addEventListener('click', () => { $('#planReview').classList.add('hidden'); $('#planForm').classList.remove('hidden'); });
$('#generatePlan').addEventListener('click', async () => {
  if (!pendingPlanData) return;
  if (!navigator.onLine) { setStatus('#planStatus','Para crear con IA necesitás internet. Podés abrir tus PDF desde «Mis PDF sin internet».','error'); return; }
  const button = $('#generatePlan'); button.disabled = true;
  $('#aiState').innerHTML = '<span class="progress"><span></span></span> Generando el plan con IA…';
  setStatus('#planStatus', 'Enviando los datos del plan a la IA…');
  try {
    const teacher = await ensureProfile();
    const data = { ...pendingPlanData, grade:pendingPlanData.grade || teacher.primary_grade || '' };
    if (!data.grade) throw new Error('Seleccioná el grado en Mi perfil para continuar.');
    data.evaluation_criteria = suggestEvaluationCriteria(data);
    const { data: response, error } = await supabase.functions.invoke('generate-lesson-plan', {
      body: {
        ...data,
        modality: data.modality || teacher.modality || '',
        student_age_range: data.student_age_range || '',
        available_resources: teacher.teacher_context?.available_resources || [],
        planning_challenges: teacher.teacher_context?.planning_challenges || '',
        preferred_dynamics: teacher.teacher_context?.preferred_dynamics || '',
        internet_access: teacher.teacher_context?.internet_access || '',
        context_zone: teacher.teacher_context?.context_zone || '',
        class_size: teacher.teacher_context?.class_size || ''
      }
    });
    if (error) throw error;
    if (!response?.plan) throw new Error(response?.error || 'La IA no devolvió un plan. Intentá de nuevo.');
    const aiPlan = {
      ...response.plan,
      teacher: [teacher.first_name, teacher.last_name].filter(Boolean).join(' '),
      school: teacher.school_name || '',
      student_age_range: data.student_age_range || '',
      additional_observation: data.additional_observation
    };
    const result = { plan:aiPlan, source:'ai' };
    generatedPlanSource = 'ai';
    generatedPlanText = result.plan.text;
    generatedPlanData = result.plan;
    $('#planReview').classList.add('hidden'); $('#planForm').classList.remove('hidden');
    renderPlanPreview(result.plan, result.source);
    $('#aiState').textContent = 'Plan generado con IA. Revisá y ajustá la propuesta antes de guardarla.';
    setStatus('#planStatus', 'La propuesta con IA está lista. Revisá y ajustá el plan antes de guardarlo.', 'ok');
    currentPlanId = null;
  } catch (err) {
    const reason = await functionErrorMessage(err);
    if (/Revisá el dictado:/i.test(reason)) {
      $('#planReview').classList.add('hidden'); $('#planForm').classList.remove('hidden');
      $('#planPreview').innerHTML=''; generatedPlanData=null; generatedPlanText='';
      $('#aiState').textContent='Revisá la palabra indicada antes de generar.';
      setStatus('#planStatus',reason,'error'); return;
    }
    try {
      const teacher = await ensureProfile();
      const data = { ...pendingPlanData, grade:pendingPlanData.grade || teacher.primary_grade || '' };
      data.evaluation_criteria = suggestEvaluationCriteria(data);
      const fallback = localDraft(data, teacher);
      fallback.additional_observation = data.additional_observation;
      generatedPlanSource = 'guided'; generatedPlanText = fallback.text; generatedPlanData = fallback;
      $('#planReview').classList.add('hidden'); $('#planForm').classList.remove('hidden');
      renderPlanPreview(fallback, 'guided');
      $('#aiState').textContent = 'Borrador guiado: no se pudo conectar con la IA.';
      setStatus('#planStatus', `La IA no respondió (${reason}). Dejé listo un borrador guiado; revisá la conexión de IA antes de volver a intentar.`, 'error');
      currentPlanId = null;
    } catch (fallbackError) {
      setStatus('#planStatus', `${reason} ${friendlyError(fallbackError)}`, 'error');
      $('#aiState').textContent = 'No se pudo generar la propuesta.';
      $('#planReview').classList.remove('hidden'); $('#planForm').classList.add('hidden');
    }
  }
  finally { button.disabled = false; }
});
function renderPlanPreview(plan, source = 'guided') {
  const structuredText=plainPlanText(plan);
  const text=plan.text||structuredText;
  generatedPlanText=text;
  const badge=source==='ai'?'<span class="pill green">Propuesta con IA</span>':'<span class="pill blue-pill">Borrador guiado</span>';
  const checklist=plan.evaluation_checklist||String(plan.evaluation_criteria||'').split(/\n/).map(value=>value.trim()).filter(Boolean);
  const worksheet=plan.worksheet||buildWorksheet(plan);
  const activities=splitActivities(plan).map(item=>`<article class="activity"><h3>${escapeHtml(item.moment||'Actividad')} · ${escapeHtml(item.minutes||0)} min</h3>${Array.isArray(item.steps)&&item.steps.length?item.steps.map(step=>`<p><b>${escapeHtml(step.label||'Actividad')} (${escapeHtml(step.minutes||0)} min):</b> ${escapeHtml(step.detail||'')}</p>`).join(''):`<p>${escapeHtml(item.activity||'')}</p>${item.examples?`<p><b>Ejemplo:</b> ${escapeHtml(item.examples)}</p>`:''}${item.assessment?`<p><b>Observación:</b> ${escapeHtml(item.assessment)}</p>`:''}`}</article>`).join('');
  const teacherSupport = `${plan.teacher_explanation?`<section class="plan-block"><h3>Guía conceptual para el docente</h3><p>${escapeHtml(plan.teacher_explanation)}</p></section>`:''}${plan.worked_examples?.length?`<section class="plan-block"><h3>Ejemplos resueltos</h3>${plan.worked_examples.map((example,index)=>`<p><b>Ejemplo ${index+1}:</b> ${escapeHtml(example)}</p>`).join('')}</section>`:''}${plan.glossary?.length?`<section class="plan-block"><h3>Glosario docente</h3>${plan.glossary.map(entry=>`<p><b>${escapeHtml(entry.term)}:</b> ${escapeHtml(entry.definition)}</p>`).join('')}</section>`:''}${plan.extension?`<section class="plan-block"><h3>Reto opcional de ampliación</h3><p>${escapeHtml(plan.extension)}</p></section>`:''}`;
  const checkRows=checklist.map(item=>`<tr><td>${escapeHtml(item)}</td><td>____</td><td>____</td></tr>`).join('');
  $('#planPreview').innerHTML=`<div class="plan-paper"><pre id="printBody" class="print-body"></pre><div id="printStructured" class="print-structured"><div class="plan-heading"><div class="brand" style="justify-content:center;font-size:17px"><img class="mark" src="./logo.svg" alt="">Syllabo</div><p class="eyebrow" style="margin:8px 0 3px">Planificación didáctica</p><h2>Plan de clase | ${escapeHtml(plan.subject||'')}</h2>${badge}</div><div class="plan-meta"><div><b>Docente:</b> ${escapeHtml(plan.teacher||'')}</div><div><b>Grado:</b> ${escapeHtml(plan.grade||'')}</div><div><b>Fecha:</b> ${escapeHtml(prettyDate(plan.lesson_date)||'')}</div><div><b>Duración:</b> ${escapeHtml(plan.duration_minutes||'')} minutos</div>${plan.school?`<div><b>Centro educativo:</b> ${escapeHtml(plan.school)}</div>`:''}${plan.student_age_range?`<div><b>Edad de referencia:</b> ${escapeHtml(plan.student_age_range)}</div>`:''}</div><section class="plan-block"><h3>Indicador de logro</h3><p>${escapeHtml(plan.achievement_indicator||'')}</p><p><b>Contenido:</b> ${escapeHtml(plan.content||'')}</p><p><b>Propósito:</b> ${escapeHtml(plan.objective||'')}</p>${plan.additional_observation?`<p><b>Observación del docente considerada:</b> ${escapeHtml(plan.additional_observation)}</p>`:''}</section><section class="plan-block"><h3>Recursos y preparación</h3><p>${escapeHtml(plan.preparation||plan.resources||'Preparar pizarra, cuaderno y ejemplos del entorno.')}</p></section><section class="plan-block"><h3>Secuencia didáctica</h3>${activities}</section><section class="plan-block worksheet-section"><h3>Ficha y evaluación</h3><p>Nombre: ____________________________________ &nbsp; Fecha: __________________</p><p>${escapeHtml(worksheet.instructions||'Resuelve las actividades y explica tus respuestas.')}</p><ol>${(worksheet.tasks||[]).map(task=>`<li>${escapeHtml(task)}<p class="answer-lines">________________________________________________________________________</p></li>`).join('')}</ol><h3>Lista de cotejo para la docente</h3><table class="checklist-table"><thead><tr><th>Criterio observable</th><th>Sí</th><th>En proceso</th></tr></thead><tbody>${checkRows}</tbody></table></section><section class="plan-block"><h3>Respuestas orientativas y apoyo</h3><p>${escapeHtml(plan.answer_guide||'Las respuestas pueden variar; revisar que se relacionen con el contenido y el indicador.')}</p><p><b>Adecuación:</b> ${escapeHtml(plan.differentiation||'Dar instrucciones paso a paso, ofrecer apoyo visual y permitir responder oralmente o por escrito.')}</p>${plan.teacher_note?`<p><b>Nota docente:</b> ${escapeHtml(plan.teacher_note)}</p>`:''}</section>${teacherSupport}</div><section class="plan-block editor-block"><h3>Editar el plan</h3><textarea id="planEditor" aria-label="Editar plan de clase">${escapeHtml(text)}</textarea><p class="muted">Revisá y ajustá la propuesta antes de guardarla o imprimirla.</p></section><div class="row noprint"><button id="savePlan" class="primary">${currentPlanId?'Guardar cambios':'Guardar en mis planes'}</button><button id="downloadPlanPDF" class="blue">Guardar PDF en mi teléfono</button><button id="printPlan" class="soft-btn">Imprimir</button><button id="discardPlan" class="text-btn">Cerrar</button></div><div id="saveStatus" class="status" aria-live="polite"></div></div>`;
  $('#planEditor').addEventListener('input',event=>{generatedPlanText=event.target.value;});
  $('#savePlan').addEventListener('click',saveCurrentPlan);
  $('#downloadPlanPDF').addEventListener('click', async () => {
    const button=$('#downloadPlanPDF'); button.disabled=true;
    try {
      if (!window.syllaboSavePDF) throw new Error('No se cargó el guardado de PDF. Recargá la página e intentá de nuevo.');
      const data=getPlanFormData();
      const text=$('#planEditor').value;
      if (!text.trim()) throw new Error('El plan está vacío.');
      const id=await window.syllaboSavePDF(text,{id:currentPlanId || button.dataset.localPdfId, subject:data.subject,date:data.lesson_date});
      button.dataset.localPdfId=id;
      setStatus('#saveStatus','PDF guardado en este teléfono. Abrilo desde «Mis PDF sin internet». Para conservarlo en tu cuenta, usá también «Guardar en mis planes».','ok');
    } catch(error) {setStatus('#saveStatus',error.message || 'No se pudo guardar el PDF. Revisá el espacio disponible.','error');}
    finally {button.disabled=false;}
  });
  $('#printPlan').addEventListener('click',()=>{generatedPlanText=$('#planEditor').value;const paper=$('#planPreview .plan-paper');const edited=generatedPlanText.trim()!==structuredText.trim();paper.classList.toggle('print-text-only',edited);$('#printBody').textContent=generatedPlanText;window.print();paper.classList.remove('print-text-only');});
  $('#discardPlan').addEventListener('click',()=>{$('#planPreview').innerHTML='';currentPlanId=null;generatedPlanText='';generatedPlanData=null;});
}
async function saveCurrentPlan() {
  const data = getPlanFormData();
  data.evaluation_criteria = generatedPlanData?.evaluation_criteria || suggestEvaluationCriteria(data);
  const editor = $('#planEditor');
  if (editor) generatedPlanText = editor.value;
  const { additional_observation, ...lessonColumns } = data;
  const row = { ...lessonColumns, plan_body:{ text:generatedPlanText, plan:generatedPlanData, source:generatedPlanSource, additional_observation }, updated_at:new Date().toISOString() };
  setStatus('#saveStatus', 'Guardando…'); $('#savePlan').disabled = true;
  try {
    let query = supabase.from('lesson_plans');
    if (currentPlanId) query = query.update(row).eq('id', currentPlanId);
    else query = query.insert(row);
    const { data:saved, error } = await query.select().single();
    if (error) throw error;
    currentPlanId = saved.id; setStatus('#saveStatus', 'Plan guardado en tu cuenta.', 'ok'); $('#savePlan').textContent = 'Guardar cambios';
    await loadHome();
  } catch(error) { setStatus('#saveStatus', friendlyError(error), 'error'); }
  finally { $('#savePlan').disabled = false; }
}
function startPlanFromClass({ date = localISODate(), subject = '', grade = '', duration = 45 } = {}) {
  const form = $('#planForm');
  form.reset(); form.elements.lesson_date.value = date; form.elements.duration_minutes.value = duration; planResourcesOverride=null;
  planningGradeOverride = grade || currentProfile?.primary_grade || '';
  if (subject) setPlanSubject(subject);
  updatePlanAgeHint(currentProfile);
  form.classList.remove('hidden'); $('#planReview').classList.add('hidden');
  $('#planPreview').innerHTML = ''; $('#aiState').textContent = 'Se generará una propuesta con IA.'; generatedPlanSource='guided'; setStatus('#planStatus');
  currentPlanId = null; generatedPlanText = ''; generatedPlanData = null; pendingPlanData = null;
}
$('#newPlan').addEventListener('click', () => startPlanFromClass());

async function loadPlans() {
  $('#plansList').innerHTML = '<div class="empty">Cargando tus planes…</div>';
  let data, error;
  try { ({ data, error } = await supabase.from('lesson_plans').select('id,subject,grade,topic,lesson_date,content,achievement_indicator,evaluation_criteria,duration_minutes,resources,plan_body,created_at').order('lesson_date', { ascending:false }).order('created_at', { ascending:false })); }
  catch (err) { $('#plansList').innerHTML = `<div class="empty">${escapeHtml(friendlyError(err))}</div>`; return; }
  if (error) { $('#plansList').innerHTML = `<div class="empty">${escapeHtml(friendlyError(error))}</div>`; return; }
  allPlans = data || []; populatePlanMonths(allPlans); populatePlanSubjects(allPlans); renderPlanList();
}
function populatePlanMonths(plans) {
  const select = $('#planMonth'); const selected = select.value;
  const months = [...new Set(plans.map(p => p.lesson_date?.slice(0,7)).filter(Boolean))];
  select.innerHTML = '<option value="">Todas las fechas</option>' + months.map(month => `<option value="${month}">${escapeHtml(new Date(`${month}-15T12:00:00`).toLocaleDateString('es-NI',{month:'long',year:'numeric'}))}</option>`).join('');
  if (months.includes(selected)) select.value = selected;
}
function populatePlanSubjects(plans) { const select=$('#planSubjectFilter'); const selected=select.value; const values=[...new Set(plans.map(p=>p.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));select.innerHTML='<option value="">Todas las asignaturas</option>'+values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');if(values.includes(selected))select.value=selected; }
function subjectKey(value) { return window.SyllaboSubjects.normalizeName(value || 'Sin asignatura'); }
function sortPlansNewest(plans) { return [...plans].sort((a,b) => String(b.lesson_date||'').localeCompare(String(a.lesson_date||'')) || String(b.created_at||'').localeCompare(String(a.created_at||''))); }
function planFolders(plans) {
  const groups = new Map();
  for (const plan of plans) { const key=subjectKey(plan.subject); if (!groups.has(key)) groups.set(key,{key,name:plan.subject||'Sin asignatura',plans:[]}); groups.get(key).plans.push(plan); }
  return [...groups.values()].map(folder=>({...folder,plans:sortPlansNewest(folder.plans)})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
let activePlanFolder = '';
function renderPlanList() {
  const search=$('#planSearch').value.trim().toLocaleLowerCase(); const month=$('#planMonth').value; const exactDate=$('#planExactDate').value;
  const matches=plan=> (!exactDate||plan.lesson_date===exactDate) && (!month||String(plan.lesson_date||'').startsWith(month)) && (!search||`${plan.subject} ${plan.grade} ${plan.content||plan.topic}`.toLocaleLowerCase().includes(search));
  const folders=planFolders(allPlans); const current=folders.find(folder=>folder.key===activePlanFolder);
  if(activePlanFolder&&!current)activePlanFolder='';
  $('#planFolderHeading').classList.toggle('hidden',!current);
  $('#plansList').classList.toggle('subject-folders',!current);
  $('#plansList').classList.toggle('plan-timeline',!!current);
  $('#planLocation').textContent=current?current.name:'Asignaturas';
  if(!current) {
    const palette=['#c8bbf4','#f4b8dc','#e8ef72','#ff936b','#afd0ed','#9dcbb7'];
    const visible=folders.filter(folder=>folder.plans.some(matches));
    $('#planResults').textContent=`${visible.length} ${visible.length===1?'asignatura':'asignaturas'} · Elegí una carpeta para ver su línea de tiempo.`;
    $('#plansList').innerHTML=visible.length?visible.map((folder,index)=>`<button class="subject-folder" style="--folder-color:${palette[index%palette.length]}" data-folder="${escapeHtml(folder.key)}"><h2>${escapeHtml(folder.name)}</h2><span class="folder-symbol" aria-hidden="true">${['▤','✎','✳','◈','≋','✦'][index%6]}</span><span class="folder-count">${folder.plans.length} ${folder.plans.length===1?'plan':'planes'}</span><small>Último plan: ${escapeHtml(prettyDate(folder.plans[0].lesson_date))}</small></button>`).join(''):'<div class="empty">No hay planes para mostrar. Creá un plan o ajustá los filtros.</div>';
    $('#plansList').querySelectorAll('[data-folder]').forEach(button=>button.addEventListener('click',()=>{activePlanFolder=button.dataset.folder;renderPlanList();}));return;
  }
  $('#activeFolderName').textContent=current.name;
  const plans=current.plans.filter(matches);
  $('#activeFolderCount').textContent=`${plans.length} de ${current.plans.length} planes · Más recientes primero`;
  $('#planResults').textContent=`${plans.length} ${plans.length===1?'plan encontrado':'planes encontrados'}${exactDate?' para el '+prettyDate(exactDate):''}. Ordenados del más reciente al más antiguo.`;
  const days=new Map(); for(const plan of plans){if(!days.has(plan.lesson_date))days.set(plan.lesson_date,[]);days.get(plan.lesson_date).push(plan);}
  $('#plansList').innerHTML=plans.length?[...days].map(([date,dayPlans])=>{
    const day=localDateFromKey(date);const weekday=day.toLocaleDateString('es-NI',{weekday:'long'});const monthYear=day.toLocaleDateString('es-NI',{month:'long',year:'numeric'});
    return `<section class="timeline-day" aria-label="${escapeHtml(weekday+', '+prettyDate(date))}"><header class="timeline-date" style="position:static;box-shadow:none"><span class="timeline-date-number">${day.getDate()}</span><div><h2>${escapeHtml(weekday)}</h2><time datetime="${escapeHtml(date)}">${escapeHtml(monthYear)}</time></div><span class="pill">${date===localISODate()?'Hoy · ':''}${dayPlans.length} ${dayPlans.length===1?'plan':'planes'}</span></header>${dayPlans.map(plan=>`<article class="plan-list-row"><div><h3>${escapeHtml(plan.content||plan.topic||'Plan de clase')}</h3><p class="muted">${escapeHtml(plan.grade)} · ${escapeHtml(plan.duration_minutes)} minutos</p></div><div class="row"><button class="soft-btn" data-open-plan="${plan.id}">Abrir / editar</button><button class="danger-btn" data-delete-plan="${plan.id}" aria-label="Eliminar plan ${escapeHtml(plan.topic)}">Eliminar</button></div></article>`).join('')}</section>`;
  }).join(''):'<div class="empty">No hay planes para esa fecha en esta carpeta. Probá otra fecha o pulsá «Limpiar búsqueda».</div>';
  plans.forEach(plan=>$(`[data-open-plan="${plan.id}"]`).addEventListener('click',()=>openSavedPlan(plan)));
  plans.forEach(plan=>$(`[data-delete-plan="${plan.id}"]`).addEventListener('click',()=>deletePlan(plan)));
}
function returnToPlanFolders(){activePlanFolder='';renderPlanList();}
$('#backToFolders').addEventListener('click',returnToPlanFolders);
$('#plansRoot').addEventListener('click',returnToPlanFolders);
$('#planExactDate').addEventListener('change',()=>{if($('#planExactDate').value)$('#planMonth').value='';renderPlanList();});
$('#clearPlanFilters').addEventListener('click',()=>{$('#planSearch').value='';$('#planMonth').value='';$('#planExactDate').value='';renderPlanList();});
$('#planSearch').addEventListener('input',renderPlanList); $('#planMonth').addEventListener('change',()=>{$('#planExactDate').value='';renderPlanList();});
async function openSavedPlan(plan) {
  currentPlanId = plan.id;
  const form = $('#planForm');
  planningGradeOverride = plan.grade || currentProfile?.primary_grade || '';
  updatePlanAgeHint(currentProfile);
  setPlanSubject(plan.subject);
  for (const key of ['subject','lesson_date','content','achievement_indicator','duration_minutes']) form.elements[key].value = plan[key] ?? '';
  planResourcesOverride=plan.resources ?? null;
  form.classList.remove('hidden'); $('#planReview').classList.add('hidden');
  const profile = await ensureProfile();
  const body = plan.plan_body || {};
  const draft = body.plan || null;
  form.elements.additional_observation.value = body.additional_observation || draft?.additional_observation || '';
  generatedPlanSource = body.source || 'guided';
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

if (!$('#establishSchedule').dataset.uiFallback) $('#establishSchedule').addEventListener('click', () => {
  const form=$('#scheduleForm'); form.classList.toggle('hidden');
  $('#establishSchedule').textContent=form.classList.contains('hidden')?'Establecer horario':'Cerrar formulario';
  if(!form.classList.contains('hidden')) form.elements.subject.focus();
});
$('#scheduleForm').addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget; const values=Object.fromEntries(new FormData(form).entries());
  values.weekday=Number(values.weekday); values.duration_minutes=Number(values.duration_minutes); values.start_time=values.start_time || null;
  const button=form.querySelector('button[type="submit"], button:not([type])') || form.querySelector('button'); button.disabled=true;
  setStatus('#scheduleStatus','Guardando clase…');
  try {
    const {error}=await supabase.from('class_schedules').insert(values);
    if(error) throw error;
    form.reset(); form.elements.duration_minutes.value=45;
    populateScheduleGradeOptions(currentProfile);
    setStatus('#scheduleStatus','Clase agregada a tu horario.','ok');
    await loadSchedule(); await loadHome(); await loadCalendar();
  } catch(error) { setStatus('#scheduleStatus',friendlyError(error),'error'); }
  finally { button.disabled=false; }
});
async function loadSchedule() {
  $('#scheduleList').innerHTML='<div class="empty">Cargando agenda…</div>';
  let data,error;
  try { ({data,error}=await supabase.from('class_schedules').select('*').order('weekday').order('start_time')); }
  catch(err) { $('#scheduleList').innerHTML=`<div class="empty">${escapeHtml(friendlyError(err))}</div>`;return; }
  if(error){$('#scheduleList').innerHTML=`<div class="empty">${escapeHtml(friendlyError(error))}</div>`;return;}
  if(!data?.length){$('#scheduleList').innerHTML='<div class="empty">Todavía no configuraste tus bloques de clase. Usá “Establecer horario” para comenzar.</div>';$('#scheduleForm').classList.add('hidden');$('#establishSchedule').textContent='Establecer horario';return;}
  $('#establishSchedule').textContent=$('#scheduleForm').classList.contains('hidden')?'Agregar bloque de clase':'Cerrar formulario';
  $('#scheduleList').innerHTML=Object.entries(weekdays).map(([day,name])=>{
    const items=data.filter(item=>item.weekday===Number(day)); if(!items.length)return '';
    return `<section class="agenda-day"><h3>${name}</h3>${items.map(item=>`<div class="row" style="padding:8px 0;border-top:1px solid var(--line)"><span class="agenda-hour">${escapeHtml((item.start_time||'').slice(0,5))}</span><span><b>${escapeHtml(item.subject)}</b> · ${escapeHtml(item.grade)}${item.section?` · Sección ${escapeHtml(item.section)}`:''}</span><span class="muted">${escapeHtml(item.duration_minutes)} min</span><button class="danger-btn" data-remove-schedule="${item.id}">Quitar</button></div>`).join('')}</section>`;
  }).join('');
  data.forEach(item=>$(`[data-remove-schedule="${item.id}"]`).addEventListener('click',async()=>{
    if(!confirm(`¿Quitar ${item.subject} del horario?`))return;
    const {error:deleteError}=await supabase.from('class_schedules').delete().eq('id',item.id);
    if(deleteError)setStatus('#scheduleStatus',friendlyError(deleteError),'error');else{setStatus('#scheduleStatus','Clase eliminada de tu agenda.','ok');await loadSchedule();await loadHome();await loadCalendar();}
  }));
}


const calendarWeekdays=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
$('#calendarView').addEventListener('change',renderCalendar);
$('#calendarPrev').addEventListener('click',()=>{const view=$('#calendarView').value;if(view==='month')calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1,12);else calendarDate.setDate(calendarDate.getDate()-(view==='week'?7:1));loadCalendar();});
$('#calendarNext').addEventListener('click',()=>{const view=$('#calendarView').value;if(view==='month')calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1,12);else calendarDate.setDate(calendarDate.getDate()+(view==='week'?7:1));loadCalendar();});
$('#calendarToday').addEventListener('click',()=>{calendarDate=new Date();loadCalendar();});
if (!$('#newCalendarEvent').dataset.uiFallback) $('#newCalendarEvent').addEventListener('click',()=>openCalendarEventForm({start_date:dateKey(calendarDate)}));
if (!$('#cancelCalendarEvent').dataset.uiFallback) $('#cancelCalendarEvent').addEventListener('click',()=>$('#calendarEventFormWrap').classList.add('hidden'));
$('#calendarEventForm').addEventListener('submit',async event=>{
  event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());const id=data.id;delete data.id;
  data.start_time=data.start_time||null;data.end_date=data.end_date||null;data.updated_at=new Date().toISOString();
  if(data.end_date&&data.end_date<data.start_date){setStatus('#eventStatus','La fecha de fin debe ser igual o posterior a la fecha de inicio.','error');return;}
  const form=event.currentTarget;const button=form.querySelector('button[type="submit"], button:not([type])');button.disabled=true;setStatus('#eventStatus','Guardando fecha…');
  try {
    const query=supabase.from('calendar_events');const result=id?await query.update(data).eq('id',id).select().single():await query.insert(data).select().single();
    if(result.error)throw result.error;
    $('#calendarEventFormWrap').classList.add('hidden');setStatus('#eventStatus','Fecha guardada.','ok');await loadCalendar();
  } catch(error) { setStatus('#eventStatus',friendlyError(error),'error'); }
  finally { button.disabled=false; }
});
function openCalendarEventForm(eventData={}) {
  const form=$('#calendarEventForm');form.reset();form.elements.id.value=eventData.id||'';
  for(const key of ['title','event_type','start_date','end_date','start_time','notes'])if(eventData[key]!=null)form.elements[key].value=eventData[key];
  $('#eventFormTitle').textContent=eventData.id?'Editar actividad o feriado':'Agregar actividad o feriado';$('#calendarEventFormWrap').classList.remove('hidden');setStatus('#eventStatus');$('#calendarEventForm').scrollIntoView({behavior:'smooth',block:'center'});
}
async function loadCalendar() {
  if(!currentUser)return;
  let plans,events,schedule,pErr,eErr,sErr;
  try {
    [{data:plans,error:pErr},{data:events,error:eErr},{data:schedule,error:sErr}]=await Promise.all([
      supabase.from('lesson_plans').select('*').order('lesson_date'),
      supabase.from('calendar_events').select('*').order('start_date'),
      supabase.from('class_schedules').select('id,weekday,start_time,subject,grade,section,duration_minutes').order('weekday').order('start_time')
    ]);
  } catch(error) { $('#calendarBoard').innerHTML=`<div class="empty">${escapeHtml(friendlyError(error))}</div>`;return; }
  const error=pErr||eErr||sErr;if(error){$('#calendarBoard').innerHTML=`<div class="empty">${escapeHtml(friendlyError(error))}</div>`;return;}
  allCalendarPlans=plans||[];allCalendarEvents=events||[];allCalendarSchedule=schedule||[];renderCalendar();
}
function getCalendarItems(date) {
  const key=dateKey(date),weekday=date.getDay();
  const holiday=allCalendarEvents.some(item=>item.event_type==='feriado'&&item.start_date<=key&&(item.end_date||item.start_date)>=key);
  const classes=holiday?[]:allCalendarSchedule.filter(item=>item.weekday===weekday).map(item=>({kind:'class',title:`${item.subject} · ${item.grade}`,time:(item.start_time||'').slice(0,5),item}));
  const plans=allCalendarPlans.filter(item=>item.lesson_date===key).map(item=>({kind:'plan',title:`Plan: ${item.subject} · ${item.topic}`,time:'',item}));
  const events=allCalendarEvents.filter(item=>item.start_date<=key&&(item.end_date||item.start_date)>=key).map(item=>({kind:item.event_type==='feriado'?'holiday':'event',title:item.title,time:(item.start_time||'').slice(0,5),item}));
  return [...classes,...events,...plans].sort((a,b)=>Number(b.kind==='holiday')-Number(a.kind==='holiday')||(a.time||'00:00').localeCompare(b.time||'00:00'));
}
function calendarEntry(item, date) {
  const className=item.kind==='holiday'?'holiday':item.kind==='plan'?'plan':'';
  const label=`${item.kind==='holiday'?'Feriado: ':''}${item.time?`${item.time} `:''}${item.title}`;
  const action=item.kind==='event'||item.kind==='holiday'?`data-calendar-event="${item.item.id}"`:item.kind==='plan'?`data-calendar-plan="${item.item.id}"`:`data-calendar-class="${escapeHtml(dateKey(date))}" data-subject="${escapeHtml(item.item.subject)}" data-grade="${escapeHtml(item.item.grade)}" data-duration="${item.item.duration_minutes}"`;
  return `<button class="calendar-entry ${className}" ${action} title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}
function renderCalendar() {
  if(!$('#calendarBoard'))return;const view=$('#calendarView').value;const monthName=calendarDate.toLocaleDateString('es-NI',{month:'long',year:'numeric'});
  if(view==='month'){$('#calendarHeading').textContent=monthName;renderCalendarMonth();}
  else if(view==='week'){const start=new Date(calendarDate);start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(start.getDate()+6);$('#calendarHeading').textContent=`${prettyDate(dateKey(start))} – ${prettyDate(dateKey(end))}`;renderCalendarAgenda(start,7);}
  else{$('#calendarHeading').textContent=calendarDate.toLocaleDateString('es-NI',{weekday:'long',day:'numeric',month:'long',year:'numeric'});renderCalendarAgenda(calendarDate,1);}
  bindCalendarEntries();
}
function renderCalendarMonth() {
  const first=new Date(calendarDate.getFullYear(),calendarDate.getMonth(),1,12);const offset=(first.getDay()+6)%7;const start=new Date(first);start.setDate(first.getDate()-offset);const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
  $('#calendarBoard').innerHTML=`<div class="calendar-board-scroll"><div class="calendar-weekdays">${calendarWeekdays.map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-grid">${days.map(date=>{const items=getCalendarItems(date);return `<div class="calendar-cell ${date.getMonth()!==calendarDate.getMonth()?'outside':''} ${dateKey(date)===localISODate()?'today':''} ${items.some(item=>item.kind==='holiday')?'has-holiday':''}"><div class="calendar-cell-head"><span>${date.getDate()}</span><button class="text-btn" data-add-date="${dateKey(date)}" aria-label="Agregar evento">+</button></div>${items.slice(0,3).map(item=>calendarEntry(item,date)).join('')}${items.length>3?`<button class="calendar-more" data-show-day="${dateKey(date)}">+${items.length-3} más</button>`:''}</div>`;}).join('')}</div></div>`;
}
function blockEnd(time, duration) { if (!time) return '';const [h,m]=time.split(':').map(Number);const total=h*60+m+Number(duration||45);return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`; }
function renderCalendarAgenda(start,count) {
  const days=Array.from({length:count},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
  $('#calendarBoard').innerHTML=days.map(date=>{const items=getCalendarItems(date);return `<section class="agenda-day"><div class="section-title"><h3>${date.toLocaleDateString('es-NI',{weekday:'long',day:'numeric',month:'long'})}</h3><button class="text-btn" data-add-date="${dateKey(date)}">+ Agregar fecha</button></div>${items.length?items.map(item=>`<div class="agenda-row ${item.kind==='holiday'?'holiday':''}"><span class="agenda-hour">${escapeHtml(item.time||(item.kind==='plan'?'Plan':'Todo el día'))}${item.kind==='class'&&item.time?`<br><small>a ${blockEnd(item.time,item.item.duration_minutes)}</small>`:''}</span><div><strong>${escapeHtml(item.kind==='holiday'?'Feriado: '+item.title:item.title)}</strong>${item.kind==='class'?`<p class="muted">${escapeHtml(item.item.duration_minutes)} min${item.item.section?` · Sección ${escapeHtml(item.item.section)}`:''}</p>`:''}</div><div class="row">${item.kind==='event'||item.kind==='holiday'?`<button class="soft-btn" data-edit-event="${item.item.id}">Editar</button><button class="danger-btn" data-delete-event="${item.item.id}">Eliminar</button>`:item.kind==='class'?`<button class="soft-btn" data-calendar-class="${dateKey(date)}" data-subject="${escapeHtml(item.item.subject)}" data-grade="${escapeHtml(item.item.grade)}" data-duration="${item.item.duration_minutes}">Planear</button>`:`<button class="soft-btn" data-calendar-plan="${item.item.id}">Abrir plan</button>`}</div></div>`).join(''):'<p class="muted">Sin clases ni fechas registradas.</p>'}</section>`;}).join('');
}
function bindCalendarEntries() {
  $('#calendarBoard').querySelectorAll('[data-show-day]').forEach(button=>button.addEventListener('click',()=>{calendarDate=localDateFromKey(button.dataset.showDay);$('#calendarView').value='day';renderCalendar();}));
  $('#calendarBoard').querySelectorAll('[data-add-date]').forEach(button=>button.addEventListener('click',()=>openCalendarEventForm({start_date:button.dataset.addDate})));
  $('#calendarBoard').querySelectorAll('[data-calendar-event]').forEach(button=>button.addEventListener('click',()=>{const event=allCalendarEvents.find(item=>item.id===button.dataset.calendarEvent);if(event)openCalendarEventForm(event);}));
  $('#calendarBoard').querySelectorAll('[data-edit-event]').forEach(button=>button.addEventListener('click',()=>{const event=allCalendarEvents.find(item=>item.id===button.dataset.editEvent);if(event)openCalendarEventForm(event);}));
  $('#calendarBoard').querySelectorAll('[data-delete-event]').forEach(button=>button.addEventListener('click',async()=>{const event=allCalendarEvents.find(item=>item.id===button.dataset.deleteEvent);if(!event||!confirm(`¿Eliminar “${event.title}” del calendario?`))return;const {error}=await supabase.from('calendar_events').delete().eq('id',event.id);if(error)alert(friendlyError(error));else loadCalendar();}));
  $('#calendarBoard').querySelectorAll('[data-calendar-plan]').forEach(button=>button.addEventListener('click',()=>{const plan=allCalendarPlans.find(item=>item.id===button.dataset.calendarPlan);if(plan)openSavedPlan(plan);}));
  $('#calendarBoard').querySelectorAll('[data-calendar-class]').forEach(button=>button.addEventListener('click',()=>{startPlanFromClass({date:button.dataset.calendarClass,subject:button.dataset.subject,grade:button.dataset.grade,duration:Number(button.dataset.duration)});showPage('crear');}));
}

$('#profileForm').addEventListener('submit', async event => {
  event.preventDefault(); setStatus('#profileStatus','Guardando perfil…');
  try { await saveTeacherProfile(event.currentTarget,false); setStatus('#profileStatus','Perfil guardado.','ok'); }
  catch(error) { setStatus('#profileStatus',friendlyError(error),'error'); }
});
async function loadProfile() {
  let data,error;
  try { ({data,error}=await supabase.from('teacher_profiles').select('*').eq('id',currentUser.id).maybeSingle()); }
  catch(err) { setStatus('#profileStatus',friendlyError(err),'error'); return; }
  if(error){setStatus('#profileStatus',friendlyError(error),'error');return;}
  if(data){currentProfile=data;fillTeacherForm($('#profileForm'),data);}
}

function localDateFromKey(value) { const [year,month,day]=value.split('-').map(Number); return new Date(year,month-1,day,12); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function samePlan(plan,date,subject,grade) { return plan.lesson_date===date && plan.subject.toLocaleLowerCase()===subject.toLocaleLowerCase() && String(plan.grade).toLocaleLowerCase()===String(grade).toLocaleLowerCase(); }
async function loadHome() {
  const [{data:plans,error:plansError},{data:schedule,error:scheduleError}]=await Promise.all([
    supabase.from('lesson_plans').select('id,subject,grade,topic,lesson_date').order('lesson_date',{ascending:true}),
    supabase.from('class_schedules').select('id,weekday,start_time,subject,grade,section,duration_minutes').order('weekday').order('start_time'),
  ]);
  if(plansError||scheduleError){$('#homeSchedule').innerHTML=`<div class="empty">${escapeHtml(friendlyError(plansError||scheduleError))}</div>`;return;}
  const {data:holidays}=await supabase.from('calendar_events').select('start_date,end_date').eq('event_type','feriado');
  const nonSchoolDays=holidays||[];
  const currentMonth=localISODate().slice(0,7);
  $('#statPlans').textContent=plans?.length||0;$('#statMonth').textContent=plans?.filter(p=>p.lesson_date.startsWith(currentMonth)).length||0;$('#statClasses').textContent=schedule?.length||0;
  if(!schedule?.length){$('#homeSchedule').innerHTML='<div class="empty">Configurá tu horario para visualizar aquí la agenda de clases.</div>';$('#planningAlerts').innerHTML='<div class="empty">Agregá primero tu horario semanal para recibir alertas de planificación.</div>';return;}
  const today=new Date(); today.setHours(12,0,0,0); const upcoming=[]; const classDates=[];
  for(let offset=0;offset<15&&classDates.length<7;offset++) { const date=new Date(today);date.setDate(today.getDate()+offset); const weekday=date.getDay();if(weekday<1||weekday>5)continue;const dayKey=dateKey(date);if(nonSchoolDays.some(event=>event.start_date<=dayKey&&(event.end_date||event.start_date)>=dayKey))continue;for(const item of schedule.filter(x=>x.weekday===weekday))classDates.push({date,item}); }
  const classes=classDates.slice(0,6);
  $('#homeSchedule').innerHTML=classes.map(({date,item})=>`<article class="item"><div class="row"><span class="pill">${escapeHtml(date.toLocaleDateString('es-NI',{weekday:'long',day:'numeric',month:'short'}))}</span><b>${escapeHtml((item.start_time||'').slice(0,5))}</b><span>${escapeHtml(item.subject)} · ${escapeHtml(item.grade)}${item.section?` · ${escapeHtml(item.section)}`:''}</span><span class="muted">${escapeHtml(item.duration_minutes)} min</span></div></article>`).join('');
  for(const {date,item} of classDates){const key=dateKey(date);if(!plans.some(plan=>samePlan(plan,key,item.subject,item.grade)))upcoming.push({date,key,item});}
  const alerts=upcoming.slice(0,5);
  $('#planningAlerts').innerHTML=alerts.length?alerts.map(({date,key,item})=>`<article class="item"><div class="row"><span class="pill">Por planear</span><b>${escapeHtml(date.toLocaleDateString('es-NI',{weekday:'short',day:'numeric',month:'short'}))}</b><span>${escapeHtml(item.subject)} · ${escapeHtml(item.grade)}</span><button class="blue" data-plan-class="${escapeHtml(key)}" data-subject="${escapeHtml(item.subject)}" data-grade="${escapeHtml(item.grade)}" data-duration="${item.duration_minutes}">Crear plan</button></div></article>`).join(''):'<div class="empty">¡Bien! Las próximas clases ya tienen un plan guardado.</div>';
  $('#planningAlerts').querySelectorAll('[data-plan-class]').forEach(button=>button.addEventListener('click',()=>{startPlanFromClass({date:button.dataset.planClass,subject:button.dataset.subject,grade:button.dataset.grade,duration:Number(button.dataset.duration)});showPage('crear');}));
}

function showRecoveryForm() {
  recoveringPassword = true;
  $('#auth').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#onboarding').classList.add('hidden'); document.body.classList.remove('onboarding-open');
  $('#authForm').classList.add('hidden'); $('#forgotForm').classList.add('hidden'); $('#recoveryForm').classList.remove('hidden');
  setStatus('#authStatus','Elegí una contraseña nueva de al menos 8 caracteres.');
  requestAnimationFrame(() => $('#recoveryForm').elements.password.focus());
}
$('#planForm').elements.lesson_date.value = localISODate();
$('#planForm').elements.lesson_date.addEventListener('change', async event => {
  if (!currentUser || !event.target.value) return;
  const weekday = new Date(`${event.target.value}T12:00:00`).getDay();
  if (weekday < 1 || weekday > 5) return;
  const { data } = await supabase.from('class_schedules').select('subject,grade,duration_minutes').eq('weekday',weekday).order('start_time');
  if (!data?.length) return;
  const form = $('#planForm');
  const selected = form.elements.subject.value ? data.find(item => item.subject === form.elements.subject.value) : data[0];
  if (selected && !form.elements.subject.value) {
    setPlanSubject(selected.subject);
  }
  planningGradeOverride = selected?.grade || currentProfile?.primary_grade || '';
  updatePlanAgeHint(currentProfile);
  if (selected && (!form.elements.duration_minutes.value || form.elements.duration_minutes.value === '45')) form.elements.duration_minutes.value = selected.duration_minutes;
});
window.syllaboAppReady = true;
if (recoveringPassword) showRecoveryForm();
if (!supabase) {
  setStatus('#authStatus', 'No se pudo cargar el servicio de acceso y datos. Revisá tu conexión y recargá la página.', 'error');
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { showRecoveryForm(); return; }
    if (session?.user && !recoveringPassword && $('#app').classList.contains('hidden')) setTimeout(() => openApp(session.user), 0);
  });
  try {
    const { data:{ session } } = await supabase.auth.getSession();
    if (session?.user && !recoveringPassword && $('#app').classList.contains('hidden')) await openApp(session.user);
  } catch (error) { setStatus('#authStatus', `No se pudo restaurar tu sesión: ${friendlyError(error)}`, 'error'); }
}



