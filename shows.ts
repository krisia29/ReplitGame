import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, carShowsTable, showVotesTable, carsTable, usersTable, feedItemsTable } from "@workspace/db";
import { CreateShowBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function getCurrentWeek(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

function formatShow(show: typeof carShowsTable.$inferSelect, username?: string | null, carName?: string | null, paintColor?: string | null, modelId?: string | null) {
  return {
    id: show.id,
    userId: show.userId,
    carId: show.carId,
    theme: show.theme,
    votes: show.votes,
    weekOf: show.weekOf,
    username: username ?? null,
    carName: carName ?? null,
    paintColor: paintColor ?? null,
    modelId: modelId ?? null,
    isWeeklyChampion: show.isWeeklyChampion,
    createdAt: show.createdAt,
  };
}

router.get("/shows", async (_req, res) => {
  const shows = await db
    .select({
      show: carShowsTable,
      username: usersTable.username,
      carName: carsTable.name,
      paintColor: carsTable.paintColor,
      modelId: carsTable.modelId,
    })
    .from(carShowsTable)
    .innerJoin(usersTable, eq(carShowsTable.userId, usersTable.id))
    .innerJoin(carsTable, eq(carShowsTable.carId, carsTable.id))
    .orderBy(desc(carShowsTable.votes), desc(carShowsTable.createdAt))
    .limit(50);

  res.json(shows.map((s) => formatShow(s.show, s.username, s.carName, s.paintColor, s.modelId)));
});

router.post("/shows", requireAuth, async (req, res) => {
  const session = req.session as { userId?: number };
  const parse = CreateShowBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { carId, theme } = parse.data;
  const weekOf = getCurrentWeek();

  const [show] = await db
    .insert(carShowsTable)
    .values({ userId: session.userId!, carId, theme, weekOf })
    .returning();

  // Feed item
  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, carId)).limit(1);
  await db.insert(feedItemsTable).values({
    type: "show_entry",
    userId: session.userId!,
    description: `entered their car in the ${theme} car show!`,
    carName: car?.name ?? null,
    points: null,
  });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId!)).limit(1);
  res.status(201).json(formatShow(show, user?.username ?? null, car?.name ?? null, car?.paintColor ?? null, car?.modelId ?? null));
});

router.post("/shows/:id/vote", requireAuth, async (req, res) => {
  const showId = parseInt(req.params.id);
  const session = req.session as { userId?: number };

  // Check if already voted
  const existing = await db
    .select()
    .from(showVotesTable)
    .where(eq(showVotesTable.showId, showId))
    .limit(1);

  const alreadyVoted = existing.some((v) => v.userId === session.userId);
  if (alreadyVoted) {
    res.status(409).json({ error: "Already voted" });
    return;
  }

  await db.insert(showVotesTable).values({ showId, userId: session.userId! });
  const [updated] = await db
    .update(carShowsTable)
    .set({ votes: (await db.select().from(carShowsTable).where(eq(carShowsTable.id, showId)).limit(1))[0].votes + 1 })
    .where(eq(carShowsTable.id, showId))
    .returning();

  const data = await db
    .select({
      show: carShowsTable,
      username: usersTable.username,
      carName: carsTable.name,
      paintColor: carsTable.paintColor,
      modelId: carsTable.modelId,
    })
    .from(carShowsTable)
    .innerJoin(usersTable, eq(carShowsTable.userId, usersTable.id))
    .innerJoin(carsTable, eq(carShowsTable.carId, carsTable.id))
    .where(eq(carShowsTable.id, showId))
    .limit(1);

  res.json(formatShow(data[0]?.show ?? updated, data[0]?.username, data[0]?.carName, data[0]?.paintColor, data[0]?.modelId));
});

router.get("/shows/weekly-champion", async (_req, res) => {
  const weekOf = getCurrentWeek();
  const data = await db
    .select({
      show: carShowsTable,
      username: usersTable.username,
      carName: carsTable.name,
      paintColor: carsTable.paintColor,
      modelId: carsTable.modelId,
    })
    .from(carShowsTable)
    .innerJoin(usersTable, eq(carShowsTable.userId, usersTable.id))
    .innerJoin(carsTable, eq(carShowsTable.carId, carsTable.id))
    .where(eq(carShowsTable.weekOf, weekOf))
    .orderBy(desc(carShowsTable.votes))
    .limit(1);

  if (!data[0]) {
    res.status(404).json({ error: "No champion yet" });
    return;
  }
  res.json(formatShow(data[0].show, data[0].username, data[0].carName, data[0].paintColor, data[0].modelId));
});

export default router;
