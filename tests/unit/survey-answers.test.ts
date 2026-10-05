import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  assertSurveyPublishable,
  validateSurveyAnswers,
} from "../../src/modules/surveys/answers.js";
import {
  answerCases,
  publishCases,
  submissionCases,
} from "../cases/survey-answers.cases.js";

describe("Survey answer validation (per question type)", () => {
  for (const c of answerCases) {
    test(`${c.id} ${c.question.type} ← ${String(JSON.stringify(c.value)).slice(0, 40)}`, () => {
      const run = () =>
        validateSurveyAnswers([c.question], { [c.question.id]: c.value });
      if ("stored" in c.expect) {
        assert.deepEqual(run(), { [c.question.id]: c.expect.stored });
      } else {
        assert.throws(run, c.expect.error);
      }
    });
  }
});

describe("Survey submission rules", () => {
  for (const c of submissionCases) {
    test(`${c.id} ${c.title}`, () => {
      const run = () => validateSurveyAnswers(c.questions, c.answers);
      if ("stored" in c.expect) {
        assert.deepEqual(run(), c.expect.stored);
      } else {
        assert.throws(run, c.expect.error);
      }
    });
  }
});

describe("Survey publishing rules", () => {
  for (const c of publishCases) {
    test(`${c.id} ${c.title}`, () => {
      const run = () => assertSurveyPublishable(c.questions);
      if (c.publishable) assert.doesNotThrow(run);
      else assert.throws(run, c.error);
    });
  }
});
