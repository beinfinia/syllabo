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

function cleanList(value: unknown, maxItems = 20, maxLength = 100) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function splitMinutes(total: number) {
  const start = Math.max(2, Math.round(total * 0.18));
  const close = Math.max(2, Math.round(total * 0.2));
  return [start, total - start - close, close];
}

function distributeMinutes(total: number, count: number) {
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  const remainder = total - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "Falta configurar OPENAI_API_KEY en los secretos de Supabase." }, 503);

  let input: Record<string, unknown>;
  try { input = await request.json(); }
  catch { return json({ error: "No se recibieron datos válidos." }, 400); }

  const data = {
    subject: clean(input.subject, 120),
    modality: clean(input.modality, 80),
    grade: clean(input.grade, 80),
    lesson_date: clean(input.lesson_date, 20),
    content: clean(input.content, 2500),
    achievement_indicator: clean(input.achievement_indicator, 1500),
    additional_observation: clean(input.additional_observation, 1500),
    duration_minutes: Number(input.duration_minutes),
    resources: cleanList(input.available_resources),
    student_age_range: clean(input.student_age_range, 80),
    planning_challenges: clean(input.planning_challenges, 500),
    preferred_dynamics: clean(input.preferred_dynamics, 500),
    internet_access: clean(input.internet_access, 100),
  };
  if (!data.subject || !data.grade || !data.content || !data.achievement_indicator || !/^\d{4}-\d{2}-\d{2}$/.test(data.lesson_date) || !Number.isInteger(data.duration_minutes) || data.duration_minutes < 10 || data.duration_minutes > 600) {
    return json({ error: "Revisá asignatura, grado, fecha, contenido, indicador y duración (10–600 minutos)." }, 400);
  }

  const moments = splitMinutes(data.duration_minutes);
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const systemPrompt = `Sos un asistente de planificación didáctica para docentes. Generá propuestas concretas, claras y utilizables en el aula, en español de Nicaragua, apropiadas para modalidad ${data.modality || "indicada"}, grado ${data.grade} y edades ${data.student_age_range || "no especificadas"}. El docente revisará el resultado.

Usá el contenido, el indicador y la observación del docente como guía principal. La observación es una preferencia pedagógica legítima: incorporala en la dinámica, ejemplos, apoyos o recursos cuando sea posible. Si contradice seguridad, inclusión o el indicador, priorizá esos aspectos y explica brevemente el ajuste en teacher_note. Propón recursos cotidianos y de bajo costo; respeta la lista de recursos disponibles y el acceso a internet indicado. No agregues temas no solicitados, ni atribuyas cumplimiento a un currículo o norma no proporcionados. No inventes fuentes, citas ni respuestas factuales dudosas.

Devuelve exclusivamente un objeto JSON válido con estas propiedades: objective (string); preparation (string); activities (array con exactamente 3 objetos, uno por momento: cada objeto tiene steps, array de 1 a 3 objetos con label y detail, y assessment string); worksheet (objeto con instructions string y tasks array de 3 a 5 strings); evaluation_criteria (array de 3 a 5 criterios observables, derivados del indicador); answer_guide (string con orientaciones de respuesta pertinentes al contenido; si faltan datos para una respuesta exacta, indícalo y describe qué evidencia aceptar); differentiation (string con apoyos concretos); teacher_note (string breve).

Los momentos deben ser inicio (activar saberes y explicar propósito), desarrollo (modelar y practicar de forma participativa) y cierre (socializar y comprobar el aprendizaje). No repitas actividades ni consignes genéricas. Las tareas de la ficha deben medir el contenido y el indicador, variar en formato y resultar comprensibles para la edad.`;
  const userPrompt = `Prepara el plan con estos datos:
Asignatura: ${data.subject}
Modalidad: ${data.modality || "no indicada"}
Grado: ${data.grade}
Rango de edad: ${data.student_age_range || "no indicado"}
Fecha: ${data.lesson_date}
Duración total: ${data.duration_minutes} minutos
Contenido a desarrollar: ${data.content}
Indicador de logro: ${data.achievement_indicator}
Sugerencia u observación del docente: ${data.additional_observation || "Ninguna"}
Recursos disponibles: ${data.resources.length ? data.resources.join(", ") : "Materiales escolares básicos y recursos del entorno"}
Acceso a internet en el aula: ${data.internet_access || "no indicado"}
Desafíos docentes a considerar: ${data.planning_challenges || "ninguno indicado"}
Dinámicas de interés: ${data.preferred_dynamics || "sin preferencia indicada"}

Distribuye el tiempo total exactamente así: inicio ${moments[0]} minutos, desarrollo ${moments[1]} minutos y cierre ${moments[2]} minutos. No agregues otros criterios de evaluación manuales; genera criterios observables a partir del indicador. Devuelve solo el JSON requerido.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_completion_tokens: 3200,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      const status = response.status;
      if (status === 429) return json({ error: "La IA alcanzó su límite de uso o saldo. Intentá más tarde o revisá la facturación de OpenAI." }, 429);
      if (status === 401) return json({ error: "La clave de OpenAI guardada en Supabase no es válida." }, 503);
      console.error("OpenAI request failed", status);
      return json({ error: "No se pudo generar el plan con IA. Intentá de nuevo." }, 502);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw || "{}");
    const sourceActivities = Array.isArray(parsed.activities) ? parsed.activities : [];
    if (sourceActivities.length !== 3) throw new Error("AI response must contain exactly three lesson moments");
    const names = ["1. Inicio", "2. Desarrollo", "3. Cierre"];
    const activities = names.map((moment, index) => {
      const item = sourceActivities[index] || {};
      const sourceSteps = Array.isArray(item.steps) ? item.steps.slice(0, 3) : [];
      const stepMinutes = distributeMinutes(moments[index], sourceSteps.length || 1);
      return {
        moment,
        minutes: moments[index],
        steps: (sourceSteps.length ? sourceSteps : [{ label: "Actividad", detail: "Completar esta actividad con apoyo de la docente." }]).map((step: Record<string, unknown>, stepIndex: number) => ({
          label: clean(step.label, 100) || "Actividad",
          minutes: stepMinutes[stepIndex] || 0,
          detail: clean(step.detail, 1200) || "Desarrollar la actividad vinculada con el contenido y el indicador.",
        })),
        assessment: clean(item.assessment, 700),
      };
    });
    const criteria = cleanList(parsed.evaluation_criteria, 5, 300);
    const worksheetTasks = cleanList(parsed.worksheet?.tasks, 5, 500);
    if (criteria.length < 3 || worksheetTasks.length < 3) throw new Error("AI response is missing evaluation criteria or worksheet tasks");

    return json({ plan: {
      title: data.content.split(/[\n.!?](?:\s|$)/)[0].slice(0, 90),
      subject: data.subject,
      grade: data.grade,
      lesson_date: data.lesson_date,
      duration_minutes: data.duration_minutes,
      topic: data.content.split(/[\n.!?](?:\s|$)/)[0].slice(0, 90),
      content: data.content,
      achievement_indicator: data.achievement_indicator,
      additional_observation: data.additional_observation,
      evaluation_criteria: criteria.join("\n"),
      evaluation_checklist: criteria,
      resources: data.resources.length ? data.resources.join(", ") : "Materiales escolares básicos y recursos del entorno",
      preparation: clean(parsed.preparation, 1200) || "Preparar con anticipación los materiales necesarios para la clase.",
      objective: clean(parsed.objective, 900),
      activities,
      worksheet: {
        instructions: clean(parsed.worksheet?.instructions, 500) || "Resuelve las actividades y explica tus respuestas.",
        tasks: worksheetTasks,
      },
      answer_guide: clean(parsed.answer_guide, 1600),
      differentiation: clean(parsed.differentiation, 1200),
      teacher_note: clean(parsed.teacher_note, 900),
    } });
  } catch (error) {
    console.error("generate-lesson-plan failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Hubo un problema al comunicarse con la IA o validar su respuesta. Intentá generar de nuevo." }, 502);
  }
});
