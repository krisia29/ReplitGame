import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, racesTable, raceResultsTable, carsTable, usersTable, feedItemsTable } from "@workspace/db";
import { CreateRaceBody, SubmitRaceResultBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { RACE_TRACKS } from "../data/catalog";

const router = Router();

router.get("/races", async (_req, res) => {
  const races = await db.select().from(racesTable).orderBy(desc(racesTable.createdAt)).limit(20);
  res.json(races);
});

router.post("/races", requireAuth, async (req, res) => {
  const parse = CreateRaceBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { trackName, difficulty } = parse.data;
  const track = RACE_TRACKS.find((t) => t.trackName === trackName && t.difficulty === difficulty);
  const name = track?.name ?? `${difficulty} Race`;
  const prizePoints = track?.prizePoints ?? 100;

  const [race] = await db
    .insert(racesTable)
    .values({ name, trackName, difficulty, prizePoints, status: "active" })
    .returning();

  res.status(201).json(race);
});

router.get("/races/results/my", requireAuth, async (req, res) => {
  const session = req.session as { userId?: number };
  const results = await db
    .select({
      id: raceResultsTable.id,
      raceId: raceResultsTable.raceId,
      userId: raceResultsTable.userId,
      carId: raceResultsTable.carId,
      position: raceResultsTable.position,
      finishTime: raceResultsTable.finishTime,
      pointsEarned: raceResultsTable.pointsEarned,
      createdAt: raceResultsTable.createdAt,
      username: usersTable.username,
      carName: carsTable.name,
    })
    .from(raceResultsTable)
    .innerJoin(usersTable, eq(raceResultsTable.userId, usersTable.id))
    .innerJoin(carsTable, eq(raceResultsTable.carId, carsTable.id))
    .where(eq(raceResultsTable.userId, session.userId!))
    .orderBy(desc(raceResultsTable.createdAt))
    .limit(20);

  res.json(results);
});

router.get("/races/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [race] = await db.select().from(racesTable).where(eq(racesTable.id, id)).limit(1);
  if (!race) {
    res.status(404).json({ error: "Race not found" });
    return;
  }
  res.json(race);
});

router.post("/races/:id/result", requireAuth, async (req, res) => {
  const raceId = parseInt(req.params.id);
  const session = req.session as { userId?: number };
  const parse = SubmitRaceResultBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { carId, finishTime, position } = parse.data;

  const [race] = await db.select().from(racesTable).where(eq(racesTable.id, raceId)).limit(1);
  if (!race) {
    res.status(404).json({ error: "Race not found" });
    return;
  }

  // Calculate points based on position and race prize
  const positionMultipliers: Record<number, number> = { 1: 1.0, 2: 0.7, 3: 0.5 };
  const multiplier = positionMultipliers[position] ?? 0.25;
  const pointsEarned = Math.round(race.prizePoints * multiplier);

  const [result] = await db
    .insert(raceResultsTable)
    .values({ raceId, userId: session.userId!, carId, position, finishTime, pointsEarned })
    .returning();

  // Update user points and level
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId!)).limit(1);
  const newPoints = (user?.points ?? 0) + pointsEarned;
  const newLevel = Math.floor(newPoints / 500) + 1;
  await db.update(usersTable).set({ points: newPoints, level: newLevel }).where(eq(usersTable.id, session.userId!));

  // Update car stats
  const isWin = position === 1;
  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, carId)).limit(1);
  if (car) {
    await db.update(carsTable).set({
      totalRaces: car.totalRaces + 1,
      totalWins: car.totalWins + (isWin ? 1 : 0),
    }).where(eq(carsTable.id, carId));
  }

  // Add feed item
  if (isWin) {
    await db.insert(feedItemsTable).values({
      type: "race_win",
      userId: session.userId!,
      description: `won the ${race.name} race!`,
      carName: car?.name ?? null,
      points: pointsEarned,
    });
  }

  const username = user?.username ?? "Player";
  res.json({
    id: result.id,
    raceId: result.raceId,
    userId: result.userId,
    carId: result.carId,
    position: result.position,
    finishTime: result.finishTime,
    pointsEarned: result.pointsEarned,
    createdAt: result.createdAt,
    username,
    carName: car?.name ?? null,
  });
});

export default router;
