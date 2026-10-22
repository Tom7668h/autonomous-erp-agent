import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface EnvConfig {
  port: number;
  nodeEnv: string;
  llmProvider: 'mock' | 'openai' | 'gemini';
  openaiApiKey?: string;
  openaiModel: string;
  geminiApiKey?: string;
  geminiModel: string;
  databasePath: string;
}

export const env: EnvConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  llmProvider: (process.env.LLM_PROVIDER as 'mock' | 'openai' | 'gemini') || 'mock',
  openaiApiKey: process.env.OPENAI_API_KEY || undefined,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'erp_system.db')
};
