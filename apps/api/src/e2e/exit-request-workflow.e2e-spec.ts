import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * The move-out approval workflow: a resident's request/update/cancel is a
 * PENDING action until a manager approves or rejects it; only approval ever
 * changes the EFFECTIVE (approved) move-out. Covers the two-tier state
 * machine end to end — this is deliberately a separate file from
 * `resident-exit-photo.e2e-spec.ts` (which covers the plain first-request
 * shape) and `dashboard-alerts`/`transfer-auto-activate`/`short-stays` (which
 * cover consumers of the EFFECTIVE tier).
 */
describe("Exit-request approval workflow (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;

  let r1Id: string;
  let r1: string; // resident token

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("exit-flow");
    const mgr = pgA.managerToken;

    const p1 = randomPhone();
    r1Id = await h.registerResident(mgr, { name: "Res One", phone: p1 });
    r1 = await h.residentLogin(pgA.slug, pgA.id, p1);
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  it("a brand-new request is PENDING — not yet effective", async () => {
    const res = await h.req("post", "/deposits/exit-request", r1, {
      requestedDate: "2026-08-01",
      note: "Job relocation",
    });
    expect(res.status).toBe(201);

    const mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest.effective).toBeNull();
    expect(mine.body.exitRequest.pending).toMatchObject({
      type: "REQUEST",
      date: "2026-08-01",
      note: "Job relocation",
    });
    // Back-compat flat fields mirror the pending action.
    expect(mine.body.exitRequest.requestedDate).toBe("2026-08-01");
  });

  it("update/cancel are rejected while a request is still pending (409)", async () => {
    const update = await h.req("post", "/deposits/exit-request/update", r1, {
      requestedDate: "2026-09-01",
    });
    expect(update.status).toBe(409);
    const cancel = await h.req("post", "/deposits/exit-request/cancel", r1);
    expect(cancel.status).toBe(409);
  });

  it("the resident can withdraw their own pending request with no approval", async () => {
    const withdraw = await h.req(
      "post",
      "/deposits/exit-request/withdraw",
      r1,
    );
    expect(withdraw.status).toBe(201);

    const mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest).toBeNull();

    // A second withdraw with nothing pending is rejected.
    const again = await h.req("post", "/deposits/exit-request/withdraw", r1);
    expect(again.status).toBe(409);
  });

  it("approving a request adopts the pending date/note as effective", async () => {
    await h.req("post", "/deposits/exit-request", r1, {
      requestedDate: "2026-08-01",
      note: "Job relocation",
    });

    const approve = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/approve`,
      pgA.managerToken,
    );
    expect(approve.status).toBe(201);
    expect(approve.body.effective).toMatchObject({
      date: "2026-08-01",
      note: "Job relocation",
    });

    const mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest.pending).toBeNull();
    expect(mine.body.exitRequest.effective).toMatchObject({
      date: "2026-08-01",
      note: "Job relocation",
    });
  });

  it("a fresh request is rejected once one is already approved — must use update/cancel", async () => {
    const res = await h.req("post", "/deposits/exit-request", r1, {
      requestedDate: "2026-09-01",
    });
    expect(res.status).toBe(409);
  });

  it("proposes changing the month; rejecting leaves the approved month untouched", async () => {
    const update = await h.req("post", "/deposits/exit-request/update", r1, {
      requestedDate: "2026-09-15",
      note: "Need a few more weeks",
    });
    expect(update.status).toBe(201);

    let mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest.effective).toMatchObject({ date: "2026-08-01" });
    expect(mine.body.exitRequest.pending).toMatchObject({
      type: "UPDATE",
      date: "2026-09-15",
    });

    const reject = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/reject`,
      pgA.managerToken,
      { note: "Can't hold the room that long" },
    );
    expect(reject.status).toBe(201);

    mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest.pending).toBeNull();
    expect(mine.body.exitRequest.effective).toMatchObject({ date: "2026-08-01" });
  });

  it("approving a change adopts the new month as effective", async () => {
    await h.req("post", "/deposits/exit-request/update", r1, {
      requestedDate: "2026-09-01",
    });
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/approve`,
      pgA.managerToken,
    );
    expect(approve.body.effective).toMatchObject({ date: "2026-09-01" });
  });

  it("cancelling an approved move-out stays pending until approved; the effective date survives a reject", async () => {
    const cancel = await h.req("post", "/deposits/exit-request/cancel", r1);
    expect(cancel.status).toBe(201);

    let mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest.effective).toMatchObject({ date: "2026-09-01" });
    expect(mine.body.exitRequest.pending).toMatchObject({ type: "CANCEL", date: null });

    await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/reject`,
      pgA.managerToken,
    );
    mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest.pending).toBeNull();
    expect(mine.body.exitRequest.effective).toMatchObject({ date: "2026-09-01" });
  });

  it("approving a cancel clears the effective move-out entirely", async () => {
    await h.req("post", "/deposits/exit-request/cancel", r1);
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/approve`,
      pgA.managerToken,
    );
    expect(approve.body.effective).toBeNull();

    const mine = await h.req("get", "/deposits/mine", r1);
    expect(mine.body.exitRequest).toBeNull();
  });

  it("approve/reject with nothing pending is rejected (409), not a silent no-op", async () => {
    const approve = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/approve`,
      pgA.managerToken,
    );
    expect(approve.status).toBe(409);
    const reject = await h.req(
      "post",
      `/deposits/exit-request/${r1Id}/reject`,
      pgA.managerToken,
    );
    expect(reject.status).toBe(409);
  });

  it("a concurrent second decision on the same pending action loses the race (409)", async () => {
    await h.req("post", "/deposits/exit-request", r1, {
      requestedDate: "2026-10-01",
    });

    const [first, second] = await Promise.all([
      h.req("post", `/deposits/exit-request/${r1Id}/approve`, pgA.managerToken),
      h.req("post", `/deposits/exit-request/${r1Id}/reject`, pgA.managerToken),
    ]);
    const statuses = [first.status, second.status].sort();
    // Exactly one of the two concurrent decisions wins (201); the other finds
    // nothing pending left to act on (409) — never both succeeding.
    expect(statuses).toEqual([201, 409]);
  });
});
