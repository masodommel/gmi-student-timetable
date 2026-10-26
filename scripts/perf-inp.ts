import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from './build.js';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};
const TARGET = 200;

interface LongFrameScript {
  sourceURL?: string;
  sourceFunctionName?: string;
  invoker?: string;
  duration?: number;
}

interface LongFrame extends PerformanceEntry {
  blockingDuration?: number;
  scripts?: LongFrameScript[];
}

interface PerfWindow extends Window {
  __interaction?: { duration: number; target: string };
  __longTasks?: number[];
  __longFrames?: Array<{ duration: number; blocking: number; scripts: string[] }>;
}

interface Measurement {
  duration: number;
  longTasks: number[];
  longFrames: Array<{ duration: number; blocking: number; scripts: string[] }>;
}

async function main(): Promise<void> {
  await buildSite();
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (path.startsWith('/gmi-student-timetable/')) path = path.slice('/gmi-student-timetable'.length);
      const file = resolve(root, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(root + sep)) throw new Error('outside root');
      const content = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      response.end(content);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  const base = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${base}?class=99178435&week=2026-10-19`);
    await page.locator('.lesson').first().waitFor();
    await page.locator('#compact-class-button').click();
    await page.waitForFunction(() => document.querySelector('#class-results')?.getAttribute('aria-busy') !== 'true');
    await page.waitForTimeout(300);
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.evaluate(() => {
      const perf = window as PerfWindow;
      perf.__interaction = undefined;
      perf.__longTasks = [];
      perf.__longFrames = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const event = entry as PerformanceEventTiming;
          if (!event.interactionId || event.name !== 'click') continue;
          perf.__interaction = {
            duration: event.duration,
            target: event.target instanceof Element ? event.target.id : '',
          };
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.__longTasks!.push(entry.duration);
      }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const frame = entry as LongFrame;
          perf.__longFrames!.push({
            duration: frame.duration,
            blocking: frame.blockingDuration ?? 0,
            scripts: (frame.scripts ?? []).map(
              (script) =>
                `${script.sourceFunctionName || script.invoker || 'anonymous'} ${Math.round(script.duration ?? 0)} ms ${(script.sourceURL || '').split('/').pop()}`,
            ),
          });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    });
    const resetPerf = (): Promise<void> =>
      page.evaluate(() => {
        const perf = window as PerfWindow;
        perf.__interaction = undefined;
        perf.__longTasks = [];
        perf.__longFrames = [];
      });
    const readPerf = (): Promise<Measurement> =>
      page.evaluate(() => {
        const perf = window as PerfWindow;
        return {
          duration: perf.__interaction?.duration ?? Number.NaN,
          longTasks: perf.__longTasks || [],
          longFrames: perf.__longFrames || [],
        };
      });
    const settle = (): Promise<unknown> =>
      page.waitForFunction(() => document.querySelector('#class-results')?.getAttribute('aria-busy') !== 'true');
    const measure = async (id: string): Promise<Measurement> => {
      await resetPerf();
      await page.locator(`#${id}`).click();
      await settle();
      await page.waitForTimeout(300);
      return readPerf();
    };
    const runs: Record<'lecturer' | 'student', Measurement[]> = { lecturer: [], student: [] };
    for (let index = 0; index < 3; index += 1) {
      runs.lecturer.push(await measure('lecturer-mode'));
      runs.student.push(await measure('student-mode'));
    }
    await resetPerf();
    await page.locator('#lecturer-mode').click();
    await page.waitForTimeout(60);
    await page.locator('#student-mode').click();
    await settle();
    await page.waitForTimeout(300);
    const rapid = await readPerf();
    const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const report = (label: string, measurements: Measurement[]): number => {
      const durations = measurements.map(({ duration }) => duration);
      const value = median(durations);
      const longTasks = measurements.flatMap(({ longTasks: tasks }) => tasks);
      const longFrames = measurements
        .flatMap(({ longFrames: frames }) => frames)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);
      console.log(`${label} INP: ${value.toFixed(1)} ms (median of ${durations.length}; target < ${TARGET} ms)`);
      console.log(`  runs: ${durations.map((duration) => duration.toFixed(1)).join(', ')} ms`);
      console.log(`  long tasks: ${longTasks.length}, max ${Math.max(0, ...longTasks).toFixed(1)} ms`);
      for (const frame of longFrames)
        console.log(
          `  frame ${frame.duration.toFixed(1)} ms, blocking ${frame.blocking.toFixed(1)} ms: ${frame.scripts.join(' | ') || 'no script'}`,
        );
      return value;
    };
    const lecturer = report('lecturer mode', runs.lecturer);
    const student = report('student mode', runs.student);
    const rapidSwitch = report('rapid switch', [rapid]);
    if (![lecturer, student, rapidSwitch].every((value) => Number.isFinite(value) && value < TARGET))
      process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

await main();
