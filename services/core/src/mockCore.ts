import {
  AppConfig,
  BilingualReply,
  buildMockReply,
  cloneDefaultConfig,
  InteractionPlan,
  mergeConfig,
  planInteraction,
  validateLlmConfig,
  MemoryRecord,
  canExecuteTool
} from '../../../packages/contracts/src/index.js';

export class MockCore {
  private config: AppConfig;

  constructor(initial?: Partial<AppConfig>) {
    this.config = mergeConfig(initial);
  }

  getConfig(): AppConfig {
    return structuredClone(this.config);
  }

  setConfig(next: Partial<AppConfig>): AppConfig {
    this.config = mergeConfig({ ...this.config, ...next });
    return this.getConfig();
  }

  sendMessage(userText: string): BilingualReply {
    return buildMockReply(userText, this.config.persona, this.config.speech.outputMode);
  }

  planFixedInteraction(kind: string, assetRoot?: string): InteractionPlan {
    return planInteraction(kind, assetRoot);
  }

  validateLlm(): string[] {
    return validateLlmConfig(this.config.llm);
  }

  listMemories(): MemoryRecord[] {
    return this.config.memories.filter((memory) => !memory.paused);
  }

  addMemory(content: string, type: MemoryRecord['type'] = 'preference'): MemoryRecord {
    const now = new Date().toISOString();
    const memory: MemoryRecord = {
      id: crypto.randomUUID(),
      type,
      content: content.trim(),
      source: 'user_confirmed',
      confirmedAt: now,
      updatedAt: now,
      paused: false
    };
    if (!memory.content) throw new Error('记忆内容不能为空。');
    this.config.memories = [...this.config.memories, memory];
    return { ...memory };
  }

  updateMemory(id: string, content: string): MemoryRecord {
    const target = this.config.memories.find((memory) => memory.id === id);
    if (!target) throw new Error('找不到这条记忆。');
    const next = content.trim();
    if (!next) throw new Error('记忆内容不能为空。');
    target.content = next;
    target.source = 'manual_edit';
    target.updatedAt = new Date().toISOString();
    return { ...target };
  }

  deleteMemory(id: string): void {
    this.config.memories = this.config.memories.filter((memory) => memory.id !== id);
  }

  pauseMemory(id: string, paused: boolean): MemoryRecord {
    const target = this.config.memories.find((memory) => memory.id === id);
    if (!target) throw new Error('找不到这条记忆。');
    target.paused = paused;
    target.updatedAt = new Date().toISOString();
    return { ...target };
  }

  checkTool(toolName: string): { allowed: boolean; reason: string } {
    return canExecuteTool(this.config.permissions, toolName);
  }
}

export function makeFreshCore(): MockCore {
  return new MockCore(cloneDefaultConfig());
}
