import { ChaosConfig, ServerMessage } from "./types.js";

export class ChaosEngine {
  private config: ChaosConfig;
  private messagesSent: number = 0;
  private reorderBuffer: ServerMessage[] = [];
  private readonly REORDER_BUFFER_SIZE = 4;

  constructor(config: ChaosConfig) {
    this.config = config;
  }

  reset(): void {
    this.messagesSent = 0;
    this.reorderBuffer = [];
  }

  shouldDropConnection(): boolean {
    if (this.config.dropAfterMessages === null) return false;
    return this.messagesSent >= this.config.dropAfterMessages;
  }

  shouldCorruptPing(): boolean {
    return Math.random() < this.config.corruptPingProbability;
  }

  process(message: ServerMessage): { messages: ServerMessage[]; delayMs: number } {
    this.messagesSent++;

    const output: ServerMessage[] = [];
    let delayMs = 0;

    if (Math.random() < this.config.latencySpikeProbability) {
      const [min, max] = this.config.latencySpikeMs;
      delayMs = min + Math.random() * (max - min);
    }

    if (Math.random() < this.config.reorderProbability) {
      this.reorderBuffer.push(message);
      if (this.reorderBuffer.length >= this.REORDER_BUFFER_SIZE) {
        const buf = [...this.reorderBuffer];
        for (let i = buf.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [buf[i], buf[j]] = [buf[j], buf[i]];
        }
        output.push(...buf);
        this.reorderBuffer = [];
      }
      if (output.length === 0) return { messages: [], delayMs: 0 };
    } else {
      if (this.reorderBuffer.length > 0) {
        const buf = [...this.reorderBuffer, message];
        for (let i = buf.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [buf[i], buf[j]] = [buf[j], buf[i]];
        }
        output.push(...buf);
        this.reorderBuffer = [];
      } else {
        output.push(message);
      }
    }

    const finalOutput: ServerMessage[] = [];
    for (const msg of output) {
      finalOutput.push(msg);
      if (Math.random() < this.config.duplicateProbability) {
        finalOutput.push(msg);
      }
    }

    return { messages: finalOutput, delayMs };
  }

  flush(): ServerMessage[] {
    if (this.reorderBuffer.length === 0) return [];
    const buf = [...this.reorderBuffer];
    for (let i = buf.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [buf[i], buf[j]] = [buf[j], buf[i]];
    }
    this.reorderBuffer = [];
    return buf;
  }
}

export function generateChaosConfig(): ChaosConfig {
  return {
    dropAfterMessages: Math.random() < 0.5
      ? 15 + Math.floor(Math.random() * 30)
      : null,
    reorderProbability: 0.15 + Math.random() * 0.2,
    duplicateProbability: 0.05 + Math.random() * 0.1,
    latencySpikeProbability: 0.05 + Math.random() * 0.08,
    latencySpikeMs: [2000, 6000 + Math.random() * 2000],
    corruptPingProbability: 0.15 + Math.random() * 0.1,
  };
}
