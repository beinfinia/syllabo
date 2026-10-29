# Syllabo
Tu asistente de planificación docente.

Aplicación web inicial. Supabase ya tiene el esquema dedicado para perfiles docentes, horarios y planes, con Row Level Security activado para que cada persona solo acceda a sus registros.

## Configuración del cliente
Configura en el despliegue `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` a partir del proyecto Syllabo. Nunca expongas la clave `service_role` ni claves secretas en el navegador.

La interfaz actual sigue siendo un prototipo local. La autenticación y sincronización con Supabase deben conectarse antes de usarlo con varias docentes. La clave de OpenAI debe residir en un servicio de servidor, como una Supabase Edge Function.
