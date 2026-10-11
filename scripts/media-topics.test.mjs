import test from 'node:test';
import assert from 'node:assert/strict';
import { isJetsRant } from '../src/lib/media-topics.mjs';

test('publisher rant and meltdown headlines qualify without labeling every Jets loss a rant', () => {
  for (const title of ['Joe Benigno TORCHES Jets in Epic Rant!', 'BT Is FED UP WITH THE JETS!!!', 'Mike Francesa: The NY Jets Are a JOKE', 'Joe Benigno DESTROYS the Jets and Aaron Glenn', 'NYJ meltdown recap']) assert.equal(isJetsRant(title), true, title);
  for (const title of ['Jets fall to Bears', 'Jets DESTROY the Browns in Week 5', 'Giants and Jets opening thoughts', 'Jets film review', 'Sal rips Yankees collapse', 'Joe Benigno DESTROYS Aaron Glenn', '', null]) assert.equal(isJetsRant(title), false, String(title));
});
