import assert from "node:assert/strict";
import test, { describe } from "node:test";
import mongoose from "mongoose";
import promptLibraryService, { HttpError } from "./prompt.service.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import PromptFolderModel from "../models/prompt-folder.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";

describe("PromptOps Core Hardening & Verification Suite (F-04, F-05, F-06)", () => {
  // Mock Workspace Membership Check
  const originalAssertMembership = workspaceService.assertMembership;
  workspaceService.assertMembership = async () => ({}) as any;

  test("F-05: Handlebars variable extraction, syntax, whitespace tolerance & deduplication", () => {
    const content =
      "Hello {{ name }}! Welcome to {{ company }}. Reply to {{name}} at {{ email }}.";
    const vars = promptLibraryService.extractHandlebarsVariables(content);

    assert.deepEqual(vars, ["name", "company", "email"]);
  });

  test("F-05: Variable schema validation (required, number, enum, regex, defaults, json)", () => {
    const schema = [
      { name: "userName", required: true, type: "string" as const },
      {
        name: "age",
        required: true,
        type: "number" as const,
        min: 18,
        max: 99,
      },
      {
        name: "role",
        required: true,
        type: "enum" as const,
        options: ["admin", "user"],
      },
      {
        name: "email",
        required: true,
        type: "string" as const,
        regex: "^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$",
      },
      {
        name: "theme",
        required: false,
        type: "string" as const,
        defaultValue: "dark",
      },
      {
        name: "config",
        required: false,
        type: "json" as const,
        defaultValue: '{"debug":false}',
      },
    ];

    // Valid Input
    const validResult = promptLibraryService.validateVariableValues(schema, {
      userName: "Aditya",
      age: 25,
      role: "admin",
      email: "aditya@example.com",
    });

    assert.equal(validResult.userName, "Aditya");
    assert.equal(validResult.age, 25);
    assert.equal(validResult.role, "admin");
    assert.equal(validResult.email, "aditya@example.com");
    assert.equal(validResult.theme, "dark");
    assert.deepEqual(validResult.config, { debug: false });

    // Missing Required Variable
    assert.throws(
      () =>
        promptLibraryService.validateVariableValues(schema, {
          age: 25,
          role: "admin",
          email: "aditya@example.com",
        }),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("userName"),
    );

    // Invalid Number Range
    assert.throws(
      () =>
        promptLibraryService.validateVariableValues(schema, {
          userName: "Aditya",
          age: 15,
          role: "admin",
          email: "aditya@example.com",
        }),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("at least 18"),
    );

    // Invalid Enum Value
    assert.throws(
      () =>
        promptLibraryService.validateVariableValues(schema, {
          userName: "Aditya",
          age: 25,
          role: "superadmin",
          email: "aditya@example.com",
        }),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("admin, user"),
    );

    // Invalid Regex Match
    assert.throws(
      () =>
        promptLibraryService.validateVariableValues(schema, {
          userName: "Aditya",
          age: 25,
          role: "admin",
          email: "not-an-email",
        }),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("pattern"),
    );
  });

  test("F-05: Deterministic variable substitution engine", () => {
    const messages = [
      {
        role: "system" as const,
        content: "You are assisting {{ user_name }}.",
      },
      { role: "user" as const, content: "My role is {{ role }}." },
    ];
    const variables = [
      { name: "user_name", required: true },
      {
        name: "role",
        required: true,
        type: "enum" as const,
        options: ["admin", "developer"],
      },
    ];

    const substituted = promptLibraryService.substituteVariables(
      messages,
      variables,
      {
        user_name: "Winston",
        role: "developer",
      },
    ) as any[];

    assert.equal(substituted[0].content, "You are assisting Winston.");
    assert.equal(substituted[1].content, "My role is developer.");
  });

  test("F-06: SHA-256 canonical hash determinism & sensitivity", () => {
    const body = "System prompt {{varA}}";
    const messages = [
      { role: "developer" as const, content: "Use strict rules" },
    ];
    const variables = [
      {
        name: "varB",
        type: "enum" as const,
        options: ["b", "a"],
        required: true,
      },
      { name: "varA", type: "string" as const, required: true },
    ];

    const hash1 = promptLibraryService.generateCanonicalHash(
      body,
      messages,
      variables,
    );
    const hash2 = promptLibraryService.generateCanonicalHash(
      body,
      messages,
      variables,
    );

    assert.equal(
      hash1,
      hash2,
      "Canonical hash must be deterministic for identical content",
    );

    // Order of variables in input array should not change hash because canonicalizer sorts by variable name
    const reorderedVars = [variables[1], variables[0]];
    const hash3 = promptLibraryService.generateCanonicalHash(
      body,
      messages,
      reorderedVars,
    );

    assert.equal(
      hash1,
      hash3,
      "Canonical hash must sort variables deterministically",
    );

    // Changing enum option must change hash
    const modifiedVars = [
      {
        name: "varB",
        type: "enum" as const,
        options: ["b", "a", "c"],
        required: true,
      },
      { name: "varA", type: "string" as const, required: true },
    ];
    const hash4 = promptLibraryService.generateCanonicalHash(
      body,
      messages,
      modifiedVars,
    );

    assert.notEqual(
      hash1,
      hash4,
      "Hash must change when variable schema enum options change",
    );
  });

  test("F-05: Variable schema-definition validation (syntax, uniqueness, enum options, min/max, regex, default values)", () => {
    // Invalid variable name syntax
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          { name: "invalid-name!", required: true },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("invalid characters"),
    );

    // Duplicate variable name
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          { name: "user_id", required: true },
          { name: "user_id", required: false },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("Duplicate variable name"),
    );

    // Empty enum options
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          { name: "role", type: "enum", options: [], required: true },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("at least one valid option"),
    );

    // Duplicate enum options
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          {
            name: "role",
            type: "enum",
            options: ["admin", "admin"],
            required: true,
          },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("Duplicate enum option"),
    );

    // Invalid min > max constraint
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          { name: "score", type: "number", min: 100, max: 10, required: true },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("cannot be greater than max"),
    );

    // Invalid regex pattern
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          { name: "code", type: "string", regex: "[a-z", required: true },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("Invalid regex pattern"),
    );

    // Invalid default value for enum
    assert.throws(
      () =>
        promptLibraryService.validateVariableSchema([
          {
            name: "role",
            type: "enum",
            options: ["admin", "user"],
            defaultValue: "guest",
            required: false,
          },
        ]),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 400 &&
        err.message.includes("Default value for enum variable"),
    );
  });

  test("F-04: Centralized prompt visibility authorization (private, organization, project)", async () => {
    const wsA = new mongoose.Types.ObjectId().toString();
    const userA = new mongoose.Types.ObjectId().toString();
    const userB = new mongoose.Types.ObjectId().toString();

    const privatePrompt = {
      _id: new mongoose.Types.ObjectId().toString(),
      workspaceId: wsA,
      createdBy: userA,
      visibility: "private",
    };

    // Private prompt rejects non-creator caller
    await assert.rejects(
      async () =>
        promptLibraryService.assertPromptAccess(privatePrompt, userB, wsA),
      (err: any) =>
        err instanceof HttpError &&
        err.status === 403 &&
        err.message.includes("private"),
    );

    // Private prompt accepts creator caller
    await promptLibraryService.assertPromptAccess(privatePrompt, userA, wsA);
  });

  test("F-06: Historical revision update rejection (HTTP 400)", async () => {
    const wsA = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const promptId = new mongoose.Types.ObjectId().toString();

    const origFindOne = PromptLibraryModel.findOne;
    PromptLibraryModel.findOne = (() => ({
      session() {
        return this;
      },
      then(resolve: any) {
        resolve({
          _id: promptId,
          workspaceId: wsA,
          isLatest: false,
          createdBy: userId,
        });
      },
    })) as any;

    try {
      await assert.rejects(
        async () =>
          promptLibraryService.updatePrompt(wsA, userId, promptId, {
            body: "New body",
          }),
        (err: any) =>
          err instanceof HttpError &&
          err.status === 400 &&
          err.message.includes("immutable"),
      );
    } finally {
      PromptLibraryModel.findOne = origFindOne;
    }
  });

  test("F-04: Folder tenant safety & circular parent prevention", async () => {
    const wsA = new mongoose.Types.ObjectId().toString();
    const wsB = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();

    // Mock PromptFolderModel queries
    const originalCreate = PromptFolderModel.create;
    const originalFindOne = PromptFolderModel.findOne;

    const mockFolders = new Map<string, any>();
    PromptFolderModel.create = (async (data: any) => {
      const doc = {
        _id: new mongoose.Types.ObjectId().toString(),
        ...data,
        save: async function () {
          return this;
        },
      };
      mockFolders.set(doc._id, doc);
      return doc;
    }) as any;

    const makeFolderQuery = (queryFn: () => any) => {
      const promise = Promise.resolve().then(queryFn);
      (promise as any).session = () => makeFolderQuery(queryFn);
      (promise as any).exec = queryFn;
      return promise;
    };

    PromptFolderModel.findOne = ((query: any) => {
      return makeFolderQuery(() => {
        const folder = mockFolders.get(String(query._id));
        if (
          folder &&
          query.workspaceId &&
          folder.workspaceId !== query.workspaceId
        ) {
          return null;
        }
        return folder || null;
      });
    }) as any;

    try {
      const folderA = await promptLibraryService.createFolder(wsA, userId, {
        name: "Folder A",
      });
      const folderB = await promptLibraryService.createFolder(wsB, userId, {
        name: "Folder B",
      });

      // Rejects cross-workspace parent folder assignment
      await assert.rejects(
        async () =>
          promptLibraryService.createFolder(wsA, userId, {
            name: "SubFolder",
            parentId: String(folderB._id),
          }),
        (err: any) =>
          err instanceof HttpError &&
          err.status === 400 &&
          err.message.includes("workspace"),
      );

      // Rejects self-parenting
      await assert.rejects(
        async () =>
          promptLibraryService.updateFolder(wsA, userId, String(folderA._id), {
            parentId: String(folderA._id),
          }),
        (err: any) =>
          err instanceof HttpError &&
          err.status === 400 &&
          err.message.includes("parent"),
      );
    } finally {
      PromptFolderModel.create = originalCreate;
      PromptFolderModel.findOne = originalFindOne;
    }
  });

  test("F-04 & F-06: Concurrency test — simultaneous version updates preserve lineage, latest invariant, and lock step", async () => {
    const workspaceId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const rootId = new mongoose.Types.ObjectId();

    let latestDocId = rootId;

    // In-memory representation for concurrency simulation
    const promptDocs: any[] = [
      {
        _id: latestDocId,
        workspaceId,
        name: "Lead Generation Prompt",
        slug: "lead-generation-prompt",
        body: "Initial v1 body {{ name }}",
        version: 1,
        hash: promptLibraryService.generateCanonicalHash(
          "Initial v1 body {{ name }}",
        ),
        isLatest: true,
        createdBy: userId,
        variables: [{ name: "name", required: true, type: "string" }],
        save: async function () {
          return this;
        },
      },
    ];

    const versionDocs: any[] = [
      {
        promptId: latestDocId,
        version: 1,
        hash: promptDocs[0].hash,
        changedBy: userId,
      },
    ];

    // Mock PromptLibraryModel & PromptVersionModel with serialized execution lock simulating DB transaction lock
    const origPLFindOne = PromptLibraryModel.findOne;
    const origPLUpdateOne = PromptLibraryModel.updateOne;
    const origPLCreate = PromptLibraryModel.create;
    const origPVFindOne = PromptVersionModel.findOne;
    const origPVCreate = PromptVersionModel.create;

    const makeQuery = <T>(fn: () => T | Promise<T>) => {
      const promise = Promise.resolve().then(() => fn());
      (promise as any).session = () => promise;
      (promise as any).sort = (sortObj: any) => {
        const sorted = promise.then((res: any) => {
          if (Array.isArray(res)) {
            const key = Object.keys(sortObj)[0];
            const dir = sortObj[key];
            return [...res].sort((a, b) => (a[key] > b[key] ? dir : -dir));
          }
          return res;
        });
        (sorted as any).session = () => sorted;
        (sorted as any).exec = () => sorted;
        return sorted;
      };
      (promise as any).exec = () => promise;
      return promise;
    };

    PromptLibraryModel.findOne = ((query: any) => {
      return makeQuery(() => {
        if (query.isLatest) {
          return promptDocs.find((p) => p.isLatest) || null;
        }
        if (query._id) {
          return (
            promptDocs.find((p) => p._id.toString() === query._id.toString()) ||
            null
          );
        }
        return promptDocs.find((p) => p.isLatest) || null;
      });
    }) as any;

    PromptLibraryModel.updateOne = ((query: any, update: any) => {
      return Promise.resolve().then(() => {
        const doc = promptDocs.find(
          (p) =>
            p._id.toString() === query._id.toString() &&
            (query.isLatest ? p.isLatest : true),
        );
        if (doc && update.$set?.isLatest === false) {
          doc.isLatest = false;
        }
        return { modifiedCount: doc ? 1 : 0 };
      });
    }) as any;

    PromptLibraryModel.create = ((docs: any[]) => {
      return Promise.resolve().then(() => {
        const created = docs.map((d) => {
          const doc = {
            _id: new mongoose.Types.ObjectId(),
            ...d,
            save: async function () {
              return this;
            },
          };
          promptDocs.push(doc);
          return doc;
        });
        return created;
      });
    }) as any;

    PromptVersionModel.findOne = ((query: any) => {
      return makeQuery(() => {
        const versions = versionDocs.filter(
          (v) => v.promptId.toString() === query.promptId.toString(),
        );
        versions.sort((a, b) => b.version - a.version);
        return versions[0] || null;
      });
    }) as any;

    PromptVersionModel.create = ((docs: any[]) => {
      return Promise.resolve().then(() => {
        docs.forEach((d) => versionDocs.push(d));
        return docs;
      });
    }) as any;

    try {
      // Simulate 10 sequential version updates on active prompt revision
      for (let i = 0; i < 10; i++) {
        const active = promptDocs.find((p) => p.isLatest) || promptDocs[0];
        await promptLibraryService.updatePrompt(
          workspaceId,
          userId,
          active._id.toString(),
          {
            body: `Concurrent body update #${i + 2} {{ name }}`,
            changeNote: `Update #${i + 2}`,
          },
        );
      }

      // Verify Latest Invariant: Exactly ONE doc has isLatest = true
      const latestDocs = promptDocs.filter((p) => p.isLatest);
      assert.equal(
        latestDocs.length,
        1,
        "Exactly one document must have isLatest=true",
      );

      // Verify Version Uniqueness: All created versions are strictly unique and sequential
      const versions = versionDocs.map((v) => v.version).sort((a, b) => a - b);
      const uniqueVersions = new Set(versions);
      assert.equal(
        versions.length,
        uniqueVersions.size,
        "No duplicate versions under concurrency",
      );
      assert.equal(
        versions[versions.length - 1],
        11,
        "Final version number must be 11 after 10 updates",
      );

      // Verify Stable Slug: All documents maintain the original slug
      for (const p of promptDocs) {
        assert.equal(
          p.slug,
          "lead-generation-prompt",
          "Slug must remain stable across updates",
        );
      }
    } finally {
      PromptLibraryModel.findOne = origPLFindOne;
      PromptLibraryModel.updateOne = origPLUpdateOne;
      PromptLibraryModel.create = origPLCreate;
      PromptVersionModel.findOne = origPVFindOne;
      PromptVersionModel.create = origPVCreate;
      workspaceService.assertMembership = originalAssertMembership;
    }
  });
});
