import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function clean(value: unknown, maxLength = 3000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function splitMinutes(total: number) {
  const start = Math.max(2, Math.round(total * 0.2));
  const close = Math.max(2, Math.round(total * 0.2));
  return [start, total - start - close, close];
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "La IA aún no está activada. Syllabo preparó un borrador guiado para que puedas trabajar sin esperar la conexión." }, 503);

  let input: Record<string, unknown>;
  try { input = await request.json(); }
  catch { return json({ error: "No se recibieron datos válidos." }, 400); }

  const data = {
    subject: clean(input.subject, 120), grade: clean(input.grade, 80), topic: clean(input.topic, 180),
    lesson_date: clean(input.lesson_date, 20), content: clean(input.content, 2500),
    achievement_indicator: clean(input.achievement_indicator, 1500),
    evaluation_criteria: clean(input.evaluation_criteria, 1500),
    duration_minutes: Number(input.duration_minutes), resources: clean(input.resources, 1200),
    teacher: clean(input.teacher, 120), school: clean(input.school, 180),
  };
  if (!data.subject || !data.grade || !data.topic || !data.content || !data.achievement_indicator || !Number.isInteger(data.duration_minutes) || data.duration_minutes < 10 || data.duration_minutes > 600) {
    return json({ error: "Revisá los datos de asignatura, grado, tema, contenido, indicador y duración." }, 400);
  }

  const minutes = splitMinutes(data.duration_minutes);
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const systemPrompt = `Sos un asistente para planificación de clases de primaria. Escribí en español claro, con consignas concretas y adecuadas al grado indicado. Generá un borrador que el docente pueda revisar. Usa exclusivamente el contenido, indicador y criterios proporcionados; no inventes citas ni afirmes que el plan cumple una norma curricular no especificada. Devuelve solo un objeto JSON válido con: objective (string), activities (array de exactamente 3 objetos con activity, examples, assessment; no incluyas minutos), evidence (string), differentiation (string), homework (string). La primera actividad activa saberes previos, la segunda desarrolla y practica el contenido con pasos claros, ejemplos y dinámica participativa; la tercera cierra y comprueba el aprendizaje. Evita materiales costosos y propone recursos cotidianos. No repitas el mismo texto entre actividades.`;
  const userPrompt = `Datos de la clase:\nAsignatura: ${data.subject}\nGrado: ${data.grade}\nTema: ${data.topic}\nContenido: ${data.content}\nIndicador de logro: ${data.achievement_indicator}\nCriterios de evaluación: ${data.evaluation_criteria || "No especificados; propón evidencias observables derivadas del indicador."}\nDuración total: ${data.duration_minutes} minutos; asigna los momentos a ${minutes[0]} min de iniciación, ${minutes[1]} min de desarrollo y ${minutes[2]} min de culminación.\nRecursos disponibles: ${data.resources || "Materiales escolares básicos y recursos del entorno."}\nDocente: ${data.teacher || ""}\nCentro educativo: ${data.school || ""}\nFecha: ${data.lesson_date || ""}\nAsegúrate de que las actividades y ejemplos correspondan al contenido y que la suma de minutos sea exactamente ${data.duration_minutes}.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        temperature: 0.5,
        max_completion_tokens: 2200,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      const status = response.status;
      return json({ error: status === 429 ? "La IA alcanzó su límite de uso. Intentá más tarde." : "No se pudo generar el plan con IA. Syllabo puede preparar un borrador guiado." }, status === 429 ? 429 : 502);
    }
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw || "{}");
    const sourceActivities = Array.isArray(parsed.activities) ? parsed.activities : [];
    const names = ["Primer momento · Iniciación", "Segundo momento · Desarrollo", "Tercer momento · Culminación"];
    const activities = names.map((moment, index) => {
      const item = sourceActivities[index] || {};
      return {
        moment, minutes: minutes[index],
        activity: clean(item.activity, 1800) || "Actividad por completar.",
        examples: clean(item.examples, 900),
        assessment: clean(item.assessment, 900),
      };
    });
    return json({ plan: {
      title: data.topic, subject: data.subject, grade: data.grade, lesson_date: data.lesson_date,
      duration_minutes: data.duration_minutes, topic: data.topic, content: data.content,
      achievement_indicator: data.achievement_indicator, evaluation_criteria: data.evaluation_criteria,
      resources: data.resources || "Materiales escolares básicos y recursos del entorno.",
      teacher: data.teacher, school: data.school,
      objective: clean(parsed.objective, 900), activities,
      evidence: clean(parsed.evidence, 1200), differentiation: clean(parsed.differentiation, 1200),
      homework: clean(parsed.homework, 700),
    } });
  } catch (error) {
    console.error("generate-lesson-plan failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Hubo un problema al comunicarse con el servicio de IA. Podés usar el borrador guiado." }, 502);
  }
});
