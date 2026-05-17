// lib/parser/dispatcher.ts
import { appleCard } from './apple-card';
import type { ParsedStatement, ParserContext, ParserModule } from './types';
/**
 * Registry of parsers. Add new parsers here as they're ported.
 * Order doesn't matter — detector functions must be mutually exclusive.
 */
const PARSERS: ParserModule[] = [
  appleCard,
  // Future: chaseChecking, chaseCard, allyCombined, discoverCard, etc.
];
export class NoParserMatchedError extends Error {
  constructor(public readonly filename: string, public readonly tried: string[]) {
    super(`No parser matched ${filename}. Tried: ${tried.join(', ')}`);
    this.name = 'NoParserMatchedError';
  }
}
export class MultipleParsersMatchedError extends Error {
  constructor(public readonly filename: string, public readonly matched: string[]) {
    super(
      `Multiple parsers matched ${filename}: ${matched.join(', ')}. ` +
      `This is a detector bug — fix detect() functions to be mutually exclusive.`,
    );
    this.name = 'MultipleParsersMatchedError';
  }
}
export function dispatch(text: string, filename: string, ctx: ParserContext): ParsedStatement {
  const matched = PARSERS.filter(p => p.detect(text, filename));
  if (matched.length === 0) {
    throw new NoParserMatchedError(filename, PARSERS.map(p => p.name));
  }
  if (matched.length > 1) {
    throw new MultipleParsersMatchedError(filename, matched.map(p => p.name));
  }
  return matched[0].parse(text, ctx);
}
