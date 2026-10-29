# Syllabo

Asistente de planificación docente con ficha de bienvenida, perfil, agenda semanal, calendario escolar y biblioteca de planes.

## Funciones

- Registro e inicio de sesión con correo y contraseña mediante Supabase Auth.
- Recuperación de contraseña por correo con formulario de solicitud y cambio de contraseña.
- Ficha inicial obligatoria en una ventana modal: nombre, apellido, género para el trato y avatar, modalidad, grado, materias y contexto docente. Se vuelve a mostrar si se sale antes de completarla.
- Materias sugeridas según modalidad y grado; el docente puede agregar asignaturas de su centro.
- Encuesta breve del entorno docente, incluida la edad más frecuente del grupo; las respuestas quedan en el perfil y ayudan a adecuar actividades y ejemplos.
- La materia se elige desde las materias guardadas por el docente y el grado se completa desde el perfil.
- Iconos Lucide 0.468.0 locales para dictado por voz, mostrar/ocultar contraseña y acciones; están en `public/icons/` y no dependen de un CDN.
- Dictado por voz en tema, contenido, indicador, criterios y recursos; usa el reconocimiento del navegador en Chrome o Edge, requiere permiso de micrófono y conexión a internet.
- Biblioteca de planes con búsqueda, filtros por asignatura y mes y orden por fecha, materia o tema.
- Horario semanal como agenda por día y hora, con un botón para establecerlo y alertas de clases que necesitan planificación.
- Calendario con vistas de mes, semana y día; reúne clases, planes y actividades, festivales y feriados creados por el docente. Los feriados registrados omiten las clases recurrentes y las alertas de planificación de esas fechas.
- Horario de lunes a viernes, con varias clases por día.
- Sugerencia de asignatura, grado y duración del horario al escoger fecha del plan.
- Generación local de un borrador guiado sin enviar la información de la clase a un proveedor de IA.
- Tres momentos de clase con distribución exacta de minutos, ejemplos, dinámicas, evaluación y apoyos.
- Edición, guardado, búsqueda, apertura, eliminación e impresión del plan a PDF.
- Datos aislados por cuenta con Row Level Security (RLS).

## Base de datos

El esquema aplicado a Supabase está versionado en `supabase/migrations/`. Las tablas son `teacher_profiles`, `class_schedules`, `lesson_plans` y `calendar_events`; las tablas con datos de usuario tienen RLS y políticas por propietario. La migración `20261029044145_teacher_onboarding_calendar_events.sql` añade la información del onboarding y la agenda de eventos.

## Desarrollo local

Sirve la carpeta `public/` con cualquier servidor estático. La app utiliza Supabase JS v2 desde esm.sh. La URL del proyecto y la clave publicable están en `public/app.js`; la clave publicable puede estar en el navegador con RLS activo. Nunca agregues una `sb_secret`, `service_role` ni una clave de proveedor de IA al frontend.

## Publicación en Cloudflare Pages

- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `public`
- Root directory: raíz del repositorio

No requiere build ni variables de entorno para publicar la versión web. Configurá en Supabase Auth las URL autorizadas del dominio de Pages, incluida la URL de producción.

## Acceso y recuperación

El acceso usa correo y contraseña. Para que el registro inicie sesión inmediatamente sin confirmar el correo, desactivá **Supabase → Authentication → Settings → Email → Confirm email**. La interfaz informa si esa opción sigue activa en el proyecto.

La URL de retorno para recuperar la contraseña es `https://syllabo.beinfinia.com/`. En **Supabase → Authentication → URL Configuration**, agregá esa dirección a **Redirect URLs** y confirmá que el dominio de producción esté conectado a Cloudflare Pages. Si los correos se siguen remitiendo a `localhost`, corregí también el **Site URL** y las plantillas de correo en Supabase.

## Asignaturas sugeridas

Las materias se filtran según modalidad y grado. La lista inicial sigue los planes de estudio publicados por el Ministerio de Educación de Nicaragua; el docente puede agregar las asignaturas que use su centro:

- Primaria: [Plan de estudios de Educación Primaria Regular (carga semanal, vigente desde 2019)](https://nicaraguaeduca.mined.gob.ni/wp-content/uploads/2023/09/I-UP-PR-29082023-VF.pdf). En 1.º y 2.º, Estudios Sociales y Ciencias Naturales se integran en Conociendo mi Mundo; de 3.º a 6.º aparecen como asignaturas separadas.
- Secundaria regular: [Plan de estudios de Educación Secundaria Regular (carga semanal, vigente desde 2019)](https://nicaraguaeduca.mined.gob.ni/wp-content/uploads/2023/07/V-UP-EFPD-SR.pdf), con opciones diferenciadas por grado para Ciencias Sociales y las ciencias de 7.º a 11.º.

La aplicación presenta la selección de materias con el nombre pedagógico del área/asignatura y no usa marcas institucionales en la interfaz. La selección por grado queda así:

- Primaria 1.º–2.º: materias comunes y Conociendo mi Mundo; en esta asignatura se integran Estudios Sociales y Ciencias Naturales.
- Primaria 3.º–6.º: materias comunes, Estudios Sociales (Historia y Geografía) y Ciencias Naturales.
- Secundaria 7.º–9.º: materias comunes, Geografía, Historia, Talleres de Arte y Cultura y Ciencias Naturales.
- Secundaria 10.º: materias comunes, Economía, Química y Física.
- Secundaria 11.º: materias comunes, Sociología, Filosofía, Física y Biología.

Se pueden añadir asignaturas propias del centro, modalidad o programa del docente.

## IA externa

La app actualmente prepara el borrador dentro del navegador, sin mandar el contenido de las clases a un servicio externo. El endpoint de IA incluido en `supabase/functions/generate-lesson-plan/` todavía no está desplegado. Para activarlo primero hay que decidir qué proveedor se usará, autorizar el envío de los datos necesarios y definir el límite de gasto; una clave de OpenAI puede generar cargos y no se paga automáticamente con créditos de AWS.

La migración de onboarding y calendario ya se aplicó al proyecto Supabase conectado. Para otra instancia, aplicá las migraciones en `supabase/migrations/` en orden.
