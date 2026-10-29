# Syllabo

Asistente de planificación docente con perfil, horario semanal y planes de clase por fecha.

## Funciones

- Registro e inicio de sesión con correo y contraseña mediante Supabase Auth.
- Recuperación de contraseña por correo.
- Perfil individual del docente: nombre(s), apellido(s), centro educativo, municipio y grado principal.
- Horario de lunes a viernes, con varias clases por día.
- Sugerencia de asignatura, grado y duración del horario al escoger fecha del plan.
- Generación local de un borrador guiado sin enviar la información de la clase a un proveedor de IA.
- Tres momentos de clase con distribución exacta de minutos, ejemplos, dinámicas, evaluación y apoyos.
- Edición, guardado, búsqueda, apertura, eliminación e impresión del plan a PDF.
- Datos aislados por cuenta con Row Level Security (RLS).

## Base de datos

El esquema aplicado a Supabase está versionado en `supabase/migrations/`. Las tablas son `teacher_profiles`, `class_schedules` y `lesson_plans`; las tres tienen RLS habilitado y políticas por usuario.

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

Para una instancia Supabase nueva, aplicá las migraciones en `supabase/migrations/`. No vuelvas a aplicar las migraciones si las tablas ya existen.
