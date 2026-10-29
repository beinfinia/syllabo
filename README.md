# Syllabo

Asistente de planificación docente con ficha de bienvenida, perfil, agenda semanal, calendario escolar y biblioteca de planes.

## Funciones

- Registro e inicio de sesión con correo y contraseña mediante Supabase Auth.
- Recuperación de contraseña por correo.
- Ficha inicial de docente: nombre, apellido, género para el trato y avatar, modalidad, grado y materias que imparte.
- Encuesta breve del entorno docente, incluida la edad más frecuente del grupo; las respuestas quedan en el perfil y ayudan a adecuar actividades y ejemplos.
- La materia se elige desde las materias guardadas por el docente y el grado se completa desde el perfil.
- Dictado por voz en tema, contenido, indicador, criterios y recursos; usa el reconocimiento del navegador y puede enviar audio al servicio de voz de ese navegador según su configuración.
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

## Verificación por correo

La URL oficial de retorno de registro y recuperación es `https://syllabo.beinfinia.com/`, incluso si la cuenta se creó desde `localhost`. En **Supabase → Authentication → URL Configuration**, poné esa dirección como **Site URL** y agregala a **Redirect URLs**. También conectá el dominio personalizado a Cloudflare Pages. Supabase debe permitir la redirección para que el enlace abra el sitio publicado.

Si ya se creó una cuenta pero su enlace anterior apunta a `localhost`, desde la pantalla de acceso se puede escribir el correo y usar **Reenviar correo de verificación** para recibir un enlace nuevo.

El remitente puede seguir apareciendo como Supabase mientras se use el correo SMTP predeterminado. Para que el correo diga Syllabo hace falta configurar SMTP propio en Supabase Auth y un remitente/dominio verificado; cambiar solo la plantilla no cambia el proveedor del remitente.

## IA externa

La app actualmente prepara el borrador dentro del navegador, sin mandar el contenido de las clases a un servicio externo. El endpoint de IA incluido en `supabase/functions/generate-lesson-plan/` todavía no está desplegado. Para activarlo primero hay que decidir qué proveedor se usará, autorizar el envío de los datos necesarios y definir el límite de gasto; una clave de OpenAI puede generar cargos y no se paga automáticamente con créditos de AWS.

La migración de onboarding y calendario ya se aplicó al proyecto Supabase conectado. Para otra instancia, aplicá las migraciones en `supabase/migrations/` en orden.
