// Keep essential interface controls responsive even while the data client loads.
(() => {
  const $ = (selector) => document.querySelector(selector);
  const icon = (name) => `<img class="icon" src="./icons/${name}.svg" alt="">`;
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
  const getSubjectsFor = (modality, grade) => {
    const label = String(grade || '').toLowerCase();
    const number = Number(label.match(/\d+/)?.[0] || 0);
    if (modality === 'primaria') {
      if (label === 'multigrado') return [...subjectCatalog.primary.filter(s => !s.startsWith('Estudios Sociales') && !s.startsWith('Ciencias Naturales') && s !== 'Conociendo mi Mundo'), 'Conociendo mi Mundo', 'Estudios Sociales (Historia y Geografía)', 'Ciencias Naturales (Ciencias de la Vida y el Ambiente)'];
      if (number < 1 || number > 6) return [];
      const shared = subjectCatalog.primary.filter(s => !s.startsWith('Estudios Sociales') && !s.startsWith('Ciencias Naturales') && s !== 'Conociendo mi Mundo');
      return number <= 2 ? [...shared, 'Conociendo mi Mundo'] : [...shared, 'Estudios Sociales (Historia y Geografía)', 'Ciencias Naturales (Ciencias de la Vida y el Ambiente)'];
    }
    if (modality === 'secundaria') {
      if (label === 'multigrado') return [...subjectCatalog.secondary];
      if (number < 7 || number > 11) return [];
      const gradeSpecific = new Set(['Ciencias Sociales (Geografía)','Ciencias Sociales (Historia)','Ciencias Sociales (Economía)','Ciencias Sociales (Sociología)','Ciencias Sociales (Filosofía)','Talleres de Arte y Cultura','Ciencias Naturales (Ciencias de la Vida y el Ambiente)','Química','Física','Biología']);
      const shared = subjectCatalog.secondary.filter(s => !gradeSpecific.has(s));
      if (number <= 9) return [...shared,'Ciencias Sociales (Geografía)','Ciencias Sociales (Historia)','Talleres de Arte y Cultura','Ciencias Naturales (Ciencias de la Vida y el Ambiente)'];
      if (number === 10) return [...shared,'Ciencias Sociales (Economía)','Química','Física'];
      return [...shared,'Ciencias Sociales (Sociología)','Ciencias Sociales (Filosofía)','Física','Biología'];
    }
    return [];
  };
  const selectedSubjects = (form) => [...form.querySelectorAll('input[name="subject_choice"]:checked')].map(input => input.value);
  const populateSubjectChoices = (form, selected = selectedSubjects(form)) => {
    const container = form.querySelector('[data-subject-choices]');
    if (!container) return;
    const known = new Set([...subjectCatalog.primary, ...subjectCatalog.secondary]);
    const custom = selected.filter(subject => !known.has(subject));
    const options = [...new Set([...getSubjectsFor(form.elements.modality?.value || '', form.elements.primary_grade?.value || ''), ...custom])];
    container.innerHTML = options.length
      ? options.map(subject => `<label class="choice"><input type="checkbox" name="subject_choice" value="${escapeHtml(subject)}" ${selected.includes(subject) ? 'checked' : ''}>${escapeHtml(subject)}</label>`).join('')
      : '<span class="muted">Elegí modalidad y grado para ver las materias sugeridas. Podés agregar una asignatura propia abajo.</span>';
  };
  window.SyllaboSubjects = { catalog: subjectCatalog, getFor: getSubjectsFor, populateChoices: populateSubjectChoices };
  const dateToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const updateGradeOptions = (form) => {
    const modality = form.elements.modality?.value;
    const field = form.elements.primary_grade;
    if (!field || !modality) return;
    const first = modality === 'secundaria' ? 7 : 1;
    const last = modality === 'secundaria' ? 11 : 6;
    const options = Array.from({ length: last - first + 1 }, (_, index) => `${first + index}° grado`);
    const selected = field.value;
    field.innerHTML = `<option value="">Seleccioná el grado</option>${options.map(value => `<option value="${value}">${value}</option>`).join('')}<option value="Multigrado">Multigrado</option>`;
    field.value = [...options, 'Multigrado'].includes(selected) ? selected : '';
    populateSubjectChoices(form);
  };
  ['onboardingForm', 'profileForm'].forEach((id) => {
    const form = $(`#${id}`);
    if (!form) return;
    populateSubjectChoices(form);
    form.elements.modality?.addEventListener('change', () => {
      const selected = selectedSubjects(form);
      updateGradeOptions(form);
      populateSubjectChoices(form, selected);
    });
    form.elements.primary_grade?.addEventListener('change', () => populateSubjectChoices(form));
  });

  document.querySelectorAll('[data-add-subject]').forEach((button) => {
    button.dataset.subjectFallback = 'true';
    button.addEventListener('click', () => {
      const form = document.getElementById(button.dataset.addSubject);
      const input = form?.elements.custom_subject;
      const value = String(input?.value || '').trim().replace(/\s+/g, ' ');
      if (!form || !input) return;
      if (!value) { input.focus(); return; }
      const selected = selectedSubjects(form);
      const allKnown = new Set([...subjectCatalog.primary, ...subjectCatalog.secondary, ...selected].map(subject => subject.toLocaleLowerCase()));
      if (allKnown.has(value.toLocaleLowerCase())) {
        input.setCustomValidity('Esa materia ya está en la lista.');
        input.reportValidity();
        input.setCustomValidity('');
        return;
      }
      populateSubjectChoices(form, [...selected, value]);
      input.value = '';
    });
  });

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.innerHTML = `${icon(visible ? 'eye-off' : 'eye')}<span>${visible ? 'Ocultar' : 'Mostrar'}</span>`;
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  });

  const establishSchedule = $('#establishSchedule');
  if (establishSchedule) {
    establishSchedule.dataset.uiFallback = 'true';
    establishSchedule.addEventListener('click', () => {
      const form = $('#scheduleForm');
      form.classList.toggle('hidden');
      establishSchedule.textContent = form.classList.contains('hidden') ? 'Establecer horario' : 'Cerrar formulario';
      if (!form.classList.contains('hidden')) form.elements.subject.focus();
    });
  }

  const newEvent = $('#newCalendarEvent');
  if (newEvent) {
    newEvent.dataset.uiFallback = 'true';
    newEvent.addEventListener('click', () => {
      const form = $('#calendarEventForm');
      form.reset();
      form.elements.start_date.value = dateToday();
      $('#eventFormTitle').textContent = 'Agregar actividad o feriado';
      $('#calendarEventFormWrap').classList.remove('hidden');
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  const cancelEvent = $('#cancelCalendarEvent');
  if (cancelEvent) {
    cancelEvent.dataset.uiFallback = 'true';
    cancelEvent.addEventListener('click', () => $('#calendarEventFormWrap').classList.add('hidden'));
  }

  document.querySelectorAll('[data-dictate]').forEach((button) => {
    button.dataset.uiFallback = 'true';
    button.addEventListener('click', () => {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const status = $('#planStatus');
      if (!Recognition) {
        status.textContent = 'El dictado de voz no está disponible en este navegador. En Chrome, permití el micrófono o usá el dictado del teclado.';
        status.className = 'status error';
        return;
      }
      if (button.dataset.listening === 'true') {
        button._recognition?.stop?.();
        return;
      }
      const field = document.getElementById(button.dataset.dictate);
      if (!field) return;
      const recognition = new Recognition();
      button._recognition = recognition;
      button.dataset.listening = 'true';
      recognition.lang = 'es-MX';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      button.classList.add('listening');
      button.innerHTML = `${icon('mic')}<span>Escuchando…</span>`;
      button.setAttribute('aria-pressed', 'true');
      status.textContent = 'Hablá ahora; al terminar, el texto aparecerá en el campo.';
      status.className = 'status';
      recognition.onresult = (event) => {
        const spoken = event.results?.[0]?.[0]?.transcript?.trim();
        if (!spoken) return;
        field.value = `${field.value.trim()}${field.value.trim() ? ' ' : ''}${spoken}`;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      };
      recognition.onerror = (event) => {
        const messages = {
          'not-allowed': 'Permití el uso del micrófono desde la configuración del navegador.',
          'service-not-allowed': 'El navegador bloqueó el servicio de dictado.',
          'no-speech': 'No detecté voz. Intentá de nuevo.',
          network: 'El dictado necesita conexión a internet.',
          'audio-capture': 'No encontré un micrófono disponible.',
          'language-not-supported': 'El navegador no admite el idioma de dictado.'
        };
        status.textContent = messages[event.error] || 'No se pudo iniciar el dictado. Revisá el micrófono e intentá de nuevo.';
        status.className = 'status error';
      };
      recognition.onend = () => {
        button.classList.remove('listening');
        button.innerHTML = `${icon('mic')}<span>Dictar</span>`;
        button.setAttribute('aria-pressed', 'false');
        button.dataset.listening = 'false';
        button._recognition = null;
      };
      try { recognition.start(); }
      catch {
        button.classList.remove('listening');
        button.innerHTML = `${icon('mic')}<span>Dictar</span>`;
        button.setAttribute('aria-pressed', 'false');
        button.dataset.listening = 'false';
        status.textContent = 'No se pudo activar el micrófono. Esperá un momento y probá de nuevo.';
        status.className = 'status error';
      }
    });
  });

  document.addEventListener('click', (event) => {
    if (window.syllaboAppReady) return;
    const tab = event.target.closest('.tab[data-page]');
    const goto = event.target.closest('[data-goto]');
    const page = tab?.dataset.page || goto?.dataset.goto;
    if (!page) return;
    document.querySelectorAll('.page').forEach((section) => section.classList.toggle('hidden', section.id !== page));
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  });
})();
