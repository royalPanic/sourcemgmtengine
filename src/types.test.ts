import { describe, it, expect } from 'vitest';
import { SOURCE_TYPES } from './types';

describe('SOURCE_TYPES', () => {
  it('includes Media as a source type', () => {
    expect(SOURCE_TYPES).toContain('Media');
  });
});
