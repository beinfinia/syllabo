# Syllabo

Asistente de planificación docente con perfil, horario semanal y planes de clase por fecha.

## Funciones

- Registro e inicio de sesión con correo y contraseña mediante Supabase Auth.
- Recuperación de contraseña por correo.
- Perfil individual del docente: nombre(s), apellido(s), centro educativo, municipio y grado principal.
- Horario de lunes a viernes, con varias clases por día.
- Sugerencia de asignatura, grado y duración del horario al escoger fecha del plan.
- Generación de un borrador guiado sin servicio de IA, o propuesta con IA cuando se configura una clave segura.
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

## Activar generación con IA

La aplicación funciona sin API de IA con un borrador guiado local. Para habilitar propuestas generadas por IA:

1. Añadí `OPENAI_API_KEY` como secreto en **Supabase → Edge Functions → Secrets**. La clave nunca se coloca en GitHub ni en `public/app.js`.
2. Opcionalmente, añadí `OPENAI_MODEL`; por defecto se usa `gpt-4.1-mini`.
3. Desplegá `supabase/functions/generate-lesson-plan/index.ts` como Edge Function `generate-lesson-plan`, con verificación JWT activada.

La llamada solo ocurre cuando el docente pulsa “Generar planificación”. El proveedor de IA puede cobrar por uso; los créditos de AWS, si se obtienen, no pagan automáticamente una clave de OpenAI.

Para una instancia Supabase nueva, aplicá las migraciones en `supabase/migrations/`. No vuelvas a aplicar las migraciones si las tablas ya existen.
