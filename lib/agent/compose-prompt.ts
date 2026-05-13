import "server-only";
import type { ProcessoSnapshot } from "@/lib/db/types";

/**
 * Monta o system prompt do agente combinando:
 *   1. Conteúdo da skill (lógica reutilizável)
 *   2. Instrução específica do processo (custom_prompt)
 *   3. Inputs estruturados resolvidos
 *   4. Contexto adicional (cliente, observability)
 */
export function composeSystemPrompt(
  snapshot: ProcessoSnapshot,
  inputs: Record<string, unknown>,
): string {
  const sections: string[] = [];

  // Header com identidade do processo
  sections.push(
    `Você é um agente executando um processo da plataforma Axenya.\n` +
      `Processo: ${snapshot.processo.name}` +
      (snapshot.cliente ? ` (cliente: ${snapshot.cliente.name})` : ""),
  );

  // Skill content
  sections.push(`# Skill: ${snapshot.skill.name} (v${snapshot.skill.version_number})\n\n${snapshot.skill.content}`);

  // Custom prompt do processo
  if (snapshot.custom_prompt?.trim()) {
    sections.push(`# Instruções específicas deste processo\n\n${snapshot.custom_prompt.trim()}`);
  }

  // Inputs estruturados
  if (Object.keys(inputs).length > 0) {
    sections.push(`# Inputs\n\n\`\`\`json\n${JSON.stringify(inputs, null, 2)}\n\`\`\``);
  }

  // Guardrails
  sections.push(
    `# Diretrizes operacionais\n\n` +
      `- Use APENAS as ferramentas (conectores) disponibilizadas. Não invente endpoints.\n` +
      `- Quando terminar a tarefa, finalize sua resposta com um resumo executivo claro e os principais achados.\n` +
      `- Se algum input crítico estiver faltando ou ambíguo, peça esclarecimento na resposta final em vez de inventar.\n` +
      `- Mantenha respostas em português brasileiro a menos que o conteúdo dos dados exija outro idioma.`,
  );

  return sections.join("\n\n---\n\n");
}
