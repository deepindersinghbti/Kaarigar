import assert from 'node:assert/strict';
import { VoiceRecognizer } from '../src/utils/speech';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static throwOnStart = false;
  onstart?: () => void;
  onend?: () => void;
  onerror?: (event: { error: string }) => void;
  onresult?: (event: any) => void;
  stops = 0;
  aborts = 0;
  constructor() { FakeRecognition.instances.push(this); }
  start() { if (FakeRecognition.throwOnStart) throw new Error('start failed'); }
  stop() { this.stops++; }
  abort() { this.aborts++; }
  result(words: string, final = true) {
    const result: any = [{ transcript: words }];
    result.isFinal = final;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}
(globalThis as any).window = { SpeechRecognition: FakeRecognition };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function hold() {
  const recognizer = new VoiceRecognizer();
  const words: string[] = [], errors: string[] = [], states: string[] = [];
  let submitted = 0;
  recognizer.start({
    language: 'en',
    onFinalResult: text => words.push(text),
    onComplete: () => submitted++,
    onStatus: status => states.push(status),
    onError: event => errors.push(event.error),
  });
  return { recognizer, words, errors, states, get submitted() { return submitted; },
    get engine() { return FakeRecognition.instances.at(-1)!; } };
}

// A final result later than the old 250ms deadline must be submitted exactly once.
{
  const h = hold();
  h.engine.onstart?.();
  h.engine.result('installed', false);
  h.recognizer.stop();
  await wait(350);
  assert.equal(h.submitted, 0);
  h.engine.result('installed a fan for 1100 rupees');
  assert.equal(h.submitted, 0);
  h.engine.onend?.();
  assert.deepEqual(h.words, ['installed a fan for 1100 rupees']);
  assert.equal(h.submitted, 1);
  h.recognizer.stop();
  assert.equal(h.submitted, 1);
}
// Final recognition while holding is buffered, never submitted early or duplicated.
{
  const h = hold();
  h.engine.onstart?.();
  h.engine.result('fan installation');
  h.engine.result('fan installation');
  assert.deepEqual(h.words, ['fan installation']);
  assert.equal(h.submitted, 0);
  h.recognizer.stop();
  h.engine.onend?.();
  assert.equal(h.submitted, 1);
}
// A quick release before the asynchronous onstart still stops capture.
{
  const h = hold();
  h.recognizer.stop();
  h.engine.onstart?.();
  assert.ok(h.engine.stops >= 1);
  assert.ok(!h.states.includes('listening'));
  h.engine.onend?.();
  assert.equal(h.submitted, 1);
}
// Permission/service/device failures end once and never submit.
for (const error of ['network', 'not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']) {
  const h = hold();
  h.engine.onstart?.();
  const lateEnd = h.engine.onend;
  h.engine.onerror?.({ error });
  lateEnd?.();
  assert.deepEqual(h.errors, [error]);
  assert.equal(h.submitted, 0);
  assert.equal(h.states.at(-1), 'idle');
}
// An unexpected browser disconnect ends once instead of cycling the mic.
{
  const h = hold();
  const engine = h.engine;
  engine.onstart?.();
  engine.onend?.();
  assert.equal(h.submitted, 0);
  assert.deepEqual(h.errors, ['interrupted']);
  const instanceCount = FakeRecognition.instances.length;
  await wait(350);
  assert.equal(FakeRecognition.instances.length, instanceCount);
}
// Cancel/close invalidates late browser events and never submits a partial entry.
{
  const h = hold();
  const lateResult = h.engine.onresult;
  const lateEnd = h.engine.onend;
  h.recognizer.cancel();
  lateResult?.({ resultIndex: 0, results: [] });
  lateEnd?.();
  assert.equal(h.submitted, 0);
  assert.deepEqual(h.words, []);
  assert.ok(h.engine.aborts);
}
// Replacing a session isolates callbacks belonging to the old hold.
{
  const h = hold();
  const lateError = h.engine.onerror;
  h.recognizer.start({ language: 'hi', onFinalResult: () => {} });
  lateError?.({ error: 'network' });
  assert.deepEqual(h.errors, []);
  h.recognizer.cancel();
}
// Synchronous start exceptions are surfaced instead of swallowed.
{
  FakeRecognition.throwOnStart = true;
  const h = hold();
  assert.deepEqual(h.errors, ['start-failed']);
  assert.equal(h.submitted, 0);
  FakeRecognition.throwOnStart = false;
}
console.log('PASS: voice release, late results, cancellation, interruption, failure and session-isolation regressions');
