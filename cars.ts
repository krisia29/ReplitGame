import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, carsTable, usersTable } from "@workspace/db";
import { CreateCarBody, UpdateCarBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { CAR_MODELS, TUNE_OPTIONS } from "../data/catalog";

const router = Router();

function computeStats(modelId: string, tuneId: string) {
  const model = CAR_MODELS.find((m) => m.id === modelId);
  const tune = TUNE_OPTIONS.find((t) => t.id === tuneId);
  if (!model) return { speed: 50, acceleration: 50, handling: 50, braking: 50 };
  const base = model.baseStats;
  const boost = tune?.statBoosts ?? { speed: 0, acceleration: 0, handling: 0, braking: 0 };
  return {
    speed: Math.min(99, base.speed + boost.speed),
    acceleration: Math.min(99, base.acceleration + boost.acceleration),
    handling: Math.min(99, base.handling + boost.handling),
    braking: Math.min(99, base.braking + boost.braking),
  };
}

function formatCar(car: typeof carsTable.$inferSelect) {
  return {
    id: car.id,
    userId: car.userId,
    modelId: car.modelId,
    name: car.name,
    paintColor: car.paintColor,
    wrapId: car.wrapId,
    wheelId: car.wheelId,
    tuneId: car.tuneId,
    stats: {
      speed: car.statSpeed,
      acceleration: car.statAcceleration,
      handling: car.statHandling,
      braking: car.statBraking,
    },
    totalRaces: car.totalRaces,
    totalWins: car.totalWins,
    showPoints: car.showPoints,
    createdAt: car.createdAt,
  };
}

router.get("/cars", requireAuth, async (req, res) => {
  const session = req.session as { userId?: number };
  const cars = await db
    .select()
    .from(carsTable)
    .where(eq(carsTable.userId, session.userId!));
  res.json(cars.map(formatCar));
});

router.post("/cars", requireAuth, async (req, res) => {
  const session = req.session as { userId?: number };
  const parse = CreateCarBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input", details: parse.error.issues });
    return;
  }
  const { modelId, name, paintColor, wrapId, wheelId, tuneId } = parse.data;
  const stats = computeStats(modelId, tuneId);

  const [car] = await db
    .insert(carsTable)
    .values({
      userId: session.userId!,
      modelId,
      name,
      paintColor,
      wrapId: wrapId ?? null,
      wheelId,
      tuneId,
      statSpeed: stats.speed,
      statAcceleration: stats.acceleration,
      statHandling: stats.handling,
      statBraking: stats.braking,
    })
    .returning();

  res.status(201).json(formatCar(car));
});

router.get("/cars/catalog", async (_req, res) => {
  res.json(CAR_MODELS);
});

router.get("/cars/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const session = req.session as { userId?: number };
  const [car] = await db
    .select()
    .from(carsTable)
    .where(and(eq(carsTable.id, id), eq(carsTable.userId, session.userId!)))
    .limit(1);

  if (!car) {
    res.status(404).json({ error: "Car not found" });
    return;
  }
  res.json(formatCar(car));
});

router.patch("/cars/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const session = req.session as { userId?: number };
  const parse = UpdateCarBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [existing] = await db
    .select()
    .from(carsTable)
    .where(and(eq(carsTable.id, id), eq(carsTable.userId, session.userId!)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Car not found" });
    return;
  }

  const { name, paintColor, wrapId, wheelId, tuneId } = parse.data;
  const newTuneId = tuneId ?? existing.tuneId;
  const newModelId = existing.modelId;
  const stats = computeStats(newModelId, newTuneId);

  const [updated] = await db
    .update(carsTable)
    .set({
      ...(name && { name }),
      ...(paintColor && { paintColor }),
      ...(wrapId !== undefined && { wrapId: wrapId ?? null }),
      ...(wheelId && { wheelId }),
      ...(tuneId && { tuneId }),
      statSpeed: stats.speed,
      statAcceleration: stats.acceleration,
      statHandling: stats.handling,
      statBraking: stats.braking,
    })
    .where(eq(carsTable.id, id))
    .returning();

  res.json(formatCar(updated));
});

router.delete("/cars/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const session = req.session as { userId?: number };
  await db.delete(carsTable).where(and(eq(carsTable.id, id), eq(carsTable.userId, session.userId!)));
  res.status(204).send();
});

export default router;
