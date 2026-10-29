# Syllabo
Tu asistente de planificación docente.

## Incluye
- Registro e inicio de sesión con Supabase Auth.
- Perfil docente: nombre, escuela, municipio y grado principal.
- Horario semanal almacenado en Supabase.
- Planes por fecha, guardados en Supabase e imprimibles como PDF.
- RLS para que cada cuenta solo pueda leer y modificar sus propios registros.

## Base de datos
El esquema está en `supabase/migrations/202610290001_syllabo_schema.sql` y ya se aplicó al proyecto Supabase Syllabo. Las tablas son `teacher_profiles`, `class_schedules` y `lesson_plans`.

## Ejecutar
Sirve la carpeta `public/` como sitio estático. `index.html` carga Supabase JS v2 desde esm.sh. La URL del proyecto y su publishable key están en `public/app.js`; la publishable key puede usarse en frontend con RLS activo. Nunca pongas una secret/service_role key ni la clave de OpenAI en el código del navegador.

## Publicar en Cloudflare Pages
Conecta este repositorio de GitHub a Cloudflare Pages y configura:

- Framework preset: `None`
- Build command: dejar vacío
- Build output directory: `public`
- Root directory: dejar vacío (raíz del repositorio)

No hacen falta variables de entorno para esta versión estática. La URL de Supabase y la clave publicable ya están configuradas en `public/app.js`. Si rotas esa clave, actualiza ese archivo y vuelve a desplegar. No agregues claves `secret` o `service_role` al repositorio ni al navegador.

## Configurar Supabase
El esquema versionado está en `supabase/migrations/202610290001_syllabo_schema.sql`. Para una base nueva, ejecuta la migración desde Supabase SQL Editor o con Supabase CLI. La migración crea `teacher_profiles`, `class_schedules` y `lesson_plans`, con políticas RLS para que cada docente solo gestione sus propios datos.

En Supabase Auth, configura las URL autorizadas de tu sitio de Cloudflare Pages (incluida la URL de producción) para registro e inicio de sesión.

La generación automática de planes con IA todavía no está conectada. Los planes actuales son borradores de estructura que la docente debe revisar y completar.
