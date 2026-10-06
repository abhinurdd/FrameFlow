import assert from 'node:assert/strict';
import test from 'node:test';

import { dominantScript, normalize, score } from './score.ts';

test('normalize strips punctuation, nukta and case', () => {
  assert.deepEqual(normalize('Matlab, yeh TOH sahi hai!'), ['matlab', 'yeh', 'toh', 'sahi', 'hai']);
  assert.deepEqual(normalize('ज़िंदगी में पैसा ज़रूरी है।'), normalize('जिंदगी में पैसा जरूरी है'));
  assert.deepEqual(normalize('हाँ १० साल'), ['हां', '10', 'साल']);
});

test('dominantScript', () => {
  assert.equal(dominantScript('यह startup बहुत अच्छा है'), 'devanagari');
  assert.equal(dominantScript('yeh startup bahut accha hai'), 'roman');
});

test('wer and cer', () => {
  assert.deepEqual(score('paisa kamana easy nahi hai', 'Paisa kamana easy nahi hai.'), { wer: 0, cer: 0, refWords: 5, hypWords: 5 });
  const s = score('paisa kamana easy nahi hai', 'paisa kamana nahi hai');
  assert.equal(s.wer, 1 / 5);
  assert.equal(score('मैं घर जा रहा हूं', 'मैं घर आ रहा हूं').wer, 1 / 5);
});
