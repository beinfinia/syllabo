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
let allPlans = [];

let currentProfile = null;
let planningGradeOverride = '';
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
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== page));
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (page === 'planes') loadPlans();
  if (page === 'horario') loadSchedule();
  if (page === 'calendario') loadCalendar();
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
const subjectCatalog = {
  primary: [
    'Creciendo en Valores','Derecho y Dignidad de las Mujeres','Educación para Aprender, Emprender, Prosperar',
    'Estudios Sociales (Historia y Geografía)','Educación Física y Práctica Deportiva','Lengua y Literatura',
    'Lengua Extranjera (Inglés)','Talleres de Arte y Cultura','Matemática',
    'Ciencias Naturales (Ciencias de la Vida y el Ambiente)','Conociendo mi Mundo'
  ],
  secondary: [
    'Creciendo en Valores','Derechos y Dignidad de las Mujeres','Educación Física y Práctica Deportiva',
    'Educación para Aprender, Emprender, Prosperar','Ciencias Sociales (Geografía)','Ciencias Sociales (Historia)',
    'Ciencias Sociales (Economía)','Ciencias Sociales (Sociología)','Ciencias Sociales (Filosofía)',
    'Lengua y Literatura','Lengua Extranjera (Inglés y Francés)','Talleres de Arte y Cultura',
    'Ciencias Naturales (Ciencias de la Vida y el Ambiente)','Química','Física','Biología','Matemática'
  ]
};
function getSubjectsFor(modality, grade) {
  const number = Number(String(grade || '').match(/\d+/)?.[0] || 0);
  if (modality === 'primaria') {
    if (!number && String(grade).toLowerCase() !== 'multigrado') return [];
    const shared = subjectCatalog.primary.filter(subject => !subject.startsWith('Estudios Sociales') && !subject.startsWith('Ciencias Naturales') && subject !== 'Conociendo mi Mundo');
    if (String(grade).toLowerCase() === 'multigrado') return [...shared, 'Conociendo mi Mundo', 'Estudios Sociales (Historia y Geografía)', 'Ciencias Naturales (Ciencias de la Vida y del Ambiente)'];
    return number <= 2 ? [...shared, 'Conociendo mi Mundo'] : [...shared, 'Estudios Sociales (Historia y Geografía)', 'Ciencias Naturales (Ciencias de la Vida y del Ambiente)'];
  }
  if (modality === 'secundaria') {
    if (String(grade).toLowerCase() === 'multigrado') return subjectCatalog.secondary;
    if (!number) return [];
    const gradeSpecific = new Set([
      'Ciencias Sociales (Geografía)','Ciencias Sociales (Historia)','Ciencias Sociales (Economía)',
      'Ciencias Sociales (Sociología)','Ciencias Sociales (Filosofía)','Talleres de Arte y Cultura',
      'Ciencias Naturales (Ciencias de la Vida y el Ambiente)','Química','Física','Biología'
    ]);
    const shared = subjectCatalog.secondary.filter(subject => !gradeSpecific.has(subject));
    if (number >= 7 && number <= 9) return [...shared, 'Ciencias Sociales (Geografía)', 'Ciencias Sociales (Historia)', 'Talleres de Arte y Cultura', 'Ciencias Naturales (Ciencias de la Vida y el Ambiente)'];
    if (number === 10) return [...shared, 'Ciencias Sociales (Economía)', 'Química', 'Física'];
    if (number === 11) return [...shared, 'Ciencias Sociales (Sociología)', 'Ciencias Sociales (Filosofía)', 'Física', 'Biología'];
    return [];
  }
  return [];
}
function getSelectedSubjects(form) { return [...form.querySelectorAll('input[name="subject_choice"]:checked')].map(input => input.value); }
function populateSubjectChoices(form, selected = getSelectedSubjects(form)) {
  const container = form.querySelector('[data-subject-choices]'); if (!container) return;
  const available = getSubjectsFor(form.elements.modality?.value || '', form.elements.primary_grade?.value || '');
  const known = new Set([...subjectCatalog.primary, ...subjectCatalog.secondary]);
  const custom = selected.filter(subject => !known.has(subject));
  const subjects = [...new Set([...available, ...custom])];
  container.innerHTML = subjects.length ? subjects.map(subject => `<label class="choice"><input type="checkbox" name="subject_choice" value="${escapeHtml(subject)}" ${selected.includes(subject)?'checked':''}>${escapeHtml(subject)}</label>`).join('') : '<span class="muted">Elegí modalidad y grado para ver las materias sugeridas. Podés agregar una asignatura propia abajo.</span>';
}
function addCustomSubject(form) {
  const input = form.elements.custom_subject; const value = String(input.value || '').trim().replace(/\s+/g, ' ');
  if (!value) { input.focus(); return; }
  const selected = getSelectedSubjects(form);
  const duplicate = [...subjectCatalog.primary, ...subjectCatalog.secondary, ...selected].some(subject => subject.toLocaleLowerCase() === value.toLocaleLowerCase());
  if (duplicate) { input.setCustomValidity('Esa materia ya está en la lista.'); input.reportValidity(); input.setCustomValidity(''); return; }
  populateSubjectChoices(form, [...selected, value]); input.value = '';
}
function populateGradeChoices(form, modality, selected = '') {
  const field = form.elements.primary_grade; if (!field) return;
  const max = modality === 'primaria' ? 6 : modality === 'secundaria' ? 11 : 0;
  const first = modality === 'secundaria' ? 7 : 1;
  const options = max ? Array.from({length:max-first+1},(_,i)=>`${first+i}° grado`) : [];
  field.innerHTML = '<option value="">Seleccioná un grado</option>' + options.map(value=>`<option value="${value}">${value}</option>`).join('') + '<option value="Multigrado">Multigrado</option>';
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
  const known = new Set([...subjectCatalog.primary, ...subjectCatalog.secondary]);
  const custom = (profile?.subjects || []).filter(subject => !known.has(subject));
  const options = [...new Set([...getSubjectsFor(profile?.modality || '', grade || profile?.primary_grade || ''), ...custom])];
  list.innerHTML = options.map(subject => `<option value="${escapeHtml(subject)}"></option>`).join('');
}
for (const formId of ['onboardingForm','profileForm']) {
  const form = $(`#${formId}`);
  populateSubjectChoices(form);
  form.elements.modality.addEventListener('change', () => { populateGradeChoices(form, form.elements.modality.value); });
  form.elements.primary_grade.addEventListener('change', () => populateSubjectChoices(form));
}
$('#scheduleForm').elements.grade.addEventListener('change', () => populateScheduleSubjectSuggestions(currentProfile, $('#scheduleForm').elements.grade.value));
document.querySelectorAll('[data-add-subject]').forEach(button => button.addEventListener('click', () => addCustomSubject($(`#${button.dataset.addSubject}`))));
function readProfileForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const selectedSubjects=getSelectedSubjects(form);
  delete data.custom_subject;
  delete data.subject_choice;
  data.subjects=[...new Set(selectedSubjects)];
  data.full_name = [data.first_name.trim(),data.last_name.trim()].filter(Boolean).join(' ');
  data.teacher_context = Object.fromEntries(['student_age_range','context_zone','class_size','internet_access','available_resources','planning_challenges','preferred_dynamics'].map(key=>[key,data[key] || '']));
  for (const key of Object.keys(data.teacher_context)) delete data[key];
  return data;
}
function fillTeacherForm(form, profile) {
  for (const key of ['first_name','last_name','gender','modality','primary_grade','school_name','municipality']) if (form.elements[key]) form.elements[key].value = profile[key] || '';
  populateGradeChoices(form,profile.modality || '',profile.primary_grade || '');
  populateSubjectChoices(form,profile.subjects || []);
  const context = profile.teacher_context || {};
  for (const key of ['student_age_range','context_zone','class_size','internet_access','available_resources','planning_challenges','preferred_dynamics']) if (form.elements[key]) form.elements[key].value = context[key] || '';
}
function populatePlanSubjectOptions(profile, selected = '') {
  const select=$('#planSubjectInput'); const subjects=profile?.subjects||[]; const value=selected||select.value;
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
function setTeacherIdentity(profile) { $('#teacherAvatar').textContent = profile.gender === 'varon' ? '👨‍🏫' : '👩‍🏫'; }
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
    `PLAN DE CLASE · ${plan.title || plan.topic}`,
    `Docente: ${plan.teacher || ''}`,
    `Centro educativo: ${plan.school || ''}`,
    `Asignatura: ${plan.subject} · Grado: ${plan.grade} · Edad de referencia: ${plan.student_age_range || 'no especificada'} · Fecha: ${prettyDate(plan.lesson_date)} · Duración: ${plan.duration_minutes} minutos`,
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
function suggestEvaluationCriteria(data) {
  return [
    `Demuestra el aprendizaje esperado descrito en el indicador: ${data.achievement_indicator}`,
    `Relaciona el contenido «${data.content}» con la actividad o el ejemplo trabajado.`,
    `Explica o presenta su respuesta con claridad y utiliza ideas vinculadas con «${data.topic}».`
  ].join('\n');
}
function localDraft(data, teacher) {
  const total = Number(data.duration_minutes);
  const opener = Math.max(2, Math.round(total * .2));
  const close = Math.max(2, Math.round(total * .2));
  const develop = total - opener - close;
  const subject = data.subject.toLowerCase();
  const evaluationCriteria = data.evaluation_criteria || suggestEvaluationCriteria(data);
  const ageRange=teacher.teacher_context?.student_age_range||'';
  let ageGuidance='';
  if(ageRange==='3–5 años')ageGuidance='Usar objetos concretos, imágenes, consignas de un paso y juegos breves con movimiento.';
  else if(ageRange==='6–8 años')ageGuidance='Usar ejemplos cotidianos, apoyos visuales, instrucciones cortas y actividades de manipulación o juego.';
  else if(ageRange==='9–11 años')ageGuidance='Combinar ejemplos cercanos, retos en pareja, organizadores gráficos y explicaciones breves del razonamiento.';
  else if(ageRange==='12–14 años')ageGuidance='Proponer retos que conecten con su vida, colaboración, elección entre ejemplos y conversación guiada.';
  else if(ageRange==='15–18 años')ageGuidance='Incluir problemas auténticos, análisis de casos, autonomía y argumentación con evidencias.';
  else if(ageRange==='Edades variadas')ageGuidance='Ofrecer una misma consigna con apoyos visuales y niveles de reto distintos.';
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
    title: data.topic, teacher: [teacher.first_name, teacher.last_name].filter(Boolean).join(' '), school: teacher.school_name, student_age_range:ageRange,
    subject: data.subject, grade: data.grade, lesson_date: data.lesson_date, duration_minutes: total, topic: data.topic,
    content: data.content, achievement_indicator: data.achievement_indicator, evaluation_criteria: evaluationCriteria,
    resources: data.resources || teacher.teacher_context?.available_resources || 'Pizarra, cuaderno, lápiz y material visual disponible.',
    objective: `Que las y los estudiantes comprendan y trabajen ${data.content}, demostrando avances hacia este indicador: ${data.achievement_indicator}`,
    activities: [
      { moment:'Primer momento · Iniciación', minutes:opener, activity:`Dar la bienvenida y presentar el tema «${data.topic}». Activar saberes previos con preguntas: ¿qué sabemos?, ¿dónde lo hemos visto?, ¿qué queremos descubrir? Registrar algunas ideas y acordar el propósito de la clase.`, examples:example, assessment:'Escuchar las respuestas iniciales, valorar ideas previas y aclarar vocabulario que se necesite.' },
      { moment:'Segundo momento · Desarrollo', minutes:develop, activity:`Presentar brevemente el contenido «${data.content}» usando ejemplos y apoyos visuales. Modelar cómo se resuelve o comprende una situación vinculada con el indicador. ${activity} ${ageGuidance}`, examples:example, assessment:`Observar el trabajo individual y en parejas. Hacer preguntas de seguimiento y brindar una pista o ejemplo adicional a quienes lo necesiten. Criterios a observar: ${evaluationCriteria}` },
      { moment:'Tercer momento · Culminación', minutes:close, activity:`Invitar a algunos estudiantes a compartir su respuesta o producción. Cerrar con una síntesis colectiva: cada estudiante completa oralmente o por escrito «Hoy aprendí…» y «Todavía quiero practicar…».`, examples:'Aplicar una pregunta o ejercicio corto directamente relacionado con el indicador de logro.', assessment:`Recoger una respuesta breve de cada estudiante y verificarla con el indicador: ${data.achievement_indicator}` }
    ],
    evidence:`Producción o respuesta individual relacionada con «${data.content}», explicación oral del procedimiento y participación en la actividad. Revisar con estos criterios: ${evaluationCriteria}`,
    differentiation:`Presentar instrucciones cortas en pasos; mostrar un ejemplo resuelto; apoyar con imágenes u objetos; permitir trabajar con una pareja de apoyo; ofrecer una consigna de ampliación a quien termine antes.${teacher.teacher_context?.internet_access==='Sin acceso en el aula'?' Priorizar materiales impresos, objetos del entorno y actividades que no requieran conexión.':''}${teacher.teacher_context?.planning_challenges?` Considerar el desafío que señaló el docente: ${teacher.teacher_context.planning_challenges}`:''}`,
    homework:''
  };
  plan.text = plainPlanText(plan);
  return plan;
}
function getPlanFormData() {
  const data = Object.fromEntries(new FormData($('#planForm')).entries());
  data.duration_minutes = Number(data.duration_minutes);
  data.grade = planningGradeOverride || currentProfile?.primary_grade || '';
  data.evaluation_criteria = suggestEvaluationCriteria(data);
  return data;
}
function formHasRequiredData(data) {
  for (const key of ['subject','grade','topic','lesson_date','content','achievement_indicator']) {
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
  if (!formHasRequiredData(data)) { setStatus('#planStatus', 'Completá la asignatura, el tema, la fecha, el contenido y el indicador.', 'error'); return; }
  pendingPlanData = data;
  const profile = currentProfile || {};
  const summary = [
    ['Asignatura', data.subject], ['Modalidad', profile.modality || '—'], ['Grado del perfil', data.grade],
    ['Edad del grupo', profile.teacher_context?.student_age_range || 'No indicada'],
    ['Tema', data.topic], ['Fecha', prettyDate(data.lesson_date)], ['Duración', `${data.duration_minutes} minutos`],
    ['Contenido', data.content], ['Indicador de logro', data.achievement_indicator],
    ['Recursos', data.resources || profile.teacher_context?.available_resources || 'Materiales escolares básicos'],
    ['Criterios de evaluación', 'Se propondrán automáticamente dentro del borrador.']
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
  const button = $('#generatePlan'); button.disabled = true;
  $('#aiState').innerHTML = '<span class="progress"><span></span></span> Preparando el borrador en este dispositivo…';
  setStatus('#planStatus', 'Armando la secuencia de clase…');
  try {
    const teacher = await ensureProfile();
    const data = { ...pendingPlanData, grade:planningGradeOverride || teacher.primary_grade || '' };
    if (!data.grade) throw new Error('Seleccioná el grado en Mi perfil para continuar.');
    data.evaluation_criteria = suggestEvaluationCriteria(data);
    const result = { plan:localDraft(data, teacher), source:'guided' };
    generatedPlanText = result.plan.text;
    generatedPlanData = result.plan;
    $('#planReview').classList.add('hidden'); $('#planForm').classList.remove('hidden');
    renderPlanPreview(result.plan, result.source);
    $('#aiState').textContent = 'Criterios y actividades propuestos automáticamente en este dispositivo; el contenido no se envió a un servicio externo.';
    setStatus('#planStatus', 'El borrador está listo. Revisá y ajustá la propuesta antes de guardarla.', 'ok');
    currentPlanId = null;
  } catch (err) { setStatus('#planStatus', friendlyError(err), 'error'); $('#aiState').textContent = 'No se pudo generar la propuesta.'; $('#planReview').classList.remove('hidden'); $('#planForm').classList.add('hidden'); }
  finally { button.disabled = false; }
});
function renderPlanPreview(plan, source = 'guided') {
  const text = plan.text || plainPlanText(plan);
  generatedPlanText = text;
  const badge = source === 'ai' ? '<span class="pill green">Propuesta con IA</span>' : '<span class="pill blue-pill">Borrador guiado</span>';
  $('#planPreview').innerHTML = `<div class="plan-paper"><pre id="printBody" class="print-body"></pre><div class="plan-heading"><div class="brand" style="justify-content:center;font-size:17px"><img class="mark" src="./logo.svg" alt="">Syllabo</div><p class="eyebrow" style="margin:8px 0 3px">Planificación didáctica</p><h2>${escapeHtml(plan.topic || plan.title || 'Plan de clase')}</h2>${badge}</div><div class="plan-meta"><div><b>Docente:</b> ${escapeHtml(plan.teacher || '')}</div><div><b>Centro:</b> ${escapeHtml(plan.school || '—')}</div><div><b>Asignatura:</b> ${escapeHtml(plan.subject || '')}</div><div><b>Grado:</b> ${escapeHtml(plan.grade || '')}</div><div><b>Edad:</b> ${escapeHtml(plan.student_age_range || '—')}</div><div><b>Fecha:</b> ${escapeHtml(prettyDate(plan.lesson_date) || '')}</div><div><b>Duración:</b> ${escapeHtml(plan.duration_minutes || '')} minutos</div></div><div class="plan-block"><h3>Contenido e indicador</h3><p><b>Contenido:</b> ${escapeHtml(plan.content || '')}</p><p><b>Indicador de logro:</b> ${escapeHtml(plan.achievement_indicator || '')}</p><p><b>Criterios de evaluación:</b> ${escapeHtml(plan.evaluation_criteria || 'Observar la participación, el procedimiento y el aprendizaje demostrado.')}</p><p><b>Propósito:</b> ${escapeHtml(plan.objective || '')}</p></div><div class="plan-block"><h3>Secuencia didáctica</h3>${splitActivities(plan).map(item=>`<div class="activity"><strong>${escapeHtml(item.moment || 'Actividad')} · ${escapeHtml(item.minutes || 0)} min</strong><p>${escapeHtml(item.activity || '')}</p>${item.examples?`<p><b>Ejemplo:</b> ${escapeHtml(item.examples)}</p>`:''}${item.assessment?`<p><b>Verificación y realimentación:</b> ${escapeHtml(item.assessment)}</p>`:''}</div>`).join('')}</div><div class="plan-block"><h3>Evaluación y atención a la diversidad</h3><p><b>Evidencias:</b> ${escapeHtml(plan.evidence || '')}</p><p><b>Apoyos y ajustes:</b> ${escapeHtml(plan.differentiation || '')}</p><p><b>Recursos:</b> ${escapeHtml(plan.resources || '')}</p>${plan.homework?`<p><b>Actividad de aplicación:</b> ${escapeHtml(plan.homework)}</p>`:''}</div><div class="plan-block"><h3>Editar el plan</h3><textarea id="planEditor" aria-label="Editar plan de clase">${escapeHtml(text)}</textarea><p class="muted">Podés editar este borrador antes de guardarlo o imprimirlo.</p></div><div class="row noprint"><button id="savePlan" class="primary">${currentPlanId?'Guardar cambios':'Guardar en mis planes'}</button><button id="printPlan" class="soft-btn">Imprimir / Guardar PDF</button><button id="discardPlan" class="text-btn">Cerrar</button></div><div id="saveStatus" class="status" aria-live="polite"></div></div>`;
  $('#planEditor').addEventListener('input', event => { generatedPlanText = event.target.value; });
  $('#savePlan').addEventListener('click', saveCurrentPlan);
  $('#printPlan').addEventListener('click', () => { generatedPlanText = $('#planEditor').value; $('#printBody').textContent = generatedPlanText; window.print(); });
  $('#discardPlan').addEventListener('click', () => { $('#planPreview').innerHTML = ''; currentPlanId = null; generatedPlanText = ''; generatedPlanData = null; });
}
async function saveCurrentPlan() {
  const data = getPlanFormData();
  data.evaluation_criteria = generatedPlanData?.evaluation_criteria || suggestEvaluationCriteria(data);
  const editor = $('#planEditor');
  if (editor) generatedPlanText = editor.value;
  const row = { ...data, plan_body:{ text:generatedPlanText, plan:generatedPlanData, source:$('#aiState').textContent.startsWith('Borrador guiado') ? 'guided' : 'ai' }, updated_at:new Date().toISOString() };
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
  form.reset(); form.elements.lesson_date.value = date; form.elements.duration_minutes.value = duration;
  planningGradeOverride = grade || currentProfile?.primary_grade || '';
  if (subject) setPlanSubject(subject);
  updatePlanAgeHint(currentProfile);
  form.classList.remove('hidden'); $('#planReview').classList.add('hidden');
  $('#planPreview').innerHTML = ''; $('#aiState').textContent = 'Se prepara un borrador editable.'; setStatus('#planStatus');
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
function renderPlanList() {
  const search = $('#planSearch').value.trim().toLocaleLowerCase(); const month = $('#planMonth').value; const subject=$('#planSubjectFilter').value; const sort=$('#planSort').value;
  const plans = allPlans.filter(p => (!month || p.lesson_date.startsWith(month)) && (!subject || p.subject===subject) && (!search || `${p.subject} ${p.grade} ${p.topic}`.toLocaleLowerCase().includes(search)));
  plans.sort((a,b)=>sort==='subject'?a.subject.localeCompare(b.subject,'es')||a.topic.localeCompare(b.topic,'es'):sort==='topic'?a.topic.localeCompare(b.topic,'es'):sort==='date-asc'?a.lesson_date.localeCompare(b.lesson_date):b.lesson_date.localeCompare(a.lesson_date));
  if (!plans.length) { $('#plansList').innerHTML = '<div class="empty">No encontramos planes con esos filtros. Creá tu primer plan para empezar.</div>'; return; }
  $('#plansList').innerHTML = plans.map(plan => `<article class="item"><div class="section-title"><div><div class="row"><span class="pill">${escapeHtml(prettyDate(plan.lesson_date))}</span><span class="pill green">${escapeHtml(plan.duration_minutes)} min</span></div><p class="item-title" style="margin-top:9px">${escapeHtml(plan.subject)} · ${escapeHtml(plan.grade)}</p><p>${escapeHtml(plan.topic)}</p></div><div class="row noprint"><button class="soft-btn" data-open-plan="${plan.id}">Abrir / editar</button><button class="danger-btn" data-delete-plan="${plan.id}">Eliminar</button></div></div></article>`).join('');
  plans.forEach(plan => $(`[data-open-plan="${plan.id}"]`).addEventListener('click', () => openSavedPlan(plan)));
  plans.forEach(plan => $(`[data-delete-plan="${plan.id}"]`).addEventListener('click', () => deletePlan(plan)));
}
$('#planSearch').addEventListener('input', renderPlanList); $('#planMonth').addEventListener('change', renderPlanList); $('#planSubjectFilter').addEventListener('change',renderPlanList); $('#planSort').addEventListener('change',renderPlanList);
async function openSavedPlan(plan) {
  currentPlanId = plan.id;
  const form = $('#planForm');
  planningGradeOverride = plan.grade || currentProfile?.primary_grade || '';
  updatePlanAgeHint(currentProfile);
  setPlanSubject(plan.subject);
  for (const key of ['subject','topic','lesson_date','content','achievement_indicator','duration_minutes','resources']) form.elements[key].value = plan[key] ?? '';
  form.classList.remove('hidden'); $('#planReview').classList.add('hidden');
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
  return [...classes,...events,...plans].sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
}
function calendarEntry(item, date) {
  const className=item.kind==='holiday'?'holiday':item.kind==='plan'?'plan':'';
  const label=`${item.time?`${item.time} `:''}${item.title}`;
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
  $('#calendarBoard').innerHTML=`<div class="calendar-weekdays">${calendarWeekdays.map(day=>`<span>${day}</span>`).join('')}</div><div class="calendar-grid">${days.map(date=>{const items=getCalendarItems(date);return `<div class="calendar-cell ${date.getMonth()!==calendarDate.getMonth()?'outside':''} ${dateKey(date)===localISODate()?'today':''}"><div class="calendar-cell-head"><span>${date.getDate()}</span><button class="text-btn" data-add-date="${dateKey(date)}" aria-label="Agregar evento">+</button></div>${items.slice(0,3).map(item=>calendarEntry(item,date)).join('')}${items.length>3?`<span class="muted">+${items.length-3} más</span>`:''}</div>`;}).join('')}</div>`;
}
function renderCalendarAgenda(start,count) {
  const days=Array.from({length:count},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
  $('#calendarBoard').innerHTML=days.map(date=>{const items=getCalendarItems(date);return `<section class="agenda-day"><div class="section-title"><h3>${date.toLocaleDateString('es-NI',{weekday:'long',day:'numeric',month:'long'})}</h3><button class="text-btn" data-add-date="${dateKey(date)}">+ Agregar fecha</button></div>${items.length?items.map(item=>`<div class="row" style="padding:8px 0;border-top:1px solid var(--line)"><span class="agenda-hour">${escapeHtml(item.time|| (item.kind==='plan'?'Plan':'Todo el día'))}</span><span>${escapeHtml(item.title)}</span>${item.kind==='event'||item.kind==='holiday'?`<button class="soft-btn" data-edit-event="${item.item.id}">Editar</button><button class="danger-btn" data-delete-event="${item.item.id}">Eliminar</button>`:item.kind==='class'?`<button class="soft-btn" data-calendar-class="${dateKey(date)}" data-subject="${escapeHtml(item.item.subject)}" data-grade="${escapeHtml(item.item.grade)}" data-duration="${item.item.duration_minutes}">Planear</button>`:''}</div>`).join(''):'<p class="muted">Sin clases ni fechas registradas.</p>'}</section>`;}).join('');
}
function bindCalendarEntries() {
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
  const selected = data.find(item => item.subject === form.elements.subject.value) || data[0];
  if (!form.elements.subject.value) {
    setPlanSubject(selected.subject);
  }
  planningGradeOverride = selected.grade || currentProfile?.primary_grade || '';
  updatePlanAgeHint(currentProfile);
  if (!form.elements.duration_minutes.value || form.elements.duration_minutes.value === '45') form.elements.duration_minutes.value = selected.duration_minutes;
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
