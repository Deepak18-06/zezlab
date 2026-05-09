import request from "supertest";
import app from "../app";

describe("GET /", () => {
  it("returns hello message", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.message).toBe("Hello from Zezlab!");
  });
});

describe("GET /health", () => {
  it("returns health ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
