import { describe, it, expect, vi } from 'vitest';
import { printJsonSummary, printHumanSummary, exitCodeFor } from './output.js';
import type { ExploreSummary } from './output.js';

const completed: ExploreSummary = {
  prompt: 'Explore the signup flow',
  projectId: 1349,
  siteUrl: 'https://stage.example.com',
  turns: 5,
  budgetExceeded: false,
  report: '## Findings\n- everything looked fine',
};
const ranOutOfBudget: ExploreSummary = { ...completed, turns: 80, budgetExceeded: true };

describe('exitCodeFor', () => {
  it('is 0 when the pass completed within budget, regardless of what it found', () => {
    expect(exitCodeFor(completed)).toBe(0);
  });

  it('is 1 when the pass hit its own budget cap and ended early', () => {
    expect(exitCodeFor(ranOutOfBudget)).toBe(1);
  });
});

describe('printJsonSummary', () => {
  it('prints the summary as JSON to stdout', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printJsonSummary(completed);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual(completed);
  });
});

describe('printHumanSummary', () => {
  it('includes the prompt and the full report text', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printHumanSummary(completed);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Explore the signup flow');
    expect(output).toContain('everything looked fine');
  });

  it('notes the pass may be incomplete when budgetExceeded is true', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printHumanSummary(ranOutOfBudget);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('may be incomplete');
  });

  it('does not print the incomplete note when the pass completed normally', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printHumanSummary(completed);
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('may be incomplete');
  });
});
