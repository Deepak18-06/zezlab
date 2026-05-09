import express, { Request, Response } from "express";

const app = express();

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Hello from Zezlab!" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

export default app;
