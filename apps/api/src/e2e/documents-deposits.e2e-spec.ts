import { createHarness, randomPhone, type Harness, type TestPg } from "./harness";

/**
 * M4 KYC documents + deposits + exit settlement e2e. The load-bearing proofs:
 * the document review guard (double-verify → 409), one deposit per resident,
 * exit money conservation (held = Σdeductions + refund), over-deduction
 * rejection WITH rollback (resident stays ACTIVE + deposit stays HELD),
 * double-settle → 409, and the cross-milestone tie: an EXITED resident's ended
 * allocation makes the next generation bill them zero.
 */
describe("M4 documents, deposits & exit (e2e)", () => {
  let h: Harness;
  let pgA: TestPg;

  let r1Id: string;
  let r2Id: string;
  let r3Id: string;
  let r4Id: string; // registered but never allocated (bedFreed:false case)
  let r1: string; // token
  let r2: string; // token

  async function newId(res: { status: number; body: { id: string } }): Promise<string> {
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.id;
  }

  beforeAll(async () => {
    h = await createHarness();
    pgA = await h.onboardPg("kyc-a");
    const mgr = pgA.managerToken;

    const buildingId = await newId(
      await h.req("post", "/property/buildings", mgr, { name: "Block A" }),
    );
    const floorId = await newId(
      await h.req("post", "/property/floors", mgr, { buildingId, label: "G" }),
    );
    const roomId = await newId(
      await h.req("post", "/property/rooms", mgr, {
        floorId,
        label: "101",
        capacity: 3,
        monthlyRentPaise: 800000,
      }),
    );
    const beds = [];
    for (const label of ["A", "B", "C"]) {
      beds.push(await newId(await h.req("post", "/property/beds", mgr, { roomId, label })));
    }

    const p1 = randomPhone();
    const p2 = randomPhone();
    r1Id = await h.registerResident(mgr, { name: "Res One", phone: p1 });
    r2Id = await h.registerResident(mgr, { name: "Res Two", phone: p2 });
    r3Id = await h.registerResident(mgr, { name: "Res Three", phone: randomPhone() });
    r4Id = await h.registerResident(mgr, { name: "Res Four", phone: randomPhone() });
    r1 = await h.residentLogin(pgA.slug, pgA.id, p1);
    r2 = await h.residentLogin(pgA.slug, pgA.id, p2);

    // r4 is intentionally NOT allocated (exit-with-no-allocation edge).
    await h.req("post", "/allocations", mgr, { bedId: beds[0], residentId: r1Id });
    await h.req("post", "/allocations", mgr, { bedId: beds[1], residentId: r2Id });
    await h.req("post", "/allocations", mgr, { bedId: beds[2], residentId: r3Id });
  }, 30000);

  afterAll(async () => {
    await h?.close();
  });

  describe("documents (KYC review)", () => {
    let docId: string;

    it("resident submits a doc; manager verifies; double-verify is blocked (409)", async () => {
      docId = await newId(
        await h.req("post", "/documents", r1, { type: "AADHAAR", s3Key: "k1" }),
      );
      const mine = await h.req("get", "/documents/mine", r1);
      expect(mine.body.find((d: { id: string }) => d.id === docId).status).toBe("PENDING");

      const verify = await h.req("post", `/documents/${docId}/verify`, pgA.managerToken);
      expect(verify.status).toBe(201);

      const again = await h.req("post", `/documents/${docId}/verify`, pgA.managerToken);
      expect(again.status).toBe(409);

      // A decided document also can't be flipped to the other outcome — the
      // conditional guard keys on status=PENDING, not just "not already verified".
      const flip = await h.req("post", `/documents/${docId}/reject`, pgA.managerToken, {
        note: "too late",
      });
      expect(flip.status).toBe(409);
    });

    it("manager rejects a second doc with a note", async () => {
      const id = await newId(
        await h.req("post", "/documents", r1, { type: "PAN", s3Key: "k2" }),
      );
      const reject = await h.req("post", `/documents/${id}/reject`, pgA.managerToken, {
        note: "Blurry scan",
      });
      expect(reject.status).toBe(201);
      const mine = await h.req("get", "/documents/mine", r1);
      expect(mine.body.find((d: { id: string }) => d.id === id).status).toBe("REJECTED");
    });

    it("re-uploading a rejected doc replaces it in place (back to PENDING, no duplicate)", async () => {
      // The PAN above is REJECTED. A re-submit ("ask for re-upload" loop) reuses
      // the same row (unique tenant+resident+type) and resets it to PENDING.
      const resubmit = await h.req("post", "/documents", r1, {
        type: "PAN",
        s3Key: "k2-v2",
      });
      expect(resubmit.status).toBe(201);

      const mine = await h.req("get", "/documents/mine", r1);
      const pans = mine.body.filter((d: { type: string }) => d.type === "PAN");
      expect(pans).toHaveLength(1); // replaced, not duplicated
      expect(pans[0].status).toBe("PENDING");
    });

    it("re-submitting a VERIFIED doc is blocked (409, never silently un-verified)", async () => {
      // The AADHAAR above is VERIFIED; re-submitting must not reset it to PENDING.
      const resubmit = await h.req("post", "/documents", r1, {
        type: "AADHAAR",
        s3Key: "k1-v2",
      });
      expect(resubmit.status).toBe(409);

      const mine = await h.req("get", "/documents/mine", r1);
      const aadhaar = mine.body.find(
        (d: { type: string }) => d.type === "AADHAAR",
      );
      expect(aadhaar.status).toBe("VERIFIED"); // unchanged
    });

    it("a resident does not see another resident's docs (intra-tenant)", async () => {
      const mine = await h.req("get", "/documents/mine", r2);
      expect(mine.body).toHaveLength(0);
    });
  });

  describe("deposits & exit settlement", () => {
    it("records a deposit; a second for the same resident is rejected (409)", async () => {
      const first = await h.req("post", "/deposits", pgA.managerToken, {
        residentId: r1Id,
        amountPaise: 1000000,
      });
      expect(first.status).toBe(201);
      const dup = await h.req("post", "/deposits", pgA.managerToken, {
        residentId: r1Id,
        amountPaise: 500000,
      });
      expect(dup.status).toBe(409);

      const mine = await h.req("get", "/deposits/mine", r1);
      expect(mine.body.deposit.amountPaise).toBe(1000000);
      expect(mine.body.deposit.status).toBe("HELD");

      // r2 also gets a deposit (used by the over-deduction case below).
      await h.req("post", "/deposits", pgA.managerToken, {
        residentId: r2Id,
        amountPaise: 500000,
      });
    });

    it("settles an exit: held = Σdeductions + refund, resident EXITED, bed freed", async () => {
      const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
        residentId: r1Id,
        deductions: [{ reason: "Cleaning", amountPaise: 200000 }],
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        depositPaise: 1000000,
        totalDeductionsPaise: 200000,
        refundPaise: 800000,
        exited: true,
        bedFreed: true,
      });
      // Conservation invariant.
      expect(res.body.totalDeductionsPaise + res.body.refundPaise).toBe(res.body.depositPaise);

      const ledger = await h.req("get", `/deposits/resident/${r1Id}`, pgA.managerToken);
      expect(ledger.body.deposit.status).toBe("SETTLED");
      const types = ledger.body.ledger.map((t: { type: string }) => t.type).sort();
      expect(types).toEqual(["DEDUCTION", "REFUND"]);
    });

    it("a second settlement for the same resident is blocked (409)", async () => {
      const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
        residentId: r1Id,
        deductions: [],
      });
      expect(res.status).toBe(409);
    });

    it("over-deduction is rejected AND rolled back (resident stays ACTIVE, deposit HELD)", async () => {
      const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
        residentId: r2Id,
        deductions: [{ reason: "Damage", amountPaise: 600000 }], // > 500000 held
      });
      expect(res.status).toBe(409);

      // Rollback proof: deposit still HELD and the allocation is still active.
      const dep = await h.req("get", `/deposits/resident/${r2Id}`, pgA.managerToken);
      expect(dep.body.deposit.status).toBe("HELD");
      const active = await h.req("get", "/allocations", pgA.managerToken);
      expect(active.body.some((a: { residentId: string }) => a.residentId === r2Id)).toBe(true);

      // A valid resubmit now succeeds (proves the EXITED flip was rolled back).
      const ok = await h.req("post", "/deposits/exit", pgA.managerToken, {
        residentId: r2Id,
        deductions: [{ reason: "Damage", amountPaise: 100000 }],
      });
      expect(ok.status).toBe(201);
      expect(ok.body.refundPaise).toBe(400000);
    });

    it("an EXITED resident is billed zero on the next generation", async () => {
      // r1 and r2 have exited; only r3 is still active → only r3 is billed.
      const gen = await h.req("post", "/invoices/generate", pgA.managerToken, {
        period: "2026-07",
      });
      expect(gen.body.generated).toBe(1);

      const all = await h.req("get", "/invoices", pgA.managerToken);
      const july = all.body.items.filter((i: { period: string }) => i.period === "2026-07");
      expect(july).toHaveLength(1);
      expect(july[0].residentId).toBe(r3Id);
    });

    it("exit with no deposit still exits and frees the bed (refund 0)", async () => {
      const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
        residentId: r3Id,
        deductions: [],
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        depositPaise: 0,
        refundPaise: 0,
        exited: true,
        bedFreed: true,
      });
    });

    it("exit with no active allocation still exits (bedFreed:false)", async () => {
      const res = await h.req("post", "/deposits/exit", pgA.managerToken, {
        residentId: r4Id, // registered, never allocated
        deductions: [],
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        depositPaise: 0,
        refundPaise: 0,
        exited: true,
        bedFreed: false,
      });
    });
  });
});
