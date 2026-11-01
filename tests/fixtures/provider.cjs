// Synthetic model responses for tests only. This module is never served or used in production.
function materials(request) {
  return {
    materials: Array.from(
      { length: request.mode === "series" ? request.count : 1 },
      (_, i) => {
        const program = request.mode === "program";
        const count = program ? Math.min(3, request.count) : 3;
        return {
          kind: program ? "program" : "lesson",
          title: `${program ? "Программа" : "Урок"}: тестовый материал ${i + 1}`,
          subject: request.subject,
          grade: request.grade,
          exam: request.exam,
          duration: request.duration,
          totalSessions: program ? request.count : 1,
          goal: "Тестовая цель: проверить заполнение редактора.",
          homework: "Тестовое задание для самостоятельной работы.",
          notes:
            "Синтетический ответ только для тестов. Проверить действующие требования.",
          stages: Array.from({ length: count }, (_, j) => ({
            title: `Тестовый ${program ? "модуль" : "этап"} ${j + 1}`,
            type: j === 0 ? "Диагностика" : "Практика",
            minutes: program
              ? request.duration
              : j === 1
                ? request.duration - 4
                : 2,
            sessions: program
              ? j === count - 1
                ? request.count - count + 1
                : 1
              : 1,
            notes: `Тестовый конспект ${j + 1}.\nКонтрольный вопрос и ответ.`,
          })),
        };
      },
    ),
  };
}
function providerResponse(request) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: JSON.stringify(materials(request)) },
        ],
      },
    ],
  };
}
async function fixtureFetch(url, init) {
  const body = JSON.parse(init.body);
  const request = JSON.parse(body.input[1].content);
  return new Response(JSON.stringify(providerResponse(request)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
module.exports = { materials, providerResponse, fixtureFetch };
