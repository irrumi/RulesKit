import type { Fact } from '../model.js';
export interface DetectionContext {
  files: string[];
  read(file: string): Promise<string>;
  add(
    category: Fact['category'],
    value: string,
    file: string,
    confidence?: Fact['confidence'],
  ): void;
  warn(message: string): void;
}
export interface Detector {
  id: string;
  detect(context: DetectionContext): Promise<void>;
}
