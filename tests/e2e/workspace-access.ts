/**
 * Live acceptance checks for workspace isolation, per-member permissions,
 * individual prompt sharing, time tracking and insights. Needs a running
 * backend + MongoDB:
 *
 *   npm run test:access
 *
 * Registers throwaway users (`access-…@example.test`) and deletes the
 * projects it creates (users and workspaces have no delete endpoint).
 */
import { isDeepStrictEqual } from "node:util";

const API = (process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api").replace(
  /\/+$/,
  "",
);
const RUN = `access-${Date.now().toString(36)}`;
const TODAY = new Date().toISOString().slice(0, 10);

let passes = 0;
let failures = 0;
const check = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n      ${(error as Error).message}`);
  }
};
const eq = (actual: unknown, expected: unknown, label: string) => {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};
const expect = (cond: unknown, label: string) => {
  if (!cond) throw new Error(label);
};

interface Res {
  status: number;
  body: any;
}

/** One signed-in user; `ws` is sent as X-Workspace-Id. */
class Client {
  token = "";
  userId = "";
  ws = "";
  constructor(readonly label: string) {}

  async register() {
    const res = await this.call("POST", "/auth/register", {
      email: `${RUN}-${this.label}@example.test`,
      password: "Access-Passw0rd!",
      firstName: this.label,
      lastName: RUN,
    });
    if (res.status >= 300)
      throw new Error(`register ${this.label}: ${res.status}`);
    this.token = res.body.data.accessToken;
    this.userId = res.body.data.user?.id ?? res.body.data.user?._id;
    const workspaces = await this.ok("GET", "/workspaces");
    this.ws = workspaces.workspaces[0].id;
    return this;
  }

  get email() {
    return `${RUN}-${this.label}@example.test`;
  }

  async call(method: string, url: string, body?: unknown): Promise<Res> {
    const res = await fetch(`${API}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(this.ws ? { "X-Workspace-Id": this.ws } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* text */
    }
    return { status: res.status, body: parsed };
  }

  async ok(method: string, url: string, body?: unknown) {
    const res = await this.call(method, url, body);
    if (res.status < 200 || res.status > 299) {
      throw new Error(
        `${this.label} ${method} ${url}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 240)}`,
      );
    }
    return res.body;
  }

  async status(method: string, url: string, body?: unknown) {
    return (await this.call(method, url, body)).status;
  }
}

const createdProjects: Array<{ client: Client; id: string }> = [];

const main = async () => {
  console.log(`Access run ${RUN} against ${API}`);
  const owner = await new Client("owner").register();
  const member = await new Client("member").register();
  const member2 = await new Client("member2").register();
  const outsider = await new Client("outsider").register();
  const outsiderWs = outsider.ws;

  // Owner invites both members into their workspace.
  const m1 = (
    await owner.ok("POST", `/workspaces/${owner.ws}/members`, {
      email: member.email,
    })
  ).member;
  const m2 = (
    await owner.ok("POST", `/workspaces/${owner.ws}/members`, {
      email: member2.email,
    })
  ).member;
  member.ws = owner.ws;
  member2.ws = owner.ws;

  const project = (
    await owner.ok("POST", "/projects", { name: `Apollo ${RUN}` })
  ).data.project;
  createdProjects.push({ client: owner, id: project.id });
  const task = (
    await owner.ok("POST", "/tasks", {
      title: "Design",
      date: TODAY,
      projectId: project.id,
    })
  ).data.task;

  console.log("\n▶ Workspace isolation");
  await check(
    "an outsider cannot see the workspace (404, not 403)",
    async () => {
      outsider.ws = owner.ws;
      eq(
        await outsider.status("GET", `/workspaces/${owner.ws}`),
        404,
        "workspace",
      );
      eq(
        await outsider.status("GET", "/projects"),
        404,
        "project list with foreign header",
      );
      outsider.ws = outsiderWs;
    },
  );
  await check("an outsider cannot reach the project or its tasks", async () => {
    eq(
      await outsider.status("GET", `/projects/${project.id}/members`),
      404,
      "project members",
    );
    eq(
      await outsider.status("PATCH", `/tasks/${task.id}/status`, {
        status: "DONE",
      }),
      404,
      "task status",
    );
    const list = await outsider.ok("GET", "/projects");
    expect(
      !list.data.projects.some((p: any) => p.id === project.id),
      "project not in outsider's list",
    );
  });

  console.log("\n▶ Project access inside the workspace");
  await check("members only see projects they were given", async () => {
    const before = await member.ok("GET", "/projects");
    eq(before.data.projects.length, 0, "no projects before access");
    await owner.ok("POST", `/projects/${project.id}/members`, {
      userId: member.userId,
    });
    const after = await member.ok("GET", "/projects");
    eq(
      after.data.projects.map((p: any) => p.id),
      [project.id],
      "project after access",
    );
  });
  await check(
    "project access requires workspace membership first",
    async () => {
      eq(
        await owner.status("POST", `/projects/${project.id}/members`, {
          userId: outsider.userId,
        }),
        400,
        "outsider",
      );
    },
  );

  console.log("\n▶ Permission flags");
  await check(
    "project.create is off by default and can be granted",
    async () => {
      eq(
        await member.status("POST", "/projects", { name: `Member ${RUN}` }),
        403,
        "before",
      );
      await owner.ok(
        "PATCH",
        `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
        {
          permissions: { "project.create": true },
        },
      );
      const res = await member.ok("POST", "/projects", {
        name: `Member ${RUN}`,
      });
      createdProjects.push({ client: member, id: res.data.project.id });
    },
  );
  await check(
    "members cannot change permissions (theirs or anyone's)",
    async () => {
      eq(
        await member.status(
          "PATCH",
          `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
          { permissions: { "project.delete": true } },
        ),
        403,
        "self",
      );
      eq(
        await member.status(
          "PATCH",
          `/workspaces/${owner.ws}/members/${m2.id}/permissions`,
          { permissions: { "project.delete": true } },
        ),
        403,
        "other",
      );
    },
  );
  await check("invalid permission keys are rejected", async () => {
    eq(
      await owner.status(
        "PATCH",
        `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
        { permissions: { "root.access": true } },
      ),
      400,
      "unknown key",
    );
  });
  await check("task.update_status is enforced server-side", async () => {
    eq(
      await member.status("PATCH", `/tasks/${task.id}/status`, {
        status: "IN_PROGRESS",
      }),
      200,
      "allowed by default",
    );
    await owner.ok(
      "PATCH",
      `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
      {
        permissions: { "task.update_status": false },
      },
    );
    eq(
      await member.status("PATCH", `/tasks/${task.id}/status`, {
        status: "DONE",
      }),
      403,
      "after revoking",
    );
    await owner.ok(
      "PATCH",
      `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
      {
        permissions: { "task.update_status": true },
      },
    );
  });
  await check("my-access reflects the flags", async () => {
    const me = (await member.ok("GET", `/workspaces/${owner.ws}/me`)).access;
    eq(me.isAdmin, false, "not admin");
    eq(me.permissions["project.create"], true, "granted flag");
    eq(me.permissions["project.delete"], false, "default flag");
  });

  console.log("\n▶ Prompts and individual sharing");
  const base = `/workspaces/${owner.ws}/prompts`;
  const privatePrompt = (
    await owner.ok("POST", base, {
      name: `Secret ${RUN}`,
      body: "Hi",
      visibility: "private",
    })
  ).data;
  const projectPrompt = (
    await owner.ok("POST", base, {
      name: `Team ${RUN}`,
      body: "Hi",
      visibility: "project",
      projectId: project.id,
    })
  ).data;
  await owner.ok("POST", `/projects/${project.id}/members`, {
    userId: member2.userId,
  });
  const visible = async (c: Client) =>
    (await c.ok("GET", base)).data.map((p: any) => String(p._id));

  await check(
    "project prompts are visible to project members, private ones are not",
    async () => {
      const ids = await visible(member);
      expect(ids.includes(String(projectPrompt._id)), "project prompt visible");
      expect(!ids.includes(String(privatePrompt._id)), "private prompt hidden");
      eq(
        await member.status("GET", `${base}/${privatePrompt._id}`),
        403,
        "private detail",
      );
    },
  );
  await check(
    "a prompt shared with one member stays invisible to another",
    async () => {
      await owner.ok("POST", `${base}/${privatePrompt._id}/access`, {
        userId: member.userId,
      });
      expect(
        (await visible(member)).includes(String(privatePrompt._id)),
        "member sees shared prompt",
      );
      expect(
        !(await visible(member2)).includes(String(privatePrompt._id)),
        "member2 does not",
      );
      eq(
        await member2.status("GET", `${base}/${privatePrompt._id}`),
        403,
        "member2 detail",
      );
    },
  );
  await check("sharing needs prompt.share_individual", async () => {
    eq(
      await member.status("POST", `${base}/${projectPrompt._id}/access`, {
        userId: member2.userId,
      }),
      403,
      "member without flag",
    );
  });
  await check(
    "attaching to a project needs prompt.add_to_project",
    async () => {
      eq(
        await member.status("POST", base, {
          name: `Mine ${RUN}`,
          body: "x",
          visibility: "project",
          projectId: project.id,
        }),
        403,
        "without flag",
      );
    },
  );
  await check("prompts never cross workspaces", async () => {
    outsider.ws = owner.ws;
    eq(await outsider.status("GET", base), 404, "outsider listing");
    outsider.ws = outsiderWs;
  });

  console.log("\n▶ Time tracking");
  const entries = `/projects/${project.id}/time-entries`;
  const ownEntry = (
    await member.ok("POST", entries, {
      taskId: task.id,
      hours: 2,
      date: TODAY,
      note: "Wireframes",
    })
  ).data.entry;
  const ownerEntry = (
    await owner.ok("POST", entries, {
      taskId: task.id,
      hours: 3.5,
      date: TODAY,
    })
  ).data.entry;
  const task2 = (
    await owner.ok("POST", "/tasks", {
      title: "Build",
      date: TODAY,
      projectId: project.id,
    })
  ).data.task;
  await member.ok("POST", entries, {
    taskId: task2.id,
    hours: 1.25,
    date: TODAY,
  });

  await check("totals by task, by member and by member per task", async () => {
    const s = (await owner.ok("GET", `/projects/${project.id}/time-summary`))
      .data;
    eq(s.totalHours, 6.75, "project total");
    eq(
      Object.fromEntries(s.byTask.map((t: any) => [t.title, t.hours])),
      { Design: 5.5, Build: 1.25 },
      "by task",
    );
    eq(
      Object.fromEntries(s.byMember.map((m: any) => [m.userId, m.hours])),
      { [owner.userId]: 3.5, [member.userId]: 3.25 },
      "by member",
    );
    const memberDesign = s.byMemberTask.find(
      (r: any) => r.userId === member.userId && r.taskId === task.id,
    );
    eq(memberDesign.hours, 2, "member on Design");
    eq(s.daily, [{ date: TODAY, hours: 6.75 }], "daily rollup");
  });
  await check("per-member breakdown endpoint", async () => {
    const s = (
      await member.ok(
        "GET",
        `/projects/${project.id}/time-summary/by-member/${member.userId}`,
      )
    ).data;
    eq(s.totalHours, 3.25, "member total");
    eq(s.byTask.length, 2, "two tasks");
  });
  await check("only project members can log hours", async () => {
    const m3 = await new Client("member3").register();
    await owner.ok("POST", `/workspaces/${owner.ws}/members`, {
      email: m3.email,
    });
    m3.ws = owner.ws;
    eq(
      await m3.status("POST", entries, {
        taskId: task.id,
        hours: 1,
        date: TODAY,
      }),
      403,
      "workspace member outside project",
    );
    eq(
      await outsider.status("POST", entries, {
        taskId: task.id,
        hours: 1,
        date: TODAY,
      }),
      404,
      "outsider",
    );
  });
  await check(
    "members edit only their own entries; admins can edit any",
    async () => {
      eq(
        await member.status("PATCH", `/time-entries/${ownerEntry.id}`, {
          hours: 9,
        }),
        403,
        "member edits owner's",
      );
      eq(
        await member.status("PATCH", `/time-entries/${ownEntry.id}`, {
          hours: 2.5,
        }),
        200,
        "member edits own",
      );
      eq(
        await owner.status("PATCH", `/time-entries/${ownEntry.id}`, {
          note: "Reviewed",
        }),
        200,
        "admin edits member's",
      );
      eq(
        await outsider.status("DELETE", `/time-entries/${ownEntry.id}`),
        404,
        "outsider delete",
      );
    },
  );
  await check(
    "validation: no future dates, no more than 24h a day, task must be in project",
    async () => {
      eq(
        await member.status("POST", entries, {
          taskId: task.id,
          hours: 1,
          date: "2999-01-01",
        }),
        400,
        "future",
      );
      eq(
        await member.status("POST", entries, {
          taskId: task.id,
          hours: 23,
          date: TODAY,
        }),
        400,
        "over 24h",
      );
      eq(
        await member.status("POST", entries, {
          taskId: "000000000000000000000000",
          hours: 1,
          date: TODAY,
        }),
        400,
        "foreign task",
      );
    },
  );

  console.log("\n▶ Insights");
  await check("intelligence.view gates the insights page", async () => {
    const data = (
      await member.ok("GET", "/analytics/insights?timeRange=last_7_days")
    ).data;
    eq(
      data.scope.projectCount,
      2,
      "member sees only the two projects they can open",
    );
    expect(data.hours.total >= 6, "hours included");
    await owner.ok(
      "PATCH",
      `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
      {
        permissions: { "intelligence.view": false },
      },
    );
    eq(
      await member.status("GET", "/analytics/insights"),
      403,
      "after revoking",
    );
  });
  await check("intelligence.analyze gates analyses", async () => {
    await owner.ok(
      "PATCH",
      `/workspaces/${owner.ws}/members/${m1.id}/permissions`,
      {
        permissions: { "intelligence.view": true },
      },
    );
    eq(
      await member.status("POST", "/analytics/forecast", {
        metric: "delivery_risk",
      }),
      403,
      "member without analyze",
    );
    expect(
      (await owner.status("POST", "/analytics/forecast", {
        metric: "delivery_risk",
      })) < 400,
      "admin may analyze",
    );
  });
  await check(
    "insights never include another workspace's projects",
    async () => {
      const data = (await outsider.ok("GET", "/analytics/insights")).data;
      eq(data.scope.projectCount, 0, "outsider has no projects");
    },
  );

  console.log("\n▶ Member removal");
  await check(
    "removing a member revokes project access and prompt grants",
    async () => {
      await owner.ok("DELETE", `/workspaces/${owner.ws}/members/${m1.id}`);
      eq(
        await member.status("GET", `/projects/${project.id}/members`),
        404,
        "project gone for removed member",
      );
      eq(await member.status("GET", base), 404, "workspace gone");
    },
  );
  await check("the owner cannot be edited or removed", async () => {
    const members = (await owner.ok("GET", `/workspaces/${owner.ws}/members`))
      .members;
    const self = members.find((m: any) => m.role === "OWNER");
    eq(
      await owner.status(
        "DELETE",
        `/workspaces/${owner.ws}/members/${self.id}`,
      ),
      403,
      "remove self/owner",
    );
  });
};

main()
  .catch((error) => {
    failures++;
    console.error(error);
  })
  .finally(async () => {
    for (const { client, id } of createdProjects) {
      await client.call("DELETE", `/projects/${id}`).catch(() => undefined);
    }
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures > 0 ? 1 : 0);
  });
