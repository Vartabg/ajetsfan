import test from "node:test";
import assert from "node:assert/strict";
import { minimumJerk, contactBump, sampleContactCycle, contactStrike } from "../src/lib/wilson-motion-math.mjs";

function meetsAtRest(sample, at, label) {
  const h = 1e-6;
  const before = sample(at - h), exact = sample(at), after = sample(at + h);
  const leftVelocity = (exact - before) / h, rightVelocity = (after - exact) / h;
  assert.ok(Math.abs(rightVelocity - leftVelocity) < 1e-5, `${label} has no velocity impulse`);
  assert.ok(Math.abs((after - 2 * exact + before) / (h * h)) < 0.1, `${label} meets with zero contact acceleration`);
}

test("the position blend starts and ends at rest without reversing", () => {
  assert.equal(minimumJerk(-1), 0);
  assert.equal(minimumJerk(2), 1);
  assert.equal(minimumJerk(0.5), 0.5);
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const current = minimumJerk(i / 1000);
    assert.ok(current >= previous && current <= 1);
    previous = current;
  }
  meetsAtRest(minimumJerk, 0, "blend start");
  meetsAtRest(minimumJerk, 1, "blend finish");
});

test("the actual foot-lift curve has zero velocity and acceleration at both contact edges", () => {
  assert.equal(contactBump(0), 0);
  assert.equal(contactBump(0.5), 1);
  assert.equal(contactBump(1), 0);
  meetsAtRest(contactBump, 0, "lift-off");
  meetsAtRest(contactBump, 1, "landing");
});

test("foot travel, lift, pitch and support stay C2 through stance, recovery and the next footfall", () => {
  for (const duty of [0.12, 0.27, 0.5, 0.7, 0.8]) {
    for (const at of [0, duty, 1]) {
      // Anchor selection advances at phase wrap, so world travel is the
      // cycle's integer anchor plus its local interpolation, not blend alone.
      meetsAtRest(phase => Math.floor(phase) + sampleContactCycle(phase, duty).blend, at, `travel/${duty}/${at}`);
      for (const key of ["lift", "pitch", "load"]) {
        meetsAtRest(phase => sampleContactCycle(phase, duty)[key], at, `${key}/${duty}/${at}`);
      }
    }
    assert.equal(sampleContactCycle(duty * 0.5, duty).planted, true);
    assert.equal(sampleContactCycle(duty + (1 - duty) * 0.5, duty).planted, false);
  }
});

test("contact strikes recover smoothly between separate hand exchanges", () => {
  for (const at of [0, 0.2, 0.34, 0.76, 1]) meetsAtRest(contactStrike, at, `hand exchange/${at}`);
  assert.equal(contactStrike(0.27), 1);
  assert.equal(contactStrike(0.9), 0);
  for (let i = -100; i <= 200; i++) {
    const value = contactStrike(i / 100);
    assert.ok(value >= 0 && value <= 1);
  }
});
